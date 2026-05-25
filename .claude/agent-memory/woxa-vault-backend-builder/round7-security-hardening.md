---
name: round7-security-hardening
description: Round-7 fixes from master-password+recovery-kit audit; TRUST_PROXY, lower(email) index, absolute_expires_at, Origin CSRF, checksum on recovery codes
metadata:
  type: project
---

Round 7 (2026-05-19) — security audit follow-ups to the round-6 recovery-kit work. All landed under migration `0006_lowercase_email_index.sql` plus targeted refactors.

**Migration 0006** does TWO things in one file (atomic for ops):
1. Drops the raw `users_email_idx`, normalizes `email` to lowercase in-place, recreates the index over `lower(email)`. After this, mixed-case inserts collide with their lowercase twins at the DB layer.
2. Adds `sessions.absolute_expires_at timestamptz NOT NULL`. Backfilled to `created_at + 30 days`. New `createSession` writes it; `validateSessionToken` enforces it (sliding refresh is clamped, never extends past the ceiling).

**TRUST_PROXY env (default false)** is the new gate for honoring `X-Forwarded-For`/`X-Real-IP`. `cf-connecting-ip` and `fly-client-ip` are always honored because Cloudflare/Fly inject them at the edge. In `getClientIp` the socket peer is the fallback — accessed via `c.env.incoming.socket.remoteAddress` (the `@hono/node-server` binding). Without this, an anonymous attacker could spoof XFF and bypass every IP-keyed rate limit.

**Recovery code format change (WARN-7)** — codes now have **14** dashed 4-char blocks (= 13 body + 1 checksum). The checksum is `SHA-256(body).slice(0, 4)` (hex, 16 bits). The reset endpoint strips and validates the checksum BEFORE the Argon2 verify so typos do not burn the per-email rate-limit window. On checksum failure we still run a dummy Argon2 verify against a sentinel to preserve constant-ish time. The hash is stored over the **body only** — not the checksum.

**Rate-limit two-tier** (in `src/lib/rateLimit.ts`): `peekRateLimit` checks without consuming, `consumeRateLimit` only consumes. The regenerate flow consumes the soft 20/hr bucket on every attempt and the hard 3/hr bucket only when password verify fails. A legitimate user with the correct password never burns the hard bucket — so an attacker on a stolen cookie cannot lock the real user out of `/me/recovery-kit/regenerate`.

**Origin CSRF middleware** (`src/middleware/originCheck.ts`) runs before `sessionMiddleware`. State-changing methods (POST/PUT/PATCH/DELETE) require an `Origin` (or `Referer`) header from `CORS_ORIGINS`. Same-origin curl with no Origin is tolerated in dev (`NODE_ENV !== 'production'`) so local smoke tests still work; prod refuses null Origin.

**Setup endpoint atomic UPDATE (CRITICAL-2)** — `/me/password/setup` no longer relies on the session-cached `user.passwordHash`. The UPDATE has `WHERE password_hash IS NULL` and the rowcount tells us who won the race. Loser throws `password_already_set` (409). Winner additionally deletes ALL existing sessions for the user (WARN-13) and issues a fresh session cookie before returning the recoveryCode.

**Reset hardening (CRITICAL-1)** — the user lookup in `/auth/password/reset-with-recovery` is gated by `status = 'active' AND deleted_at IS NULL`. Disabled / soft-deleted users get the unknown-email branch (constant-time path), audited as `account.password_reset_failed` with `metadata.reason = 'unknown_email'`.

**Logger redact (CRITICAL-6)** — pino redact list extended in `src/lib/logger.ts` to cover `*.recoveryCode`, `*.token`, `*.newPassword`, `*.currentPassword`, `req.body.recoveryCode`, and a few more. Every endpoint returning a plaintext `recoveryCode` now sets `Cache-Control: no-store` (`/me/password/setup`, `/me/recovery-kit/regenerate`, `/invite/:token/signup-and-accept`). The reset endpoint also sets `no-store` even though it doesn't return a code, since it signals an auth state change.

**Production rate-limit note** — the in-memory `rateLimit` is process-local. Before scaling out (multi-instance Fly.io, Workers) it MUST migrate to Redis per DESIGN.md §10. Spec carries this as a TODO.

See [[recovery-kit-flow]] for the round-6 baseline and [[account-self-service]] for round-5 context. The round-7 changes are documented inline in `API_CONTRACT.md` under "Round-7 security hardening".
