---
name: project-invitation-accept-flow
description: Where the invitation accept page lives, how login `next` hop works, and the error code → stage map
metadata:
  type: project
---

Frontend invitation acceptance landed 2026-05-19 (covers the recipient side of `acceptUrl` from `POST /members/invite`). Updated 2026-05-19 to add the new-account signup branch. **Re-aligned 2026-05-21 to the two-password model: the invite signup form now sets the LOGIN password, NOT the Master Password.**

**Two-password model on the invite signup branch (load-bearing):** When `userExists === false`, the `SignupCard` collects a LOGIN/account password (label "Password", `autoComplete=new-password`, min 10). It is NOT the Master Password. A blue `KeyRound` notice card (`invite.signup.two_password_notice_title/desc`) states this explicitly. The Master Password + recovery kit are set LATER at `/setup-password`. The old "Master Password" copy and the "We never send this to the server" hint were removed (that claim is false for a login password). See [[self-service-signup]].

**Post-signup routing:** `signupAndAccept` response carries NO recoveryCode anymore (`InvitationSignupAcceptResult = { user, membership }`). Do NOT call `persistUnlockTimestamp()` (vault stays locked — master not set) and do NOT render `RecoveryKitModal` on this page. On success: `await refreshAuth()` → toast `invite.signup.success_toast` → `router.replace("/app")` → SessionGuard walks to `/setup-password` (master pw + recovery kit). The signup `SuccessCard` just shows a spinner + `invite.signup.success_redirecting` (no Go-to-app button). See [[forced-setup-page-pattern]].

- `src/lib/api/invitations.ts` — `previewInvitation(token)` (public GET) + `acceptInvitation(token)` (POST, auth-required) + `signupAndAccept(token, { password, displayName? })` (public POST that creates the user with the LOGIN password AND accepts in one atomic call; backend sets the session cookie). Types: `InvitationPreview` carries `userExists: boolean` (`false` → render signup card instead of preview), `InvitationAcceptResult`, and `InvitationSignupAcceptResult` (`{ user, membership }` — recoveryCode REMOVED 2026-05-21).
- `src/app/invite/[token]/page.tsx` — standalone full-screen card (mirrors `/s/[token]` layout). Reads params via `use(params)` because Next 16.2.6 `params` is a Promise.
- Login `next` hop: `src/app/login/password/page.tsx` honors `?next=` after a successful login (defaults to `/app`). The welcome page at `src/app/page.tsx` forwards `?next=` through to both password and Google SSO entry. SSO uses `sanitizeNext` from `src/lib/api/sso.ts`; password page has a tiny inline `safeNext` helper with the same rules (`/`-prefixed, no `//`, ≤256 chars).

**Stage → error code map** (page state machine):
- 404 → `error_not_found`
- 410 `invitation_expired` → `error_expired`
- 410 `invitation_revoked` → `error_revoked`
- 409 `invitation_already_accepted` → `error_already_accepted`
- 403 `invitation_email_mismatch` (POST accept only) → `error_email_mismatch` (offers `Sign out and try again`)
- 409 `already_member` (POST accept only) → toast + `router.push("/app")` (NOT a card; success-shaped UX)
- 401 (POST accept only) → bounce to `/login/password?email=<invited>&next=/invite/<token>`
- 409 `user_exists` (POST signup-and-accept) → toast + bounce to `/login/password?email=<invited>&next=/invite/<token>` (existing account, sign in path)
- 429 `rate_limited` (POST signup-and-accept) → toast, keep on signup card
- 400 `validation_error` (POST signup-and-accept) → inline error under password field

**Email mismatch UX**: if signed in but `user.email !== preview.email`, show an inline amber warning on the preview card BEFORE the user clicks Accept. Backend still has final say (lowercased compare server-side), so this is proactive only — we don't disable the Accept button.

**Why**: backend issues `acceptUrl` like `/invite/<token>` in the invite response (Phase A; no email transport yet). Without this route the link 404s and admins can't onboard anyone.

**How to apply**:
- Future tweaks to invitation copy land in `invite.*` keys in `src/lib/i18n/translations.ts`.
- Role badge styling reuses the same `ROLE_TONE` shape as `src/app/app/members/page.tsx` (Crown/ShieldCheck/Users/UserCog + light/dark color pairs).
- `previewInvitation` is safe to call pre-login (no auth needed). Don't add `?` to URL — token is a path segment.
- Phase B will start delivering invite emails via Resend; the same `/invite/<token>` URL stays valid.