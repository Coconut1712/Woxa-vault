---
name: project-sso-mfa-flow
description: Backend enforces app-level 2FA on Google SSO; /login/mfa is the standalone challenge page that redeems the mfa_pending cookie
metadata:
  type: project
---

Backend now enforces app-level 2FA on the Google SSO callback. A 2FA-enabled user signing in via Google does NOT get a session from the callback; instead the backend sets a short-lived HttpOnly `mfa_pending` cookie (Max-Age=300, carries the HMAC mfaToken) and 302-redirects to `/login/mfa?next=<path>` (next omitted when it equals /app).

**Why:** App-level 2FA must be satisfied even on SSO sign-in, not just password login. The token is HttpOnly-cookie-bound so page JS cannot read or exfiltrate it.

**How to apply:**
- `/login/mfa` (src/app/login/mfa/page.tsx) POSTs `/auth/2fa/verify-login` with body `{ code }` (or `{ code, useBackupCode: true }`) ONLY — NO mfaToken. The browser re-attaches the cookie. Contrast with the password flow (src/app/login/password/page.tsx) which sends `{ mfaToken, code }`.
- The shared API helper `verifyMfaLogin` (src/lib/api/auth.ts) and `completeMfaLogin` (src/lib/auth/provider.tsx) both take an OPTIONAL `mfaToken` for exactly this reason. Backend resolution order: body mfaToken first, then mfa_pending cookie.
- Success 200 `{ status:"ok", user, mfaSatisfied:true }` sets the session + clears mfa_pending; page calls completeMfaLogin (flips auth state, hydrates /me) then router.replace(safeNext) and lets the SessionGuard ladder route on.
- MFA error mapping (split by backend error code, fixed 2026-05-21): `401 mfa_session_expired` → TERMINAL "verification timed out / restart SSO" state (ExpiredState, links to `/`); a plain `401 invalid_credentials` (wrong 2FA code) → INLINE retry: setErrorKey("login.mfa.error.invalid_code"), clear the code input, stay on the active challenge (NOT terminal); `429 rate_limited` → inline "too many attempts". The local 5-min countdown hitting zero is still terminal. Same split applies to the password flow (src/app/login/password/page.tsx): `mfa_token_invalid`/`mfa_session_expired`/400 → onTokenExpired() bounce to password step; `invalid_code`/401 → inline retry keeping the field. Previously ALL 401s were terminal here (showed "timed out" on a wrong code) — that was the bug.
- Contract details live in /Users/woxa/Projects/Woxa-vault/API_CONTRACT.md around lines 146-179 ("/login/mfa", "POST /auth/2fa/verify-login").
- `next` open-redirect guard: allowlist regex `/^\/(?!\/)[A-Za-z0-9_\-./~?&=#%@:+,]*$/` (mirrors safeNext in welcome page), default /app. Same regex also in src/app/welcome/page.tsx.
