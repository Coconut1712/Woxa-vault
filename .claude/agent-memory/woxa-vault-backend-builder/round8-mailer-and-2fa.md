---
name: round8-mailer-and-2fa
description: Round 8 — Resend mailer for invitations and production TOTP 2FA (enroll/verify/login/disable/backup codes)
metadata:
  type: project
---

Round 8 delivered two coupled features.

**Resend mailer (Feature 1):**
- `src/lib/mailer/resend.ts` — lazy `Resend` client. Falls back to a plain `console.log` block (not via pino) in dev when `RESEND_API_KEY` is empty. Never structured-logs the `acceptUrl`.
- Wired into `members.ts` `POST /members/invite` + `POST /members/invite/:id/resend`. Failures do not roll back the invitation row; response carries `{ emailSent, emailError? }`. `acceptUrl` is included in the response body only when `NODE_ENV !== "production"`.
- `redactEmail("alice@example.com") → "a***@example.com"` used for any structured log line.
- `*.acceptUrl` added to `lib/logger.ts` pino redact paths as last-line defense.

**Why:** production callers must rely on the email channel for invites; before this round the only delivery was a logger.info line.
**How to apply:** future endpoints that mint single-recipient secrets must use the same pattern — return `{ sent, errorCode }` without rolling back persisted state; log redacted recipient + opaque id only.

**2FA (Feature 2):**
- Migration 0008 `user_mfa_backup_codes` (hand-authored, not via drizzle-kit because journal has divergent snapshots 0006/0007). Argon2id hash per code, `used_at` for single-use claim.
- `src/lib/mfa.ts` — envelope-encrypts TOTP secret under `LOCAL_KEK_BASE64` (single base64 blob = `iv || ciphertext || tag`). HS256-style mfaToken signed with the separate `MFA_TOKEN_SECRET`.
- `src/routes/twoFactor.ts` mounted at `/auth/2fa` in app.ts. Routes: `POST /enroll`, `POST /verify-enroll`, `POST /disable`, `POST /regenerate-backup-codes`, `POST /verify-login` (public — consumes mfaToken).
- `auth.ts` `/auth/login` now branches on `users.totp_enabled_at`: returns `{ status: "mfa_required", mfaToken }` instead of issuing the session cookie. Cookie + audit `auth.login.success` happen only after `verify-login`.
- `me.ts` GET `/me` exposes `twoFactorPending` (secret stored but not yet verified) and `backupCodesRemaining`.
- New error code `two_factor_already_enabled` (409) in `lib/errors.ts`.

**Why:** AC-003.5 mandated the login gate; prior to this, totp columns existed in the schema but had no enforcement.
**How to apply:** any new sensitive endpoint that mutates 2FA state must require both `password` and (when 2FA is currently enabled) a fresh `code`. The disable/regenerate handlers are the reference shape.

**Tests:** added vitest config with `@/*` alias. `src/lib/mfa.test.ts` + `src/lib/mailer/resend.test.ts` exercise crypto round-trip, TOTP verify, backup-code single-use, mfaToken sign+verify+tamper, email redaction, dev fallback. All 7 pass.

**Env additions:** `RESEND_API_KEY` (required prod), `MAIL_FROM`, `MFA_TOKEN_SECRET` (required prod). Production guard in `src/config/env.ts` refuses to boot when either prod secret is missing/placeholder.

Related: [[vault-items-schema]], [[round7-security-hardening]], [[account-self-service]].
