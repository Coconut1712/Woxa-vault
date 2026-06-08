import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// US-060 (rotation tracking) + Wave-2a v2 version-snapshot metadata gap.
// Drives the REAL app + REAL Postgres (project memory: integration tests hit a
// real database, never mocks).
//
// Pins:
//   * ItemSummary.rotationStatus / rotationDueAt computed from passwordChangedAt
//     + effective policy (item override ?? org default): fresh/due/overdue/none.
//   * GET /items/rotation-due: returns due+overdue items the caller can reach,
//     scoped to the active org, with counts; a stranger sees none (RBAC).
//   * v2 item_versions snapshot copies name/username/url ciphertext; the version
//     reveal returns those ciphertext-metadata fields.

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
    eq,
    inArray,
    createSession,
    SESSION_COOKIE_NAME,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

describe("rotation tracking + v2 version metadata (US-060 / Wave-2a) integration", () => {
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

  async function makeOrg(settings: Record<string, unknown> = {}): Promise<string> {
    const orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "Rotation Test Org",
      slug: `rot-${orgId.slice(0, 8)}`,
      settings,
    });
    createdOrgIds.push(orgId);
    return orgId;
  }

  async function makeUser(orgId: string, orgRole = "member"): Promise<{ userId: string; cookie: string }> {
    const userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `rot-${userId}@test.local`,
      totpEnabledAt: new Date(),
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    createdUserIds.push(userId);
    const { token, session } = await deps.createSession(userId, {}, true);
    // Set active org + vault-unlock so reveal/list endpoints work. session.id is
    // SHA-256(token); use the returned row id directly (no token parsing).
    const { sessions } = await import("@/db/schema");
    await deps.db
      .update(sessions)
      .set({ activeOrgId: orgId, vaultUnlockedAt: new Date() })
      .where(deps.eq(sessions.id, session.id));
    return { userId, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
  }

  // Default to a v1 (legacy plaintext) vault so the rotation tests can create
  // items with plaintext `name` (the ZK enforcement now blocks plaintext
  // metadata on v2 vaults). The dedicated v2 metadata-version test passes 2
  // explicitly and sends nameCiphertext.
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

  function req(path: string, cookie: string, init: RequestInit = {}) {
    return deps.app.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
    });
  }

  interface RotDto {
    id: string;
    rotationPolicyDays: number | null;
    rotationStatus: "none" | "fresh" | "due" | "overdue";
    rotationDueAt: string | null;
    passwordChangedAt: string | null;
  }

  // v2 (ZK) password blob — its mere PRESENCE stamps password_changed_at on
  // create (AC-015.3); the server stores the ciphertext verbatim.
  const PW_CT = Buffer.from("pw-ciphertext").toString("base64");
  const PW_IV = Buffer.from("pw-iv-aaaaaaa").toString("base64");

  async function createItem(vaultId: string, cookie: string, body: Record<string, unknown>): Promise<RotDto> {
    const res = await req(`/vaults/${vaultId}/items`, cookie, { method: "POST", body: JSON.stringify(body) });
    expect(res.status).toBe(201);
    return ((await res.json()) as { item: RotDto }).item;
  }

  // Backdate password_changed_at directly so we can hit due/overdue without
  // waiting (the route always stamps now() on a password change).
  async function backdatePassword(itemId: string, daysAgo: number) {
    const when = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    await deps.db.update(deps.items).set({ passwordChangedAt: when }).where(deps.eq(deps.items.id, itemId));
  }

  // ---- status compute via the API serializer -------------------------------

  it("rotationStatus reflects item policy: fresh / due / overdue / none", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    // No policy, with password → none.
    const noPolicy = await createItem(vaultId, owner.cookie, { type: "login", name: "no-policy", passwordCiphertext: PW_CT, passwordIv: PW_IV });
    expect(noPolicy.rotationStatus).toBe("none");
    expect(noPolicy.rotationDueAt).toBeNull();

    // 30-day policy, fresh.
    const fresh = await createItem(vaultId, owner.cookie, {
      type: "login", name: "fresh", passwordCiphertext: PW_CT, passwordIv: PW_IV, rotationPolicyDays: 30,
    });
    expect(fresh.rotationPolicyDays).toBe(30);
    expect(fresh.rotationStatus).toBe("fresh");
    expect(fresh.rotationDueAt).toBeTruthy();

    // 30-day policy, backdated 25 days → due (within 14-day window).
    const due = await createItem(vaultId, owner.cookie, {
      type: "login", name: "due", passwordCiphertext: PW_CT, passwordIv: PW_IV, rotationPolicyDays: 30,
    });
    await backdatePassword(due.id, 25);
    const dueRes = await req(`/items/${due.id}`, owner.cookie);
    expect(dueRes.status).toBe(200);
    expect(((await dueRes.json()) as { item: RotDto }).item.rotationStatus).toBe("due");

    // 30-day policy, backdated 40 days → overdue.
    const overdue = await createItem(vaultId, owner.cookie, {
      type: "login", name: "overdue", passwordCiphertext: PW_CT, passwordIv: PW_IV, rotationPolicyDays: 30,
    });
    await backdatePassword(overdue.id, 40);
    const ovRes = await req(`/items/${overdue.id}`, owner.cookie);
    expect(((await ovRes.json()) as { item: RotDto }).item.rotationStatus).toBe("overdue");
  });

  it("org default applies when item has no own policy; 0 clamps to null (inherit)", async () => {
    const orgId = await makeOrg({ rotationDefaultDays: 30 });
    const owner = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    // No item policy → inherits org default 30; backdate 40 → overdue.
    const it = await createItem(vaultId, owner.cookie, { type: "login", name: "inherit", passwordCiphertext: PW_CT, passwordIv: PW_IV });
    expect(it.rotationPolicyDays).toBeNull();
    await backdatePassword(it.id, 40);
    const res = await req(`/items/${it.id}`, owner.cookie);
    expect(((await res.json()) as { item: RotDto }).item.rotationStatus).toBe("overdue");

    // Item sends 0 → stored as null (inherit). Still overdue via org default.
    const zero = await createItem(vaultId, owner.cookie, {
      type: "login", name: "zero", passwordCiphertext: PW_CT, passwordIv: PW_IV, rotationPolicyDays: 0,
    });
    expect(zero.rotationPolicyDays).toBeNull();
  });

  // ---- rotation-due endpoint + RBAC ----------------------------------------

  it("GET /items/rotation-due returns due+overdue for the caller; stranger gets none (RBAC)", async () => {
    const orgId = await makeOrg({ rotationDefaultDays: 30 });
    const owner = await makeUser(orgId, "admin");
    const stranger = await makeUser(orgId, "member"); // member of org, NOT the vault
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    const overdue = await createItem(vaultId, owner.cookie, { type: "login", name: "rot-overdue", passwordCiphertext: PW_CT, passwordIv: PW_IV });
    await backdatePassword(overdue.id, 40);
    const due = await createItem(vaultId, owner.cookie, { type: "login", name: "rot-due", passwordCiphertext: PW_CT, passwordIv: PW_IV });
    await backdatePassword(due.id, 25);
    // Fresh item must NOT appear.
    await createItem(vaultId, owner.cookie, { type: "login", name: "rot-fresh", passwordCiphertext: PW_CT, passwordIv: PW_IV });

    const res = await req(`/items/rotation-due`, owner.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { id: string; rotationStatus: string; name: string }[];
      counts: { due: number; overdue: number; total: number };
    };
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain(overdue.id);
    expect(ids).toContain(due.id);
    expect(body.counts.overdue).toBe(1);
    expect(body.counts.due).toBe(1);
    expect(body.counts.total).toBe(2);
    // overdue sorts first.
    expect(body.items[0]!.rotationStatus).toBe("overdue");
    // No secret leaks.
    expect(JSON.stringify(body)).not.toContain("\"password\"");

    // Stranger (org member but no vault grant) sees nothing.
    const sRes = await req(`/items/rotation-due`, stranger.cookie);
    expect(sRes.status).toBe(200);
    const sBody = (await sRes.json()) as { items: unknown[]; counts: { total: number } };
    expect(sBody.counts.total).toBe(0);
    expect(sBody.items.length).toBe(0);
  });

  // ---- v2 version snapshot + reveal of ciphertext-metadata -----------------

  it("v2 PATCH snapshots name/username/url ciphertext; version reveal returns them", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "admin");
    const vaultId = await makeVault(orgId, owner.userId, 2); // ZK vault
    await addVaultMember(vaultId, owner.userId, "manager");

    const nameCt = Buffer.from("name-ciphertext-v1").toString("base64");
    const nameIv = Buffer.from("name-iv-aaaaa").toString("base64");
    const userCt = Buffer.from("user-ciphertext-v1").toString("base64");
    const userIv = Buffer.from("user-iv-aaaaa").toString("base64");
    const urlCt = Buffer.from("url-ciphertext-v1").toString("base64");
    const urlIv = Buffer.from("url-iv-aaaaaa").toString("base64");

    // Create a v2 item carrying ciphertext-metadata (name="" placeholder).
    const createRes = await req(`/vaults/${vaultId}/items`, owner.cookie, {
      method: "POST",
      body: JSON.stringify({
        type: "login",
        name: "",
        nameCiphertext: nameCt, nameIv,
        usernameCiphertext: userCt, usernameIv: userIv,
        urlCiphertext: urlCt, urlIv,
        passwordCiphertext: Buffer.from("pw-ct").toString("base64"),
        passwordIv: Buffer.from("pw-iv-aaaaaaa").toString("base64"),
      }),
    });
    expect(createRes.status).toBe(201);
    const itemId = ((await createRes.json()) as { item: { id: string } }).item.id;

    // Content edit (re-encrypt the name) → snapshots the PRE-edit ciphertext.
    const nameCt2 = Buffer.from("name-ciphertext-v2").toString("base64");
    const patchRes = await req(`/items/${itemId}`, owner.cookie, {
      method: "PATCH",
      body: JSON.stringify({ nameCiphertext: nameCt2, nameIv }),
    });
    expect(patchRes.status).toBe(200);

    // Reveal version 1 → must carry the ORIGINAL ciphertext-metadata.
    const revealRes = await req(`/items/${itemId}/versions/1`, owner.cookie);
    expect(revealRes.status).toBe(200);
    const snap = (await revealRes.json()) as {
      version: number;
      name: string;
      nameCiphertext: string | null;
      nameIv: string | null;
      usernameCiphertext: string | null;
      urlCiphertext: string | null;
    };
    expect(snap.version).toBe(1);
    expect(snap.name).toBe(""); // v2 placeholder
    expect(snap.nameCiphertext).toBe(nameCt); // original, not the re-encrypted v2
    expect(snap.nameIv).toBe(nameIv);
    expect(snap.usernameCiphertext).toBe(userCt);
    expect(snap.urlCiphertext).toBe(urlCt);

    // The snapshot row in DB carries the ciphertext-metadata columns.
    const rows = await deps.db
      .select({
        nameCiphertext: deps.itemVersions.nameCiphertext,
        usernameCiphertext: deps.itemVersions.usernameCiphertext,
        urlCiphertext: deps.itemVersions.urlCiphertext,
      })
      .from(deps.itemVersions)
      .where(deps.eq(deps.itemVersions.itemId, itemId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.nameCiphertext?.toString("base64")).toBe(nameCt);
  });
});
