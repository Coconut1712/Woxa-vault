---
name: project-account-settings-wired
description: Where the live Account settings page lives, what /me endpoints it consumes, and how the Master Password / Recovery Kit flows are split
metadata:
  type: project
---

Account settings page got wired to the real `/me` endpoints on 2026-05-19. On 2026-05-19 (later same day) the "Change Master Password" card was removed — `POST /me/password` no longer exists; the recovery kit is now the only forgotten-password path.

- `src/lib/api/me.ts` — `getMe()`, `updateProfile({ displayName })`, `setupPassword({ password })`, `regenerateRecoveryKit({ password })`, `resetPasswordWithRecovery({ email, recoveryCode, newPassword })`, `revokeOtherSessions()`. Exports `MeUser` with `requiresPasswordSetup: boolean`, `hasRecoveryKit: boolean`, `recoveryKitCreatedAt: string | null` in addition to the original fields. `changePassword` was deleted along with the corresponding UI.
- `src/app/app/account/page.tsx` — outer page fetches `getMe()` once on mount; profile/security sections receive `me` as a prop. Notifications + Integrations tabs are still mock-driven (no contract yet) — intentional.

**Wired sections**:
- Profile — displayName editable (PATCH /me), email/role/createdAt/lastLoginAt read-only. 400 `validation_error` shows inline empty-name error.
- Recovery Kit (under Security tab) — POST /me/recovery-kit/regenerate. Confirmation dialog asks for current password; 401 → inline "Incorrect master password"; 429 → toast + inline "Too many attempts"; on 200 the response's `recoveryCode` is handed to the shared `<RecoveryKitModal>`. Status row shows "Recovery kit generated on {when}" with `formatDateTime` when `hasRecoveryKit` is true, otherwise a red "No recovery kit set" badge.
- Active sessions (under Security tab) — POST /me/sessions/revoke-all behind a confirmation Dialog. Backend now requires `{ password }` in the body (defense-in-depth) — the Dialog renders a current-password Field with show/hide eye, 401 → inline `account.sessions.error.invalid_password`, 429 → toast + inline `account.sessions.error.rate_limited`. `revokeOtherSessions({ password })` in `src/lib/api/me.ts`.

**Recovery Kit modal (`src/components/auth/recovery-kit-modal.tsx`)** is the shared blocking surface across two call sites:
- /setup-password (after `setupPassword()`)
- Account → Recovery Kit → Regenerate (after `regenerateRecoveryKit()`)
- NOTE (2026-05-21): /invite/[token] signup NO LONGER shows this modal — that branch now only sets the LOGIN password and routes to /setup-password where the recovery kit is generated. `signupAndAccept` returns no recoveryCode. See [[project-invitation-accept-flow]].

The modal is HARD-blocking by design: ESC is swallowed at window level, the backdrop is a plain `div` (not Dialog), and the Continue button is disabled until both confirmation checkboxes are ticked. Has Copy / Download .txt / Print actions; print opens a hidden iframe so it doesn't fight the host stylesheet.

**Security hardening (2026-05-19 post-audit)**:
- Copy → OS clipboard auto-clears after 30s (matches AC-014.2 for passwords). Button label shows live countdown (`Copied — clearing in {seconds}s`) then `Clipboard cleared` for 4s, then resets to `Copy`. Implemented via interval + timeout pair in `copyTimersRef`; cleared on unmount.
- Download → opt-in confirmation dialog warns plaintext .txt may be cloud-synced (iCloud Drive / Google Drive desktop / OneDrive). Anchor has `rel="noreferrer noopener"`.
- Print iframe → cleanup via `afterprint` event with a 30s fallback timeout (older Safari / some Linux distros never fire `afterprint`). Tracked via `printCleanupRef`; teardown on unmount.
- Print HTML → contains tight `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; ...">` and `<meta name="referrer" content="no-referrer">`.
- Code `<code>` element → `onDragStart={(e) => e.preventDefault()}` + `draggable={false}` so the `select-all`-then-drag chain can't drop the code into another field.

**Password policy helpers** were extracted from inline duplicates in account/page.tsx and invite/[token]/page.tsx into `src/components/auth/password-policy.tsx`:
- `evaluatePassword(str)` → `PasswordChecks` (`minLength: 10` is required; uppercase/lowercase/digit/special are recommendations only)
- `<StrengthMeter checks={…} />` — 5-bar meter (rose→amber→blue→emerald) + the inline `<PolicyItem>` checklist
- Submit blocking rule remains: `minLength && match`

**Setup / forgot-password / banners** (added 2026-05-19):
- `src/app/setup-password/page.tsx` — outside `/app` layout, requires auth but `me.requiresPasswordSetup` must be true (otherwise bounces to `/app`). On success shows the recovery kit modal, then `refresh()` + redirect.
- `src/app/forgot-password/page.tsx` — public (no auth) reset surface. Posts to `/auth/password/reset-with-recovery`. 401 → inline "Recovery code is invalid" (NEVER hint that the email is wrong — backend is constant-time). On 200, redirect to `/login/password?notice=regenerate-recovery`. **Email pre-fill is forwarded via `sessionStorage` (key `woxa-forgot-email`), NOT a URL query param** — putting email in `?email=` leaks PII through Referer / browser history / Sentry URL capture / third-party scripts. Same key is consumed by `/login/password` (reads-then-removes in a one-shot useEffect).
- `src/lib/auth/session-guard.tsx` — extended to redirect `me.requiresPasswordSetup` users to `/setup-password` from any protected route.
- `src/components/auth/recovery-kit-banner.tsx` — persistent amber banner mounted in `/app/layout.tsx`, visible when `me.hasRecoveryKit === false`. Links to Account Settings.
- `/login/password` — link below the password input now points at `/forgot-password?email=...` (was `href="#"`); a `?notice=regenerate-recovery` shows an amber notice above the form prompting the user to regenerate their kit after a successful reset.

**AuthProvider** (`src/lib/auth/provider.tsx`) now exposes both `user: AuthUser` (from `/auth/me`) AND `me: MeUser | null` (from `/me`). `refresh()` re-pulls both; `login()` pulls `/me` after `/auth/login` so guards can read setup flags immediately. Read `useAuth().me` (not `user`) for `requiresPasswordSetup` / `hasRecoveryKit` / `recoveryKitCreatedAt`.

**Translation key namespaces** (current):
- `account.profile.*` / `account.sessions.*` / `account.error.*`
- `account.recovery_kit.*` — section_title, subtitle, status_active/missing, regenerate(+ing), regenerate_confirm_title/desc, regenerate_password_label, error.invalid_password / rate_limited / regenerate_failed
- `account.password.error.*` — survives as shared error strings (`too_short`, `no_match`, `rate_limited`, `generic`). The full master-password change UI keys (`section_title`, `subtitle`, `current_label`, `new_label`, `confirm_label`, `submit`, `submitting`, `changed`, `error.invalid_current`, `error.same_as_current`) were removed with the card.
- `recovery_kit_modal.*` — title.{setup,regenerate,signup}, subtitle, warning_one_time, code_label, checkbox.{saved,understood}, action.{copy,copied,download,print,continue}, copy_failed, download.{heading,instructions}, print.{heading,generated_label}
- `setup_password.*` — title, subtitle, password_label, confirm_label, submit, submitting, success_toast, error.{already_set,generic}
- `forgot_password.*` — title, subtitle, email_label, code_label, code_placeholder, new_password_label, confirm_label, submit, submitting, success, back_to_login, error.{invalid,rate_limited,generic}
- `login.forgot_password_link`, `login.after_recovery_notice`
- `auth.banner.regenerate_recovery`, `auth.banner.regenerate_recovery_action`
- `invite.signup.success_with_recovery`
- `invite.signup.*` (existing) — policy/strength labels, shared with setup/forgot password

**Why**: backend retired `POST /me/password` and introduced the recovery-kit ceremony (setup → display once → reset-with-recovery) as the only forgotten-password path. Frontend had to add three new surfaces (setup, forgot, regen modal) plus a global guard that blocks every protected route while a fresh SSO user lacks a local password.

**How to apply**:
- Need to show a recovery code from any new flow? Drop `<RecoveryKitModal recoveryCode={…} context="setup"|"regenerate"|"signup" onConfirm={…} />` at the page root. It's a portal-less fixed overlay — render it as a sibling of your main content.
- New /me fields → extend `MeUser` in `src/lib/api/me.ts`. Both `AuthProvider` and the account page rely on `getMe()`.
- New password-entry surface? Import `evaluatePassword`/`StrengthMeter` from `@/components/auth/password-policy`. Don't re-implement the meter inline.
- Guard scope: anything under `/app/*` is automatically wrapped by `SessionGuard`, which now ALSO bounces `requiresPasswordSetup` users out to `/setup-password`. Public routes (`/forgot-password`, `/setup-password`, `/invite/[token]`, `/login/password`) are intentionally outside.
- The recovery-kit banner lives in `/app/layout.tsx` between the sidebar and `{children}`. It auto-hides when `me.hasRecoveryKit` flips back to true.

**Known intentional gaps**:
- Sessions table (per-session listing) — only the revoke-all action exists; replace with row list when `GET /me/sessions` lands.
- 2FA + passkeys toggles in `SecuritySection` remain placeholder toggles (mock state) — keep them there until matching endpoints exist.
