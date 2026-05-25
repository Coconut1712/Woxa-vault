import { describe, expect, it } from "vitest";
import { rateLimit, peekRateLimit, consumeRateLimit } from "./rateLimit";

// The /auth/2fa/verify-login route now charges an IP-ONLY bucket BEFORE
// decoding the mfaToken (the per-user bucket keys off a userId carried inside
// the token, so a forged/expired token never reaches it). These tests pin the
// sliding-window primitive that backs that bucket so a regression in the limit
// math (off-by-one, window leak) is caught. We use a unique key per test so the
// shared module-level bucket map doesn't bleed across cases.

describe("rateLimit — verify-login IP bucket semantics", () => {
  it("allows up to `limit` requests then blocks (30/min/IP)", () => {
    const key = `2fa-verify-login-ip:test-${Math.random()}`;
    const opts = { limit: 30, windowMs: 60 * 1000 };
    for (let i = 0; i < 30; i++) {
      expect(rateLimit(key, opts).allowed).toBe(true);
    }
    // 31st request inside the window is rejected.
    const blocked = rateLimit(key, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it("peek does not consume a slot; consume charges only on demand", () => {
    const key = `peek-test-${Math.random()}`;
    const opts = { limit: 2, windowMs: 60 * 1000 };
    // Peeking many times never exhausts the bucket.
    for (let i = 0; i < 10; i++) {
      expect(peekRateLimit(key, opts).allowed).toBe(true);
    }
    // Two explicit consumes fill it; the third peek now reports blocked.
    consumeRateLimit(key, { windowMs: opts.windowMs });
    consumeRateLimit(key, { windowMs: opts.windowMs });
    expect(peekRateLimit(key, opts).allowed).toBe(false);
  });
});
