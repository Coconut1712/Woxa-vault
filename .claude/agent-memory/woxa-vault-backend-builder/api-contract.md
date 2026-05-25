---
name: api-contract
description: Error codes, cookie, and CORS conventions agreed with woxa-vault-web in /API_CONTRACT.md
metadata:
  type: project
---

The frontend (`woxa-vault-web`) keys off these exact `error.code` strings — changing them silently will break the UI.

- `invalid_credentials` (401) — wrong email/password on /auth/login
- `unauthorized` (401) — missing/expired session on protected routes
- `validation_error` (400) — Zod validation failed; envelope MUST include `details.fieldErrors` map
- `rate_limited` (429) — set `Retry-After` header + `details.retryAfterSec`
- `internal_error` (500) — generic
- `service_unavailable` (503) — downstream connection refused/timed out (DB/KMS/Redis). Central `onError` in `src/app.ts` auto-converts Node errors with `code` in `{ECONNREFUSED, ECONNRESET, ETIMEDOUT, ENOTFOUND, EAI_AGAIN, EHOSTUNREACH, ENETUNREACH}` (and unwraps `err.cause` + `err.errors[]` for postgres-js). Helper: `errors.serviceUnavailable()` + `isDownstreamConnectionError()` in `src/lib/errors.ts`.

**Why:** Frontend already shipped `ApiError` switch on these codes. Drift = blank error toast for the user.

**How to apply:**
- Whenever adding new endpoints, route Zod failures through `jsonValidator` in `src/routes/auth.ts` (or extract to a shared util) so the envelope stays standard. Default `zValidator("json", schema)` leaks raw ZodError JSON.
- Logout returns `200 { ok: true }`, NOT 204 — frontend accepts 2xx but contract pinned to 200.
- Session cookie name is `woxa_session`; HttpOnly + SameSite=Lax; `Secure` toggled via `SESSION_COOKIE_SECURE` env.
- CORS allow-list is comma-separated `CORS_ORIGINS`; defaults to `http://localhost:3000`. `credentials: true` is non-negotiable.

Source of truth: `/Users/woxa/Projects/Woxa-vault/API_CONTRACT.md` (jointly owned with the frontend agent).
