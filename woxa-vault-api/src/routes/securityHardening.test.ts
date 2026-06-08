import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Regression tests for the 2026-06 blue-team hardening pass. Drives the REAL
// app + REAL Postgres (project convention: integration tests, never mocks).
//
// Each block encodes an attack that USED to succeed and now must be blocked:
//   1. ZK enforcement — a client must not be able to write plaintext metadata
//      into a v2 (zero-knowledge) vault (create + patch). (DESIGN §5 / FR-043)
//   2. Server-side vault lock — a fresh session starts LOCKED; reveal/destructive
//      endpoints 401 `vault_locked` until POST /me/verify-password stamps an
//      unlock. A login (or stolen cookie) alone never unlocks. (AC-055.8)

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
  const { organizations, orgMembers, users, vaults, vaultMembers, items } = await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { createSession, markSessionVaultUnlocked, SESSION_COOKIE_NAME } = await import("@/lib/session");
  const { hashPassword } = await import("@/lib/password");
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
    markSessionVaultUnlocked,
    hashPassword,
    SESSION_COOKIE_NAME,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("Blue-team hardening regressions (integration)", () => {
  let deps: Deps;
  let orgId: string;
  const userIds: string[] = [];
  const vaultIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
    orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "Hardening Org",
      slug: `hd-${orgId.slice(0, 8)}`,
    });
  });

  afterAll(async () => {
    if (!deps) return;
    if (vaultIds.length) await deps.db.delete(deps.vaults).where(deps.inArray(deps.vaults.id, vaultIds));
    if (userIds.length) await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, userIds));
    await deps.db.delete(deps.organizations).where(deps.eq(deps.organizations.id, orgId));
    await deps.sql.end({ timeout: 5 });
  });

  // Mint a user + session. `unlocked` controls whether the vault is unlocked
  // (the production default is LOCKED — see createSession's startUnlocked arg).
  async function makeUser(orgRole = "member", unlocked = true) {
    const userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `hd-${userId}@test.local`,
      passwordHash: null,
      totpEnabledAt: new Date(),
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    userIds.push(userId);
    const { token } = await deps.createSession(userId, {}, unlocked);
    return { userId, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
  }

  async function makeVault(createdBy: string, encryptionVersion = 2) {
    const [v] = await deps.db
      .insert(deps.vaults)
      .values({ orgId, name: `v-${randomUUID().slice(0, 8)}`, createdBy, encryptionVersion })
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

  // -------------------------------------------------------------------------
  // 1. ZK enforcement (DESIGN §5 / FR-043 / AC-017.2)
  // -------------------------------------------------------------------------
  describe("ZK metadata enforcement on v2 vaults", () => {
    it("rejects create with plaintext name and NO nameCiphertext on a v2 vault (400)", async () => {
      const u = await makeUser("member");
      const vaultId = await makeVault(u.userId, 2);
      await addVaultMember(vaultId, u.userId, "manager");

      const res = await req(`/vaults/${vaultId}/items`, u.cookie, {
        method: "POST",
        body: JSON.stringify({ type: "login", name: "plaintext-leak" }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string; details?: any } };
      expect(body.error.code).toBe("validation_error");
      expect(body.error.details?.nameCiphertext).toBeTruthy();

      // And nothing landed in the DB with a plaintext name.
      const leaked = await deps.db.query.items.findFirst({
        where: deps.eq(deps.items.vaultId, vaultId),
      });
      expect(leaked).toBeUndefined();
    });

    it("accepts create with nameCiphertext on a v2 vault (201) and stores name='' ", async () => {
      const u = await makeUser("member");
      const vaultId = await makeVault(u.userId, 2);
      await addVaultMember(vaultId, u.userId, "manager");

      const res = await req(`/vaults/${vaultId}/items`, u.cookie, {
        method: "POST",
        body: JSON.stringify({
          type: "login",
          name: "",
          nameCiphertext: b64("secret-name"),
          nameIv: b64("name-iv-aaaaa"),
        }),
      });
      expect(res.status).toBe(201);
      const id = ((await res.json()) as { item: { id: string } }).item.id;
      const row = await deps.db.query.items.findFirst({ where: deps.eq(deps.items.id, id) });
      expect(row!.name).toBe("");
      expect(row!.nameCiphertext!.toString("base64")).toBe(b64("secret-name"));
    });

    it("rejects PATCH that sets a plaintext name on a v2 item (400)", async () => {
      const u = await makeUser("member");
      const vaultId = await makeVault(u.userId, 2);
      await addVaultMember(vaultId, u.userId, "manager");

      const create = await req(`/vaults/${vaultId}/items`, u.cookie, {
        method: "POST",
        body: JSON.stringify({ type: "login", name: "", nameCiphertext: b64("n"), nameIv: b64("iv") }),
      });
      const id = ((await create.json()) as { item: { id: string } }).item.id;

      const patch = await req(`/items/${id}`, u.cookie, {
        method: "PATCH",
        body: JSON.stringify({ name: "now-plaintext" }),
      });
      expect(patch.status).toBe(400);
      const body = (await patch.json()) as { error: { code: string; details?: any } };
      expect(body.error.details?.name).toBeTruthy();
    });

    it("legacy v1 vault STILL accepts a plaintext name (no regression)", async () => {
      const u = await makeUser("member");
      const vaultId = await makeVault(u.userId, 1);
      await addVaultMember(vaultId, u.userId, "manager");

      const res = await req(`/vaults/${vaultId}/items`, u.cookie, {
        method: "POST",
        body: JSON.stringify({ type: "login", name: "legacy-plaintext" }),
      });
      expect(res.status).toBe(201);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Server-side vault lock (AC-055.8)
  // -------------------------------------------------------------------------
  describe("Fresh session starts LOCKED (no auto-unlock)", () => {
    it("a fresh (locked) session is 401 vault_locked on reveal; unlocking clears it", async () => {
      // Locked session — exactly what a stolen cookie / fresh login looks like.
      const locked = await makeUser("member", false);
      const vaultId = await makeVault(locked.userId, 1);
      await addVaultMember(vaultId, locked.userId, "manager");

      // Create an item (metadata write — not lock-gated, so this works locked).
      const create = await req(`/vaults/${vaultId}/items`, locked.cookie, {
        method: "POST",
        body: JSON.stringify({
          type: "login",
          name: "lock-test",
          passwordCiphertext: b64("pw-ct"),
          passwordIv: b64("pw-iv-aaaaaa"),
        }),
      });
      expect(create.status).toBe(201);
      const id = ((await create.json()) as { item: { id: string } }).item.id;

      // Reveal is lock-gated → 401 vault_locked while the session is locked.
      const reveal = await req(`/items/${id}/password`, locked.cookie);
      expect(reveal.status).toBe(401);
      const body = (await reveal.json()) as { error: { code: string } };
      expect(body.error.code).toBe("vault_locked");

      // Detail view (returns decrypted notes) is also lock-gated → 401.
      const view = await req(`/items/${id}`, locked.cookie);
      expect(view.status).toBe(401);
    });

    it("an unlocked session reveals normally (legitimate flow preserved)", async () => {
      const unlocked = await makeUser("member", true);
      const vaultId = await makeVault(unlocked.userId, 1);
      await addVaultMember(vaultId, unlocked.userId, "manager");

      const create = await req(`/vaults/${vaultId}/items`, unlocked.cookie, {
        method: "POST",
        body: JSON.stringify({
          type: "login",
          name: "ok",
          passwordCiphertext: b64("pw-ct"),
          passwordIv: b64("pw-iv-aaaaaa"),
        }),
      });
      const id = ((await create.json()) as { item: { id: string } }).item.id;

      const reveal = await req(`/items/${id}/password`, unlocked.cookie);
      expect(reveal.status).toBe(200);
    });

    it("a locked session cannot DELETE (purge) a vault — 401 vault_locked", async () => {
      const locked = await makeUser("member", false);
      const vaultId = await makeVault(locked.userId, 1);
      await addVaultMember(vaultId, locked.userId, "manager");

      const del = await req(`/vaults/${vaultId}`, locked.cookie, { method: "DELETE" });
      expect(del.status).toBe(401);
      const body = (await del.json()) as { error: { code: string } };
      expect(body.error.code).toBe("vault_locked");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Deprecated authKeyHash factor is rejected once masterAuthKeyHash exists
  // -------------------------------------------------------------------------
  describe("verify-password refuses the deprecated authKeyHash factor", () => {
    it("rejects authKeyHash when the account has masterAuthKeyHash (401), but masterAuthKeyHash works", async () => {
      const userId = randomUUID();
      // The client derives a 64+ hex master-auth-key; the server stores Argon2(it).
      const masterKey = "f".repeat(64);
      const storedMasterHash = await deps.hashPassword(masterKey);
      const storedLegacyHash = await deps.hashPassword("a".repeat(64));
      await deps.db.insert(deps.users).values({
        id: userId,
        email: `hd-${userId}@test.local`,
        passwordHash: null,
        masterAuthKeyHash: storedMasterHash,
        authKeyHash: storedLegacyHash, // legacy factor still present in the row
        totpEnabledAt: new Date(),
        status: "active",
      });
      await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: "member" });
      userIds.push(userId);
      const { token } = await deps.createSession(userId, {}, false);
      const cookie = `${deps.SESSION_COOKIE_NAME}=${token}`;

      // Attack: present the DEPRECATED authKeyHash — must be rejected outright.
      const legacy = await req(`/me/verify-password`, cookie, {
        method: "POST",
        body: JSON.stringify({ authKeyHash: "a".repeat(64) }),
      });
      expect(legacy.status).toBe(401);
      const body = (await legacy.json()) as { error: { code: string } };
      expect(body.error.code).toBe("invalid_credentials");

      // Legitimate: the current masterAuthKeyHash factor still unlocks.
      const ok = await req(`/me/verify-password`, cookie, {
        method: "POST",
        body: JSON.stringify({ masterAuthKeyHash: masterKey }),
      });
      expect(ok.status).toBe(200);
    });
  });
});
