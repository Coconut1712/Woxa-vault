---
name: validation_and_ratelimit
description: Zod + jsonValidator validation convention, plus the two-tier rate limit pattern
metadata:
  type: reference
---

**Validation convention:**
- Every API route uses `jsonValidator(zodSchema)` from `woxa-vault-api/src/lib/validator.ts`.
- Schemas live inline at the top of each route file (`routes/me.ts`, `routes/auth.ts`, etc.) — search for `z.object` near `.post(` / `.get(`.
- Length caps are mandatory: passwords `max(1024)` to prevent Argon2 cost-bomb DoS; displayName `max(120)`; etc.
- `password` fields use `min(1)` (not `min(10)`) on verify/unlock paths so users whose password predates a policy bump can still authenticate. `min(10)` only on setup/change paths.
- `password` is NOT trimmed — leading/trailing whitespace is part of the secret.

**Two-tier rate limit pattern (CRITICAL-5 origin):**
- In-memory sliding window in `woxa-vault-api/src/lib/rateLimit.ts` — Phase A only, migrate to Redis for Phase B.
- API: `rateLimit(key, opts)` consumes a slot; `peekRateLimit(key, opts)` inspects without consuming; `consumeRateLimit(key, opts)` charges a slot only on failure.
- Pattern (used in `me.ts:verify-password`, `me.ts:recovery-kit/regenerate`, `me.ts:sessions/revoke-all`):
  1. SOFT cap (e.g. 30/15min) — `rateLimit()` ticks on every attempt so even a legit user can't burn Argon2 indefinitely.
  2. HARD cap (e.g. 5/15min) — `peekRateLimit()` up front to 429 if exhausted; `consumeRateLimit()` only on failure so a session-thief can't lock out the legit user by spamming wrong guesses between their own successes.
- Always set `Retry-After` header (seconds) on 429.
- Cleanup interval keeps memory bounded (rateLimit.ts:97-105).

Related: [[crypto_primitives]] [[auth_session_patterns]]
