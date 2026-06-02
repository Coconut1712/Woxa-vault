import type { NextConfig } from "next";

/**
 * Dev-only API proxy.
 *
 * In dev, the browser hits Next at http://localhost:3000 and the API at
 * http://localhost:8787 — that pair is cross-origin, which means the
 * `Set-Cookie: woxa_session=...` response from /auth/login is treated as a
 * third-party cookie. Modern browsers (Chrome Tracking Protection / Privacy
 * Sandbox, Firefox Total Cookie Protection, Safari ITP) silently drop those.
 *
 * Rewriting /api/* → http://localhost:8787/* makes everything same-origin
 * from the browser's perspective, so HttpOnly + SameSite=Lax + Secure=false
 * cookies stick like they would in production behind a reverse proxy.
 *
 * In prod the frontend talks to api.iux24.com directly (cross-site) and the
 * session cookie there will be SameSite=None; Secure — set via env, not here.
 */
const API_PROXY_TARGET =
  process.env.WOXA_VAULT_API_PROXY_TARGET ?? "http://localhost:8787";

/**
 * Baseline security headers (FR-114 / FR-115 / NFR-030, OWASP Secure Headers).
 *
 * These are static, request-independent, and safe to apply to every route
 * including static assets — so they live here in `headers()` rather than in
 * `proxy.ts`. The Content-Security-Policy is *not* here: it needs a fresh
 * per-request nonce, so it is emitted from `src/proxy.ts` instead.
 *
 *  - Strict-Transport-Security: 2-year HSTS with subdomains + preload (FR-115).
 *    Only meaningful over HTTPS; browsers ignore it on plain http://localhost.
 *  - X-Content-Type-Options: stop MIME sniffing.
 *  - X-Frame-Options: DENY framing — defence-in-depth clickjacking guard for a
 *    password manager (also covered by CSP `frame-ancestors 'none'`).
 *  - Referrer-Policy: never leak full URLs (which can carry tokens) cross-site.
 *  - Permissions-Policy: deny powerful features the app does not use. We keep
 *    clipboard-write enabled (copy secret/passphrase) and leave
 *    publickey-credentials-get unrestricted for future WebAuthn — i.e. we do
 *    NOT add them to the deny list.
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
