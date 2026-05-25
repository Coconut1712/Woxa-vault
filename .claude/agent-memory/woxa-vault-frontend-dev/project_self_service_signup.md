---
name: self-service-signup
description: The /signup email+login-password page, register() API + provider method, and how it hands off to the setup-password ladder
metadata:
  type: project
---

Self-service signup (`/signup`) added 2026-05-21. Pre-auth standalone page (NOT under /app, NOT a forced-setup wall — it has no auth check, it just submits).

**Two-password model (the load-bearing UX point):** This system splits two distinct passwords and the signup copy MUST keep them separate:
- LOGIN password = account/sign-in credential, set at `/signup`.
- MASTER password = unlocks the vault, set LATER at `/setup-password` together with the recovery kit.
The page renders a blue info card (`signup.two_password_notice_title/desc`) saying "this is your login password — not your Master Password". Do not relabel the signup password as Master Password.

**Why route through /app, not straight to /setup-password:** After `register()` the backend sets the session cookie immediately and `GET /me` returns `requiresPasswordSetup=true` + no workspace. `router.replace("/app")` lets SessionGuard's ladder do the walk: /setup-password (master pw + recovery kit) → /spaces. Keeps the post-auth ladder in one place. See [[forced-setup-page-pattern]].

**API:** `register(input)` in `src/lib/api/auth.ts` → `POST /auth/register` body `{ email, password, displayName? }` (`password` = login pw, min 10), 200 `{ status:"ok", user }` + cookie, NO recoveryCode. Errors: 400 `validation_error` / 409 `email_taken` / 429 `rate_limited`. `displayName` is trimmed and omitted when blank.

**Provider:** `AuthProvider` now exposes `register()` alongside `login()`/`completeMfaLogin()`. It mirrors the login happy path exactly: `registerRequest` → `getMe()` → `persistUnlockTimestamp()` → set user/me/status authenticated (fail-closed if /me throws). Read via `useAuth().register`.

**Entry links:** root `/` (under the email form, `signup.from_welcome_link`) and `/login/password` (`signup.from_login_prompt` + `from_login_link`). Both carry `?next=` through with allowlist sanitize. The /login link only appends next when it's not the `/app` default.

**i18n namespace:** `signup.*` — title/subtitle/back_to_start, email/displayName/password/password_confirm labels+placeholders+hint, two_password_notice_title/desc, submit(+ting), have_account/sign_in_link, error.{email_taken, email_taken_action, validation, rate_limited, network, generic}, from_login_prompt/from_login_link, from_welcome_link. Reuses `account.password.error.no_match` for the confirm mismatch.

**Reused pieces:** `evaluatePassword`/`StrengthMeter` from `@/components/auth/password-policy` (min 10 required, rest recommended); `safeNext` allowlist regex `^\/(?!\/)[A-Za-z0-9_\-./~?&=#%@:+,]*$` (len<=256). Password fields type=password + `autoComplete="new-password"`, email `autoComplete="email"`.

Related: [[project-account-settings-wired]], [[forced-setup-page-pattern]]
