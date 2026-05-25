---
name: round2-security-audit-patches
description: Round-2 security audit fixes applied on top of Round-8 mailer + 2FA work — hardening that future rounds should not regress
metadata:
  type: project
---

Round-2 security audit closed P1+P2 findings F-01..F-09 plus F-14 + env hardening. F-10, F-11, F-12 remain deferred as TODOs in `src/routes/twoFactor.ts`.

**Why:** External audit of the round-8 2FA + invitation work; user paid for the report and expected exact-fidelity application of the recommendations, not re-litigation.

**How to apply:**
- Do NOT remove or weaken any of the following invariants without an explicit ack from the user:
  - `getMfaSecret` returns a SHA-256-normalized 32-byte buffer cached for the process lifetime (F-04).
  - Backup codes are 11 chars `XXXXX-XXXXX` with 50 bits of entropy via the RFC 4648 alphabet (F-05) — DO NOT revert to `randomBytes(5)` / 40 bits.
  - `/auth/2fa/disable` and `/auth/2fa/regenerate-backup-codes` tick `peekRateLimit` + `consumeRateLimit` on the fail path only (F-01, F-02). Bucket keys: `2fa-disable-fail:${userId}` (10/15min), `2fa-regen-fail:${userId}` (5/15min).
  - `/auth/2fa/disable` calls `invalidateOtherSessions(user.id, currentSession.id)` AFTER the disable transaction commits (F-09). The helper lives in `src/lib/session.ts`.
  - `/invite/:token/accept` is rate-limited per `(ip, tokenHash)` 10/60s before any DB lookup (F-03).
  - `lib/mailer/resend.ts` calls `sanitizeForSubject()` on both `inviterName` and `orgName` before they're spliced into the Subject line (F-07). The regex strips ASCII control bytes (`[\x00-\x1F\x7F]`).
  - `env.ts` `MFA_TOKEN_SECRET` is refined to `^[0-9a-f]{64}$/i` with the literal placeholder string allowed only in dev. Production guard still rejects the placeholder.
  - Both backup-code-verify loops (in `/disable` and `/verify-login`) MUST keep their `break` after a matched Argon2 verify (F-06) — without it, every wrong code burns ~200 ms × N rows of CPU.

Audit-aware test invariants (now in `src/lib/mfa.test.ts`):
- 1000-sample uniqueness check for `generateBackupCode()` — duplicates indicate a regression.
- HMAC tag length sanity check (43-char base64url segment ↔ 32-byte digest) for `signMfaToken` — drift here means `getMfaSecret` was changed.

See [[round8-mailer-and-2fa]] for the prior layer this audit hardened.
