import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for the workspace "Require 2FA" security policy + its
// server-side enforcement (REQUIREMENTS §4 settings/policy; DESIGN.md §12.2
// settings jsonb). Drives the REAL app + REAL Postgres (project memory:
// integration tests hit a real database, never mocks).
//
// What this pins:
//   1. PATCH /workspace/settings: owner + admin can set require2fa; a plain
//      member is forbidden; the org is resolved from the caller's membership
//      (no client org id → no IDOR).
//   2. GET /workspace/settings reflects the persisted policy.
//   3. /me.requiresTwoFactorEnroll: true for an un-enrolled user in a
//      require2fa org, false once 2FA is enrolled (account-level).
//   4. ENFORCEMENT: an un-enrolled user under require2fa gets 403
//      `two_factor_required` on a secret-bearing route (GET /vaults) but can
//      STILL reach GET /me and POST /auth/2fa/enroll (no lockout).

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
  const { organizations, orgMembers, users } = await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { createSession } = await import("@/lib/session");
  const { SESSION_COOKIE_NAME } = await import("@/lib/session");
  return {
    app: createApp(),
    db,
    sql,
    organizations,
    orgMembers,
    users,
    eq,
    inArray,
    createSession,
    SESSION_COOKIE_NAME,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

// Create a user + membership in `orgId` with `role`, returning a ready-to-send
// session cookie string. `enrolled2fa` controls totp_enabled_at.
async function makeMember(
  deps: Deps,
  orgId: string,
  role: string,
  enrolled2fa: boolean,
): Promise<{ userId: string; cookie: string }> {
  const userId = randomUUID();
  await deps.db.insert(deps.users).values({
    id: userId,
    email: `req2fa-${userId}@test.local`,
    passwordHash: null,
    totpEnabledAt: enrolled2fa ? new Date() : null,
    status: "active",
  });
  await deps.db.insert(deps.orgMembers).values({ orgId, userId, role });
  const { token } = await deps.createSession(userId);
  return { userId, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
}

describe("Require-2FA workspace policy + enforcement (integration)", () => {
  let deps: Deps;
  let orgId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
    orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "Req2FA Test Org",
      slug: `req2fa-${orgId.slice(0, 8)}`,
    });
  });

  afterAll(async () => {
    if (deps) {
      if (createdUserIds.length > 0) {
        await deps.db
          .delete(deps.users)
          .where(deps.inArray(deps.users.id, createdUserIds));
      }
      await deps.db
        .delete(deps.organizations)
        .where(deps.eq(deps.organizations.id, orgId));
      await deps.sql.end({ timeout: 5 });
    }
  });

  async function member(role: string, enrolled2fa: boolean) {
    const m = await makeMember(deps, orgId, role, enrolled2fa);
    createdUserIds.push(m.userId);
    return m;
  }

  it("a plain member CANNOT change the security policy (403 forbidden)", async () => {
    const { cookie } = await member("member", true);
    const res = await deps.app.request("/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ require2fa: true }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("an admin CAN enable require2fa; GET reflects it", async () => {
    const { cookie } = await member("admin", true);
    const patch = await deps.app.request("/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ require2fa: true }),
    });
    expect(patch.status).toBe(200);
    const patchBody = (await patch.json()) as { settings: { require2fa: boolean } };
    expect(patchBody.settings.require2fa).toBe(true);

    const get = await deps.app.request("/workspace/settings", {
      headers: { Cookie: cookie },
    });
    expect(get.status).toBe(200);
    const getBody = (await get.json()) as { settings: { require2fa: boolean } };
    expect(getBody.settings.require2fa).toBe(true);
  });

  it("an owner CAN toggle the policy back off", async () => {
    const { cookie } = await member("owner", true);
    const res = await deps.app.request("/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ require2fa: false }),
    });
    expect(res.status).toBe(200);
    // Re-enable for the enforcement tests below.
    await deps.app.request("/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ require2fa: true }),
    });
  });

  it("/me.requiresTwoFactorEnroll is TRUE for an un-enrolled member under require2fa", async () => {
    const { cookie } = await member("member", false);
    const res = await deps.app.request("/me", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { requiresTwoFactorEnroll: boolean } };
    expect(body.user.requiresTwoFactorEnroll).toBe(true);
  });

  it("/me.requiresTwoFactorEnroll is FALSE once 2FA is enrolled (account-level)", async () => {
    const { cookie } = await member("member", true);
    const res = await deps.app.request("/me", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { requiresTwoFactorEnroll: boolean } };
    expect(body.user.requiresTwoFactorEnroll).toBe(false);
  });

  it("ENFORCEMENT: un-enrolled member under require2fa is BLOCKED on GET /vaults (403 two_factor_required)", async () => {
    const { cookie } = await member("member", false);
    const res = await deps.app.request("/vaults", { headers: { Cookie: cookie } });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("two_factor_required");
  });

  it("NO LOCKOUT: the same blocked member can still reach GET /me", async () => {
    const { cookie } = await member("member", false);
    const res = await deps.app.request("/me", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
  });

  it("NO LOCKOUT: the same blocked member can still hit POST /auth/2fa/enroll", async () => {
    const { cookie } = await member("member", false);
    const res = await deps.app.request("/auth/2fa/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    // The enroll handler runs (returns 200 with an otpauth uri) — crucially it
    // is NOT 403 two_factor_required, proving the gate doesn't lock the user
    // out of the remediation path.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { otpauthUri?: string };
    expect(typeof body.otpauthUri).toBe("string");
  });

  it("an ENROLLED member under require2fa is NOT blocked on GET /vaults", async () => {
    const { cookie } = await member("member", true);
    const res = await deps.app.request("/vaults", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
  });
});
