import type { MiddlewareHandler } from "hono";
import { env } from "@/config/env";
import { errors } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Origin-header CSRF defense (WARN-4 — defense in depth on top of SameSite).
//
// Threat model:
//   Asset: state-changing routes that rely on the session cookie. A malicious
//     page on another origin should not be able to coerce the browser into
//     issuing a POST/PATCH/DELETE/PUT carrying our cookie.
//   Adversary: a cross-site forgery (CSRF). Modern browsers default cookies
//     to SameSite=Lax which already blocks most cross-site POST forms; this
//     middleware is the belt to that suspender — every state-changing
//     request must declare an `Origin` (or `Referer`) header from the
//     CORS allow-list. Same-origin requests have a matching Origin set by
//     the browser; cross-site forgeries either omit it (rare) or set an
//     attacker origin (always blocked).
//   Mitigations:
//     * Check `Origin` first; fall back to `Referer` parsing only when
//       Origin is absent (rare on POST in modern browsers but possible from
//       file:// or curl).
//     * Methods covered: POST, PUT, PATCH, DELETE — everything that mutates.
//       GET/HEAD/OPTIONS are unaffected.
//     * `null` origin (e.g. <iframe sandbox> or curl with no Origin) is
//       allowed ONLY in development so local curl smoke tests work. Prod
//       rejects the request.
//   Residual risk:
//     * Browser bug that omits Origin on a POST from a malicious origin —
//       no current browser does this, but if one shipped it tomorrow we'd
//       want SameSite=Lax to still hold the line. Both controls together
//       give us the redundancy.
// ---------------------------------------------------------------------------

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export const originCheck: MiddlewareHandler = async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method.toUpperCase())) {
    return next();
  }

  const origin = c.req.header("origin");
  const referer = c.req.header("referer");
  const allowList = env.CORS_ORIGINS;

  // Same-origin curl/test requests have no Origin header by default.
  // Tolerate this in development so local smoke tests still run; production
  // requires a valid Origin or a Referer that matches the allow-list.
  if (!origin && !referer) {
    if (env.NODE_ENV !== "production") return next();
    throw errors.forbidden("Origin header is required for state-changing requests");
  }

  if (origin) {
    if (allowList.includes(origin)) return next();
    throw errors.forbidden(`Origin ${origin} is not allowed`);
  }

  const refererOrigin = originFromReferer(referer);
  if (refererOrigin && allowList.includes(refererOrigin)) return next();

  throw errors.forbidden("Origin does not match the allow-list");
};
