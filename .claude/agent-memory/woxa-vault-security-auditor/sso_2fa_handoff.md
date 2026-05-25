---
name: sso_2fa_handoff
description: SSO Google login app-level 2FA enforcement + mfa_pending cookie handoff — audit notes
metadata:
  type: reference
---

App-level 2FA enforcement on Google SSO (closes the SSO 2FA-bypass). Audited 2026-05-21, verdict: ship-able, no 🔴/🟠 blockers.

**Flow:**
- `routes/sso.ts` callback `/auth/sso/google/callback`: after JIT/resolve user, gate at sso.ts:349 `if (result.user.totpEnabledAt)` → `signMfaToken(userId)`, audit `auth.login.mfa_required`, clear OAuth state cookie + set `mfa_pending` HttpOnly cookie (`buildMfaPendingCookie`, mfa.ts:377), 302 to `/login/mfa?next=<sanitized>`. NO `createSession` on this branch — token-free URL. Non-2FA users fall through to the normal session path at sso.ts:377.
- `lib/mfa.ts`: `MFA_PENDING_COOKIE="mfa_pending"`, Max-Age=300 (== mfaToken exp), `buildMfaPendingCookie(token, secure)` / `buildClearMfaPendingCookie(secure)`. Attrs: Path=/, HttpOnly, SameSite=Lax, Secure(prod). mfaToken = HMAC-SHA256, user-bound, 5-min exp (same token type as password flow body-token).
- `routes/twoFactor.ts` verify-login (~558-792): dual-source `const mfaToken = bodyToken ?? cookieToken` (body wins, twoFactor.ts:571). BOTH go through `verifyMfaToken` (HMAC+exp+user binding) — cookie is NOT trusted blindly. `tokenFromCookie` flag → clear cookie on success (734) AND on bad-token (597). Session minted for `decoded.userId`; code checked vs THAT user's secret (no cross-user confusion-deputy).
- Frontend `app/login/mfa/page.tsx`: POSTs `{ code, useBackupCode? }` only (no mfaToken in body — `lib/api/auth.ts` verifyMfaLogin omits the key when undefined). Cookie re-attached by browser via `credentials:"include"`. `safeNext` allowlist regex mirrors backend `sanitizeNext`.

**Why it's safe (verified):**
- No 2FA-bypass door: all 5 `createSession` callers checked. auth.ts:155 + sso.ts:377 both gated by `totpEnabledAt` return-before-create. twoFactor.ts:719 is post-OTP. me.ts:393 (password setup) is behind requireAuth (already-authed). invitations.ts:507 is brand-new user (totpEnabledAt always null).
- CSRF: `originCheck` middleware (`*` global, app.ts:66) covers POST verify-login — Origin/Referer must match CORS allow-list. + SameSite=Lax cookie. Two controls.
- Redact: `req.headers.cookie` + `res.headers["set-cookie"]` + `*.mfaToken` all in logger.ts REDACT_PATHS → cookie + Set-Cookie token never hit logs. Token never in URL/Referer (cookie transport).
- Open-redirect: `NEXT_RE = /^\/(?!\/)[A-Za-z0-9_\-./~?&=#%@:+,]*$/` blocks `//`, `/\`, `https://`, `javascript:`, real CRLF. Percent-encoded `%0d%0a`/`%2f%2f` pass the regex but stay same-origin path text (no header injection — Hono passes Location as-is, Node setHeader rejects real ctrl chars; encoded text is inert). SSO 2FA redirect re-encodes via `encodeURIComponent(decoded.next)` anyway.

**Accepted residuals (NOT new — same as password flow, documented):**
- mfaToken nonce is decorative; token reusable within 5-min TTL if captured. SSO cookie is HttpOnly (XSS can't read) + cleared on success + TOTP `last_totp_step` CAS / backup-code `used_at` block code replay. A captured live token + fresh OTP could mint a 2nd session — requires TLS break or the legit OTP secret. Same risk class as password body-token.
- `SESSION_COOKIE_SECURE` defaults false (dev); must be true in prod (operational, same as session cookie).

**Info-only nits found:** verify-login bad-token path (twoFactor.ts:590-617) returns before per-USER bucket and writes audit with actorUserId=null (only IP-only bucket caps it) — pre-existing, noted in [[mfa_patterns]]. mfa page doesn't explicitly setCode("") on success but unmount + OTP single-use makes it moot.

Related: [[mfa_patterns]] [[auth_session_patterns]] [[audit_and_logging]] [[validation_and_ratelimit]] [[recurring_antipatterns]]
