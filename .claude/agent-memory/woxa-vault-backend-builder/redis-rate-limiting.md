---
name: redis-rate-limiting
description: Rate limiter is Redis-backed (ioredis) with in-memory fallback; all rateLimit/peek/consume calls are now async
metadata:
  type: project
---

`src/lib/rateLimit.ts` was migrated from pure in-memory to a Redis sorted-set
sliding window (DESIGN.md §10 / NFR-012, residual #1).

**Why:** in-memory counters don't share across instances — horizontal scaling
multiplied an attacker's brute-force budget by the replica count.

**How to apply:**
- `rateLimit`, `peekRateLimit`, `consumeRateLimit` are now **async** (return Promises).
  Every call site MUST `await`. They are called in `src/routes/{workspace,me,twoFactor,auth,sends,search,invitations,notifications,accessRequests,sso}.ts`.
- Redis client is a singleton in `src/lib/redis.ts`, reading `REDIS_URL` from env (optional).
  If `REDIS_URL` is unset → `redis` exports `null` → limiter uses the in-process map.
  If a Redis command throws (Redis down) → per-request try/catch falls back to in-memory; one WARN logged per outage episode.
- Each operation runs a single **Lua EVAL** (ZREMRANGEBYSCORE + ZCARD + conditional ZADD + PEXPIRE) for atomicity — chose Lua over MULTI/EXEC because MULTI still races on check-then-add for the same key under concurrency. Key prefix `rl:`. Members are `<now_ms>-<rand>` so same-ms requests don't collapse.
- Tests run WITHOUT real Redis (`REDIS_URL` unset) and exercise the in-memory fallback. Do NOT make tests depend on a live Redis.
- `docker-compose.yml` has a `redis:7-alpine` service (port 6379) for dev; optional.
- Internal sync fallbacks kept as `rateLimitInMemory` / `peekRateLimitInMemory` / `consumeRateLimitInMemory`.

Related: [[gotcha-drizzle-migration-when-gate]] (env hardening conventions live in env.ts).
