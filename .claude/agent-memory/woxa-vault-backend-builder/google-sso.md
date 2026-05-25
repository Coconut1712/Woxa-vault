---
name: google-sso
description: Google Workspace SSO flow — env vars, state cookie format, JIT provisioning
metadata:
  type: project
---

Routes live in `src/routes/sso.ts`, mounted at `/auth/sso` from `src/app.ts`.

**Env vars (in `src/config/env.ts`):**
- `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` — blank disables SSO; endpoint returns `internal_error` 500.
- `GOOGLE_OAUTH_ALLOWED_DOMAIN` — comma-separated workspace domains. Empty list = accept any verified Google account (logs `warn` on each login). Cross-checked against BOTH the `hd` claim AND email domain at callback; passing only `hd` to Google is not enough.
- `WEB_BASE_URL` — origin the backend redirects to post-callback. Default `http://localhost:3000`. Must be `https://vault.iux24.com` in prod.

**State cookie format:** `woxa_oauth_state=<state>:<base64url(next)>`, HttpOnly, SameSite=Lax, Max-Age=600. Single cookie avoids a server-side OAuth state store. Cleared on both success and failure of the callback.

**`next` sanitization:** must start with `/`, must NOT start with `//`, length ≤ 256, only `[A-Za-z0-9_\-./~?&=#%@:+,]`. Anything else collapses to `/app`. The regex literal `NEXT_RE` is the single source of truth.

**JIT provisioning rules:**
1. Lookup by `users.sso_subject` first (stable across email rename inside Google), then by `email`.
2. New user → find org by `slug = <emailDomain.split('.')[0]>`. If none, **create a new org** with that slug + `name = <full domain>`. Then insert `org_members` with role `member`.
3. Audit `auth.sso.jit_provisioned` on first-time, `auth.sso.login.success` otherwise. `auth.sso.login.failed` with `reason: domain_forbidden` for hd/domain mismatch.

**Post-callback redirect (master-password gate):** after session issuance, callback inspects `result.user.passwordHash`. If null (JIT user or legacy SSO user without master password) → redirect to `/setup-password` (with `?next=<orig>` when the original next wasn't the default `/app`). Otherwise → redirect to sanitized `decoded.next`. This closes the race window where a fresh JIT user could land on `/app` before the frontend SessionGuard mounts and forces setup.

**Rate limit:** start endpoint = 10 starts/min/IP. Returns a JSON `rate_limited` envelope (NOT a redirect), so automated abuse sees the error directly.

**Why this design:** REQUIREMENTS §4.1 US-001 requires Google Workspace SSO with domain restriction. DESIGN.md §6 has the threat model for state CSRF and the open-redirect risk on `next`.

**How to apply:**
- Adding another OIDC provider? Mirror `sso.ts` — keep the state-cookie format consistent so middleware can be shared later.
- Loosening domain restriction in prod? Don't. Workspace admins expect the hard cutoff.
- Touching `sanitizeNext`? The regex is also documented in `API_CONTRACT.md` — keep them in sync.
- Testing locally without Google? Set `GOOGLE_OAUTH_CLIENT_ID=fake` etc. — start endpoint will 302 to Google but the token exchange will fail with `sso_provider_error`. Sufficient for state-cookie and redirect tests.

Related: [[vault-items-schema]], [[api-contract]].
