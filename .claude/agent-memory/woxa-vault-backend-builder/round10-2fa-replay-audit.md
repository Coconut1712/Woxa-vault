---
name: round10-2fa-replay-audit
description: Round-10 2FA security audit — TOTP replay CAS (last_totp_step), KEK prod boot guard, verify-login IP bucket, 2FA change email
metadata:
  type: project
---

Round-10 audit hardened the 2FA flow (`src/routes/twoFactor.ts`, `src/lib/mfa.ts`, `src/config/env.ts`). All findings were pre-existing.

**Why:** 2FA is security-critical; `verifyTotpCode` was stateless → a single TOTP replayable for ~60-90s (RFC 6238 §5.2 violation), capture-replay on verify-login could mint a 2nd session.

**How to apply / invariants future rounds MUST NOT regress:**
- **TOTP replay guard** = migration 0010 `users.last_totp_step bigint` + monotonic CAS. `mfa.checkTotpStep(secret,code)` returns the matched absolute step (`floor(now/30)+checkDelta`) or null. Route helper `consumeTotpStep(conn,userId,secret,code)` does `UPDATE users SET last_totp_step=$step WHERE id=$id AND (last_totp_step IS NULL OR last_totp_step<$step) RETURNING id` → "ok"/"invalid"/"replay". Called in ALL 4 TOTP success paths: verify-enroll, disable (TOTP branch only), regenerate, verify-login. Backup-code paths are EXEMPT (own single-use `used_at` marker).
- `verifyTotpCode` kept as boolean wrapper over `checkTotpStep` (used by mfa.test + the disable looks-like-TOTP routing); no longer imported in twoFactor.ts.
- **KEK prod boot guard** in env.ts production fatal list: `LOCAL_KEK_BASE64` required + must base64-decode to exactly 32 bytes + not placeholder `REPLACE_ME_WITH_BASE64_32_BYTES`. Mirrors RESEND/MFA_TOKEN_SECRET guards.
- **verify-login IP bucket**: IP-only `2fa-verify-login-ip:${ip}` 30/min charged BEFORE `verifyMfaToken` decode (per-user bucket keys off userId inside token, unreachable on forged token). Bad-token path writes best-effort audit `2fa.login_failed` actorUserId=null reason=bad_token.
- **2FA change email**: `mailer/resend.ts sendTwoFactorChangedEmail({to,action,ipHash,at})` (NO secrets/codes; only short ipHash prefix). Called best-effort post-commit via `notifyTwoFactorChanged()` in enable + disable paths; try/catch never fails the request.
- Argon2id pinned explicitly in `password.ts` + `mfa.ts` ARGON_OPTS — see [[gotcha-node-rs-argon2-const-enum]].

Tests added: `mfa.test.ts` checkTotpStep; `twoFactor.totpReplay.test.ts` (DB integration, monotonic CAS + concurrency); `env.kekGuard.test.ts` (subprocess boot, 4 cases); `rateLimit.test.ts`. 44 tests pass, typecheck clean. Related: [[round8-mailer-and-2fa]], [[round2-security-audit-patches]], [[migration-history-handwritten]].
