---
name: mfa_patterns
description: 2FA architecture — TOTP storage, backup codes, mfaToken, rate-limit gaps to recheck
metadata:
  type: reference
---

MFA (TOTP + backup codes + mfaToken) implementation in Woxa Vault — review notes that recur across audits.

**Architecture:**
- **Routes:** `woxa-vault-api/src/routes/twoFactor.ts` mounted at `/auth/2fa`. Login gate at `routes/auth.ts:139-153` returns `{ status: "mfa_required", mfaToken }` WITHOUT setting session cookie. Session is minted only by `/auth/2fa/verify-login`.
- **TOTP secret:** column `users.totp_secret_encrypted` (envelope-encrypted under `LOCAL_KEK_BASE64` via `encryptUserSecret`). `users.totp_enabled_at` is the gate — pending state = secret set + enabled_at NULL.
- **Backup codes:** `user_mfa_backup_codes` table (migration `drizzle/0008_user_mfa_backup_codes.sql`). Single-use via atomic `UPDATE … WHERE used_at IS NULL RETURNING`. Argon2id-hashed (same params as master password).
- **mfaToken:** HMAC-SHA256 (custom — NOT a JWT library), purpose `mfa_challenge`, 5-min exp, base64url encoded. Verified with `timingSafeEqual`. Secret = `MFA_TOKEN_SECRET` (separate from session signing material).

**Rate limit coverage (status 2026-05-21 — round 1/2 gaps now CLOSED):**
- `/enroll`: 5/min/user. Still keyed per-user only (no IP cap) — minor, accepted.
- `/verify-enroll`: two-tier 30 soft + 10 hard/min/user — correct pattern.
- `/verify-login`: 10/min by `ip:userId`. Still no pre-decode IP-only bucket; a failed `verifyMfaToken` returns before the bucket and writes NO audit row (forged/expired tokens leave no trail).
- `/disable`: NOW fail-counting 10/15min (`peekRateLimit` up front, `consumeRateLimit` on verified fail). FIXED.
- `/regenerate-backup-codes`: NOW fail-counting 5/15min. FIXED.
- All 4 mgmt endpoints sit behind `requireAuth`; `verify-login` is intentionally public.

**Frontend handoff:**
- `woxa-vault-web/src/app/login/password/page.tsx` holds mfaToken in component state only.
- `BackupCodesPanel` (`components/auth/backup-codes-panel.tsx`) prints via isolated iframe with strict CSP — good pattern, reuse for any other one-time secret display.
- `TwoFactorEnrollDialog` blocks dialog close while on the codes step (no backdrop dismiss).

**Known accepted residuals (Phase A):**
- Pending TOTP secret can be re-rolled by a session-thief 5×/min (F-006). Mitigation = audit log + email notification. Email NOW IMPLEMENTED: `sendTwoFactorChangedEmail` in `mailer/resend.ts` fires best-effort post-commit on enable/disable (no secrets in body, escaped, only ipHash 12-char prefix). Note it covers enable/disable only — NOT enroll re-roll, so the F-006 re-roll spam still has no out-of-band alert.
- mfaToken not bound to IP/UA (TLS terminates the risk — NAT churn justification documented in `mfa.ts`).
- mfaToken `nonce` is DECORATIVE — not tracked server-side, so it does not actually block token reuse within the 5-min TTL.
- Backup code entropy FIXED: now 50 bits (`randomBytes(7)`, top 50 bits → 10 base32 chars) at `mfa.ts:174`. Was 40. Resolved.

**RESOLVED 2026-05-21 (verified by focused re-audit, all pass):**
- **TOTP REPLAY (was high) — CLOSED.** `users.last_totp_step` bigint column (migration 0010, schema.ts:88). `checkTotpStep` (mfa.ts:159) returns absolute step = floor(now/30)+delta; `consumeTotpStep` (twoFactor.ts:109) does monotonic CAS `UPDATE … WHERE last_totp_step IS NULL OR last_totp_step < $step RETURNING id`, 0 rows = "replay" → 401 invalid_code (no oracle, same error as invalid). Wired into ALL 4 TOTP paths: verify-enroll :253, disable :373, regenerate :505, verify-login :680. Backup-code path correctly does NOT touch the column (own `used_at` single-use). Tests: `routes/twoFactor.totpReplay.test.ts` (real PG: first-use accept, same-step replay reject, earlier/skew-step reject, later-step accept, concurrent race one-wins) + `mfa.test.ts` checkTotpStep cases. All 10 pass.
- argon2 algorithm — CLOSED. `algorithm: 2 satisfies Algorithm` pinned in mfa.ts:228 ARGON_OPTS (= Argon2id, not a downgrade). isolatedModules forbids enum deref so numeric pin is the right call.
- `LOCAL_KEK_BASE64` boot guard — CLOSED. env.ts:149-156 production guard: required + base64-decodes to exactly 32 bytes + rejects `REPLACE_ME_WITH_BASE64_32_BYTES` placeholder. Dev/test still optional (no false-positive).
- verify-enroll/disable/regenerate audit as `2fa.login_failed` + `metadata.stage` (+ `reason: replay|invalid_code`). Coarse but OK; replay vs invalid distinguished in metadata only, not in HTTP response — correct (no oracle).

**Minor availability edge (info, accepted — NOT a blocker):** `consumeTotpStep(db, …)` runs on the base `db` connection BEFORE the enable/session tx in verify-enroll & verify-login (it accepts a `DbLike` but callers pass `db`, not `tx`). If the subsequent enable/session tx fails after step consume, that step is "burned" — legit user must wait for the next 30s window. Only triggers on a DB error mid-flow; not exploitable. mfa.ts:102-105 comment says callers *can* fold CAS into the tx; they currently don't.

**verify-login error-code contract (audited 2026-05-21, focused — SHIPPABLE, no 🔴/🟠):** Three distinct outcomes, oracle-safe:
- bad/expired/absent mfaToken → `mfa_session_expired` (401, errors.ts:50). Thrown ONLY at twoFactor.ts:623, gated by `if (!decoded)` (twoFactor.ts:591) BEFORE any user lookup → leaks nothing about user existence or 2FA-code validity; it only states the caller's own login session (mfaToken) expired. Terminal on FE.
- wrong TOTP → `invalid_credentials` "Invalid 2FA code" (twoFactor.ts:721). Replayed TOTP → SAME `invalid_credentials` "Invalid 2FA code" (twoFactor.ts:715). Byte-identical (status+code+message) → no replay oracle. Pinned by `twoFactor.verifyLoginErrors.test.ts` line 182-187 (replayBody.message === badBody.message). 5/5 pass real PG.
- user-not-found / 2FA-not-enabled → `invalid_credentials` (twoFactor.ts:640), same code as wrong-code → no enumeration oracle (forging a token for an arbitrary userId needs MFA_TOKEN_SECRET anyway).
FE: `/login/mfa` (SSO standalone) and password-flow MfaChallengeStep both branch mfa_session_expired→terminal, invalid_code/401→retry. SSO page clears code field on wrong code; password-flow inline step deliberately KEEPS the field for typo-fix (UX choice, both safe — code is state-only, never logged/stored).

**New surface this round — `sendTwoFactorChangedEmail` (mailer/resend.ts:248):** no secrets in body (no TOTP secret/backup codes/code), all dynamic fields escaped via `escapeHtml`, only ipHash 12-char prefix + timestamp. Best-effort post-commit via `notifyTwoFactorChanged` (twoFactor.ts:135) try/catch — never blocks/fails auth. No SMTP-header injection (subject is a static template string, no user input; `to` from session). Clean.

Related: [[validation_and_ratelimit]] [[crypto_primitives]] [[recurring_antipatterns]]
