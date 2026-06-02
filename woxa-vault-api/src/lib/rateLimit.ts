// ---------------------------------------------------------------------------
// Sliding-window rate limiter.
//
// Threat model: brute-force credential guessing on /auth/login, send-reveal
// token guessing, and quota abuse across all state-changing endpoints (FR-008,
// AC-032). Assets: credentials, one-time-send tokens, regenerate quotas.
// Adversaries: anonymous attackers spamming an endpoint; a stolen session
// trying to burn a victim's quota. Mitigations: per-(IP[,key]) sliding window;
// `peek`/`consume` split so a window is only charged on a *failed* attempt
// (CRITICAL-5).
//
// Backend selection (DESIGN.md §10 / NFR-012):
//   * REDIS_URL set  → Redis sorted-set sliding window, shared across every
//     instance, so horizontal scaling can't multiply an attacker's budget by
//     the replica count. Each operation runs as a single atomic Lua script
//     (EVAL) — ZREMRANGEBYSCORE + ZCARD + conditional ZADD + PEXPIRE in one
//     round-trip — which closes the check-then-add race that a multi-command
//     MULTI/EXEC pipeline would still expose under concurrent requests on the
//     same key.
//   * REDIS_URL unset, OR a Redis command throws (Redis down) → transparent
//     fallback to the in-process map below. Fallback state is per-instance and
//     resets on restart; that is acceptable because the durable account-lock
//     (failed_login_count → lockedUntil in DB) is the real backstop.
//
// Residual risk: under a Redis outage the limiter degrades to per-instance
// counters (an attacker hitting N replicas gets N× the budget for the outage
// window). Logged and bounded by the DB account-lock.
// ---------------------------------------------------------------------------
import { redis } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

// ===========================================================================
// In-memory fallback (sync). Used when Redis is not configured or unavailable.
// ===========================================================================

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

function rateLimitInMemory(
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

function peekRateLimitInMemory(
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

function consumeRateLimitInMemory(key: string, options: { windowMs: number }): void {
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

// ===========================================================================
// Redis sliding window (sorted set, one atomic Lua script per operation).
//
// Member encoding: `<now_ms>-<random>` so concurrent requests in the same
// millisecond produce distinct ZSET members (a plain score-as-member would
// collapse them and undercount). Score = now_ms. We trim members older than
// (now - windowMs) on every call, then count, then conditionally add.
// PEXPIRE keeps the key bounded so abandoned buckets self-evict.
// ===========================================================================

// CHECK-AND-CONSUME: trim, count; if under limit add a member and allow.
// Returns {allowed, count_after, oldest_ms}.
const CHECK_CONSUME_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, count, oldest[2] or now}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1, now}
`;

// PEEK (non-consuming): trim, count only. No member added.
const PEEK_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, count, oldest[2] or now}
end
return {1, count, now}
`;

// CONSUME (unconditional): trim, add a member regardless of limit.
const CONSUME_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return 1
`;

const RL_PREFIX = "rl:";

function uniqueMember(now: number): string {
  return `${now}-${Math.random().toString(36).slice(2, 10)}`;
}

type LuaTriple = [number, number, number];

function toResult(
  raw: LuaTriple,
  now: number,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const [allowed, count, oldest] = raw;
  if (allowed === 0) {
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, options.windowMs - (now - Number(oldest))),
    };
  }
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - Number(count)),
    resetMs: options.windowMs,
  };
}

// ===========================================================================
// Public async API. Same shape as the previous sync API; callers `await`.
// Each Redis path is wrapped so a runtime Redis failure transparently falls
// back to in-memory for that request.
// ===========================================================================

export async function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  if (redis) {
    try {
      const now = Date.now();
      const raw = (await redis.eval(
        CHECK_CONSUME_LUA,
        1,
        RL_PREFIX + key,
        now,
        options.windowMs,
        options.limit,
        uniqueMember(now),
      )) as LuaTriple;
      return toResult(raw, now, options);
    } catch {
      // fall through to in-memory
    }
  }
  return rateLimitInMemory(key, options);
}

export async function peekRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  if (redis) {
    try {
      const now = Date.now();
      const raw = (await redis.eval(
        PEEK_LUA,
        1,
        RL_PREFIX + key,
        now,
        options.windowMs,
        options.limit,
      )) as LuaTriple;
      return toResult(raw, now, options);
    } catch {
      // fall through to in-memory
    }
  }
  return peekRateLimitInMemory(key, options);
}

export async function consumeRateLimit(
  key: string,
  options: { windowMs: number },
): Promise<void> {
  if (redis) {
    try {
      const now = Date.now();
      await redis.eval(
        CONSUME_LUA,
        1,
        RL_PREFIX + key,
        now,
        options.windowMs,
        uniqueMember(now),
      );
      return;
    } catch {
      // fall through to in-memory
    }
  }
  consumeRateLimitInMemory(key, { windowMs: options.windowMs });
}
