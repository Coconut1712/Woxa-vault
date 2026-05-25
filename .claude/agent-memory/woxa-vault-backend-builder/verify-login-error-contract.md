---
name: verify-login-error-contract
description: verify-login HTTP error codes — mfa_session_expired vs invalid_credentials, and the replay==wrong-code no-oracle invariant
metadata:
  type: project
---

`POST /auth/2fa/verify-login` (`src/routes/twoFactor.ts`) returns THREE distinct error shapes the frontend branches on:

- `429 rate_limited` — too many attempts (30/min/IP, 10/min/IP+user)
- `401 mfa_session_expired` — the mfaToken (body) or `mfa_pending` cookie is missing/malformed/expired (5-min TTL). Audit reason `bad_token`. Terminal: FE sends user back to fresh login. Added in the round that split this from invalid_credentials (was previously all invalid_credentials, so FE showed "timed out" even on a wrong code).
- `401 invalid_credentials` — wrong TOTP code **AND replayed TOTP** (and "2FA not enabled"). Retryable on FE.

**Security invariant — DO NOT REGRESS:** replayed TOTP and wrong code MUST be byte-for-byte identical at the HTTP layer (same status 401, same code `invalid_credentials`, same message "Invalid 2FA code"). Distinguishing them creates a replay oracle (attacker learns a sniffed code was once valid). The internal audit trail still separates them via reason `replay` vs `invalid_code`. See [[round10-2fa-replay-audit]] for the last_totp_step CAS guard that powers replay detection.

Error helper `errors.mfaSessionExpired()` lives in `src/lib/errors.ts` (401, code `mfa_session_expired`). Contract documented in `API_CONTRACT.md` verify-login error table.

Route-level integration test: `src/routes/twoFactor.verifyLoginErrors.test.ts` — drives real app + real PG, asserts replay==wrong-code message equality. Uses `TRUST_PROXY=true` + per-test `X-Forwarded-For` to isolate the in-process rate-limit Map buckets (app.request has no socket, so getClientIp falls back to one shared "unknown" IP otherwise).

**Why:** FE reported wrong code surfacing as "timed out". **How to apply:** when touching the verify-login error path, keep mfa_session_expired strictly for token-session failures and never let replay diverge from wrong-code. Enroll/disable/regenerate 2FA errors stay `invalid_credentials` — unaffected.
