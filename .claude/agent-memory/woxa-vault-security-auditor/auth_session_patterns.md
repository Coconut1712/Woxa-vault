---
name: auth_session_patterns
description: Lucia sessions, requireAuth middleware, AuthProvider fail-closed bootstrap
metadata:
  type: reference
---

**Sessions:** Lucia v3, stored in `sessions` table. Cookie is `httpOnly`, `Secure`, `SameSite=Lax`, signed.
- Session ID = sha256(token) — see `routes/me.ts:hashToken` for the helper duplicated in revoke-all path.
- `requireAuth` middleware: `woxa-vault-api/src/middleware/auth.ts` — every protected route mounts this via `.use("*", requireAuth)` at router level.
- `sessionMiddleware` is the no-enforce variant used for routes that may serve anon-or-auth (e.g. public preview endpoints).
- Privilege-change rotation: setup-password, recovery reset, and revoke-all rotate the session set (delete-and-mint). Verify-password does NOT rotate (intentionally — it's a verify-only UX gate).

**Frontend AuthProvider (`woxa-vault-web/src/lib/auth/provider.tsx`):**
- Bootstraps via `/auth/me` then `/me`. Fail-closed: if `/me` throws, treat as unauthenticated. Never set `status="authenticated"` while `me === null`.
- `SessionGuard` (`src/lib/auth/session-guard.tsx`) bounces to `/setup-password` when `me.requiresPasswordSetup`. Children only render when `status === authenticated && me !== null && !me.requiresPasswordSetup`.
- AuthProvider stamps `persistUnlockTimestamp()` on every successful auth event (login, refresh-found-session, setup-password-success, invite-signup-success) so the vault lock overlay doesn't flash for an authenticated user.
- AuthProvider calls `clearUnlockTimestamp()` on logout to prevent a refreshed tab from skipping the next session's lock gate.

**SSO callback:** `woxa-vault-api/src/routes/sso.ts` — Google OAuth with PKCE + signed state cookie. JIT-provisioned users get redirected to `/setup-password` via backend redirect, then the frontend stamps unlock via AuthProvider refresh.

Related: [[vault_lock_architecture]] [[validation_and_ratelimit]]
