import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for the Trash feature (soft-delete + restore + permanent
// delete + empty). Drives the REAL app + REAL Postgres (project memory:
// integration tests hit a real database, never mocks).
//
// What this pins:
//   * Soft delete: DELETE /items/:id flags the item (gone from the vault list +
//     GET /items/:id → 404) but it appears in GET /trash.
//   * Restore: POST /trash/:id/restore brings it back (in the vault list, gone
//     from trash).
//   * Permanent delete: DELETE /trash/:id → 204, item fully gone (not in trash,
//     not restorable).
//   * Empty: POST /trash/empty purges every soft-deleted item in the org.
//   * Admin-only: a non-admin (org member, even a vault manager) gets 403 on
//     every trash endpoint.
//   * Org scoping: an admin of org A cannot see/restore/purge a soft-deleted
//     item that lives in org B (404, anti-enumeration).

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
  const { organizations, orgMembers, users, vaults, vaultMembers, items } = await import(
    "@/db/schema"
  );
  const { eq, inArray } = await import("drizzle-orm");
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
    eq,
    inArray,
    createSession,
    SESSION_COOKIE_NAME,
    generateWrappedDek,
    encryptField,
    zeroize,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

describe("Trash (soft-delete / restore / purge / empty) integration", () => {
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
      name: "Trash Test Org",
      slug: `trash-${orgId.slice(0, 8)}`,
    });
    createdOrgIds.push(orgId);
    return orgId;
  }

  async function makeUser(
    orgId: string,
    orgRole = "member",
  ): Promise<{ userId: string; cookie: string }> {
    const userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `trash-${userId}@test.local`,
      passwordHash: null,
      totpEnabledAt: new Date(), // satisfy requireTwoFactorEnrolled
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    createdUserIds.push(userId);
    const { token } = await deps.createSession(userId);
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

  async function makeItem(
    vaultId: string,
    createdBy: string,
    secret = "s3cret",
  ): Promise<string> {
    const { dek, wrapped } = deps.generateWrappedDek();
    try {
      const enc = deps.encryptField(dek, secret);
      const [it] = await deps.db
        .insert(deps.items)
        .values({
          vaultId,
          type: "login",
          name: `item-${randomUUID().slice(0, 8)}`,
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

  async function listVaultItemIds(vaultId: string, cookie: string): Promise<string[]> {
    const res = await req(`/vaults/${vaultId}/items`, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string }[] };
    return body.items.map((i) => i.id);
  }

  async function listTrashIds(cookie: string): Promise<string[]> {
    const res = await req("/trash", cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string }[] };
    return body.items.map((i) => i.id);
  }

  // ---- soft delete ---------------------------------------------------------

  it("DELETE /items/:id soft-deletes → vanishes from vault, appears in trash", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    const itemId = await makeItem(vaultId, admin.userId);

    // present before delete
    expect(await listVaultItemIds(vaultId, admin.cookie)).toContain(itemId);

    const del = await req(`/items/${itemId}`, admin.cookie, { method: "DELETE" });
    expect(del.status).toBe(204);

    // gone from the vault list + GET /items/:id → 404
    expect(await listVaultItemIds(vaultId, admin.cookie)).not.toContain(itemId);
    expect((await req(`/items/${itemId}`, admin.cookie)).status).toBe(404);

    // visible in trash with the expected DTO shape
    const trashRes = await req("/trash", admin.cookie);
    expect(trashRes.status).toBe(200);
    const trashBody = (await trashRes.json()) as {
      items: {
        id: string;
        vaultId: string;
        vaultName: string;
        type: string;
        name: string;
        username: string | null;
        deletedAt: string;
        deletedBy: { id: string; displayName: string } | null;
        purgeAt: string;
      }[];
    };
    const found = trashBody.items.find((i) => i.id === itemId);
    expect(found).toBeDefined();
    expect(found!.vaultId).toBe(vaultId);
    expect(found!.type).toBe("login");
    expect(found!.username).toBe("alice@example.com");
    expect(found!.deletedBy?.id).toBe(admin.userId);
    expect(typeof found!.deletedAt).toBe("string");
    // purgeAt = deletedAt + 30d
    const gap = new Date(found!.purgeAt).getTime() - new Date(found!.deletedAt).getTime();
    expect(gap).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("an EDITOR soft-deletes (trash, not purge) — item still recoverable", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const editor = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    await addVaultMember(vaultId, editor.userId, "editor");
    const itemId = await makeItem(vaultId, admin.userId);

    // editor deletes → 204 (soft)
    expect((await req(`/items/${itemId}`, editor.cookie, { method: "DELETE" })).status).toBe(204);

    // admin sees it in trash and can restore it
    expect(await listTrashIds(admin.cookie)).toContain(itemId);
    expect((await req(`/trash/${itemId}/restore`, admin.cookie, { method: "POST" })).status).toBe(
      200,
    );
    expect(await listVaultItemIds(vaultId, admin.cookie)).toContain(itemId);
  });

  // ---- restore -------------------------------------------------------------

  it("POST /trash/:id/restore brings the item back to its vault", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "owner");
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    const itemId = await makeItem(vaultId, admin.userId);

    await req(`/items/${itemId}`, admin.cookie, { method: "DELETE" });
    expect(await listTrashIds(admin.cookie)).toContain(itemId);

    const restore = await req(`/trash/${itemId}/restore`, admin.cookie, { method: "POST" });
    expect(restore.status).toBe(200);
    const body = (await restore.json()) as { item: { id: string; vaultId: string; name: string } };
    expect(body.item.id).toBe(itemId);
    expect(body.item.vaultId).toBe(vaultId);

    // back in the vault, gone from trash
    expect(await listVaultItemIds(vaultId, admin.cookie)).toContain(itemId);
    expect(await listTrashIds(admin.cookie)).not.toContain(itemId);
  });

  // ---- permanent delete ----------------------------------------------------

  it("DELETE /trash/:id permanently deletes — gone, not restorable", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    const itemId = await makeItem(vaultId, admin.userId);

    await req(`/items/${itemId}`, admin.cookie, { method: "DELETE" });
    expect(await listTrashIds(admin.cookie)).toContain(itemId);

    const purge = await req(`/trash/${itemId}`, admin.cookie, { method: "DELETE" });
    expect(purge.status).toBe(204);

    // fully gone: not in trash, not restorable (404), the row is hard-deleted
    expect(await listTrashIds(admin.cookie)).not.toContain(itemId);
    expect((await req(`/trash/${itemId}/restore`, admin.cookie, { method: "POST" })).status).toBe(
      404,
    );
    const rows = await deps.db
      .select({ id: deps.items.id })
      .from(deps.items)
      .where(deps.eq(deps.items.id, itemId));
    expect(rows.length).toBe(0);
  });

  // ---- empty ---------------------------------------------------------------

  it("POST /trash/empty purges every soft-deleted item in the org", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "owner");
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    const a = await makeItem(vaultId, admin.userId);
    const b = await makeItem(vaultId, admin.userId);
    const c = await makeItem(vaultId, admin.userId);

    // soft-delete a + b, leave c live
    await req(`/items/${a}`, admin.cookie, { method: "DELETE" });
    await req(`/items/${b}`, admin.cookie, { method: "DELETE" });
    const trash = await listTrashIds(admin.cookie);
    expect(trash).toContain(a);
    expect(trash).toContain(b);

    const empty = await req("/trash/empty", admin.cookie, { method: "POST" });
    expect(empty.status).toBe(200);
    const emptyBody = (await empty.json()) as { purged: number };
    expect(emptyBody.purged).toBe(2);

    // trash now empty; the live item c is untouched
    expect(await listTrashIds(admin.cookie)).toHaveLength(0);
    expect(await listVaultItemIds(vaultId, admin.cookie)).toContain(c);
  });

  // ---- admin-only gate -----------------------------------------------------

  it("a non-admin (org member + vault manager) is 403 on every trash endpoint", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const member = await makeUser(orgId, "member"); // NOT org admin
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    await addVaultMember(vaultId, member.userId, "manager"); // even a vault manager
    const itemId = await makeItem(vaultId, admin.userId);
    await req(`/items/${itemId}`, admin.cookie, { method: "DELETE" });

    expect((await req("/trash", member.cookie)).status).toBe(403);
    expect(
      (await req(`/trash/${itemId}/restore`, member.cookie, { method: "POST" })).status,
    ).toBe(403);
    expect((await req(`/trash/${itemId}`, member.cookie, { method: "DELETE" })).status).toBe(403);
    expect((await req("/trash/empty", member.cookie, { method: "POST" })).status).toBe(403);

    // the item is still in the admin's trash (the member's blocked calls were no-ops)
    expect(await listTrashIds(admin.cookie)).toContain(itemId);
  });

  // ---- org scoping ---------------------------------------------------------

  it("admin of org A cannot see/restore/purge a trashed item in org B (404)", async () => {
    // org A admin
    const orgA = await makeOrg();
    const adminA = await makeUser(orgA, "admin");

    // org B with its own trashed item
    const orgB = await makeOrg();
    const adminB = await makeUser(orgB, "admin");
    const vaultB = await makeVault(orgB, adminB.userId);
    await addVaultMember(vaultB, adminB.userId, "manager");
    const itemB = await makeItem(vaultB, adminB.userId);
    await req(`/items/${itemB}`, adminB.cookie, { method: "DELETE" });

    // admin A's trash does NOT contain org B's item
    expect(await listTrashIds(adminA.cookie)).not.toContain(itemB);

    // restore / purge of org B's item by admin A → 404 (anti-enumeration)
    expect((await req(`/trash/${itemB}/restore`, adminA.cookie, { method: "POST" })).status).toBe(
      404,
    );
    expect((await req(`/trash/${itemB}`, adminA.cookie, { method: "DELETE" })).status).toBe(404);

    // org B's item is still in org B's trash (admin A's calls were no-ops)
    expect(await listTrashIds(adminB.cookie)).toContain(itemB);
  });
});
