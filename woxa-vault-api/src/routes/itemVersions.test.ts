import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for item version history (US-015 AC-015.2 / FR-037) and
// password_changed_at (AC-015.3). Drives the REAL app + REAL Postgres (project
// memory: integration tests hit a real database, never mocks).
//
// What this pins:
//   * PATCH that changes CONTENT creates an item_versions snapshot; >10 edits
//     prune down to the last 10 (FR-037).
//   * PATCH that touches ONLY metadata (folderId) creates NO version.
//   * GET /items/:id/versions: a vault VIEWER sees the metadata list but
//     canReveal=false; revealing a version's secret (GET .../versions/:v) → 403.
//     A manager → 200 with decrypted content.
//   * password_changed_at: set on create-with-password; advanced when the
//     password changes; UNCHANGED when only a non-password field is edited.

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
    items,
    itemVersions,
    folders,
  } = await import("@/db/schema");
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
    itemVersions,
    folders,
    eq,
    inArray,
    createSession,
    SESSION_COOKIE_NAME,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

describe("item version history + password_changed_at (US-015) integration", () => {
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

  // ---- helpers -------------------------------------------------------------

  async function makeOrg(): Promise<string> {
    const orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "Versions Test Org",
      slug: `ver-${orgId.slice(0, 8)}`,
    });
    createdOrgIds.push(orgId);
    return orgId;
  }

  async function makeUser(orgId: string, orgRole = "member"): Promise<{ userId: string; cookie: string }> {
    const userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `ver-${userId}@test.local`,
      passwordHash: null,
      totpEnabledAt: new Date(),
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
      .values({ orgId, name: `vault-${randomUUID().slice(0, 8)}`, createdBy, encryptionVersion: 1 })
      .returning();
    createdVaultIds.push(v!.id);
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

  interface ItemDto {
    id: string;
    name: string;
    passwordChangedAt: string | null;
  }

  async function createItem(
    vaultId: string,
    cookie: string,
    body: Record<string, unknown>,
  ): Promise<ItemDto> {
    const res = await req(`/vaults/${vaultId}/items`, cookie, {
      method: "POST",
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { item: ItemDto }).item;
  }

  async function patchItem(itemId: string, cookie: string, body: Record<string, unknown>) {
    return req(`/items/${itemId}`, cookie, { method: "PATCH", body: JSON.stringify(body) });
  }

  // v2 (ZK) password blobs. The server stores ciphertext verbatim and stamps
  // password_changed_at on its PRESENCE; the version reveal hands back the
  // ciphertext (never plaintext). Distinct labels prove the snapshot captured
  // the PRE-edit blob.
  const pwBlob = (label: string) => ({
    passwordCiphertext: Buffer.from(`ct-${label}`).toString("base64"),
    passwordIv: Buffer.from("iv-aaaaaaaaa").toString("base64"),
  });
  const PW_ORIG = pwBlob("orig");
  const PW_NEW = pwBlob("new");

  // ---- versioning + prune --------------------------------------------------

  it("content PATCH creates a version; >10 edits prune to last 10 (FR-037)", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    const item = await createItem(vaultId, owner.cookie, {
      type: "login",
      name: "v0",
      ...PW_ORIG,
    });

    // 12 content edits → 12 snapshots BEFORE each edit, pruned to last 10.
    for (let i = 1; i <= 12; i++) {
      const res = await patchItem(item.id, owner.cookie, { name: `v${i}` });
      expect(res.status).toBe(200);
    }

    const rows = await deps.db
      .select({ versionNumber: deps.itemVersions.versionNumber })
      .from(deps.itemVersions)
      .where(deps.eq(deps.itemVersions.itemId, item.id));

    expect(rows.length).toBe(10);
    const nums = rows.map((r) => r.versionNumber).sort((a, b) => a - b);
    // 12 edits produced versions 1..12; oldest two pruned → 3..12 remain.
    expect(nums[0]).toBe(3);
    expect(nums[nums.length - 1]).toBe(12);
  });

  it("metadata-only PATCH (folderId) creates NO version", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    const [folder] = await deps.db
      .insert(deps.folders)
      .values({ vaultId, name: "f1" })
      .returning();

    const item = await createItem(vaultId, owner.cookie, {
      type: "login",
      name: "meta-only",
      ...PW_ORIG,
    });

    const res = await patchItem(item.id, owner.cookie, { folderId: folder!.id });
    expect(res.status).toBe(200);

    const rows = await deps.db
      .select({ versionNumber: deps.itemVersions.versionNumber })
      .from(deps.itemVersions)
      .where(deps.eq(deps.itemVersions.itemId, item.id));
    expect(rows.length).toBe(0);
  });

  // ---- RBAC on the version endpoints ---------------------------------------

  it("viewer sees the version LIST (canReveal=false) but is 403 on reveal; manager 200 with content", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const viewer = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, viewer.userId, "viewer");

    const item = await createItem(vaultId, owner.cookie, {
      type: "login",
      name: "orig",
      ...PW_ORIG,
    });
    // One content edit so there is exactly one version (snapshot of "orig").
    expect((await patchItem(item.id, owner.cookie, { ...PW_NEW })).status).toBe(200);

    // Viewer: list visible, canReveal false.
    const listRes = await req(`/items/${item.id}/versions`, viewer.cookie);
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as {
      canReveal: boolean;
      versions: { version: number; editedByEmail: string; hasPassword: boolean }[];
    };
    expect(list.canReveal).toBe(false);
    expect(list.versions.length).toBe(1);
    expect(list.versions[0]!.version).toBe(1);
    expect(list.versions[0]!.hasPassword).toBe(true);
    // No secret leaks in the list payload.
    expect(JSON.stringify(list)).not.toContain(PW_ORIG.passwordCiphertext);

    // Viewer: revealing a version's content → 403.
    const viewerReveal = await req(`/items/${item.id}/versions/1`, viewer.cookie);
    expect(viewerReveal.status).toBe(403);

    // Manager: reveal → 200, returns the SNAPSHOTTED (pre-edit) ciphertext.
    const mgrReveal = await req(`/items/${item.id}/versions/1`, owner.cookie);
    expect(mgrReveal.status).toBe(200);
    const snap = (await mgrReveal.json()) as { version: number; passwordCiphertext: string | null };
    expect(snap.version).toBe(1);
    expect(snap.passwordCiphertext).toBe(PW_ORIG.passwordCiphertext);
  });

  it("no access to the item → 404 (anti-enumeration) on the version list", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const stranger = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    const item = await createItem(vaultId, owner.cookie, { type: "login", name: "x", ...PW_ORIG });
    const res = await req(`/items/${item.id}/versions`, stranger.cookie);
    expect(res.status).toBe(404);
  });

  // ---- password_changed_at (AC-015.3) --------------------------------------

  it("password_changed_at: set on create, advanced on password change, unchanged on non-password edit", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    // Create with password → passwordChangedAt set.
    const item = await createItem(vaultId, owner.cookie, {
      type: "login",
      name: "pwitem",
      ...PW_ORIG,
    });
    expect(item.passwordChangedAt).toBeTruthy();
    const createdStamp = new Date(item.passwordChangedAt!).getTime();

    // Non-password edit (name only) → passwordChangedAt UNCHANGED.
    const r1 = await patchItem(item.id, owner.cookie, { name: "renamed" });
    expect(r1.status).toBe(200);
    const afterName = ((await r1.json()) as { item: ItemDto }).item;
    expect(new Date(afterName.passwordChangedAt!).getTime()).toBe(createdStamp);

    // Password change → passwordChangedAt ADVANCES.
    await new Promise((res) => setTimeout(res, 5));
    const r2 = await patchItem(item.id, owner.cookie, { ...PW_NEW });
    expect(r2.status).toBe(200);
    const afterPw = ((await r2.json()) as { item: ItemDto }).item;
    expect(new Date(afterPw.passwordChangedAt!).getTime()).toBeGreaterThan(createdStamp);

    // Clearing the password ("") is NOT a rotation — stamp unchanged.
    const pwClearedStamp = new Date(afterPw.passwordChangedAt!).getTime();
    const r3 = await patchItem(item.id, owner.cookie, { passwordCiphertext: "" });
    expect(r3.status).toBe(200);
    const afterClear = ((await r3.json()) as { item: ItemDto }).item;
    expect(new Date(afterClear.passwordChangedAt!).getTime()).toBe(pwClearedStamp);
  });

  it("create WITHOUT a password → passwordChangedAt is null", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    const item = await createItem(vaultId, owner.cookie, { type: "note", name: "just-a-note" });
    expect(item.passwordChangedAt).toBeNull();
  });

  // ---- #3: concurrent PATCH must NOT collide on (item_id, version_number) ----

  it("concurrent content PATCHes serialize — no unique-violation 500, both apply (FR-037)", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    const item = await createItem(vaultId, owner.cookie, {
      type: "login",
      name: "race-0",
      ...PW_ORIG,
    });

    // Fire several content PATCHes in parallel (simulates double-click / two
    // tabs). Before the FOR UPDATE lock these raced on MAX(version_number)+1 and
    // some returned 500 from the unique index. All must now succeed.
    const N = 6;
    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        patchItem(item.id, owner.cookie, { name: `race-${i + 1}` }),
      ),
    );
    for (const res of responses) expect(res.status).toBe(200);

    // Each PATCH snapshotted the prior state → N distinct, contiguous versions.
    const rows = await deps.db
      .select({ versionNumber: deps.itemVersions.versionNumber })
      .from(deps.itemVersions)
      .where(deps.eq(deps.itemVersions.itemId, item.id));
    const nums = rows.map((r) => r.versionNumber).sort((a, b) => a - b);
    expect(nums.length).toBe(N);
    expect(new Set(nums).size).toBe(N); // no duplicates
    expect(nums[0]).toBe(1);
    expect(nums[nums.length - 1]).toBe(N);
  });

  // ---- #5: version LIST is explicitly capped at 10 ----

  it("version list returns at most 10 rows (FR-037 '10 most recent')", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    const item = await createItem(vaultId, owner.cookie, { type: "login", name: "L0", ...PW_ORIG });
    for (let i = 1; i <= 15; i++) {
      expect((await patchItem(item.id, owner.cookie, { name: `L${i}` })).status).toBe(200);
    }

    const res = await req(`/items/${item.id}/versions`, owner.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { versions: { version: number }[] };
    expect(body.versions.length).toBe(10);
    // Most-recent-first ordering preserved.
    expect(body.versions[0]!.version).toBeGreaterThan(body.versions[9]!.version);
  });

  // ---- #8: auditor WITH an item/vault grant can still reveal a version ----

  it("org-auditor holding a manager vault grant CAN reveal a version (effective role wins over auditor)", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    // This user's ORG role is auditor (org-wide read-only) but they ALSO hold a
    // manager grant on the vault → effective item role = manager. The old
    // `|| isAuditor` guard wrongly 403'd them; resolveItemRole already maps a
    // PURE auditor to viewer, so the effective role must win here.
    const auditorMgr = await makeUser(orgId, "auditor");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, auditorMgr.userId, "manager");

    const item = await createItem(vaultId, owner.cookie, {
      type: "login",
      name: "aud",
      ...PW_ORIG,
    });
    expect((await patchItem(item.id, owner.cookie, { ...PW_NEW })).status).toBe(200);

    // Reveal as the auditor-with-manager-grant → 200 with the snapshot ciphertext.
    const reveal = await req(`/items/${item.id}/versions/1`, auditorMgr.cookie);
    expect(reveal.status).toBe(200);
    const snap = (await reveal.json()) as { version: number; passwordCiphertext: string | null };
    expect(snap.version).toBe(1);
    expect(snap.passwordCiphertext).toBe(PW_ORIG.passwordCiphertext);
  });

  it("pure org-auditor (no vault grant) is STILL 403 on version reveal (viewer floor holds)", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const pureAuditor = await makeUser(orgId, "auditor");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    const item = await createItem(vaultId, owner.cookie, {
      type: "login",
      name: "aud2",
      ...PW_ORIG,
    });
    expect((await patchItem(item.id, owner.cookie, { ...PW_NEW })).status).toBe(200);

    // Pure auditor resolves to viewer (org-wide read-only) → reveal blocked.
    const reveal = await req(`/items/${item.id}/versions/1`, pureAuditor.cookie);
    expect(reveal.status).toBe(403);
  });
});
