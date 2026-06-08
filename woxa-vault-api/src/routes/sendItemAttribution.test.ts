import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for POST /sends item-source attribution.
// Drives the REAL app + REAL Postgres (project memory: integration tests hit a
// real database, never mocks).
//
// Contract under test (US-033 item-source linkage):
//   * POST /sends with a valid, accessible `itemId` whose vault org matches the
//     send's org context → the CREATE audit event is attributed to the ITEM
//     (targetType='item', targetId=itemId), with the send id in metadata.sendId,
//     and that row is returned by GET /items/:id/activity.
//   * POST /sends with NO itemId → send-scoped event (targetType='send'),
//     unchanged; never appears in any item's activity.
//   * POST /sends with an inaccessible itemId → falls back to send-scoped
//     (lenient: send still 201, no 403, no existence leak).

beforeAll(() => {
  if (
    !process.env.MFA_TOKEN_SECRET ||
    process.env.MFA_TOKEN_SECRET === "REPLACE_ME_WITH_HEX_64_CHARS"
  ) {
    process.env.MFA_TOKEN_SECRET = "a".repeat(64);
  }
  if (
    !process.env.LOCAL_KEK_BASE64 ||
    process.env.LOCAL_KEK_BASE64 === "REPLACE_ME_WITH_BASE64_32_BYTES"
  ) {
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
  const { organizations, orgMembers, users, vaults, vaultMembers, items, auditEvents } =
    await import("@/db/schema");
  const { eq, and, inArray } = await import("drizzle-orm");
  const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/session");
  const { generateWrappedDek, encryptField, zeroize } = await import("@/lib/itemCrypto");
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
    auditEvents,
    eq,
    and,
    inArray,
    createSession,
    SESSION_COOKIE_NAME,
    generateWrappedDek,
    encryptField,
    zeroize,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

describe("POST /sends item-source attribution integration", () => {
  let deps: Deps;
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdVaultIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
  });

  afterAll(async () => {
    if (!deps) return;
    if (createdVaultIds.length > 0) {
      await deps.db.delete(deps.vaults).where(deps.inArray(deps.vaults.id, createdVaultIds));
    }
    if (createdUserIds.length > 0) {
      await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, createdUserIds));
    }
    if (createdOrgIds.length > 0) {
      await deps.db
        .delete(deps.organizations)
        .where(deps.inArray(deps.organizations.id, createdOrgIds));
    }
    await deps.sql.end({ timeout: 5 });
  });

  // ---- helpers -------------------------------------------------------------

  async function makeOrg(): Promise<string> {
    const orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "Send Attr Test Org",
      slug: `sat-${orgId.slice(0, 8)}`,
    });
    createdOrgIds.push(orgId);
    return orgId;
  }

  // Creates a user with a vault-UNLOCKED session (POST /sends is gated by
  // requireVaultUnlocked; createSession(..., true) is the test-only unlock hook).
  async function makeUser(
    orgId: string,
    orgRole = "member",
  ): Promise<{ userId: string; cookie: string }> {
    const userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `sat-${userId}@test.local`,
      passwordHash: null,
      totpEnabledAt: new Date(), // satisfy requireTwoFactorEnrolled
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    createdUserIds.push(userId);
    const { token } = await deps.createSession(userId, {}, true);
    return { userId, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
  }

  async function makeVault(orgId: string, createdBy: string): Promise<string> {
    const [v] = await deps.db
      .insert(deps.vaults)
      .values({ orgId, name: `vault-${randomUUID().slice(0, 8)}`, createdBy })
      .returning();
    createdVaultIds.push(v!.id);
    return v!.id;
  }

  async function addVaultMember(vaultId: string, userId: string, role: string) {
    await deps.db.insert(deps.vaultMembers).values({ vaultId, userId, role });
  }

  async function makeItem(vaultId: string, createdBy: string, name?: string): Promise<string> {
    const { dek, wrapped } = deps.generateWrappedDek();
    try {
      const enc = deps.encryptField(dek, "s3cret");
      const [it] = await deps.db
        .insert(deps.items)
        .values({
          vaultId,
          type: "login",
          name: name ?? `item-${randomUUID().slice(0, 8)}`,
          username: "alice@example.com",
          passwordCiphertext: enc.ciphertext,
          passwordIv: enc.iv,
          dekCiphertext: wrapped.dekCiphertext,
          dekIv: wrapped.dekIv,
          createdBy,
        })
        .returning();
      return it!.id;
    } finally {
      deps.zeroize(dek);
    }
  }

  function req(path: string, cookie: string, init: RequestInit = {}) {
    return deps.app.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
    });
  }

  async function createSend(
    cookie: string,
    body: { content: string; expiresInMinutes: number; maxViews?: number; itemId?: string },
  ) {
    return req("/sends", cookie, { method: "POST", body: JSON.stringify(body) });
  }

  // Returns the audit row for a given send id (matched via metadata.sendId when
  // item-attributed, or via targetId when send-scoped).
  async function findCreateEventForSend(sendId: string) {
    const rows = await deps.db
      .select()
      .from(deps.auditEvents)
      .where(deps.eq(deps.auditEvents.action, "send.create"));
    return rows.find(
      (r) =>
        r.targetId === sendId ||
        (r.metadata as { sendId?: string } | null)?.sendId === sendId,
    );
  }

  // ---- valid accessible itemId → item-attributed -----------------------------

  it("valid accessible itemId → create event attributed to item; shows in /items/:id/activity", async () => {
    const orgId = await makeOrg();
    const user = await makeUser(orgId, "member"); // org member + vault manager
    const vaultId = await makeVault(orgId, user.userId);
    await addVaultMember(vaultId, user.userId, "manager");
    const itemId = await makeItem(vaultId, user.userId, "My Login");

    const res = await createSend(user.cookie, {
      content: "secret-payload",
      expiresInMinutes: 60,
      maxViews: 1,
      itemId,
    });
    expect(res.status).toBe(201);
    const sendBody = (await res.json()) as { send: { id: string } };
    const sendId = sendBody.send.id;

    // Audit row is attributed to the ITEM, with the send id in metadata.
    const ev = await findCreateEventForSend(sendId);
    expect(ev).toBeDefined();
    expect(ev!.targetType).toBe("item");
    expect(ev!.targetId).toBe(itemId);
    expect(ev!.targetName).toBe("My Login");
    expect(ev!.orgId).toBe(orgId);
    const meta = ev!.metadata as {
      sendId: string;
      maxViews: number;
      expiresInMinutes: number;
      hasPassword: boolean;
    };
    expect(meta.sendId).toBe(sendId);
    expect(meta.maxViews).toBe(1);
    expect(meta.expiresInMinutes).toBe(60);
    expect(meta.hasPassword).toBe(false);

    // ...and it surfaces in the item's activity feed (vault manager → 200).
    const act = await req(`/items/${itemId}/activity`, user.cookie);
    expect(act.status).toBe(200);
    const actBody = (await act.json()) as {
      events: { action: string; targetType: string; targetId: string }[];
    };
    const found = actBody.events.find(
      (e) => e.action === "send.create" && e.targetId === itemId,
    );
    expect(found).toBeDefined();
    expect(found!.targetType).toBe("item");
  });

  // ---- itemId omitted → send-scoped (unchanged) -----------------------------

  it("itemId omitted → send-scoped create event; never in any item activity", async () => {
    const orgId = await makeOrg();
    const user = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, user.userId);
    await addVaultMember(vaultId, user.userId, "manager");
    const itemId = await makeItem(vaultId, user.userId);

    const res = await createSend(user.cookie, {
      content: "secret-payload",
      expiresInMinutes: 60,
    });
    expect(res.status).toBe(201);
    const sendId = ((await res.json()) as { send: { id: string } }).send.id;

    const ev = await findCreateEventForSend(sendId);
    expect(ev).toBeDefined();
    expect(ev!.targetType).toBe("send");
    expect(ev!.targetId).toBe(sendId);
    // metadata stays the legacy shape — no sendId key when send-scoped.
    expect((ev!.metadata as { sendId?: string }).sendId).toBeUndefined();

    // The unrelated item's activity feed does NOT include this send.
    const act = await req(`/items/${itemId}/activity`, user.cookie);
    expect(act.status).toBe(200);
    const actBody = (await act.json()) as { events: { action: string }[] };
    expect(actBody.events.some((e) => e.action === "send.create")).toBe(false);
  });

  // ---- inaccessible itemId → lenient fallback to send-scoped -----------------

  it("inaccessible itemId → 201, falls back to send-scoped (no leak, no 403)", async () => {
    // Item lives in a vault the SENDER has no grant on.
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const sender = await makeUser(orgId, "member"); // org member, NOT a vault member
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const itemId = await makeItem(vaultId, owner.userId);

    const res = await createSend(sender.cookie, {
      content: "secret-payload",
      expiresInMinutes: 60,
      itemId,
    });
    // Lenient: the send still succeeds.
    expect(res.status).toBe(201);
    const sendId = ((await res.json()) as { send: { id: string } }).send.id;

    // Attribution did NOT happen — event is send-scoped.
    const ev = await findCreateEventForSend(sendId);
    expect(ev).toBeDefined();
    expect(ev!.targetType).toBe("send");
    expect(ev!.targetId).toBe(sendId);

    // And it never leaked into the item's activity (checked as the owner, who
    // CAN read the feed).
    const act = await req(`/items/${itemId}/activity`, owner.cookie);
    expect(act.status).toBe(200);
    const actBody = (await act.json()) as { events: { action: string }[] };
    expect(actBody.events.some((e) => e.action === "send.create")).toBe(false);
  });
});
