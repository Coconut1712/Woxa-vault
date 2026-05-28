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

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/:path*`,
      },
    ];
  },
};

export default nextConfig;
