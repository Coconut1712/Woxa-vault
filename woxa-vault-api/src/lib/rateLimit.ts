// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter for Phase A.
// Threat model: brute-force credential guessing on /auth/login.
// Mitigations: 5 attempts per 15-minute window per (IP, email) key (FR-008).
// Residual risk: process restart resets counters — acceptable in Phase A
// because account-lock (failed_login_count → lockedUntil) lives in DB.
// Phase B: migrate to Redis sliding-window so multi-instance deployments
// share state (DESIGN.md §10).
// ---------------------------------------------------------------------------

type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const since = now - options.windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  // Drop hits outside the sliding window.
  bucket.hits = bucket.hits.filter((t) => t > since);

  if (bucket.hits.length >= options.limit) {
    const oldest = bucket.hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, options.windowMs - (now - oldest)),
    };
  }

  bucket.hits.push(now);
  return {
    allowed: true,
    remaining: options.limit - bucket.hits.length,
    resetMs: options.windowMs,
  };
}

// CRITICAL-5: variant that inspects the bucket without consuming a slot.
// Used when the rate limit should only be charged on a failed attempt — a
// stolen session must not be able to "burn" a legit user's regenerate quota
// by spamming wrong-password tries. Pair with `consumeRateLimit(key)` when
// the failure path is reached.
export function peekRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const since = now - options.windowMs;
  const bucket = buckets.get(key);
  const hits = bucket ? bucket.hits.filter((t) => t > since) : [];
  if (hits.length >= options.limit) {
    const oldest = hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, options.windowMs - (now - oldest)),
    };
  }
  return {
    allowed: true,
    remaining: options.limit - hits.length,
    resetMs: options.windowMs,
  };
}

export function consumeRateLimit(key: string, options: { windowMs: number }): void {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  // Trim before pushing so the bucket doesn't grow without bound under sustained
  // failure traffic.
  const since = now - options.windowMs;
  bucket.hits = bucket.hits.filter((t) => t > since);
  bucket.hits.push(now);
}

// Lightweight periodic cleanup to keep memory bounded.
setInterval(
  () => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [k, b] of buckets) {
      if (b.hits.every((t) => t < cutoff)) buckets.delete(k);
    }
  },
  15 * 60 * 1000,
).unref();
