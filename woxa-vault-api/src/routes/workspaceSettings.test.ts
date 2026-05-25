import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration tests for Phase-1 workspace Settings: rename, delete, the
// expanded security policy (autoLockMinutes + sso block), and partial-PATCH
// merge semantics. Drives the REAL app + REAL Postgres (project memory:
// integration tests hit a real database, never mocks).

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
  const { organizations, orgMembers, sessions, users, vaults, auditEvents } =
    await import("@/db/schema");
  const { eq, and, inArray, desc } = await import("drizzle-orm");
  const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/session");
  const { hashPassword } = await import("@/lib/password");
  return {
    app: createApp(),
    db,
    sql,
    organizations,
    orgMembers,
    sessions,
    users,
    vaults,
    auditEvents,
    eq,
    and,
    inArray,
    desc,
    createSession,
    SESSION_COOKIE_NAME,
    hashPassword,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

const MASTER_PW = "Correct-Horse-Battery-Staple-1";

describe("Workspace Settings — rename / delete / policy (integration)", () => {
  let deps: Deps;
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
  });

  afterAll(async () => {
    if (deps) {
      if (createdOrgIds.length > 0) {
        await deps.db
          .delete(deps.organizations)
          .where(deps.inArray(deps.organizations.id, createdOrgIds));
      }
      if (createdUserIds.length > 0) {
        await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, createdUserIds));
      }
      await deps.sql.end({ timeout: 5 });
    }
  });

  // Helper: create an org + a member with the given role, returns a session
  // cookie scoped to that org (first membership). withPassword seeds a master
  // password hash so the delete proof can succeed.
  async function seat(opts: {
    role: "owner" | "admin" | "member" | "guest";
    withPassword?: boolean;
    orgName?: string;
  }): Promise<{ orgId: string; userId: string; cookie: string }> {
    const orgId = randomUUID();
    const userId = randomUUID();
    const orgName = opts.orgName ?? `WS Settings ${orgId.slice(0, 8)}`;
    await deps.db
      .insert(deps.organizations)
      .values({ id: orgId, name: orgName, slug: `wss-${orgId.slice(0, 8)}` });
    createdOrgIds.push(orgId);

    await deps.db.insert(deps.users).values({
      id: userId,
      email: `wss-${userId}@test.local`,
      passwordHash: opts.withPassword ? await deps.hashPassword(MASTER_PW) : null,
      totpEnabledAt: new Date(), // sidestep the require2fa gate
      status: "active",
    });
    createdUserIds.push(userId);

    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: opts.role });

    const { token } = await deps.createSession(userId);
    return { orgId, userId, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
  }

  function getSettings(cookie: string) {
    return deps.app.request("/workspace/settings", { headers: { Cookie: cookie } });
  }
  function patchSettings(cookie: string, body: unknown) {
    return deps.app.request("/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  }
  function patchWorkspace(cookie: string, body: unknown) {
    return deps.app.request("/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  }
  function deleteWorkspace(cookie: string, body: unknown) {
    return deps.app.request("/workspace", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  }

  // ---- RENAME -------------------------------------------------------------

  it("owner renames the workspace -> 200, name changes, audit row written", async () => {
    const owner = await seat({ role: "owner" });
    const res = await patchWorkspace(owner.cookie, { name: "Renamed By Owner" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workspace: { id: string; name: string } };
    expect(body.workspace.name).toBe("Renamed By Owner");

    const [org] = await deps.db
      .select({ name: deps.organizations.name })
      .from(deps.organizations)
      .where(deps.eq(deps.organizations.id, owner.orgId));
    expect(org?.name).toBe("Renamed By Owner");

    const audit = await deps.db
      .select({ action: deps.auditEvents.action, metadata: deps.auditEvents.metadata })
      .from(deps.auditEvents)
      .where(
        deps.and(
          deps.eq(deps.auditEvents.orgId, owner.orgId),
          deps.eq(deps.auditEvents.action, "workspace.renamed"),
        ),
      );
    expect(audit.length).toBe(1);
    expect((audit[0]!.metadata as { to: string }).to).toBe("Renamed By Owner");
  });

  it("admin renames the workspace -> 200", async () => {
    const admin = await seat({ role: "admin" });
    const res = await patchWorkspace(admin.cookie, { name: "Renamed By Admin" });
    expect(res.status).toBe(200);
  });

  it("member cannot rename -> 403", async () => {
    const member = await seat({ role: "member" });
    const res = await patchWorkspace(member.cookie, { name: "Nope" });
    expect(res.status).toBe(403);
  });

  it("guest cannot rename -> 403", async () => {
    const guest = await seat({ role: "guest" });
    const res = await patchWorkspace(guest.cookie, { name: "Nope" });
    expect(res.status).toBe(403);
  });

  it("rename rejects empty/oversize name -> 400", async () => {
    const owner = await seat({ role: "owner" });
    expect((await patchWorkspace(owner.cookie, { name: "" })).status).toBe(400);
    expect((await patchWorkspace(owner.cookie, { name: "x".repeat(81) })).status).toBe(400);
  });

  // ---- DELETE -------------------------------------------------------------

  it("owner with correct password + confirmName -> 204, org + vaults gone", async () => {
    const owner = await seat({ role: "owner", withPassword: true, orgName: "Delete Me Org" });
    // Seed a vault so we can prove the cascade dropped it.
    const vaultId = randomUUID();
    await deps.db
      .insert(deps.vaults)
      .values({ id: vaultId, orgId: owner.orgId, name: "Doomed Vault", createdBy: owner.userId });

    const res = await deleteWorkspace(owner.cookie, {
      confirmName: "Delete Me Org",
      password: MASTER_PW,
    });
    expect(res.status).toBe(204);

    const org = await deps.db
      .select({ id: deps.organizations.id })
      .from(deps.organizations)
      .where(deps.eq(deps.organizations.id, owner.orgId));
    expect(org.length).toBe(0);

    const v = await deps.db
      .select({ id: deps.vaults.id })
      .from(deps.vaults)
      .where(deps.eq(deps.vaults.id, vaultId));
    expect(v.length).toBe(0);

    // workspace.deleted audit survives (org-less scope).
    const audit = await deps.db
      .select({ action: deps.auditEvents.action })
      .from(deps.auditEvents)
      .where(
        deps.and(
          deps.eq(deps.auditEvents.actorUserId, owner.userId),
          deps.eq(deps.auditEvents.action, "workspace.deleted"),
        ),
      );
    expect(audit.length).toBe(1);

    // already cascaded — drop from cleanup list so afterAll doesn't double-delete.
    const idx = createdOrgIds.indexOf(owner.orgId);
    if (idx >= 0) createdOrgIds.splice(idx, 1);
  });

  it("owner with WRONG password -> 401, org survives", async () => {
    const owner = await seat({ role: "owner", withPassword: true, orgName: "Keep Org A" });
    const res = await deleteWorkspace(owner.cookie, {
      confirmName: "Keep Org A",
      password: "totally-wrong",
    });
    expect(res.status).toBe(401);
    const org = await deps.db
      .select({ id: deps.organizations.id })
      .from(deps.organizations)
      .where(deps.eq(deps.organizations.id, owner.orgId));
    expect(org.length).toBe(1);
  });

  it("owner with WRONG confirmName -> 400, org survives", async () => {
    const owner = await seat({ role: "owner", withPassword: true, orgName: "Keep Org B" });
    const res = await deleteWorkspace(owner.cookie, {
      confirmName: "Wrong Name",
      password: MASTER_PW,
    });
    expect(res.status).toBe(400);
    const org = await deps.db
      .select({ id: deps.organizations.id })
      .from(deps.organizations)
      .where(deps.eq(deps.organizations.id, owner.orgId));
    expect(org.length).toBe(1);
  });

  it("admin (non-owner) cannot delete -> 403", async () => {
    const admin = await seat({ role: "admin", withPassword: true, orgName: "Keep Org C" });
    const res = await deleteWorkspace(admin.cookie, {
      confirmName: "Keep Org C",
      password: MASTER_PW,
    });
    expect(res.status).toBe(403);
    const org = await deps.db
      .select({ id: deps.organizations.id })
      .from(deps.organizations)
      .where(deps.eq(deps.organizations.id, admin.orgId));
    expect(org.length).toBe(1);
  });

  it("owner WITHOUT a master password cannot delete -> 401", async () => {
    const owner = await seat({ role: "owner", withPassword: false, orgName: "Keep Org D" });
    const res = await deleteWorkspace(owner.cookie, {
      confirmName: "Keep Org D",
      password: "anything",
    });
    expect(res.status).toBe(401);
  });

  // ---- SETTINGS (policy) --------------------------------------------------

  it("GET /workspace/settings returns the full default policy shape", async () => {
    const member = await seat({ role: "member" });
    const res = await getSettings(member.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      settings: {
        require2fa: boolean;
        autoLockMinutes: number;
        sso: { allowedDomains: string[]; jitEnabled: boolean; requireSso: boolean };
      };
    };
    expect(body.settings.require2fa).toBe(false);
    expect(body.settings.autoLockMinutes).toBe(15);
    expect(body.settings.sso).toEqual({
      allowedDomains: [],
      jitEnabled: true,
      requireSso: false,
    });
  });

  it("PATCH persists autoLockMinutes + sso, GET returns them", async () => {
    const owner = await seat({ role: "owner" });
    const res = await patchSettings(owner.cookie, {
      autoLockMinutes: 30,
      sso: { allowedDomains: ["Example.COM", " acme.io ", "example.com"], jitEnabled: false },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      settings: {
        autoLockMinutes: number;
        sso: { allowedDomains: string[]; jitEnabled: boolean; requireSso: boolean };
      };
    };
    expect(body.settings.autoLockMinutes).toBe(30);
    // lowercased, trimmed, deduped, order preserved.
    expect(body.settings.sso.allowedDomains).toEqual(["example.com", "acme.io"]);
    expect(body.settings.sso.jitEnabled).toBe(false);

    const after = (await (await getSettings(owner.cookie)).json()) as {
      settings: { autoLockMinutes: number; sso: { allowedDomains: string[]; jitEnabled: boolean } };
    };
    expect(after.settings.autoLockMinutes).toBe(30);
    expect(after.settings.sso.allowedDomains).toEqual(["example.com", "acme.io"]);
    expect(after.settings.sso.jitEnabled).toBe(false);
  });

  it("partial PATCH does NOT wipe other keys", async () => {
    const owner = await seat({ role: "owner" });
    // First set everything.
    await patchSettings(owner.cookie, {
      require2fa: true,
      autoLockMinutes: 45,
      sso: { allowedDomains: ["keep.com"], jitEnabled: false, requireSso: true },
    });
    // Now PATCH only one nested sso key.
    const res = await patchSettings(owner.cookie, { sso: { requireSso: false } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      settings: {
        require2fa: boolean;
        autoLockMinutes: number;
        sso: { allowedDomains: string[]; jitEnabled: boolean; requireSso: boolean };
      };
    };
    // Untouched keys survive.
    expect(body.settings.require2fa).toBe(true);
    expect(body.settings.autoLockMinutes).toBe(45);
    expect(body.settings.sso.allowedDomains).toEqual(["keep.com"]);
    expect(body.settings.sso.jitEnabled).toBe(false);
    // Only the patched key changed.
    expect(body.settings.sso.requireSso).toBe(false);
  });

  it("autoLockMinutes out of range is CLAMPED to [1,120]", async () => {
    const owner = await seat({ role: "owner" });
    const high = (await (await patchSettings(owner.cookie, { autoLockMinutes: 9999 })).json()) as {
      settings: { autoLockMinutes: number };
    };
    expect(high.settings.autoLockMinutes).toBe(120);
    const low = (await (await patchSettings(owner.cookie, { autoLockMinutes: 0 })).json()) as {
      settings: { autoLockMinutes: number };
    };
    expect(low.settings.autoLockMinutes).toBe(1);
  });

  it("non-admin cannot PATCH settings -> 403", async () => {
    const member = await seat({ role: "member" });
    const res = await patchSettings(member.cookie, { autoLockMinutes: 20 });
    expect(res.status).toBe(403);
  });

  it("PATCH writes a security_policy_updated audit row listing changed keys", async () => {
    const owner = await seat({ role: "owner" });
    await patchSettings(owner.cookie, { autoLockMinutes: 25, sso: { jitEnabled: false } });
    const audit = await deps.db
      .select({ metadata: deps.auditEvents.metadata })
      .from(deps.auditEvents)
      .where(
        deps.and(
          deps.eq(deps.auditEvents.orgId, owner.orgId),
          deps.eq(deps.auditEvents.action, "workspace.security_policy_updated"),
        ),
      )
      .orderBy(deps.desc(deps.auditEvents.occurredAt));
    expect(audit.length).toBeGreaterThanOrEqual(1);
    const changed = (audit[0]!.metadata as { changed: string[] }).changed;
    expect(changed).toContain("autoLockMinutes");
    expect(changed).toContain("sso.jitEnabled");
  });
});
