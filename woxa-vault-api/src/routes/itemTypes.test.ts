import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for US-012 / FR-030 — six item kinds + secret-at-rest.
// Drives the REAL app + REAL Postgres (no mocks).
//
// What this pins:
//   * All six kinds (login/note/api_key/ssh/card/identity) create with 201 and
//     round-trip their `type` truthfully (no longer collapsed to login|note).
//   * Secret material (primary secret → password column, type-specific secrets
//     stuffed into the notes meta blob by the client) is ENCRYPTED at rest:
//     the plaintext never appears in the ciphertext columns.
//   * An effective viewer cannot reveal the secret (password withheld; notes
//     null) — the gate is the SAME canRevealItem used for login passwords.

beforeAll(() => {
  if (!process.env.MFA_TOKEN_SECRET || process.env.MFA_TOKEN_SECRET === "REPLACE_ME_WITH_HEX_64_CHARS") {
    process.env.MFA_TOKEN_SECRET = "a".repeat(64);
  }
  if (!process.env.LOCAL_KEK_BASE64 || process.env.LOCAL_KEK_BASE64 === "REPLACE_ME_WITH_BASE64_32_BYTES") {
    process.env.LOCAL_KEK_BASE64 = Buffer.alloc(32).toString("base64");
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgres://woxa:woxa_local_dev@localhost:5433/woxa_vault";
  }
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
});

async function loadDeps() {
  const { createApp } = await import("@/app");
  const { db, sql } = await import("@/db/client");
  const { organizations, orgMembers, users, vaults, vaultMembers, items, itemMembers } = await import(
    "@/db/schema"
  );
  const { eq, inArray } = await import("drizzle-orm");
  const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/session");
  return {
    app: createApp(),
    db,
    sql,
    organizations,
    orgMembers,
    users,
    vaults,
    vaultMembers,
    items,
    itemMembers,
    eq,
    inArray,
    createSession,
    SESSION_COOKIE_NAME,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

const ALL_TYPES = ["login", "note", "api_key", "ssh", "card", "identity"] as const;

describe("Item types + secret-at-rest (integration)", () => {
  let deps: Deps;
  let orgId: string;
  const userIds: string[] = [];
  const vaultIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
    orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "ItemTypes Org",
      slug: `it-${orgId.slice(0, 8)}`,
    });
  });

  afterAll(async () => {
    if (!deps) return;
    if (vaultIds.length) await deps.db.delete(deps.vaults).where(deps.inArray(deps.vaults.id, vaultIds));
    if (userIds.length) await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, userIds));
    await deps.db.delete(deps.organizations).where(deps.eq(deps.organizations.id, orgId));
    await deps.sql.end({ timeout: 5 });
  });

  async function makeUser(orgRole = "member") {
    const userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `it-${userId}@test.local`,
      passwordHash: null,
      totpEnabledAt: new Date(),
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    userIds.push(userId);
    const { token } = await deps.createSession(userId);
    return { userId, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
  }

  async function makeVault(createdBy: string) {
    const [v] = await deps.db
      .insert(deps.vaults)
      .values({ orgId, name: `v-${randomUUID().slice(0, 8)}`, createdBy })
      .returning();
    vaultIds.push(v!.id);
    return v!.id;
  }

  async function addVaultMember(vaultId: string, userId: string, role: string) {
    await deps.db.insert(deps.vaultMembers).values({ vaultId, userId, role });
  }

  function req(path: string, cookie: string, init: RequestInit = {}) {
    return deps.app.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
    });
  }

  it("creates all six kinds and round-trips type truthfully", async () => {
    const u = await makeUser("member");
    const vaultId = await makeVault(u.userId);
    await addVaultMember(vaultId, u.userId, "manager");

    for (const type of ALL_TYPES) {
      const res = await req(`/vaults/${vaultId}/items`, u.cookie, {
        method: "POST",
        body: JSON.stringify({ type, name: `${type}-item` }),
      });
      expect(res.status, `create ${type}`).toBe(201);
      const body = (await res.json()) as { item: { type: string } };
      expect(body.item.type).toBe(type);
    }
  });

  it("encrypts type-specific secrets at rest (no plaintext in ciphertext columns)", async () => {
    const u = await makeUser("member");
    const vaultId = await makeVault(u.userId);
    await addVaultMember(vaultId, u.userId, "manager");

    // Mirror the client wire shape: primary secret → password; type-specific
    // secrets (card number/CVV here) live inside the notes meta blob.
    const CARD_NUMBER = "4242424242424242";
    const CVV = "999";
    const API_KEY = "sk_live_SUPERSECRETVALUE_zzz";
    const notesBlob = `__WOXA_META__:${JSON.stringify({
      displayKind: "card",
      card: { cardNumber: CARD_NUMBER, cvv: CVV },
    })}`;

    const res = await req(`/vaults/${vaultId}/items`, u.cookie, {
      method: "POST",
      body: JSON.stringify({ type: "card", name: "Corp Amex", password: API_KEY, notes: notesBlob }),
    });
    expect(res.status).toBe(201);
    const created = ((await res.json()) as { item: { id: string } }).item;

    // Inspect the raw row: ciphertext columns must NOT contain the plaintext.
    const row = await deps.db.query.items.findFirst({ where: deps.eq(deps.items.id, created.id) });
    expect(row).toBeTruthy();
    const pwHex = row!.passwordCiphertext!.toString("latin1");
    const notesHex = row!.notesCiphertext!.toString("latin1");
    expect(pwHex).not.toContain(API_KEY);
    expect(notesHex).not.toContain(CARD_NUMBER);
    expect(notesHex).not.toContain(CVV);
    expect(notesHex).not.toContain("cardNumber"); // even the meta keys are encrypted
    // DEK is wrapped, present.
    expect(row!.dekCiphertext).toBeTruthy();

    // Owner reveal returns the real primary secret.
    const reveal = await req(`/items/${created.id}/password`, u.cookie);
    expect(reveal.status).toBe(200);
    expect(((await reveal.json()) as { password: string | null }).password).toBe(API_KEY);
  });

  it("viewer cannot reveal a non-login type's secret (same gate as password)", async () => {
    const owner = await makeUser("member");
    const viewer = await makeUser("member");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, viewer.userId, "viewer");

    const res = await req(`/vaults/${vaultId}/items`, owner.cookie, {
      method: "POST",
      body: JSON.stringify({ type: "ssh", name: "Prod SSH", password: "-----BEGIN PRIVATE KEY-----xyz" }),
    });
    const itemId = ((await res.json()) as { item: { id: string } }).item.id;

    // Viewer: reveal endpoint → 403 (canRevealItem false).
    const reveal = await req(`/items/${itemId}/password`, viewer.cookie);
    expect(reveal.status).toBe(403);

    // Viewer: detail view → 200 but notes withheld (null) and password null.
    const view = await req(`/items/${itemId}`, viewer.cookie);
    expect(view.status).toBe(200);
    const full = ((await view.json()) as {
      item: { password: string | null; notes: string | null; type: string };
    }).item;
    expect(full.password).toBeNull();
    expect(full.notes).toBeNull();
    expect(full.type).toBe("ssh");
  });
});
