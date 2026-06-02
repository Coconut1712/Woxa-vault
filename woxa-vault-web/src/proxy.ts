import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Content-Security-Policy (FR-116, NFR-030 / OWASP).
 *
 * Strict, nonce-based policy. A fresh nonce is minted per request, threaded to
 * Next via the `x-nonce` request header (Next attaches it to every framework /
 * page inline script automatically) and to next-themes' inline theme script via
 * `app/layout.tsx` reading the same header. `'strict-dynamic'` lets those
 * trusted scripts load their own chunks without us enumerating hashes.
 *
 * SHIP MODE — REPORT-ONLY BY DEFAULT
 * ----------------------------------
 * We emit `Content-Security-Policy-Report-Only` unless `CSP_ENFORCE` is set to
 * a truthy value. Report-Only means the browser *reports* violations but never
 * blocks anything — so a missed inline script can never white-screen the app.
 * The policy is otherwise identical, so the report-only run is a faithful dry
 * run of enforcement.
 *
 * TO PROMOTE TO ENFORCE: verify there are no blocking violations in the console
 * across login, vault, item, settings + TOTP enrolment, then set `CSP_ENFORCE=1`
 * in the deployment environment. No code change required.
 *
 * Notes on directives:
 *  - script-src: only self + the per-request nonce (+ strict-dynamic). Dev adds
 *    'unsafe-eval' because React's dev runtime uses eval for error overlays;
 *    production never needs it.
 *  - style-src: 'unsafe-inline' is allowed for styles only. Tailwind/Next/base-ui
 *    inject inline <style>; nonce-ing every one is impractical and inline *style*
 *    (unlike inline script) is not an XSS execution vector. This is the accepted
 *    trade-off in the Next CSP guide.
 *  - img-src: data: covers the TOTP QR code (data:image/png) and inline SVGs;
 *    blob: covers attachment object URLs.
 *  - connect-src: self (dev API goes through the /api same-origin rewrite) plus
 *    the prod API origin derived from NEXT_PUBLIC_API_BASE_URL when it is an
 *    absolute cross-site URL.
 *  - form-action: self + API origin — the SSO start endpoint is a top-level
 *    navigation/redirect to the API host.
 *  - frame-ancestors 'none': clickjacking guard (pairs with X-Frame-Options).
 */

/** Truthy check for the enforce flag: "1", "true", "yes" (case-insensitive). */
const CSP_ENFORCE = /^(1|true|yes)$/i.test(process.env.CSP_ENFORCE ?? "");

/**
 * Origin of the production API, used in connect-src / form-action so the
 * browser may talk to api.iux24.com cross-site. Empty in dev, where the API is
 * reached through the same-origin /api rewrite and `'self'` already covers it.
 */
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return "";
  try {
    // Only an absolute http(s) URL is a distinct origin worth listing.
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const api = apiOrigin();
  const connectExtra = api ? ` ${api}` : "";

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${connectExtra}`,
    `form-action 'self'${connectExtra}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Next reads the nonce off the request header and applies it to its scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const headerName = CSP_ENFORCE
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";
  response.headers.set(headerName, csp);
  // Expose the nonce on the response too, for layout/server components to read.
  response.headers.set("x-nonce", nonce);

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on all paths EXCEPT:
     *  - api            (the dev API proxy rewrite — no HTML, no nonce needed)
     *  - _next/static   (immutable build assets)
     *  - _next/image    (image optimiser)
     *  - favicon.ico
     * Also skip link prefetches, which don't render HTML that needs a nonce.
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
