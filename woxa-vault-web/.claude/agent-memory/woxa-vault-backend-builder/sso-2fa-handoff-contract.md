---
name: sso-2fa-handoff-contract
description: SSO 2FA handoff uses an HttpOnly `mfa_pending` cookie (never URL) + /login/mfa redirect; verify-login reads mfaToken body-first then cookie
metadata:
  type: project
---

App-level 2FA (AC-003.5) is enforced on the Google SSO path, not just password login. The handoff contract the frontend `/login/mfa` page depends on:

- SSO callback, when `user.totpEnabledAt` is set: issues NO session. Sets cookie **`mfa_pending`** (HttpOnly, SameSite=Lax, Path=/, Max-Age=300, Secure in prod) carrying the same HMAC `mfaToken` the password flow returns in JSON, then 302 → `<web>/login/mfa` (`?next=` only when next≠/app). Token is NEVER in the URL (history/Referer/access-log leak).
- `POST /auth/2fa/verify-login` resolves the token **body-first, then `mfa_pending` cookie**. SSO challenge sends only `code` (page can't read the HttpOnly cookie). On success: sets session cookie + clears `mfa_pending`. On bad token via cookie: also clears the cookie.

**Why:** user confirmed SSO must clear the SAME second factor as password login; Google proving factor 1 must not exempt TOTP. Cookie (not URL) chosen to avoid token leak.

**How to apply:** Don't rename `mfa_pending` or move the token into the URL/query — frontend builds against this. The cookie helpers (`buildMfaPendingCookie`, `buildClearMfaPendingCookie`, `MFA_PENDING_COOKIE`) live in `src/lib/mfa.ts` alongside `signMfaToken`. JIT/no-TOTP users keep the old direct-session path. Tests: `src/lib/mfaPendingCookie.test.ts` (cookie attrs) + `src/routes/sso2fa.test.ts` (verify-login cookie path, integration vs real PG). See [[test-seed]] for DB access patterns.