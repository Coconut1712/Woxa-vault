import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";

// Integration test for Phase C Wave-2b — client-driven vault re-key (AC-024.5)
// and revoke → rekey_pending. Drives the REAL app + REAL Postgres (project
// memory: integration tests hit a real DB).
//
// What this pins:
//   * POST /vaults/:id/rekey: atomic — replaces ALL vault_keys, re-encrypts every
//     item, REPLACES item_search_terms, bumps keyVersion, clears rekeyPending.
//   * rejects: incomplete item set, keyVersion mismatch (optimistic concurrency),
//     a wrappedKeys userId outside the org, missing member key.
//   * vault-member remove on a v2 vault deletes that user's vault_keys row AND
//     sets vaults.rekeyPending=true (server-side access cut immediately).

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
  const {
    organizations,
    orgMembers,
    users,
    vaults,
    vaultMembers,
    vaultKeys,
    items,
    itemSearchTerms,
    userKeys,
    teams,
    teamMembers,
    vaultTeamMembers,
  } = await import("@/db/schema");
  const { eq, inArray, and } = await import("drizzle-orm");
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
    vaultKeys,
    items,
    itemSearchTerms,
    userKeys,
    teams,
    teamMembers,
    vaultTeamMembers,
    eq,
    inArray,
    and,
    createSession,
    SESSION_COOKIE_NAME,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

// 32-byte HMAC term, base64.
function term(): string {
  return randomBytes(32).toString("base64");
}
function b64(n = 24): string {
  return randomBytes(n).toString("base64");
}

describe("vault re-key (Phase C Wave-2b) integration", () => {
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
      await deps.db.delete(deps.organizations).where(deps.inArray(deps.organizations.id, createdOrgIds));
    }
    await deps.sql.end({ timeout: 5 });
  });

  async function makeOrg(): Promise<string> {
    const orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "Rekey Test Org",
      slug: `rk-${orgId.slice(0, 8)}`,
    });
    createdOrgIds.push(orgId);
    return orgId;
  }

  async function makeUser(orgId: string, orgRole = "member"): Promise<{ userId: string; cookie: string }> {
    const userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `rk-${userId}@test.local`,
      passwordHash: null,
      totpEnabledAt: new Date(),
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    createdUserIds.push(userId);
    const { token } = await deps.createSession(userId, {}, true);
    return { userId, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
  }

  async function makeVault(orgId: string, createdBy: string, encryptionVersion = 1): Promise<string> {
    const [v] = await deps.db
      .insert(deps.vaults)
      .values({ orgId, name: `vault-${randomUUID().slice(0, 8)}`, createdBy, encryptionVersion })
      .returning();
    createdVaultIds.push(v!.id);
    return v!.id;
  }

  async function addVaultMember(vaultId: string, userId: string, role: string) {
    await deps.db.insert(deps.vaultMembers).values({ vaultId, userId, role });
  }

  async function addVaultKey(vaultId: string, userId: string) {
    await deps.db.insert(deps.vaultKeys).values({
      vaultId,
      userId,
      wrappedKey: randomBytes(48),
      wrapAlgo: "x25519-aes256gcm",
    });
  }

  // Enroll a user into ZK by giving them an X25519 public key (the roster only
  // requires/accepts a wrapped key for users who have one).
  async function enrollZk(userId: string) {
    await deps.db.insert(deps.userKeys).values({
      userId,
      publicKey: randomBytes(32),
      encryptedPrivateKey: randomBytes(48),
      privateKeyIv: randomBytes(12),
      privateKeyAuthTag: randomBytes(16),
    });
  }

  async function makeTeam(orgId: string): Promise<string> {
    const [t] = await deps.db
      .insert(deps.teams)
      .values({ orgId, name: `team-${randomUUID().slice(0, 8)}` })
      .returning();
    return t!.id;
  }

  async function addTeamMember(teamId: string, userId: string) {
    await deps.db.insert(deps.teamMembers).values({ teamId, userId });
  }

  async function addVaultTeam(vaultId: string, teamId: string, role: string) {
    await deps.db.insert(deps.vaultTeamMembers).values({ vaultId, teamId, role });
  }

  // Insert a v2 item directly (name="" + ciphertext) for rekey tests.
  async function makeV2Item(vaultId: string): Promise<string> {
    const [it] = await deps.db
      .insert(deps.items)
      .values({
        vaultId,
        type: "login",
        name: "",
        nameCiphertext: randomBytes(40),
        nameIv: randomBytes(12),
        passwordCiphertext: randomBytes(40),
        passwordIv: randomBytes(12),
      })
      .returning();
    return it!.id;
  }

  function req(path: string, cookie: string, init: RequestInit = {}) {
    return deps.app.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
    });
  }

  function rekeyItemPayload(id: string) {
    return {
      id,
      nameCiphertext: b64(40),
      nameIv: b64(12),
      passwordCiphertext: b64(40),
      passwordIv: b64(12),
      searchTerms: [term(), term()],
    };
  }

  // ---- Task A: rekey happy path ---------------------------------------------

  it("rekey atomically replaces keys + items + terms, bumps keyVersion, clears rekeyPending", async () => {
    const orgId = await makeOrg();
    const mgr = await makeUser(orgId, "admin");
    const member = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, mgr.userId, 2);
    await addVaultMember(vaultId, mgr.userId, "manager");
    await addVaultMember(vaultId, member.userId, "editor");
    await addVaultKey(vaultId, mgr.userId);
    await addVaultKey(vaultId, member.userId);
    await enrollZk(mgr.userId);
    await enrollZk(member.userId);
    // Simulate a prior revoke leaving the vault flagged.
    await deps.db.update(deps.vaults).set({ rekeyPending: true }).where(deps.eq(deps.vaults.id, vaultId));

    const i1 = await makeV2Item(vaultId);
    const i2 = await makeV2Item(vaultId);
    // Seed old terms to prove REPLACE (not append).
    await deps.db.insert(deps.itemSearchTerms).values({ itemId: i1, termHash: randomBytes(32) });

    const res = await req(`/vaults/${vaultId}/rekey`, mgr.cookie, {
      method: "POST",
      body: JSON.stringify({
        expectedKeyVersion: 1,
        newKeyVersion: 2,
        wrappedKeys: [
          { userId: mgr.userId, wrappedKey: b64(48) },
          { userId: member.userId, wrappedKey: b64(48) },
        ],
        items: [rekeyItemPayload(i1), rekeyItemPayload(i2)],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keyVersion: number; rekeyPending: boolean; itemCount: number };
    expect(body.keyVersion).toBe(2);
    expect(body.rekeyPending).toBe(false);
    expect(body.itemCount).toBe(2);

    const [v] = await deps.db
      .select({ keyVersion: deps.vaults.keyVersion, rekeyPending: deps.vaults.rekeyPending })
      .from(deps.vaults)
      .where(deps.eq(deps.vaults.id, vaultId));
    expect(v!.keyVersion).toBe(2);
    expect(v!.rekeyPending).toBe(false);

    // Keys present for both members only.
    const keys = await deps.db
      .select({ userId: deps.vaultKeys.userId })
      .from(deps.vaultKeys)
      .where(deps.eq(deps.vaultKeys.vaultId, vaultId));
    expect(keys.map((k) => k.userId).sort()).toEqual([mgr.userId, member.userId].sort());

    // i1 had 1 old term seeded + 2 new → REPLACE means exactly 2.
    const terms = await deps.db
      .select({ itemId: deps.itemSearchTerms.itemId })
      .from(deps.itemSearchTerms)
      .where(deps.eq(deps.itemSearchTerms.itemId, i1));
    expect(terms.length).toBe(2);
  });

  it("rejects when the item set is incomplete (an item is left on the old key)", async () => {
    const orgId = await makeOrg();
    const mgr = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, mgr.userId, 2);
    await addVaultMember(vaultId, mgr.userId, "manager");
    await addVaultKey(vaultId, mgr.userId);
    await enrollZk(mgr.userId);
    const i1 = await makeV2Item(vaultId);
    await makeV2Item(vaultId); // i2 omitted from payload

    const res = await req(`/vaults/${vaultId}/rekey`, mgr.cookie, {
      method: "POST",
      body: JSON.stringify({
        expectedKeyVersion: 1,
        newKeyVersion: 2,
        wrappedKeys: [{ userId: mgr.userId, wrappedKey: b64(48) }],
        items: [rekeyItemPayload(i1)],
      }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("rekey_incomplete_items");
  });

  it("rejects on keyVersion mismatch (optimistic concurrency)", async () => {
    const orgId = await makeOrg();
    const mgr = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, mgr.userId, 2);
    await addVaultMember(vaultId, mgr.userId, "manager");
    await addVaultKey(vaultId, mgr.userId);
    await enrollZk(mgr.userId);
    const i1 = await makeV2Item(vaultId);

    // Client thinks version is 5 but it's actually 1.
    const res = await req(`/vaults/${vaultId}/rekey`, mgr.cookie, {
      method: "POST",
      body: JSON.stringify({
        expectedKeyVersion: 5,
        newKeyVersion: 6,
        wrappedKeys: [{ userId: mgr.userId, wrappedKey: b64(48) }],
        items: [rekeyItemPayload(i1)],
      }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("rekey_conflict");
  });

  it("rejects a wrappedKeys entry for a user outside the org", async () => {
    const orgId = await makeOrg();
    const otherOrgId = await makeOrg();
    const mgr = await makeUser(orgId, "admin");
    const outsider = await makeUser(otherOrgId, "member");
    const vaultId = await makeVault(orgId, mgr.userId, 2);
    await addVaultMember(vaultId, mgr.userId, "manager");
    await addVaultKey(vaultId, mgr.userId);
    await enrollZk(mgr.userId);
    const i1 = await makeV2Item(vaultId);

    const res = await req(`/vaults/${vaultId}/rekey`, mgr.cookie, {
      method: "POST",
      body: JSON.stringify({
        expectedKeyVersion: 1,
        newKeyVersion: 2,
        wrappedKeys: [
          { userId: mgr.userId, wrappedKey: b64(48) },
          { userId: outsider.userId, wrappedKey: b64(48) },
        ],
        items: [rekeyItemPayload(i1)],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("non-manager cannot rekey", async () => {
    const orgId = await makeOrg();
    const mgr = await makeUser(orgId, "admin");
    const editor = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, mgr.userId, 2);
    await addVaultMember(vaultId, mgr.userId, "manager");
    await addVaultMember(vaultId, editor.userId, "editor");
    await addVaultKey(vaultId, editor.userId);
    const i1 = await makeV2Item(vaultId);

    const res = await req(`/vaults/${vaultId}/rekey`, editor.cookie, {
      method: "POST",
      body: JSON.stringify({
        expectedKeyVersion: 1,
        newKeyVersion: 2,
        wrappedKeys: [{ userId: editor.userId, wrappedKey: b64(48) }],
        items: [rekeyItemPayload(i1)],
      }),
    });
    expect(res.status).toBe(403);
  });

  // ---- Task B: revoke → rekey_pending ---------------------------------------

  it("removing a member from a v2 vault deletes their vault_keys row and sets rekeyPending", async () => {
    const orgId = await makeOrg();
    const mgr = await makeUser(orgId, "admin");
    const victim = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, mgr.userId, 2);
    await addVaultMember(vaultId, mgr.userId, "manager");
    await addVaultMember(vaultId, victim.userId, "editor");
    await addVaultKey(vaultId, mgr.userId);
    await addVaultKey(vaultId, victim.userId);

    const res = await req(`/vaults/${vaultId}/members/${victim.userId}`, mgr.cookie, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);

    const victimKey = await deps.db
      .select({ userId: deps.vaultKeys.userId })
      .from(deps.vaultKeys)
      .where(deps.and(deps.eq(deps.vaultKeys.vaultId, vaultId), deps.eq(deps.vaultKeys.userId, victim.userId)));
    expect(victimKey.length).toBe(0);

    const mgrKey = await deps.db
      .select({ userId: deps.vaultKeys.userId })
      .from(deps.vaultKeys)
      .where(deps.and(deps.eq(deps.vaultKeys.vaultId, vaultId), deps.eq(deps.vaultKeys.userId, mgr.userId)));
    expect(mgrKey.length).toBe(1); // manager keeps theirs

    const [v] = await deps.db
      .select({ rekeyPending: deps.vaults.rekeyPending })
      .from(deps.vaults)
      .where(deps.eq(deps.vaults.id, vaultId));
    expect(v!.rekeyPending).toBe(true);
  });

  it("removing a member from a v1 vault does NOT set rekeyPending (AC-024.4 unchanged)", async () => {
    const orgId = await makeOrg();
    const mgr = await makeUser(orgId, "admin");
    const victim = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, mgr.userId, 1);
    await addVaultMember(vaultId, mgr.userId, "manager");
    await addVaultMember(vaultId, victim.userId, "editor");

    const res = await req(`/vaults/${vaultId}/members/${victim.userId}`, mgr.cookie, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);

    const [v] = await deps.db
      .select({ rekeyPending: deps.vaults.rekeyPending })
      .from(deps.vaults)
      .where(deps.eq(deps.vaults.id, vaultId));
    expect(v!.rekeyPending).toBe(false);
  });

  // ---- Review fixes: roster (direct ∪ team), publicKey-null exclusion --------

  it("rekey roster = direct ∪ team-derived: wrappedKeys must cover a team member", async () => {
    const orgId = await makeOrg();
    const mgr = await makeUser(orgId, "admin");
    const teamUser = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, mgr.userId, 2);
    await addVaultMember(vaultId, mgr.userId, "manager");
    await enrollZk(mgr.userId);
    await enrollZk(teamUser.userId);

    // teamUser gets vault access ONLY via a team grant (no direct membership).
    const teamId = await makeTeam(orgId);
    await addTeamMember(teamId, teamUser.userId);
    await addVaultTeam(vaultId, teamId, "editor");

    const i1 = await makeV2Item(vaultId);

    // Omitting the team-derived member → roster-incompleteness 409.
    const missing = await req(`/vaults/${vaultId}/rekey`, mgr.cookie, {
      method: "POST",
      body: JSON.stringify({
        expectedKeyVersion: 1,
        newKeyVersion: 2,
        wrappedKeys: [{ userId: mgr.userId, wrappedKey: b64(48) }],
        items: [rekeyItemPayload(i1)],
      }),
    });
    expect(missing.status).toBe(409);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      "rekey_incomplete_members",
    );

    // Including the team-derived member → accepted, and their vault_keys row is
    // written (no silent lockout).
    const ok = await req(`/vaults/${vaultId}/rekey`, mgr.cookie, {
      method: "POST",
      body: JSON.stringify({
        expectedKeyVersion: 1,
        newKeyVersion: 2,
        wrappedKeys: [
          { userId: mgr.userId, wrappedKey: b64(48) },
          { userId: teamUser.userId, wrappedKey: b64(48) },
        ],
        items: [rekeyItemPayload(i1)],
      }),
    });
    expect(ok.status).toBe(200);

    const keys = await deps.db
      .select({ userId: deps.vaultKeys.userId })
      .from(deps.vaultKeys)
      .where(deps.eq(deps.vaultKeys.vaultId, vaultId));
    expect(keys.map((k) => k.userId).sort()).toEqual([mgr.userId, teamUser.userId].sort());
  });

  it("rejects a wrappedKeys entry for a member who has not enrolled ZK (publicKey=null)", async () => {
    const orgId = await makeOrg();
    const mgr = await makeUser(orgId, "admin");
    const noKey = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, mgr.userId, 2);
    await addVaultMember(vaultId, mgr.userId, "manager");
    await addVaultMember(vaultId, noKey.userId, "editor");
    await enrollZk(mgr.userId);
    // noKey has NO userKeys row → publicKey is null.
    const i1 = await makeV2Item(vaultId);

    const res = await req(`/vaults/${vaultId}/rekey`, mgr.cookie, {
      method: "POST",
      body: JSON.stringify({
        expectedKeyVersion: 1,
        newKeyVersion: 2,
        wrappedKeys: [
          { userId: mgr.userId, wrappedKey: b64(48) },
          { userId: noKey.userId, wrappedKey: b64(48) },
        ],
        items: [rekeyItemPayload(i1)],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("a not-enrolled member is EXCLUDED from the roster requirement (not required, payload still valid)", async () => {
    const orgId = await makeOrg();
    const mgr = await makeUser(orgId, "admin");
    const noKey = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, mgr.userId, 2);
    await addVaultMember(vaultId, mgr.userId, "manager");
    await addVaultMember(vaultId, noKey.userId, "editor"); // no ZK enrollment
    await addVaultKey(vaultId, mgr.userId);
    await enrollZk(mgr.userId);
    const i1 = await makeV2Item(vaultId);

    // Only the enrolled member is in wrappedKeys → must still succeed (the
    // not-enrolled member is not required and not wrapped — no failure, no junk).
    const res = await req(`/vaults/${vaultId}/rekey`, mgr.cookie, {
      method: "POST",
      body: JSON.stringify({
        expectedKeyVersion: 1,
        newKeyVersion: 2,
        wrappedKeys: [{ userId: mgr.userId, wrappedKey: b64(48) }],
        items: [rekeyItemPayload(i1)],
      }),
    });
    expect(res.status).toBe(200);

    const keys = await deps.db
      .select({ userId: deps.vaultKeys.userId })
      .from(deps.vaultKeys)
      .where(deps.eq(deps.vaultKeys.vaultId, vaultId));
    expect(keys.map((k) => k.userId)).toEqual([mgr.userId]);
  });
});
