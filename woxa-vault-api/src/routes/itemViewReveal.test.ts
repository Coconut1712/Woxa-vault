import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for the VIEW vs REVEAL split (audit-accuracy work):
//   * GET /items/:id        -> VIEW-only. password ALWAYS null (for every
//                              role), notes still returned. Audit = item.view.
//   * GET /items/:id/password -> REVEAL. returns the decrypted password (null
//                              if none). Audit = item.reveal. Viewer -> 403,
//                              no-access -> 404, deleted -> 404, locked -> 401.
// Plus: share/role_change audit metadata now carries granteeEmail (+ from/to).
//
// Drives the REAL app + REAL Postgres (project memory: integration tests hit a
// real database, never mocks).

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
  const {
    organizations,
    orgMembers,
    users,
    vaults,
    vaultMembers,
    items,
    itemMembers,
    auditEvents,
    sessions,
  } = await import("@/db/schema");
  const { eq, and, inArray, desc } = await import("drizzle-orm");
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
    itemMembers,
    auditEvents,
    sessions,
    eq,
    and,
    inArray,
    desc,
    createSession,
    SESSION_COOKIE_NAME,
    generateWrappedDek,
    encryptField,
    zeroize,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

describe("VIEW vs REVEAL split + share audit metadata (integration)", () => {
  let deps: Deps;
  let orgId: string;
  const createdUserIds: string[] = [];
  const createdVaultIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
    orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "View/Reveal Test Org",
      slug: `vr-${orgId.slice(0, 8)}`,
    });
  });

  afterAll(async () => {
    if (!deps) return;
    if (createdVaultIds.length > 0) {
      await deps.db.delete(deps.vaults).where(deps.inArray(deps.vaults.id, createdVaultIds));
    }
    if (createdUserIds.length > 0) {
      await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, createdUserIds));
    }
    await deps.db.delete(deps.organizations).where(deps.eq(deps.organizations.id, orgId));
    await deps.sql.end({ timeout: 5 });
  });

  // ---- helpers -------------------------------------------------------------

  async function makeUser(
    orgRole = "member",
  ): Promise<{ userId: string; email: string; cookie: string }> {
    const userId = randomUUID();
    const email = `vr-${userId}@test.local`;
    await deps.db.insert(deps.users).values({
      id: userId,
      email,
      passwordHash: null,
      totpEnabledAt: new Date(), // satisfy requireTwoFactorEnrolled
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    createdUserIds.push(userId);
    const { token } = await deps.createSession(userId);
    return { userId, email, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
  }

  async function makeVault(createdBy: string): Promise<string> {
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

  async function makeItem(
    vaultId: string,
    createdBy: string,
    secret: string | null = "s3cret",
  ): Promise<string> {
    const { dek, wrapped } = deps.generateWrappedDek();
    try {
      const enc = secret !== null ? deps.encryptField(dek, secret) : null;
      const [it] = await deps.db
        .insert(deps.items)
        .values({
          vaultId,
          type: "login",
          name: `item-${randomUUID().slice(0, 8)}`,
          passwordCiphertext: enc?.ciphertext ?? null,
          passwordIv: enc?.iv ?? null,
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

  // Read the latest audit row for an item (occurred_at DESC).
  async function latestAudit(itemId: string) {
    const rows = await deps.db
      .select()
      .from(deps.auditEvents)
      .where(
        deps.and(
          deps.eq(deps.auditEvents.targetType, "item"),
          deps.eq(deps.auditEvents.targetId, itemId),
        ),
      )
      .orderBy(deps.desc(deps.auditEvents.occurredAt), deps.desc(deps.auditEvents.id))
      .limit(1);
    return rows[0];
  }

  // ---- A. VIEW: password withheld + item.view audit ------------------------

  it.each(["manager", "editor", "user"])(
    "GET /items/:id (role=%s) returns password=null and writes item.view (NOT item.reveal)",
    async (role) => {
      const owner = await makeUser("admin");
      const viewerUser = await makeUser("member");
      const vaultId = await makeVault(owner.userId);
      await addVaultMember(vaultId, owner.userId, "manager");
      await addVaultMember(vaultId, viewerUser.userId, role);
      const itemId = await makeItem(vaultId, owner.userId, "top-secret");

      const res = await req(`/items/${itemId}`, viewerUser.cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        item: { password: string | null; hasPassword: boolean; effectiveRole: string };
      };
      // password is WITHHELD even for a manager/editor/user (was non-null pre-split).
      expect(body.item.password).toBeNull();
      // hasPassword flag still tells the UI a secret exists.
      expect(body.item.hasPassword).toBe(true);
      expect(body.item.effectiveRole).toBe(role);

      const audit = await latestAudit(itemId);
      expect(audit?.action).toBe("item.view");
    },
  );

  it("GET /items/:id still returns decrypted notes (UI decodes meta from them)", async () => {
    const owner = await makeUser("admin");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    // Seed an item with notes by creating via the API so notes get encrypted.
    const create = await req(`/vaults/${vaultId}/items`, owner.cookie, {
      method: "POST",
      body: JSON.stringify({ type: "login", name: "with-notes", password: "pw", notes: "my-notes" }),
    });
    expect(create.status).toBe(201);
    const itemId = ((await create.json()) as { item: { id: string } }).item.id;

    const res = await req(`/items/${itemId}`, owner.cookie);
    const body = (await res.json()) as { item: { password: string | null; notes: string | null } };
    expect(body.item.password).toBeNull();
    expect(body.item.notes).toBe("my-notes");
  });

  // ---- B. REVEAL: /password returns the secret + item.reveal audit ---------

  it.each(["manager", "editor", "user"])(
    "GET /items/:id/password (role=%s) returns the real password and writes item.reveal",
    async (role) => {
      const owner = await makeUser("admin");
      const grantee = await makeUser("member");
      const vaultId = await makeVault(owner.userId);
      await addVaultMember(vaultId, owner.userId, "manager");
      await addVaultMember(vaultId, grantee.userId, role);
      const itemId = await makeItem(vaultId, owner.userId, "reveal-me");

      const res = await req(`/items/${itemId}/password`, grantee.cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { password: string | null };
      expect(body.password).toBe("reveal-me");

      const audit = await latestAudit(itemId);
      expect(audit?.action).toBe("item.reveal");
    },
  );

  it("GET /items/:id/password returns null when the item has no password", async () => {
    const owner = await makeUser("admin");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const itemId = await makeItem(vaultId, owner.userId, null); // no password

    const res = await req(`/items/${itemId}/password`, owner.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { password: string | null }).password).toBeNull();
    // still audited as a reveal (the caller asked to reveal).
    expect((await latestAudit(itemId))?.action).toBe("item.reveal");
  });

  it("GET /items/:id/password → 403 for an effective viewer", async () => {
    const owner = await makeUser("admin");
    const viewer = await makeUser("member");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, viewer.userId, "viewer");
    const itemId = await makeItem(vaultId, owner.userId, "nope");

    expect((await req(`/items/${itemId}/password`, viewer.cookie)).status).toBe(403);
  });

  it("GET /items/:id/password → 404 for a caller with no access (anti-enumeration)", async () => {
    const owner = await makeUser("admin");
    const stranger = await makeUser("member"); // org member, no vault grant
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const itemId = await makeItem(vaultId, owner.userId, "nope");

    expect((await req(`/items/${itemId}/password`, stranger.cookie)).status).toBe(404);
  });

  it("GET /items/:id/password → 404 for a soft-deleted item", async () => {
    const owner = await makeUser("admin");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const itemId = await makeItem(vaultId, owner.userId, "gone");

    // live → 200
    expect((await req(`/items/${itemId}/password`, owner.cookie)).status).toBe(200);
    await deps.db
      .update(deps.items)
      .set({ deletedAt: new Date(), deletedBy: owner.userId })
      .where(deps.eq(deps.items.id, itemId));
    expect((await req(`/items/${itemId}/password`, owner.cookie)).status).toBe(404);
  });

  it("GET /items/:id/password → 401 vault_locked when the session is locked", async () => {
    const owner = await makeUser("admin");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const itemId = await makeItem(vaultId, owner.userId, "locked-pw");

    // Expire the session's vault unlock (same gate the old reveal used).
    await deps.db
      .update(deps.sessions)
      .set({ vaultUnlockedAt: null })
      .where(deps.eq(deps.sessions.userId, owner.userId));

    const res = await req(`/items/${itemId}/password`, owner.cookie);
    expect(res.status).toBe(401);
  });

  // ---- C. Share audit metadata now carries granteeEmail (+ from/to) --------

  it("item.share audit metadata contains granteeEmail; item.role_change has granteeEmail + from/to", async () => {
    const owner = await makeUser("admin");
    const grantee = await makeUser("member");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const itemId = await makeItem(vaultId, owner.userId, "pw");

    // Share at role 'user'.
    const share = await req(`/items/${itemId}/members`, owner.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: grantee.userId, role: "user" }),
    });
    expect(share.status).toBe(201);

    const shareAudit = await latestAudit(itemId);
    expect(shareAudit?.action).toBe("item.share");
    const shareMeta = shareAudit?.metadata as Record<string, unknown>;
    expect(shareMeta.granteeUserId).toBe(grantee.userId);
    expect(shareMeta.granteeEmail).toBe(grantee.email);
    expect(shareMeta.role).toBe("user");

    // Change the role user → editor.
    const change = await req(`/items/${itemId}/members/${grantee.userId}`, owner.cookie, {
      method: "PATCH",
      body: JSON.stringify({ role: "editor" }),
    });
    expect(change.status).toBe(200);

    const changeAudit = await latestAudit(itemId);
    expect(changeAudit?.action).toBe("item.role_change");
    const changeMeta = changeAudit?.metadata as Record<string, unknown>;
    expect(changeMeta.granteeUserId).toBe(grantee.userId);
    expect(changeMeta.granteeEmail).toBe(grantee.email);
    expect(changeMeta.from).toBe("user");
    expect(changeMeta.to).toBe("editor");

    // Revoke → revokedEmail present.
    const revoke = await req(`/items/${itemId}/members/${grantee.userId}`, owner.cookie, {
      method: "DELETE",
    });
    expect(revoke.status).toBe(204);

    const revokeAudit = await latestAudit(itemId);
    expect(revokeAudit?.action).toBe("item.revoke");
    const revokeMeta = revokeAudit?.metadata as Record<string, unknown>;
    expect(revokeMeta.revokedUserId).toBe(grantee.userId);
    expect(revokeMeta.revokedEmail).toBe(grantee.email);
  });
});
