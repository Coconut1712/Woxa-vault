import { describe, expect, it } from "vitest";
import { rateLimit, peekRateLimit, consumeRateLimit } from "./rateLimit";

// These tests run WITHOUT REDIS_URL set, so the limiter exercises its
// in-memory fallback path (DESIGN.md §10 / NFR-012) — the test suite must not
// depend on a real Redis. The /auth/2fa/verify-login route charges an IP-ONLY
// bucket BEFORE decoding the mfaToken (the per-user bucket keys off a userId
// carried inside the token, so a forged/expired token never reaches it). These
// tests pin the sliding-window primitive so a regression in the limit math
// (off-by-one, window leak) is caught. We use a unique key per test so the
// shared module-level bucket map doesn't bleed across cases.
//
// The functions are async now (Redis makes them Promise-returning); the
// in-memory fallback resolves synchronously underneath, so behavior is
// identical to the previous sync implementation.

describe("rateLimit — in-memory fallback (no REDIS_URL)", () => {
  it("allows up to `limit` requests then blocks (30/min/IP)", async () => {
    const key = `2fa-verify-login-ip:test-${Math.random()}`;
    const opts = { limit: 30, windowMs: 60 * 1000 };
    for (let i = 0; i < 30; i++) {
      expect((await rateLimit(key, opts)).allowed).toBe(true);
    }
    // 31st request inside the window is rejected.
    const blocked = await rateLimit(key, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it("peek does not consume a slot; consume charges only on demand", async () => {
    const key = `peek-test-${Math.random()}`;
    const opts = { limit: 2, windowMs: 60 * 1000 };
    // Peeking many times never exhausts the bucket.
    for (let i = 0; i < 10; i++) {
      expect((await peekRateLimit(key, opts)).allowed).toBe(true);
    }
    // Two explicit consumes fill it; the third peek now reports blocked.
    await consumeRateLimit(key, { windowMs: opts.windowMs });
    await consumeRateLimit(key, { windowMs: opts.windowMs });
    expect((await peekRateLimit(key, opts)).allowed).toBe(false);
  });

  it("falls back to in-memory when Redis is not configured (REDIS_URL unset)", async () => {
    // The redis singleton is null in the test env, so this simply confirms the
    // public API resolves and enforces the limit purely in-process.
    const key = `fallback-test-${Math.random()}`;
    const opts = { limit: 1, windowMs: 60 * 1000 };
    expect((await rateLimit(key, opts)).allowed).toBe(true);
    expect((await rateLimit(key, opts)).allowed).toBe(false);
  });
});
