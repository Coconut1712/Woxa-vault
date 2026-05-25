import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for the SSO 2FA handoff contract (REQUIREMENTS AC-003.5).
// Drives the REAL app + REAL Postgres (project memory: integration tests hit a
// real database, never mocks). We do NOT mock Google here — the Google leg is
// covered by the unit-level gate; what this file pins is the security-critical
// downstream contract the SSO callback depends on:
//
//   1. /auth/2fa/verify-login reads the mfaToken from the `mfa_pending` cookie
//      when the request body omits it (the SSO flow can't read the HttpOnly
//      cookie in JS, so it sends only `code`).
//   2. A correct TOTP via the cookie path mints a session AND clears the
//      mfa_pending cookie.
//   3. The mfa_pending cookie is NOT itself a session — presenting it with a
//      WRONG code grants no session cookie.

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
  // Keep originCheck happy without an Origin header (dev/test bypass) and the
  // session cookie unsigned-by-Secure so app.request works over http.
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
});

async function loadDeps() {
  const { createApp } = await import("@/app");
  const { db, sql } = await import("@/db/client");
  const { users } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { signMfaToken, encryptUserSecret, generateTotpSecret, MFA_PENDING_COOKIE } =
    await import("@/lib/mfa");
  const { SESSION_COOKIE_NAME } = await import("@/lib/session");
  const { authenticator } = await import("otplib");
  const { HashAlgorithms } = await import("@otplib/core");
  // Mirror the app-wide TOTP options so generated codes verify against the
  // server's checkDelta window.
  authenticator.options = { window: 1, step: 30, digits: 6, algorithm: HashAlgorithms.SHA1 };
  return {
    app: createApp(),
    db,
    sql,
    users,
    eq,
    signMfaToken,
    encryptUserSecret,
    generateTotpSecret,
    authenticator,
    MFA_PENDING_COOKIE,
    SESSION_COOKIE_NAME,
  };
}

describe("SSO 2FA handoff — verify-login via mfa_pending cookie (integration)", () => {
  let deps: Awaited<ReturnType<typeof loadDeps>>;
  let userId: string;
  let totpSecret: string;

  beforeAll(async () => {
    deps = await loadDeps();
    userId = randomUUID();
    totpSecret = deps.generateTotpSecret();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `sso-2fa-${userId}@test.local`,
      passwordHash: null, // SSO-only user
      totpSecretEncrypted: deps.encryptUserSecret(totpSecret),
      totpEnabledAt: new Date(),
      status: "active",
    });
  });

  afterAll(async () => {
    if (deps && userId) {
      await deps.db.delete(deps.users).where(deps.eq(deps.users.id, userId));
    }
    await deps.sql.end({ timeout: 5 });
  });

  function setCookies(res: Response): string[] {
    // Node 20 Headers expose getSetCookie(); fall back to a single header.
    const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
    if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
    const single = res.headers.get("set-cookie");
    return single ? [single] : [];
  }

  it("reads mfaToken from the mfa_pending cookie (body omits it) and mints a session", async () => {
    const { app, signMfaToken, authenticator, MFA_PENDING_COOKIE, SESSION_COOKIE_NAME } = deps;
    const mfaToken = signMfaToken(userId);
    const code = authenticator.generate(totpSecret);

    const res = await app.request("/auth/2fa/verify-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${MFA_PENDING_COOKIE}=${mfaToken}`,
      },
      // NOTE: body has NO mfaToken — only `code`. This is the SSO contract.
      body: JSON.stringify({ code }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; mfaSatisfied?: boolean };
    expect(body.status).toBe("ok");
    expect(body.mfaSatisfied).toBe(true);

    const cookies = setCookies(res);
    // A real session cookie was issued...
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`) && !c.includes(`${SESSION_COOKIE_NAME}=;`))).toBe(true);
    // ...and the spent mfa_pending cookie was burned (Max-Age=0).
    const cleared = cookies.find((c) => c.startsWith(`${MFA_PENDING_COOKIE}=`));
    expect(cleared).toBeDefined();
    expect(cleared).toContain("Max-Age=0");
  });

  it("does NOT mint a session for a wrong code presented via the cookie", async () => {
    const { app, signMfaToken, MFA_PENDING_COOKIE, SESSION_COOKIE_NAME } = deps;
    const mfaToken = signMfaToken(userId);

    const res = await app.request("/auth/2fa/verify-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${MFA_PENDING_COOKIE}=${mfaToken}`,
      },
      body: JSON.stringify({ code: "000000" }),
    });

    expect(res.status).toBe(401);
    const cookies = setCookies(res);
    // The pending cookie is NOT a session: no session cookie is set.
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`) && !c.includes(`${SESSION_COOKIE_NAME}=;`))).toBe(false);
  });

  it("rejects when no token is supplied (neither body nor cookie)", async () => {
    const { app, SESSION_COOKIE_NAME } = deps;
    const res = await app.request("/auth/2fa/verify-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    });
    expect(res.status).toBe(401);
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`) && !c.includes(`${SESSION_COOKIE_NAME}=;`))).toBe(false);
  });
});
