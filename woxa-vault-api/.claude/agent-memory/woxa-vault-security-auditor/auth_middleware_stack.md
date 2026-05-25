---
name: auth-middleware-stack
description: Auth/guard middleware in woxa-vault-api and which surfaces each one gates
metadata:
  type: reference
---

`src/middleware/auth.ts`:
- `sessionMiddleware` (global in app.ts) populates c.var.user/session/sessionToken
  from the session cookie; does NOT enforce auth.
- `requireAuth` -> 401 if no user.
- `requireTwoFactorEnrolled` -> 403 two_factor_required if org policy requires
  2FA and user has no verified TOTP. Mounted on secret-bearing routers
  (items, itemActivity) but NOT on /audit.
- `requireVaultUnlocked` -> 401 vault_locked unless session.vaultUnlockedAt
  within VAULT_UNLOCK_IDLE_MS (15 min). Applied ONLY to plaintext endpoints
  (item reveal, attachment download, send create). NOT applied to metadata
  endpoints (itemActivity is metadata-only -> intentionally not gated).
- `blockGuestWrites` -> 403 for guest org role on POST/PATCH/PUT/DELETE.
- `activeOrgForContext(c)` -> resolveActiveOrg using session.activeOrgId.

Global middleware order in app.ts: honoLogger -> secureHeaders -> cors ->
originCheck (CSRF Origin check) -> sessionMiddleware -> routers.

Route mount order matters: child paths (/items/:id/activity, /:id/members,
/:id/attachments) MUST mount BEFORE generic itemRoutes (/:id) or the generic
/:id reveal handler intercepts them. itemActivity is mounted correctly before
itemRoutes.

Rate limiting: `src/lib/rateLimit.ts` exists and is applied to auth/sends/
invitations/2fa. NOT applied to /audit or /items/:id/activity (read surfaces).
