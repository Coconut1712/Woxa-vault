import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for the member-management RBAC hierarchy (DESIGN.md §3 —
// Owner > Admin > Member > Guest). Drives the REAL app + REAL Postgres
// (project memory: integration tests hit a real database, never mocks).
//
// What this pins (the privilege-escalation fix):
//   * PATCH /members/:userId — the caller must STRICTLY outrank BOTH the
//     target's current role AND the new role being assigned. So:
//       - admin PATCH member -> admin  => 403 (cannot mint a peer admin)
//       - admin PATCH member -> guest  => 200 (lower rank, allowed)
//       - owner PATCH member -> admin  => 200 (owner outranks admin)
//   * POST /members/invite — same rank-grant guard on the invite path:
//       - admin invite role=admin     => 403
//       - admin invite role=member    => 201
//
// We do NOT re-test the pre-existing guards (target-owner protection /
// outranks(target)) here — those live in orgAccess.test.ts + are unchanged.

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
  const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/session");
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

// Create a user + membership in `orgId` with `role`; returns a session cookie.
// We enroll 2FA so the require-2fa enforcement gate (if the org ever sets it)
// can't interfere — these tests are about RBAC, not the 2FA policy.
async function makeMember(
  deps: Deps,
  orgId: string,
  role: string,
): Promise<{ userId: string; cookie: string }> {
  const userId = randomUUID();
  await deps.db.insert(deps.users).values({
    id: userId,
    email: `rbac-${userId}@test.local`,
    passwordHash: null,
    totpEnabledAt: new Date(),
    status: "active",
  });
  await deps.db.insert(deps.orgMembers).values({ orgId, userId, role });
  const { token } = await deps.createSession(userId);
  return { userId, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
}

describe("Member-management RBAC: actor must outrank the assigned role (integration)", () => {
  let deps: Deps;
  let orgId: string;
  const createdUserIds: string[] = [];
  // The DB enforces a single-owner invariant per org (org_members_single_owner_idx),
  // so we mint exactly ONE owner and reuse it across owner-path assertions.
  let ownerCookie: string;

  beforeAll(async () => {
    deps = await loadDeps();
    orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "RBAC Test Org",
      slug: `rbac-${orgId.slice(0, 8)}`,
    });
    const owner = await makeMember(deps, orgId, "owner");
    createdUserIds.push(owner.userId);
    ownerCookie = owner.cookie;
  });

  afterAll(async () => {
    if (deps) {
      if (createdUserIds.length > 0) {
        await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, createdUserIds));
      }
      await deps.db.delete(deps.organizations).where(deps.eq(deps.organizations.id, orgId));
      await deps.sql.end({ timeout: 5 });
    }
  });

  async function member(role: string) {
    const m = await makeMember(deps, orgId, role);
    createdUserIds.push(m.userId);
    return m;
  }

  async function patchRole(actorCookie: string, targetUserId: string, role: string) {
    return deps.app.request(`/members/${targetUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: actorCookie },
      body: JSON.stringify({ role }),
    });
  }

  // ---- PATCH role ----------------------------------------------------------

  it("admin PATCH member -> admin is FORBIDDEN (no peer-admin minting)", async () => {
    const admin = await member("admin");
    const target = await member("member");
    const res = await patchRole(admin.cookie, target.userId, "admin");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");

    // The target's role must NOT have changed.
    const after = await deps.db
      .select({ role: deps.orgMembers.role })
      .from(deps.orgMembers)
      .where(deps.eq(deps.orgMembers.userId, target.userId));
    expect(after[0]?.role).toBe("member");
  });

  it("admin PATCH member -> guest is ALLOWED (lower rank)", async () => {
    const admin = await member("admin");
    const target = await member("member");
    const res = await patchRole(admin.cookie, target.userId, "guest");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { member: { role: string } };
    expect(body.member.role).toBe("guest");
  });

  it("owner PATCH member -> admin is ALLOWED (owner outranks admin)", async () => {
    const target = await member("member");
    const res = await patchRole(ownerCookie, target.userId, "admin");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { member: { role: string } };
    expect(body.member.role).toBe("admin");
  });

  // ---- Invite --------------------------------------------------------------

  it("admin invite role=admin is FORBIDDEN", async () => {
    const admin = await member("admin");
    const res = await deps.app.request("/members/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ email: `invitee-${randomUUID()}@test.local`, role: "admin" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("admin invite role=member is ALLOWED", async () => {
    const admin = await member("admin");
    const res = await deps.app.request("/members/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ email: `invitee-${randomUUID()}@test.local`, role: "member" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { invitation: { role: string } };
    expect(body.invitation.role).toBe("member");
  });

  it("owner invite role=admin is ALLOWED (owner outranks admin)", async () => {
    const res = await deps.app.request("/members/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ email: `invitee-${randomUUID()}@test.local`, role: "admin" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { invitation: { role: string } };
    expect(body.invitation.role).toBe("admin");
  });
});
