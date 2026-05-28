import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  status: ContentfulStatusCode;
  code: string;
  details?: unknown;

  constructor(status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

// Error codes are aligned with API_CONTRACT.md (Woxa-vault/API_CONTRACT.md).
// Frontend keys off `error.code`, so be careful when changing string values.
export const errors = {
  // 400 — payload failed validation
  validation: (msg = "Validation failed", details?: unknown) =>
    new ApiError(400, "validation_error", msg, details),
  // 401 — wrong email / password (kept as `invalid_credentials` for FE).
  // Also used on `POST /auth/2fa/verify-login` for a WRONG 2FA code AND a
  // REPLAYED TOTP — the two MUST stay indistinguishable at the HTTP layer
  // (same code, same message) so a replayed code is not an oracle for code
  // validity. Frontend treats this as a retryable "wrong code" on that route.
  invalidCredentials: (msg = "Invalid email or password") =>
    new ApiError(401, "invalid_credentials", msg),
  // 401 — `POST /auth/2fa/verify-login` only. The `mfaToken` (body) or the
  // `mfa_pending` cookie is missing / malformed / expired (5-min TTL). This is
  // a terminal state for the in-flight login: the frontend should send the user
  // back to start a fresh sign-in. Deliberately distinct from
  // `invalid_credentials` so the FE can show "session timed out, log in again"
  // instead of the retryable "wrong code" message. It leaks nothing about the
  // 2FA code — it only states the caller's own login session expired.
  mfaSessionExpired: (msg = "Your sign-in session has expired. Start a new login.") =>
    new ApiError(401, "mfa_session_expired", msg),
  // 401 — session missing / expired
  unauthorized: (msg = "Authentication required") => new ApiError(401, "unauthorized", msg),
  forbidden: (msg = "Forbidden") => new ApiError(403, "forbidden", msg),
  notFound: (msg = "Not found") => new ApiError(404, "not_found", msg),
  rateLimited: (msg = "Too many requests", retryAfterSec?: number) =>
    new ApiError(429, "rate_limited", msg, retryAfterSec ? { retryAfterSec } : undefined),
  conflict: (msg = "Resource conflict") => new ApiError(409, "conflict", msg),
  internal: (msg = "Internal server error") => new ApiError(500, "internal_error", msg),

  // 409 — `POST /auth/register` called with an email that already has an
  // account. NOT constant-time (registration is a deliberate enumeration
  // surface — a user must be told their email is taken), but rate-limited per
  // IP. Frontend routes the caller to the login page.
  emailTaken: (msg = "An account with this email already exists") =>
    new ApiError(409, "email_taken", msg),

  // 409 — setup endpoint called when the user already has a password set.
  // The frontend should route the user through the recovery-kit reset flow
  // instead of re-running setup.
  passwordAlreadySet: (msg = "Password is already set for this account") =>
    new ApiError(409, "password_already_set", msg),
  // 401 — recovery code did not match (or was already invalidated). Reused
  // for both "unknown email" and "wrong code" to avoid a user-enumeration
  // oracle on the public reset endpoint.
  recoveryKitInvalid: (msg = "Recovery code is invalid or has already been used") =>
    new ApiError(401, "recovery_kit_invalid", msg),
  // 409 — user has no recovery kit (e.g. SSO-only without having run setup).
  // Surfaced by the regenerate endpoint when there's nothing to invalidate
  // — informational only; admin-reset flow is Phase B.
  recoveryKitNotSet: (msg = "No recovery kit is set for this account") =>
    new ApiError(409, "recovery_kit_not_set", msg),
  // 409 — caller's account has no `password_hash` set (e.g. SSO-only JIT user
  // who hasn't run `/me/password/setup` yet). Surfaced by `POST
  // /me/verify-password` so the frontend can route the user through password
  // setup instead of looping on the unlock prompt. AC-055.8 — the vault auto-
  // lock gate cannot be cleared without a password to verify against.
  passwordNotSet: (msg = "No password is set for this account") =>
    new ApiError(409, "password_not_set", msg),
  // 401 — Phase A.5 server-side vault lock (WARN-I). The session is otherwise
  // valid but the master-password unlock window has elapsed (15 min idle by
  // default). The frontend should prompt the user to re-enter their master
  // password and call `POST /me/verify-password` before retrying the original
  // sensitive item-read request. Distinct from `unauthorized` so the frontend
  // can branch on "locked vault" vs "logged out".
  vaultLocked: (msg = "Vault is locked. Re-enter your master password to continue.") =>
    new ApiError(401, "vault_locked", msg),
  // 409 — caller asked to enroll 2FA on an account that already has it
  // enabled. Frontend routes to the "disable first" UX.
  twoFactorAlreadyEnabled: (msg = "2FA is already enabled for this account") =>
    new ApiError(409, "two_factor_already_enabled", msg),
  // 403 — a workspace the caller belongs to has the `require2fa` security
  // policy enabled and the caller has NOT yet enrolled 2FA. Secret-bearing
  // routes (vaults / items / sends / folders / attachments) are blocked until
  // the user finishes enrollment. The 2FA enroll/verify-enroll endpoints,
  // GET /me and logout are intentionally NOT gated so the user can self-remedy.
  // Frontend routes the user to the forced /setup-2fa screen on this code.
  twoFactorRequired: (
    msg = "Two-factor authentication is required by your workspace. Enroll 2FA to continue.",
  ) => new ApiError(403, "two_factor_required", msg),
  // 409 — two concurrent `POST /workspace/transfer-ownership` calls raced on
  // the partial unique index `org_members_single_owner_idx`. The invariant
  // held (exactly one owner survives) but one request lost. Surface a
  // retryable conflict instead of a raw 500 so the caller can simply re-run.
  ownershipTransferConflict: (
    msg = "Concurrent ownership change, please retry",
  ) => new ApiError(409, "ownership_transfer_conflict", msg),
  // 409 — a concurrent `PATCH /workspace` (rename) raced for the same derived
  // slug and lost on the `organizations.slug` unique constraint. The slug is
  // server-derived from the new name (auto-follow); this is a transient race,
  // so surface a retryable conflict instead of a raw 500.
  workspaceSlugConflict: (
    msg = "That workspace name is taken right now, please retry",
  ) => new ApiError(409, "workspace_slug_conflict", msg),
};
