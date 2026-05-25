---
name: project-two-factor-auth
description: 2FA / TOTP frontend wiring — login MFA challenge, enroll/disable/regenerate, backup codes panel, and where each piece lives
metadata:
  type: project
---

Two-factor authentication (TOTP) is wired through the real backend (woxa-vault-api). The frontend pieces:

**API client**
- `src/lib/api/two-factor.ts` — owns `enrollTwoFactor`, `verifyEnrollTwoFactor`, `disableTwoFactor`, `regenerateBackupCodes`. Returns shapes match backend contract documented in /API_CONTRACT.md.
- `src/lib/api/auth.ts` — `login()` now returns a `LoginResult` discriminated union (`status: "ok" | "mfa_required"`). `verifyMfaLogin()` exchanges an `mfaToken` (JWT, ~5min TTL) for a real session.
- `src/lib/api/me.ts` — `MeUser` now has optional `twoFactorPending`, `backupCodesRemaining`, `totpEnabledAt`. These drive the TwoFactorCard's state machine.

**Auth provider** (`src/lib/auth/provider.tsx`)
- `login()` returns the `LoginResult` discriminator; it only mutates auth state on `"ok"`. The `"mfa_required"` branch is handed back to the caller untouched (no session cookie yet).
- New `completeMfaLogin({ mfaToken, code, useBackupCode? })` finishes the flow and runs the same /me refresh + unlock-timestamp dance as `login()`.

**Login MFA challenge** (`src/app/login/password/page.tsx`)
- Two-step state machine: `password` → `mfa`. mfaToken held in component state ONLY (never localStorage/cookie/URL).
- 6-digit TOTP input auto-submits on length 6. Toggle to backup mode switches input to `ABCDE-FGHIJ` shape (uppercase, dash-delimited).
- 5-minute countdown derived from `tokenExpiresAt = Date.now() + 5min` on receipt; tick once per second; on zero bounce back to password step with `login.error.mfa_expired`.
- On 400 `mfa_token_invalid` → bounce to password step. On 401 `invalid_code` → keep input, show inline error.

**Account → Security 2FA card** (`src/components/auth/two-factor-card.tsx`)
- Single composing component renders one of three states based on `me.twoFactorEnabled` + `me.twoFactorPending`.
- Owns three child dialogs: `TwoFactorEnrollDialog`, `TwoFactorDisableDialog`, `TwoFactorRegenerateDialog`, plus an inline `DiscardPendingDialog` for the cancel-pending case (calls `/disable` with password only, no TOTP code — the backend accepts this while pending).

**Enroll flow** (`src/components/auth/two-factor-enroll-dialog.tsx`)
- 3 stages: `scan` → `verify` → `codes`. Backend is idempotent on /enroll while pending so we can re-call safely.
- QR image wrapped in a white `<div>` with padding for scannability in dark mode.
- Stage 3 uses the shared `BackupCodesPanel`.

**BackupCodesPanel** (`src/components/auth/backup-codes-panel.tsx`)
- Reused by both enroll step 3 and regenerate flow.
- 2-column monospace grid, "Copy all" / "Download .txt" / "Print" actions. Print uses an isolated iframe with self-contained CSS (mirrors the recovery-kit modal pattern).
- Confirmation checkbox gates the "Done" button — codes are returned ONCE.

**Members invite email feedback** (`src/app/app/members/page.tsx`, `src/lib/api/members.ts`)
- `InvitationCreatedResponse` now has `emailSent: boolean`, `emailError?: string`, optional `acceptUrl`.
- Happy path (`emailSent === true`) shows toast only and does NOT open the success modal even if `acceptUrl` is present (dev mode).
- Fallback with link → opens modal with acceptUrl. Fallback without link → modal with "Retry send" button that calls `resendInvite`.
- Same pattern applies to the "Resend invite" action.

**Translation namespaces added**
- `auth.mfa.challenge.*` — login MFA challenge.
- `auth.twofa.card.*`, `auth.twofa.actions.*`, `auth.twofa.enroll.*`, `auth.twofa.disable.*`, `auth.twofa.regenerate.*`, `auth.twofa.codes.*`, `auth.twofa.pending.*`.
- `members.invite.emailSent`, `emailFailedFallback*`, `emailFailedNoFallback*`, `retrySend`, `retrying`, `emailErrorLabel`.
- `login.error.mfa_invalid_code`, `login.error.mfa_expired`.
- `common.retry`.

**Gotchas hit while building this**
- Existing `useAuth().login` returned `AuthUser` directly — now returns `LoginResult`. Only caller was `login/password/page.tsx`.
- shadcn does NOT include `InputOTP` here — use plain `<Input>` with `inputMode="numeric"`, `maxLength={6}`, monospace + `tracking-[0.4em]` text-center styling for the OTP look.
- The disable endpoint accepts a password-only call while 2FA is *pending* (since no TOTP exists yet) — leveraging this for the cancel-pending dialog avoids forcing the user to invent a TOTP.
- Backup-code login: the input format is `ABCDE-FGHIJ` (10 alphanumeric chars + 1 dash = 11 chars). Convert to uppercase as user types.
