import { describe, expect, it, beforeAll } from "vitest";

// Pin the SSO-handoff cookie contract. The /login/mfa frontend page relies on
// the cookie being HttpOnly + SameSite=Lax + Path=/ so it rides the top-level
// redirect from Google and is re-attached on the verify-login POST WITHOUT the
// SPA ever reading it. A regression here (e.g. SameSite=Strict would drop the
// cookie on the cross-site Google redirect; a narrower Path would miss the
// /auth/2fa/verify-login POST) silently breaks SSO 2FA.

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
});

async function loadMfa() {
  return import("@/lib/mfa");
}

describe("mfa_pending cookie (SSO 2FA handoff)", () => {
  it("set cookie is HttpOnly, SameSite=Lax, Path=/ with a token-aligned Max-Age", async () => {
    const { buildMfaPendingCookie, MFA_PENDING_COOKIE, MFA_PENDING_COOKIE_MAX_AGE } = await loadMfa();
    const cookie = buildMfaPendingCookie("the.mfa.token", false);
    expect(cookie.startsWith(`${MFA_PENDING_COOKIE}=the.mfa.token`)).toBe(true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    // Max-Age must equal the mfaToken TTL so a stale cookie self-expires in
    // lock-step with the token it carries (5 min).
    expect(MFA_PENDING_COOKIE_MAX_AGE).toBe(300);
    expect(cookie).toContain(`Max-Age=${MFA_PENDING_COOKIE_MAX_AGE}`);
    // SameSite=Strict would be DROPPED on the cross-site redirect back from
    // Google — assert we never tighten to it by accident.
    expect(cookie).not.toContain("SameSite=Strict");
  });

  it("omits Secure when secure=false, includes it when secure=true", async () => {
    const { buildMfaPendingCookie } = await loadMfa();
    expect(buildMfaPendingCookie("t", false)).not.toContain("Secure");
    expect(buildMfaPendingCookie("t", true)).toContain("Secure");
  });

  it("clear cookie expires the value (Max-Age=0) and stays HttpOnly", async () => {
    const { buildClearMfaPendingCookie, MFA_PENDING_COOKIE } = await loadMfa();
    const cleared = buildClearMfaPendingCookie(true);
    expect(cleared.startsWith(`${MFA_PENDING_COOKIE}=;`)).toBe(true);
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toContain("HttpOnly");
    expect(cleared).toContain("Secure");
  });
});
