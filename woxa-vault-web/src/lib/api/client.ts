/**
 * Low-level fetch wrapper for the woxa-vault-api backend.
 *
 * Conventions (see /API_CONTRACT.md at the repo root):
 *  - HttpOnly cookie session → every request runs with credentials: "include"
 *  - JSON request + response bodies
 *  - Uniform error envelope: { error: { code, message } } → thrown as ApiError
 *  - Base URL from NEXT_PUBLIC_API_BASE_URL (falls back to http://localhost:8787)
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ??
  "http://localhost:8787";

/**
 * Window event dispatched when any API call returns 401 `vault_locked` (the
 * per-session master-password unlock window expired server-side). The in-app
 * VaultLockProvider listens for this and raises the Master-password overlay, so
 * an auto-lock surfaces the unlock screen instead of a generic "couldn't load"
 * error. The server is the source of truth for the unlock window — this keeps
 * the client overlay in sync even if its idle timer hasn't fired yet.
 */
export const VAULT_LOCKED_EVENT = "woxa:vault-locked";

/**
 * Window event dispatched when the vault is unlocked (master password verified).
 * Data providers that sit ABOVE the VaultLockProvider in the tree (VaultsProvider
 * etc.) listen for it to refetch, so any data that errored while locked recovers
 * automatically instead of leaving a stale "couldn't load" state behind.
 */
export const VAULT_UNLOCKED_EVENT = "woxa:vault-unlocked";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Network failures or non-Response throws bubble up as ApiError with code "network_error". */
export class NetworkError extends ApiError {
  constructor(message: string) {
    super(0, "network_error", message);
    this.name = "NetworkError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiRequestInit {
  method?: Method;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Performs a fetch against the backend and parses the JSON envelope.
 *  - Returns the parsed JSON body on 2xx (or `undefined` for 204).
 *  - Throws `ApiError` on any non-2xx, mapping the standard error envelope.
 *  - Throws `NetworkError` if the request itself fails (DNS, CORS, offline).
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...init.headers,
  };

  let body: BodyInit | undefined;
  if (init.body !== undefined && init.body !== null) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    body = JSON.stringify(init.body);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      credentials: "include",
      headers,
      body,
      signal: init.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new NetworkError(
      err instanceof Error ? err.message : "Failed to reach the server",
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  // Parse JSON defensively — backend should always emit JSON, but never trust the wire.
  const text = await res.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // fall through; parsed stays undefined
    }
  }

  if (!res.ok) {
    const envelope = isErrorEnvelope(parsed) ? parsed.error : null;
    const code = envelope?.code ?? defaultCodeForStatus(res.status);
    // Safety net: a 403 `two_factor_required` means the workspace turned on the
    // Require-2FA policy mid-session and this user has no TOTP enrolled. The
    // backend has already blocked the secret route; bounce the browser to the
    // forced-enrollment page so the user can recover instead of staring at a
    // dead request. SessionGuard normally catches this on /me, but a direct API
    // call (or a policy flipped between /me refreshes) can race ahead of it.
    if (res.status === 403 && code === "two_factor_required") {
      redirectToTwoFactorSetup();
    }
    // The per-session vault-unlock window expired (auto-lock). Signal the lock
    // overlay to show the Master-password screen rather than letting the caller
    // render a generic error. We still throw so the caller's catch runs — the
    // opaque z-100 overlay sits above whatever error UI it shows.
    if (res.status === 401 && code === "vault_locked") {
      signalVaultLocked();
    }
    throw new ApiError(
      res.status,
      code,
      envelope?.message ?? `Request failed with status ${res.status}`,
    );
  }

  return (parsed ?? (undefined as unknown)) as T;
}

/**
 * Hard-redirect the browser to /setup-2fa once, guarding against loops. We use
 * a raw `window.location` assignment (not next/navigation) so this stays usable
 * from the non-React fetch layer. No-ops on the server and when we're already
 * on the forced-enrollment page.
 */
function redirectToTwoFactorSetup(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/setup-2fa") return;
  window.location.assign("/setup-2fa");
}

/** Notify the in-app VaultLockProvider that the server reports the vault locked. */
function signalVaultLocked(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(VAULT_LOCKED_EVENT));
}

function isErrorEnvelope(
  value: unknown,
): value is { error: { code?: string; message?: string } } {
  if (!value || typeof value !== "object") return false;
  const err = (value as { error?: unknown }).error;
  return !!err && typeof err === "object";
}

function defaultCodeForStatus(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "internal_error";
  if (status >= 400) return "bad_request";
  return "unknown_error";
}
