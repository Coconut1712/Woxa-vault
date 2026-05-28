/**
 * Current-user profile + Master Password / Recovery Kit endpoints — see
 * /API_CONTRACT.md ("Endpoints — Current user").
 *
 * All routes here except `resetPasswordWithRecovery` require an authenticated
 * session (Lucia cookie). A bare 401 means the caller should bounce through
 * `/login/password`.
 *
 * Note: this lives alongside `auth.ts`, which owns the slimmer session-only
 * `AuthUser`. `/me` returns the richer `MeUser` (timestamps, role badge, 2FA
 * flag, password/recovery-kit setup state) that protected pages and global
 * guards need.
 */

import { apiFetch } from "./client";
import type { OrgRole } from "./members";

/** Response shape for GET /me and PATCH /me. */
export interface MeUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  /** `null` if the user has never completed a successful sign-in. */
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  /**
   * True when the user has begun TOTP enrollment (POST /auth/2fa/enroll) but
   * has not yet completed it (POST /auth/2fa/verify-enroll). The UI surfaces a
   * "resume setup" affordance in this state.
   */
  twoFactorPending?: boolean;
  /**
   * Count of TOTP backup codes the user still has available. Decrements after
   * each backup-code login or on successful regeneration. Only present when
   * `twoFactorEnabled === true`.
   */
  backupCodesRemaining?: number;
  /**
   * ISO timestamp of when 2FA was enrolled. Backend may omit this on older
   * accounts — treat as optional metadata, not a load-bearing flag.
   */
  totpEnabledAt?: string | null;
  /**
   * True when the user has NO TOTP 2FA enrolled AND belongs to at least one
   * workspace whose `require2fa` policy is enabled. While true the user must
   * complete `/setup-2fa` before any secret route is reachable — the backend
   * blocks those routes with 403 `two_factor_required` and SessionGuard bounces
   * the user to the forced-enrollment page.
   *
   * Optional in the type because older backends predate the field — callers
   * MUST treat `undefined` as "no forced enrollment" (fail open to /app) so
   * existing users on an older backend are never trapped at /setup-2fa.
   */
  requiresTwoFactorEnroll?: boolean;
  /**
   * Role within the user's current (ACTIVE) workspace. `null` for users who
   * haven't accepted an invitation yet (rare — they should be redirected to
   * /invite/*). Reflects the workspace named by `activeOrgId`.
   */
  role: OrgRole | null;
  /**
   * Org id of the user's ACTIVE workspace for this session — what every
   * org-scoped surface (vaults / members / settings) is currently scoped to.
   * Changes after POST /workspace/switch. The workspace switcher uses this to
   * mark the active row in the dropdown.
   *
   * Optional in the type because older backends predate the field — callers
   * MUST treat `undefined` as "unknown" and fall back to matching by the
   * single membership / name rather than crashing.
   */
  activeOrgId?: string | null;
  /**
   * True when the user signed in through SSO JIT and has never set a local
   * password. Until this is false, the user must complete `/setup-password`
   * before any other UI is allowed.
   */
  requiresPasswordSetup: boolean;
  /** True when the user has an active recovery kit hash on file. */
  hasRecoveryKit: boolean;
  /** ISO timestamp of when the active recovery kit was generated, or null. */
  recoveryKitCreatedAt: string | null;
  /**
   * True when the user belongs to (or owns) at least one workspace. Drives the
   * post-auth routing decision: a freshly-provisioned user with no workspace is
   * sent to `/spaces` to create or join one before reaching `/app`.
   *
   * Optional in the type because older backends predate the field — callers
   * MUST treat `undefined` as "unknown, do not redirect" (fail open to /app)
   * rather than "no workspace", to avoid bouncing existing users into /spaces.
   * Prefer this over `workspaceCount` when present.
   */
  hasWorkspace?: boolean;
  /**
   * Number of workspaces the user belongs to. Backend may send this instead of
   * (or alongside) `hasWorkspace`. `workspaceCount > 0` implies `hasWorkspace`.
   */
  workspaceCount?: number;

  /** Phase C: Zero-Knowledge Encryption */
  isZeroKnowledge?: boolean;
  publicKey?: string | null;
}

interface MeResponse {
  user: MeUser;
}

interface RevokeAllResponse {
  revokedCount: number;
}

/** Notification preferences for the user. */
export interface NotificationSettings {
  newLogin: boolean;
  sendReceived: boolean;
  vaultShared: boolean;
}

/** GET /me — full profile including timestamps + 2FA flag. */
export async function getMe(signal?: AbortSignal): Promise<MeUser> {
  const res = await apiFetch<MeResponse>("/me", { signal });
  return res.user;
}

/**
 * PATCH /me — updates `displayName`.
 *
 * Errors:
 *   - 400 validation_error (empty string)
 */
export async function updateProfile(input: {
  displayName: string;
}): Promise<MeUser> {
  const res = await apiFetch<MeResponse>("/me", {
    method: "PATCH",
    body: input,
  });
  return res.user;
}

/**
 * POST /me/password/setup — set the initial Master Password for a user who
 * was provisioned via SSO and never had one. Returns the plaintext recovery
 * code ONCE — the caller MUST show it to the user immediately (blocking
 * modal) and never store it.
 *
 * Body: `{ password, authKeyHash?, publicKey?, ... }`
 */
export async function setupPassword(input: {
  password: string;
  loginAuthKeyHash?: string;
  masterAuthKeyHash?: string;
  publicKey?: string;
  encryptedPrivateKey?: string;
  privateKeyIv?: string;
  privateKeyAuthTag?: string;
}): Promise<{ ok: true; recoveryCode: string }> {
  return apiFetch<{ ok: true; recoveryCode: string }>("/me/password/setup", {
    method: "POST",
    body: input,
  });
}

/**
 * POST /me/recovery-kit/regenerate — replace the user's recovery code with a
 * freshly generated one. Returns the plaintext recovery code ONCE; old kit is
 * invalidated immediately.
 *
 * Requires the user to confirm their current Master Password in the body —
 * defense in depth against session-stolen takeover.
 *
 * Errors:
 *   - 401 invalid_credentials → wrong current password.
 *   - 429 rate_limited (3/hr/user).
 */
export async function regenerateRecoveryKit(input: {
  password: string;
}): Promise<{ recoveryCode: string }> {
  return apiFetch<{ recoveryCode: string }>("/me/recovery-kit/regenerate", {
    method: "POST",
    body: input,
  });
}

/**
 * POST /auth/password/reset-with-recovery — PUBLIC endpoint, no session
 * required. Verifies the recovery code against the supplied email and sets a
 * brand-new password. Backend invalidates ALL existing sessions and clears
 * the recovery kit hash, so the user must:
 *   1. Sign in again with the new password
 *   2. Generate a new recovery kit (UI surfaces this via banner)
 *
 * The 401 path is constant-time — the same response is returned for unknown
 * emails as for invalid codes, so the UI must NOT hint that the email is
 * wrong vs. the code is wrong.
 *
 * Errors:
 *   - 401 recovery_kit_invalid
 *   - 400 validation_error (newPassword too short)
 *   - 429 rate_limited
 */
export async function resetPasswordWithRecovery(input: {
  email: string;
  recoveryCode: string;
  newPassword: string;
}): Promise<{ ok: true; requiresNewRecoveryKit: true }> {
  return apiFetch<{ ok: true; requiresNewRecoveryKit: true }>(
    "/auth/password/reset-with-recovery",
    {
      method: "POST",
      body: input,
    },
  );
}

/**
 * POST /me/verify-password — confirms the caller's current Master Password
 * without rotating the session. Used by the in-app Vault Lock overlay to gate
 * access without forcing a fresh login.
 *
 * Body: `{ password?, authKeyHash?, lockReason? }`
 */
export async function verifyPassword(input: {
  password?: string;
  authKeyHash?: string;
  masterAuthKeyHash?: string;
  lockReason?: "idle" | "manual" | "sleep" | "restart";
}): Promise<{ 
  ok: true; 
  keys?: {
    publicKey: string;
    encryptedPrivateKey: string;
    privateKeyIv: string;
    privateKeyAuthTag: string;
  };
}> {
  return apiFetch<{ 
    ok: true; 
    keys?: {
      publicKey: string;
      encryptedPrivateKey: string;
      privateKeyIv: string;
      privateKeyAuthTag: string;
    };
  }>("/me/verify-password", {
    method: "POST",
    body: input,
  });
}

/**
 * POST /me/sessions/revoke-all — sign out every session except the caller's.
 *
 * Returns the number of sessions that were revoked (0 if this was the only
 * active session). Never throws on "nothing to revoke" — that's a 200/0.
 *
 * Defense-in-depth: backend now requires the caller to confirm their current
 * Master Password in the body, so a stolen session cookie alone cannot wipe
 * the user out of their other devices.
 *
 * Errors:
 *   - 401 invalid_credentials → wrong password.
 *   - 429 rate_limited.
 */
export async function revokeOtherSessions(input: {
  password: string;
}): Promise<RevokeAllResponse> {
  return apiFetch<RevokeAllResponse>("/me/sessions/revoke-all", {
    method: "POST",
    body: input,
  });
}

/** GET /me/notifications/settings — read user's notification preferences. */
export async function getNotificationSettings(
  signal?: AbortSignal,
): Promise<NotificationSettings> {
  const res = await apiFetch<{ settings: NotificationSettings }>(
    "/me/notifications/settings",
    { signal },
  );
  return res.settings;
}

/** PATCH /me/notifications/settings — update user's notification preferences. */
export async function updateNotificationSettings(
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const res = await apiFetch<{ settings: NotificationSettings }>(
    "/me/notifications/settings",
    {
      method: "PATCH",
      body: patch,
    },
  );
  return res.settings;
}
