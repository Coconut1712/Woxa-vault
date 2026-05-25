---
name: dev-cookie-proxy
description: Dev frontend talks to API via Next rewrite /api/* to avoid browser dropping cross-origin session cookies
metadata:
  type: project
---

In dev, `woxa-vault-web` (port 3000) does NOT call `http://localhost:8787` directly. It calls `/api/*` and `next.config.ts` rewrites that to the API at `http://localhost:8787`. The browser then sees the API as same-origin and the HttpOnly `woxa_session` cookie (SameSite=Lax, Secure=false) sticks.

**Why:** Modern browsers (Chrome Tracking Protection / Privacy Sandbox, Firefox Total Cookie Protection, Safari ITP) silently drop Set-Cookie responses from cross-origin XHR/fetch in dev, even when SameSite=Lax + same-site by port. That caused the "login succeeds then immediately redirects back to /login" bug — backend was fine; the cookie was never stored.

**How to apply:**
- Dev frontend env: `NEXT_PUBLIC_API_BASE_URL=/api` (NOT `http://localhost:8787`).
- Next config: `rewrites()` returns `{ source: "/api/:path*", destination: "${WOXA_VAULT_API_PROXY_TARGET ?? http://localhost:8787}/:path*" }`.
- Restart `npm run dev` whenever `next.config.ts` changes — Next does not hot-reload config.
- Backend still issues `SameSite=Lax`, Secure toggled by `SESSION_COOKIE_SECURE`. Do not change to SameSite=None in dev — not needed once same-origin.
- CORS allow-list at the API still has `http://localhost:3000` for direct curl/Postman use, but the browser flow no longer relies on it.
- **Prod:** Frontend at vault.iux24.com talks to api.iux24.com directly (cross-site). At that point the backend must issue `SameSite=None; Secure` cookies. Track this via `SESSION_COOKIE_SECURE=true` + a future `SESSION_COOKIE_SAMESITE` env when the cross-site setup ships. See [[api-contract]].

Files touched in the fix:
- `woxa-vault-web/next.config.ts` — rewrite block
- `woxa-vault-web/.env.local`, `.env.example` — `NEXT_PUBLIC_API_BASE_URL=/api`
