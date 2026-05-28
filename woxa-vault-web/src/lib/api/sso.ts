/**
 * Google SSO entry point — see /API_CONTRACT.md ("Endpoints — Google SSO").
 *
 * SSO uses top-level browser redirects, NOT XHR. Frontend builds the URL and
 * assigns `window.location.href`; backend handles the OAuth handshake and
 * eventually 302s back to `next` (default `/app`) on success or
 * `/?error=<code>` on failure.
 *
 * In dev the URL goes through the Next rewrite (/api → :8787) so the browser
 * keeps everything same-origin — that's why we keep the URL relative when the
 * configured API base is itself a relative path.
 */

import { API_BASE_URL } from "./client";
import type { SsoErrorCode } from "./types";

export type { SsoErrorCode };

const SSO_ERROR_CODES: ReadonlySet<SsoErrorCode> = new Set<SsoErrorCode>([
  "sso_state_mismatch",
  "sso_domain_forbidden",
  "sso_email_unverified",
  "sso_provider_error",
  "sso_internal_error",
]);

/** Type-guard: turn an arbitrary `?error=` string into a known SsoErrorCode. */
export function asSsoErrorCode(value: string | null | undefined): SsoErrorCode | null {
  if (!value) return null;
  return SSO_ERROR_CODES.has(value as SsoErrorCode)
    ? (value as SsoErrorCode)
    : null;
}

/** Match the backend's accepted shape: starts with `/`, no `//` prefix, ≤256 chars. */
function sanitizeNext(next: string | undefined): string {
  if (!next) return "/app";
  if (next.length > 256) return "/app";
  if (!next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

export interface GoogleSsoStartParams {
  email?: string;
  next?: string;
}

/**
 * Build the URL for `GET /auth/sso/google/start`. Returns a same-origin URL
 * when `API_BASE_URL` is a path (the dev default `/api`), or an absolute URL
 * when it points at a different host (prod).
 *
 * Use with `window.location.href = ...` — backend rejects XHR-style calls.
 */
export function googleSsoStartUrl(params: GoogleSsoStartParams = {}): string {
  const search = new URLSearchParams();
  if (params.email) search.set("email", params.email);
  search.set("next", sanitizeNext(params.next));

  const path = `${API_BASE_URL}/auth/sso/google/start`;
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Convenience: redirect the current browser tab to the SSO start endpoint.
 * No-op on the server (where `window` is undefined).
 */
export function startGoogleSso(params: GoogleSsoStartParams = {}): void {
  if (typeof window === "undefined") return;
  window.location.href = googleSsoStartUrl(params);
}
