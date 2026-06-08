---
name: per-user-kdf-salt
description: Phase C crypto fix #2 — per-user random kdf_salt replacing predictable userId.padEnd salt; GET /auth/kdf-salt + /me expose it
metadata:
  type: project
---

Phase C crypto fix #2: client master-key derivation no longer uses the
predictable salt `userId.padEnd(16,"0")`. A random 32-byte per-user salt is now
stored server-side and handed back to the client.

**Schema:** `users.kdf_salt text` (base64, nullable for backfill). Migration
`drizzle/0030_user_kdf_salt.sql` (hand-written, journal idx 30).

**Helper:** `src/lib/kdfSalt.ts` — `generateKdfSalt()` (random 32B b64) and
`fakeKdfSaltForEmail(email)` (deterministic decoy = HMAC(MFA_TOKEN_SECRET,
"kdf-salt:"+lowercased email), 32B). Reuses MFA_TOKEN_SECRET as server secret.

**Generated at every user-creation site:** register (`routes/auth.ts`), SSO JIT
(`routes/sso.ts`), invite signup (`routes/invitations.ts`). `/me/password/setup`
sets it ONLY if `user.kdfSalt` is null (NEVER overwrites — overwriting changes
derivation and orphans wrapped data).

**Endpoints:**
- `GET /auth/kdf-salt?email=` — public/pre-auth, returns `{ kdfSalt }`. Real salt
  for known email; deterministic decoy for unknown (anti-enumeration, same shape
  + same value per email). Rate-limit = login tier (5/IP + 5/IP+email/15min).
  Empty email → 401 invalid_credentials. `Cache-Control: no-store`.
- `GET /me` payload gains `kdfSalt: string | null` (use post-auth, no enum risk).

**Server impact:** salt is NOT secret; login verify unchanged (still compares
loginPasswordHash/authKeyHash). Salt only affects client-side derivation.

Tests: `src/routes/authKdfSalt.test.ts` (real/decoy/deterministic/me/backfill).

See [[gotcha-sql-rpad-vs-js-padend]] — the backfill formula trap.
