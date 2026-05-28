/**
 * Two-factor (TOTP) enrollment + management endpoints.
 *
 * The session-time MFA challenge (POST /auth/2fa/verify-login) lives in
 * `auth.ts` because it operates on an unauthenticated short-lived `mfaToken`.
 * Everything in this file requires an authenticated session cookie — they are
 * called from the user's account settings to enroll, disable, or regenerate
 * backup codes.
 *
 * Backup codes are returned to the client EXACTLY ONCE — the UI MUST display
 * them in a hard-to-dismiss surface (see `BackupCodesPanel`) and forget the
 * array immediately after the user confirms they have saved a copy.
 */

import { apiFetch } from "./client";

export interface TotpEnrollResponse {
  /** otpauth:// URI — useful for "Open in authenticator" links on iOS / desktop. */
  otpauthUri: string;
  /** Base64-encoded PNG data URL of the QR code (`data:image/png;base64,…`). */
  qrDataUrl: string;
  /** Plain base32 TOTP secret for manual entry into authenticators. */
  secret: string;
}

export interface TotpVerifyEnrollResponse {
  enabled: true;
  /** 10 plaintext one-time backup codes. Shown ONCE — never refetched. */
  backupCodes: string[];
}

export interface TotpRegenerateResponse {
  /** Fresh 10-code backup list. All previously generated codes are invalidated. */
  backupCodes: string[];
}

/**
 * POST /auth/2fa/enroll — begin (or restart) TOTP enrollment.
 *
 * Backend is idempotent: calling enroll while a pending enrollment exists
 * returns the same secret. Calling enroll while 2FA is already verified is a
 * 409 (`two_factor_already_enabled`).
 */
export async function enrollTwoFactor(): Promise<TotpEnrollResponse> {
  return apiFetch<TotpEnrollResponse>("/auth/2fa/enroll", { method: "POST" });
}

/**
 * POST /auth/2fa/verify-enroll — finalize enrollment by submitting a valid
 * TOTP code. On success the backend marks 2FA enabled and emits 10 plaintext
 * backup codes (one-time).
 *
 * Errors:
 *   - 401 `invalid_code` — wrong/expired TOTP code; keep user on the verify step.
 *   - 409 `two_factor_already_enabled` — race or stale UI; refresh /me.
 *   - 429 `rate_limited`.
 */
export async function verifyEnrollTwoFactor(input: {
  code: string;
}): Promise<TotpVerifyEnrollResponse> {
  return apiFetch<TotpVerifyEnrollResponse>("/auth/2fa/verify-enroll", {
    method: "POST",
    body: input,
  });
}

/**
 * POST /auth/2fa/disable — turn off TOTP. Backend requires the user's current
 * password and (when 2FA is fully enabled) a TOTP code OR backup code as a
 * second factor before the change goes through.
 *
 * Errors:
 *   - 401 `invalid_credentials` — wrong password.
 *   - 401 `invalid_code` — wrong TOTP/backup code.
 *   - 429 `rate_limited`.
 */
export async function disableTwoFactor(input: {
  password: string;
  code?: string;
}): Promise<{ disabled: true }> {
  return apiFetch<{ disabled: true }>("/auth/2fa/disable", {
    method: "POST",
    body: input,
  });
}

/**
 * POST /auth/2fa/regenerate-backup-codes — replace ALL existing backup codes.
 *
 * Backend requires the current Master Password AND a live TOTP code (NOT a
 * backup code) so a stolen-cookie attacker who already burned a backup can't
 * mint themselves an unlimited supply.
 *
 * Errors:
 *   - 401 `invalid_credentials` / `invalid_code`.
 *   - 429 `rate_limited`.
 */
export async function regenerateBackupCodes(input: {
  password: string;
  code: string;
}): Promise<TotpRegenerateResponse> {
  return apiFetch<TotpRegenerateResponse>(
    "/auth/2fa/regenerate-backup-codes",
    { method: "POST", body: input },
  );
}
