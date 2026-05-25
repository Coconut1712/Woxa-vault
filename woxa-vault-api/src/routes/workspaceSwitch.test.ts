import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for the ACTIVE WORKSPACE model (finding M-1). Drives the
// REAL app + REAL Postgres (project memory: integration tests hit a real
// database, never mocks).
//
// What this pins:
//   * POST /workspace/switch to an org the caller IS a member of => 200 and
//     the active-org pointer is persisted on the session row.
//   * Org-scoped reads (GET /workspace, GET /workspace/settings, GET /members)
//     resolve against the ACTIVE org after a switch, not the first membership.
//   * POST /workspace/switch to an org the caller is NOT a member of => 404
//     (IDOR masking — the endpoint must not confirm the org exists).
//   * The active org being DELETED falls back to the first membership.
//   * Role comes from the ACTIVE org membership: a user who is owner of A and
//     admin of B sees role=admin after switching to B (no privilege carry-over).

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
  const { organizations, orgMembers, sessions, users } = await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/session");
  const { createHash } = await import("node:crypto");
  return {
    app: createApp(),
    db,
    sql,
    organizations,
    orgMembers,
    sessions,
    users,
    eq,
    inArray,
    createSession,
    SESSION_COOKIE_NAME,
    createHash,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

describe("Active workspace switch (integration)", () => {
  let deps: Deps;
  let userId: string;
  let cookie: string;
  let sessionToken: string;
  let orgA: string; // user is OWNER here (default / first membership)
  let orgB: string; // user is ADMIN here (switch target)
  let orgC: string; // user is NOT a member (IDOR target)
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();

    // Three orgs. orgA created first so it wins the joined_at fallback ordering.
    orgA = randomUUID();
    orgB = randomUUID();
    orgC = randomUUID();
    for (const [id, name] of [
      [orgA, "Switch Org A"],
      [orgB, "Switch Org B"],
      [orgC, "Switch Org C (foreign)"],
    ] as const) {
      await deps.db
        .insert(deps.organizations)
        .values({ id, name, slug: `sw-${id.slice(0, 8)}` });
      createdOrgIds.push(id);
    }

    // One user, 2FA enrolled so the require-2fa gate can never interfere with
    // the org-scoped reads we assert here.
    userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `switch-${userId}@test.local`,
      passwordHash: null,
      totpEnabledAt: new Date(),
      status: "active",
    });
    createdUserIds.push(userId);

    // Owner of A (first membership), admin of B. NOT a member of C.
    await deps.db.insert(deps.orgMembers).values({ orgId: orgA, userId, role: "owner" });
    await deps.db.insert(deps.orgMembers).values({ orgId: orgB, userId, role: "admin" });

    const created = await deps.createSession(userId);
    sessionToken = created.token;
    cookie = `${deps.SESSION_COOKIE_NAME}=${sessionToken}`;
  });

  afterAll(async () => {
    if (deps) {
      if (createdUserIds.length > 0) {
        await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, createdUserIds));
      }
      if (createdOrgIds.length > 0) {
        await deps.db
          .delete(deps.organizations)
          .where(deps.inArray(deps.organizations.id, createdOrgIds));
      }
      await deps.sql.end({ timeout: 5 });
    }
  });

  async function activeOrgIdOnSession(): Promise<string | null> {
    const sessionId = deps.createHash("sha256").update(sessionToken).digest("hex");
    const rows = await deps.db
      .select({ activeOrgId: deps.sessions.activeOrgId })
      .from(deps.sessions)
      .where(deps.eq(deps.sessions.id, sessionId));
    return rows[0]?.activeOrgId ?? null;
  }

  async function getMe() {
    return deps.app.request("/me", { headers: { Cookie: cookie } });
  }

  async function getWorkspace() {
    return deps.app.request("/workspace", { headers: { Cookie: cookie } });
  }

  function switchTo(orgId: string) {
    return deps.app.request("/workspace/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ orgId }),
    });
  }

  // ---- default (no switch yet) --------------------------------------------

  it("before any switch, the active org defaults to the first membership (owner of A)", async () => {
    expect(await activeOrgIdOnSession()).toBeNull();

    const me = (await (await getMe()).json()) as {
      user: { activeOrgId: string; role: string };
    };
    expect(me.user.activeOrgId).toBe(orgA);
    expect(me.user.role).toBe("owner");

    const ws = (await (await getWorkspace()).json()) as {
      workspace: { id: string; role: string };
    };
    expect(ws.workspace.id).toBe(orgA);
    expect(ws.workspace.role).toBe("owner");
  });

  // ---- switch to a workspace the caller belongs to ------------------------

  it("switches to org B (member) and persists the pointer + returns the active role", async () => {
    const res = await switchTo(orgB);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      workspace: { id: string; name: string; slug: string; role: string };
    };
    expect(body.workspace.id).toBe(orgB);
    expect(body.workspace.role).toBe("admin");

    // Pointer persisted on the session row.
    expect(await activeOrgIdOnSession()).toBe(orgB);
  });

  it("after switching to B, /me reflects org B + role=admin (no owner carry-over from A)", async () => {
    const me = (await (await getMe()).json()) as {
      user: { activeOrgId: string; role: string; workspaceCount: number };
    };
    expect(me.user.activeOrgId).toBe(orgB);
    // PRIVILEGE-ESCALATION GUARD: owner of A must NOT carry owner into B.
    expect(me.user.role).toBe("admin");
    // workspaceCount still counts ALL memberships.
    expect(me.user.workspaceCount).toBe(2);
  });

  it("after switching to B, GET /workspace + /workspace/settings + /members all scope to B", async () => {
    const ws = (await (await getWorkspace()).json()) as {
      workspace: { id: string; role: string };
    };
    expect(ws.workspace.id).toBe(orgB);
    expect(ws.workspace.role).toBe("admin");

    // settings readable by admin; org resolved from active membership.
    const settingsRes = await deps.app.request("/workspace/settings", {
      headers: { Cookie: cookie },
    });
    expect(settingsRes.status).toBe(200);

    // members list scoped to org B — exactly the one member we seeded there.
    const membersRes = await deps.app.request("/members", { headers: { Cookie: cookie } });
    expect(membersRes.status).toBe(200);
    const membersBody = (await membersRes.json()) as {
      members: { userId: string; role: string }[];
    };
    expect(membersBody.members.map((m) => m.userId)).toEqual([userId]);
    expect(membersBody.members[0]?.role).toBe("admin");
  });

  // ---- IDOR: switching to a non-member org --------------------------------

  it("switching to org C (NOT a member) returns 404 and does NOT change the pointer", async () => {
    // Pointer currently at B from the prior switch.
    expect(await activeOrgIdOnSession()).toBe(orgB);

    const res = await switchTo(orgC);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");

    // IDOR guard: the failed switch must leave the active org untouched.
    expect(await activeOrgIdOnSession()).toBe(orgB);
  });

  it("switching to a totally random (non-existent) org id also returns 404", async () => {
    const res = await switchTo(randomUUID());
    expect(res.status).toBe(404);
    expect(await activeOrgIdOnSession()).toBe(orgB);
  });

  // ---- fallback when the active org is deleted ----------------------------

  it("when the active org (B) is deleted, the resolver falls back to the first membership (A)", async () => {
    // Sanity: still pointing at B.
    expect(await activeOrgIdOnSession()).toBe(orgB);

    // Delete org B. The FK is ON DELETE SET NULL, so the session pointer goes
    // NULL and the resolver should fall back to A (owner).
    await deps.db.delete(deps.organizations).where(deps.eq(deps.organizations.id, orgB));
    // Drop the now-dead membership row too (cascade may handle it, but be
    // explicit so the fallback path is unambiguous).
    await deps.db.delete(deps.orgMembers).where(deps.eq(deps.orgMembers.orgId, orgB));

    expect(await activeOrgIdOnSession()).toBeNull();

    const me = (await (await getMe()).json()) as {
      user: { activeOrgId: string; role: string; workspaceCount: number };
    };
    expect(me.user.activeOrgId).toBe(orgA);
    expect(me.user.role).toBe("owner");
    expect(me.user.workspaceCount).toBe(1);
  });
});
