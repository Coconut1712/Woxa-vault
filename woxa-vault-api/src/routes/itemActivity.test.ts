import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for GET /items/:id/activity (per-item "Recent activity").
// Drives the REAL app + REAL Postgres (project memory: integration tests hit a
// real database, never mocks).
//
// Authorization is the crux — what this pins:
//   * Vault MANAGER who is only an org `member` → 200, sees ONLY this item's
//     events (not an unrelated item's), but STILL 403 on GET /audit (the full
//     org log stays admin+).
//   * Vault editor / user / viewer → 403.
//   * Org admin (not a vault member) of the item's org → 200.
//   * No access to the item → 404 (anti-enumeration).
//   * Item-level "manager" override on a vault editor → 200 (effective manager).
//   * Org admin of org A vs an item in org B → no access → 404 (cross-org).
//   * limit param respected; deleted item → 404.

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
  } = await import("@/db/schema");
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
    itemMembers,
    auditEvents,
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

describe("GET /items/:id/activity (per-item activity) integration", () => {
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
      name: "Activity Test Org",
      slug: `act-${orgId.slice(0, 8)}`,
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
      email: `act-${userId}@test.local`,
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

  async function addItemMember(itemId: string, userId: string, role: string) {
    await deps.db.insert(deps.itemMembers).values({ itemId, userId, role });
  }

  async function makeItem(vaultId: string, createdBy: string): Promise<string> {
    const { dek, wrapped } = deps.generateWrappedDek();
    try {
      const enc = deps.encryptField(dek, "s3cret");
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

  // Seed `n` audit rows for (orgId, item) at distinct ascending timestamps.
  async function seedItemEvents(
    orgId: string,
    itemId: string,
    actorUserId: string,
    actorEmail: string,
    n: number,
  ): Promise<void> {
    const base = Date.now() - n * 60_000;
    for (let i = 0; i < n; i++) {
      await deps.db.insert(deps.auditEvents).values({
        orgId,
        actorUserId,
        actorEmail,
        action: i % 2 === 0 ? "item.reveal" : "item.update",
        targetType: "item",
        targetId: itemId,
        targetName: "seeded",
        success: true,
        occurredAt: new Date(base + i * 60_000),
      });
    }
  }

  function req(path: string, cookie: string, init: RequestInit = {}) {
    return deps.app.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
    });
  }

  async function activity(itemId: string, cookie: string, limit?: number) {
    const qs = limit !== undefined ? `?limit=${limit}` : "";
    return req(`/items/${itemId}/activity${qs}`, cookie);
  }

  // ---- vault manager (org member) ------------------------------------------

  it("vault MANAGER (org member) → 200, sees ONLY this item's events; still 403 on /audit", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const manager = await makeUser(orgId, "member"); // org MEMBER, not admin
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    await addVaultMember(vaultId, manager.userId, "manager");

    const itemA = await makeItem(vaultId, admin.userId);
    const itemB = await makeItem(vaultId, admin.userId); // unrelated item, same vault
    await seedItemEvents(orgId, itemA, admin.userId, admin.cookie, 3);
    await seedItemEvents(orgId, itemB, admin.userId, admin.cookie, 4);

    const res = await activity(itemA, manager.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      events: { id: string; targetId: string; targetType: string; action: string }[];
    };
    // sees A's events only — never B's
    expect(body.events.length).toBe(3);
    expect(body.events.every((e) => e.targetId === itemA)).toBe(true);
    expect(body.events.every((e) => e.targetType === "item")).toBe(true);

    // DTO shape sanity (same keys as /audit serializer)
    expect(Object.keys(body.events[0]!).sort()).toEqual(
      [
        "action",
        "actorEmail",
        "actorUserId",
        "id",
        "ipHash",
        "metadata",
        "occurredAt",
        "orgId",
        "success",
        "targetId",
        "targetName",
        "targetType",
        "userAgent",
      ].sort(),
    );

    // The SAME manager (org member) must STILL be blocked from the full log.
    expect((await req("/audit", manager.cookie)).status).toBe(403);
  });

  // ---- ordering + limit ----------------------------------------------------

  it("events ordered occurredAt DESC; limit param respected (default 20, cap honored)", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    const itemId = await makeItem(vaultId, admin.userId);
    await seedItemEvents(orgId, itemId, admin.userId, admin.cookie, 25);

    // default limit = 20
    const def = await activity(itemId, admin.cookie);
    expect(def.status).toBe(200);
    const defBody = (await def.json()) as { events: { occurredAt: string }[] };
    expect(defBody.events.length).toBe(20);
    // DESC: each occurredAt <= the previous one
    for (let i = 1; i < defBody.events.length; i++) {
      expect(
        new Date(defBody.events[i - 1]!.occurredAt).getTime() >=
          new Date(defBody.events[i]!.occurredAt).getTime(),
      ).toBe(true);
    }

    // explicit limit
    const five = await activity(itemId, admin.cookie, 5);
    expect(((await five.json()) as { events: unknown[] }).events.length).toBe(5);

    // limit out of range → 400
    expect((await activity(itemId, admin.cookie, 0)).status).toBe(400);
    expect((await activity(itemId, admin.cookie, 51)).status).toBe(400);
  });

  // ---- lesser vault roles → 403 -------------------------------------------

  it("vault editor / user / viewer → 403", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const editor = await makeUser(orgId, "member");
    const useRole = await makeUser(orgId, "member");
    const viewer = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    await addVaultMember(vaultId, editor.userId, "editor");
    await addVaultMember(vaultId, useRole.userId, "user");
    await addVaultMember(vaultId, viewer.userId, "viewer");
    const itemId = await makeItem(vaultId, admin.userId);
    await seedItemEvents(orgId, itemId, admin.userId, admin.cookie, 2);

    expect((await activity(itemId, editor.cookie)).status).toBe(403);
    expect((await activity(itemId, useRole.cookie)).status).toBe(403);
    expect((await activity(itemId, viewer.cookie)).status).toBe(403);
  });

  // ---- org admin (not a vault member) → 200 --------------------------------

  it("org admin (not a vault member) of the item's org → 200", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "owner");
    const adminNoVault = await makeUser(orgId, "admin"); // org admin, NOT in the vault
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const itemId = await makeItem(vaultId, owner.userId);
    await seedItemEvents(orgId, itemId, owner.userId, owner.cookie, 2);

    const res = await activity(itemId, adminNoVault.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[] };
    expect(body.events.length).toBe(2);
  });

  // ---- no access → 404 -----------------------------------------------------

  it("a user with no access to the item → 404 (anti-enumeration)", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const outsider = await makeUser(orgId, "member"); // org member, no vault grant
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    const itemId = await makeItem(vaultId, admin.userId);
    await seedItemEvents(orgId, itemId, admin.userId, admin.cookie, 2);

    expect((await activity(itemId, outsider.cookie)).status).toBe(404);
  });

  // ---- item-level manager override on a vault editor → 200 ----------------

  it("item-level 'manager' override on a vault editor → 200 (effective manager)", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const editor = await makeUser(orgId, "member"); // vault editor + item-manager override
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    await addVaultMember(vaultId, editor.userId, "editor");
    const itemId = await makeItem(vaultId, admin.userId);
    await seedItemEvents(orgId, itemId, admin.userId, admin.cookie, 2);

    // without the override, the editor would be 403 (pinned above). Grant the
    // item-level manager override and the same user becomes effective-manager.
    await addItemMember(itemId, editor.userId, "manager");

    const res = await activity(itemId, editor.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { events: unknown[] }).events.length).toBe(2);
  });

  // ---- cross-org admin must NOT leak --------------------------------------

  it("org admin of org A cannot read an item in org B → 404", async () => {
    const orgA = await makeOrg();
    const adminA = await makeUser(orgA, "admin"); // admin of A only

    const orgB = await makeOrg();
    const adminB = await makeUser(orgB, "admin");
    const vaultB = await makeVault(orgB, adminB.userId);
    await addVaultMember(vaultB, adminB.userId, "manager");
    const itemB = await makeItem(vaultB, adminB.userId);
    await seedItemEvents(orgB, itemB, adminB.userId, adminB.cookie, 2);

    // adminA has NO membership in org B and no vault grant → 404, even though
    // they are an admin elsewhere.
    expect((await activity(itemB, adminA.cookie)).status).toBe(404);
    // sanity: adminB (the item's org admin) can read it.
    expect((await activity(itemB, adminB.cookie)).status).toBe(200);
  });

  // ---- deleted item → 404 --------------------------------------------------

  it("deleted (soft-deleted) item → 404", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, admin.userId);
    await addVaultMember(vaultId, admin.userId, "manager");
    const itemId = await makeItem(vaultId, admin.userId);
    await seedItemEvents(orgId, itemId, admin.userId, admin.cookie, 2);

    // live → 200
    expect((await activity(itemId, admin.cookie)).status).toBe(200);

    // soft-delete it
    await deps.db
      .update(deps.items)
      .set({ deletedAt: new Date(), deletedBy: admin.userId })
      .where(deps.eq(deps.items.id, itemId));

    expect((await activity(itemId, admin.cookie)).status).toBe(404);
  });

  // ---- unknown item id → 404 ----------------------------------------------

  it("unknown item id → 404", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    expect((await activity(randomUUID(), admin.cookie)).status).toBe(404);
  });
});
