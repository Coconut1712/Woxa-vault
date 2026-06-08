---
name: security-headers-csp
description: Where security headers + nonce-based CSP live in woxa-vault-web, why CSP ships Report-Only, and how to promote to enforce
metadata:
  type: project
---

Security headers + CSP for woxa-vault-web (FR-114/115/116, NFR-030, residual #3).

**Layout of the implementation:**
- `next.config.ts` `headers()` → static, request-independent headers on every route: HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Deliberately does NOT restrict clipboard-write (copy secret) or publickey-credentials-get (future WebAuthn).
- `src/proxy.ts` (Next 16 renamed `middleware`→`proxy`) → per-request nonce + CSP. Nonce set on `x-nonce` request+response header.
- `src/app/layout.tsx` → reads `x-nonce` via `headers()` and passes `nonce={nonce}` to `<ThemeProvider>` so next-themes' inline no-flash theme script carries the nonce (this is the one inline script that would break a strict enforce policy if not nonce'd).

**CSP ships as `Content-Security-Policy-Report-Only` by default.** Flip to enforcing `Content-Security-Policy` by setting env `CSP_ENFORCE=1|true|yes`. No code change to promote.
- **Why Report-Only default:** zero white-screen risk if any inline script is ever missed. Verified the enforce policy is already clean (see below), but report-only is the safe shipping default until prod telemetry confirms.

**CSP directives:** `script-src 'self' 'nonce-…' 'strict-dynamic'` (+`'unsafe-eval'` in dev only for React error overlay); `style-src 'self' 'unsafe-inline'` (inline style is not an XSS vector; Tailwind/base-ui inject inline `<style>`); `img-src 'self' blob: data:` (data: = TOTP QR `data:image/png`, blob: = attachment object URLs); `font-src 'self'` (next/font/google self-hosts Inter+JetBrains_Mono at build → no external font origin); `connect-src` + `form-action` = `'self'` plus the **origin of `NEXT_PUBLIC_API_BASE_URL`** (SSO start is a top-level redirect → form-action); `frame-ancestors 'none'` + `frame-src 'none'`.

**CRITICAL invariant:** CSP `connect-src` origin is derived from the SAME env var the API client uses (`NEXT_PUBLIC_API_BASE_URL`, see src/lib/api/client.ts) so they can never drift. Dev leaves it unset → client uses the `/api` same-origin rewrite → `'self'` covers it. Prod sets `https://api.iux24.com` → appears in connect-src/form-action.

**Env (documented in `.env.example`):** `NEXT_PUBLIC_API_BASE_URL`, `WOXA_VAULT_API_PROXY_TARGET`, `CSP_ENFORCE`.

**Verification done (2026-06-02):** built, ran prod server, headless Chrome `--dump-dom` (old `--headless` mode; `--headless=new` returned 0 bytes — use old mode) under ENFORCE on /login/password, /app, /welcome. All hydrated fully (real inputs/buttons/data-slot, no white screen). All 20 script tags carried the matching nonce incl. the next-themes inline script. Zero CSP violations once `NEXT_PUBLIC_API_BASE_URL` origin matched the client (a connect-src violation appears ONLY if the baked API origin and CSP origin mismatch — that's a config error, not a policy bug).
