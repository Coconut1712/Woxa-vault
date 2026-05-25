import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for the verify-login error-code contract. Drives the REAL
// app + REAL Postgres (project memory: integration tests hit a real database,
// never mocks). What this file pins is the security-critical distinction the
// frontend keys off:
//
//   - bad / expired / absent mfaToken → 401 `mfa_session_expired`  (terminal)
//   - wrong TOTP code                 → 401 `invalid_credentials`  (retryable)
//   - REPLAYED TOTP code              → 401 `invalid_credentials`  (MUST be
//        byte-for-byte identical to wrong-code at the HTTP layer — no replay
//        oracle)
//   - too many attempts               → 429 `rate_limited`
//
// The replay assertion is the load-bearing one: a regression that gives replay
// a distinct status / code / message would let an attacker probe whether a
// sniffed code was ever valid.

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
  // The rate-limit store is an in-process Map shared across all tests in this
  // run, and app.request() has no socket so getClientIp() falls back to a
  // single "unknown" IP for every call. Enabling TRUST_PROXY lets each test
  // pass a distinct X-Forwarded-For so it owns its own 30/min/IP and
  // 10/min/IP+user buckets — otherwise the cases pollute one another.
  process.env.TRUST_PROXY = "true";
});

async function loadDeps() {
  const { createApp } = await import("@/app");
  const { db, sql } = await import("@/db/client");
  const { users } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { signMfaToken, encryptUserSecret, generateTotpSecret } = await import("@/lib/mfa");
  const { SESSION_COOKIE_NAME } = await import("@/lib/session");
  const { authenticator } = await import("otplib");
  const { HashAlgorithms } = await import("@otplib/core");
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
    SESSION_COOKIE_NAME,
  };
}

type ErrorBody = { error: { code: string; message: string } };

describe("verify-login error-code contract (integration)", () => {
  let deps: Awaited<ReturnType<typeof loadDeps>>;
  let userId: string;
  let totpSecret: string;

  beforeAll(async () => {
    deps = await loadDeps();
    userId = randomUUID();
    totpSecret = deps.generateTotpSecret();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `verify-login-err-${userId}@test.local`,
      passwordHash: null,
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
    const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
    if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
    const single = res.headers.get("set-cookie");
    return single ? [single] : [];
  }

  function hasSessionCookie(res: Response): boolean {
    const { SESSION_COOKIE_NAME } = deps;
    return setCookies(res).some(
      (c) => c.startsWith(`${SESSION_COOKIE_NAME}=`) && !c.includes(`${SESSION_COOKIE_NAME}=;`),
    );
  }

  it("absent token → 401 mfa_session_expired", async () => {
    const { app } = deps;
    const res = await app.request("/auth/2fa/verify-login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.0.0.1" },
      body: JSON.stringify({ code: "123456" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("mfa_session_expired");
    expect(hasSessionCookie(res)).toBe(false);
  });

  it("malformed / forged token → 401 mfa_session_expired", async () => {
    const { app } = deps;
    const res = await app.request("/auth/2fa/verify-login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.0.0.2" },
      body: JSON.stringify({ mfaToken: "not-a-real-token", code: "123456" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("mfa_session_expired");
    expect(hasSessionCookie(res)).toBe(false);
  });

  it("wrong code (valid token) → 401 invalid_credentials", async () => {
    const { app, signMfaToken, authenticator } = deps;
    const mfaToken = signMfaToken(userId);
    // Build a code guaranteed to differ from the current valid one.
    const current = authenticator.generate(totpSecret);
    const wrong = current === "000000" ? "111111" : "000000";

    const res = await app.request("/auth/2fa/verify-login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.0.0.3" },
      body: JSON.stringify({ mfaToken, code: wrong }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("invalid_credentials");
    expect(hasSessionCookie(res)).toBe(false);
  });

  it("replayed code is INDISTINGUISHABLE from a wrong code at the HTTP layer", async () => {
    const { app, signMfaToken, authenticator } = deps;

    const xff = { "Content-Type": "application/json", "X-Forwarded-For": "10.0.0.4" };

    // 1. First use of a valid code succeeds and consumes the step.
    const code = authenticator.generate(totpSecret);
    const ok = await app.request("/auth/2fa/verify-login", {
      method: "POST",
      headers: xff,
      body: JSON.stringify({ mfaToken: signMfaToken(userId), code }),
    });
    expect(ok.status).toBe(200);

    // 2. Replay the SAME code with a fresh (still-valid) mfaToken. The replay
    //    guard rejects it — but it must look exactly like a wrong code.
    const replay = await app.request("/auth/2fa/verify-login", {
      method: "POST",
      headers: xff,
      body: JSON.stringify({ mfaToken: signMfaToken(userId), code }),
    });
    const replayBody = (await replay.json()) as ErrorBody;

    // 3. Submit a definitely-wrong code for comparison.
    const wrong = code === "000000" ? "111111" : "000000";
    const bad = await app.request("/auth/2fa/verify-login", {
      method: "POST",
      headers: xff,
      body: JSON.stringify({ mfaToken: signMfaToken(userId), code: wrong }),
    });
    const badBody = (await bad.json()) as ErrorBody;

    // No oracle: status, code AND message identical between replay and wrong.
    expect(replay.status).toBe(401);
    expect(replay.status).toBe(bad.status);
    expect(replayBody.error.code).toBe("invalid_credentials");
    expect(replayBody.error.code).toBe(badBody.error.code);
    expect(replayBody.error.message).toBe(badBody.error.message);
    expect(hasSessionCookie(replay)).toBe(false);
  });

  it("too many attempts → 429 rate_limited (per IP+user bucket)", async () => {
    const { app, signMfaToken, authenticator } = deps;
    // Fresh user so this test owns its own IP+user rate-limit bucket
    // (10/min/IP+user) and isn't polluted by the cases above.
    const rlUserId = randomUUID();
    const rlSecret = deps.generateTotpSecret();
    await deps.db.insert(deps.users).values({
      id: rlUserId,
      email: `verify-login-rl-${rlUserId}@test.local`,
      passwordHash: null,
      totpSecretEncrypted: deps.encryptUserSecret(rlSecret),
      totpEnabledAt: new Date(),
      status: "active",
    });
    try {
      const current = authenticator.generate(rlSecret);
      const wrong = current === "000000" ? "111111" : "000000";
      let sawRateLimit = false;
      // The per-IP+user bucket is 10/min; loop past it.
      for (let i = 0; i < 12; i++) {
        const res = await app.request("/auth/2fa/verify-login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.0.0.5" },
          body: JSON.stringify({ mfaToken: signMfaToken(rlUserId), code: wrong }),
        });
        if (res.status === 429) {
          const body = (await res.json()) as ErrorBody;
          expect(body.error.code).toBe("rate_limited");
          sawRateLimit = true;
          break;
        }
        expect(res.status).toBe(401);
      }
      expect(sawRateLimit).toBe(true);
    } finally {
      await deps.db.delete(deps.users).where(deps.eq(deps.users.id, rlUserId));
    }
  });
});
