import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for GET /auth/login-info `hasLoginPassword` + the
// "test@gmail.com" login shape. Drives the REAL app + REAL Postgres (project
// memory: integration tests hit a real database, never mocks).
//
// Bug being guarded (CONFIRMED 2026-06-05):
//   The frontend chose the login factor by `requiresZk` (= auth_key_hash !==
//   null), a VAULT-UNLOCK signal. An account with BOTH a login password and a
//   legacy auth_key_hash (test@gmail.com) was routed through the ZK path and
//   could never log in with email+password. The fix adds `hasLoginPassword` to
//   login-info so the client routes by the LOGIN factor. The BACKEND already
//   verifies the plaintext login password against login_password_hash for such
//   accounts — these tests pin both the new field and that backend behaviour.

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
  const { users } = await import("@/db/schema");
  const { inArray, sql: dsql } = await import("drizzle-orm");
  const { hashPassword } = await import("@/lib/password");
  const { SESSION_COOKIE_NAME } = await import("@/lib/session");
  return { app: createApp(), db, sql, users, inArray, dsql, hashPassword, SESSION_COOKIE_NAME };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

function uniqEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@logininfo-test.local`;
}

function cookieFromSetCookie(res: Response, name: string): string | null {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const m = raw.match(new RegExp(`${name}=([^;]+)`));
  return m ? `${name}=${m[1]}` : null;
}

describe("login-info hasLoginPassword + test@gmail.com login shape (integration)", () => {
  let deps: Deps;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
  });

  afterAll(async () => {
    if (deps) {
      if (createdEmails.length > 0) {
        await deps.db.delete(deps.users).where(deps.inArray(deps.users.email, createdEmails));
      }
      await deps.sql.end({ timeout: 5 });
    }
  });

  async function loginInfo(email: string): Promise<Response> {
    return deps.app.request(`/auth/login-info?email=${encodeURIComponent(email)}`);
  }

  it("returns hasLoginPassword=true for an account with a login password", async () => {
    const email = uniqEmail("haslogin");
    createdEmails.push(email);
    await deps.db.insert(deps.users).values({
      email,
      loginPasswordHash: await deps.hashPassword("the-login-password-1"),
      passwordHash: null,
      status: "active",
    });

    const res = await loginInfo(email);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hasLoginPassword?: boolean; requiresZk?: boolean };
    expect(body.hasLoginPassword).toBe(true);
    expect(body.requiresZk).toBe(false);
  });

  it("returns hasLoginPassword=false for a legacy ZK-only account (no login password)", async () => {
    const email = uniqEmail("zkonly");
    createdEmails.push(email);
    await deps.db.insert(deps.users).values({
      email,
      loginPasswordHash: null,
      // Legacy ZK factor present → requiresZk should be true.
      authKeyHash: await deps.hashPassword("master-derived-auth-key"),
      ssoSubject: `sub-${randomUUID()}`,
      status: "active",
    });

    const res = await loginInfo(email);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hasLoginPassword?: boolean; requiresZk?: boolean };
    expect(body.hasLoginPassword).toBe(false);
    expect(body.requiresZk).toBe(true);
  });

  it("the test@gmail.com shape: login_password_hash AND auth_key_hash both set", async () => {
    const email = uniqEmail("both");
    createdEmails.push(email);
    const loginPw = "the-login-password-1";

    await deps.db.insert(deps.users).values({
      email,
      // Login password the user actually types at the email+password form.
      loginPasswordHash: await deps.hashPassword(loginPw),
      // Master password hash (vault unlock) — different credential.
      passwordHash: await deps.hashPassword("the-master-password-2"),
      // Legacy ZK auth key derived from the MASTER password — this is what made
      // requiresZk true and broke login pre-fix.
      authKeyHash: await deps.hashPassword("master-derived-auth-key"),
      status: "active",
    });

    // login-info must surface BOTH signals so the client routes by the login
    // factor while the lock screen still sees the ZK master factor.
    const infoRes = await loginInfo(email);
    expect(infoRes.status).toBe(200);
    const info = (await infoRes.json()) as { hasLoginPassword?: boolean; requiresZk?: boolean };
    expect(info.hasLoginPassword).toBe(true);
    expect(info.requiresZk).toBe(true);

    // The actual fix proof: POST /auth/login with the PLAINTEXT login password
    // succeeds for this account (the backend checks login_password_hash). This
    // is exactly what the frontend now sends for hasLoginPassword=true.
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
});
