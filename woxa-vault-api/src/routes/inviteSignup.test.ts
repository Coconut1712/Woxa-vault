import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";

// Integration test for the invite signup-and-accept flow under the two-password
// model. Drives the REAL app + REAL Postgres (project memory: integration tests
// hit a real database, never mocks).
//
// What this pins:
//   1. POST /invite/:token/signup-and-accept stores the chosen password in
//      `login_password_hash` and leaves `password_hash` (master) NULL — so the
//      new user is NOT locked out (the prior bug set master + no login hash).
//   2. The response no longer carries a `recoveryCode` (the master-bound kit
//      moved to /me/password/setup) and issues a session cookie.
//   3. The invited user joins the org with the role from the invitation, and
//      the invitation is flipped to accepted.
//   4. GET /me reports requiresPasswordSetup=true and hasWorkspace=true.
//   5. The new user can immediately log in with that LOGIN password.

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
  const { users, organizations, orgMembers, invitations } = await import("@/db/schema");
  const { eq, inArray, sql: dsql } = await import("drizzle-orm");
  const { SESSION_COOKIE_NAME } = await import("@/lib/session");
  return {
    app: createApp(),
    db,
    sql,
    users,
    organizations,
    orgMembers,
    invitations,
    eq,
    inArray,
    dsql,
    SESSION_COOKIE_NAME,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

function uniqEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@invite-test.local`;
}

function cookieFromSetCookie(res: Response, name: string): string | null {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const m = raw.match(new RegExp(`${name}=([^;]+)`));
  return m ? `${name}=${m[1]}` : null;
}

// Mirror the server's token format (base32 lowercase no padding) + hash
// (SHA-256 hex) so we can seed an invitation row directly.
function makeInviteToken(): { token: string; tokenHash: string } {
  const token = encodeBase32LowerCaseNoPadding(randomBytes(24));
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

describe("invite signup-and-accept (two-password, integration)", () => {
  let deps: Deps;
  const createdEmails: string[] = [];
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
  });

  afterAll(async () => {
    if (deps) {
      if (createdEmails.length > 0) {
        await deps.db.delete(deps.users).where(deps.inArray(deps.users.email, createdEmails));
      }
      if (createdOrgIds.length > 0) {
        // org_members + invitations cascade on org delete (FK onDelete cascade).
        await deps.db
          .delete(deps.organizations)
          .where(deps.inArray(deps.organizations.id, createdOrgIds));
      }
      await deps.sql.end({ timeout: 5 });
    }
  });

  // Seed an organization + a pending invitation for `email` at `role`.
  async function seedInvite(email: string, role: string): Promise<{ token: string; orgId: string }> {
    const slug = `inv-org-${randomUUID()}`;
    const [org] = await deps.db
      .insert(deps.organizations)
      .values({ name: "Invite Test Org", slug })
      .returning({ id: deps.organizations.id });
    createdOrgIds.push(org!.id);

    const { token, tokenHash } = makeInviteToken();
    await deps.db.insert(deps.invitations).values({
      orgId: org!.id,
      email: email.toLowerCase(),
      role,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return { token, orgId: org!.id };
  }

  async function signupAndAccept(token: string, body: Record<string, unknown>): Promise<Response> {
    return deps.app.request(`/invite/${token}/signup-and-accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("sets login_password_hash, leaves master NULL, returns NO recoveryCode, and joins the org at the invited role", async () => {
    const email = uniqEmail("ok");
    createdEmails.push(email);
    const { token, orgId } = await seedInvite(email, "admin");

    const res = await signupAndAccept(token, { password: "login-secret-123", displayName: "Invitee" });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      user: { id: string; email: string; displayName: string };
      membership: { orgId: string; role: string };
      recoveryCode?: unknown;
    };

    // No secret in the body — the recovery kit moved to /me/password/setup.
    expect(body.recoveryCode).toBeUndefined();
    expect(body.user.email).toBe(email);
    expect(body.membership.orgId).toBe(orgId);
    expect(body.membership.role).toBe("admin");

    // Session cookie issued → logged in immediately.
    const cookie = cookieFromSetCookie(res, deps.SESSION_COOKIE_NAME);
    expect(cookie).not.toBeNull();

    // DB invariant: LOGIN hash present, MASTER hash NULL, recovery kit NOT set.
    const row = await deps.db.query.users.findFirst({
      where: deps.dsql`lower(${deps.users.email}) = ${email}`,
    });
    expect(row).toBeTruthy();
    expect(row!.loginPasswordHash).toBeTruthy();
    expect(row!.passwordHash).toBeNull();
    expect(row!.recoveryKitHash).toBeNull();
    expect(row!.emailVerifiedAt).not.toBeNull(); // invite proves mailbox ownership

    // Membership row exists at the invited role.
    const member = await deps.db.query.orgMembers.findFirst({
      where: deps.dsql`${deps.orgMembers.orgId} = ${orgId} and ${deps.orgMembers.userId} = ${row!.id}`,
    });
    expect(member).toBeTruthy();
    expect(member!.role).toBe("admin");

    // Invitation flipped to accepted.
    const inv = await deps.db.query.invitations.findFirst({
      where: deps.eq(deps.invitations.orgId, orgId),
    });
    expect(inv!.acceptedAt).not.toBeNull();

    // GET /me → requiresPasswordSetup true (master null) + hasWorkspace true.
    const me = await deps.app.request("/me", { headers: { Cookie: cookie! } });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as {
      user: { requiresPasswordSetup: boolean; hasWorkspace: boolean };
    };
    expect(meBody.user.requiresPasswordSetup).toBe(true);
    expect(meBody.user.hasWorkspace).toBe(true);
  });

  it("the invited user can log in with email + that LOGIN password (no lockout)", async () => {
    const email = uniqEmail("login");
    createdEmails.push(email);
    const { token } = await seedInvite(email, "member");
    const loginPw = "the-invite-login-pw-1";

    const signup = await signupAndAccept(token, { password: loginPw });
    expect(signup.status).toBe(200);

    // Fresh login (simulates session expiry) must succeed with the login pw.
    const loginRes = await deps.app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: loginPw }),
    });
    expect(loginRes.status).toBe(200);
    const okBody = (await loginRes.json()) as { status: string };
    expect(okBody.status).toBe("ok");
    expect(cookieFromSetCookie(loginRes, deps.SESSION_COOKIE_NAME)).not.toBeNull();
  });

  it("rejects when the invited email already has an account (409 user_exists)", async () => {
    const email = uniqEmail("exists");
    createdEmails.push(email);

    // Pre-create the user.
    await deps.db.insert(deps.users).values({
      email,
      loginPasswordHash: null,
      passwordHash: null,
      status: "active",
    });

    const { token } = await seedInvite(email, "member");
    const res = await signupAndAccept(token, { password: "login-secret-123" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("user_exists");
  });

  it("rejects a weak password (< 10 chars) with 400 validation_error", async () => {
    const email = uniqEmail("weak");
    createdEmails.push(email);
    const { token } = await seedInvite(email, "member");

    const res = await signupAndAccept(token, { password: "short" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });
});
