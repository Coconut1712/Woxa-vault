/**
 * Workspace-wide security settings — see /API_CONTRACT.md
 * ("Endpoints — Workspace settings").
 *
 * Exposes the full, fully-defaulted policy envelope (`{ settings: { … } }`).
 * GET returns every field with server defaults applied; PATCH takes a PARTIAL
 * patch (all fields optional, `sso` deep-merged) and returns the full policy so
 * callers re-sync from the response without a second fetch.
 *
 * RBAC:
 *   - GET  /workspace/settings — readable by ANY member (all roles).
 *   - PATCH /workspace/settings — owner + admin ONLY. A non-privileged caller
 *     gets 403 `forbidden`; the UI must keep the controls read-only for them and
 *     never trust the client-side role for the actual gate (the backend is the
 *     source of truth — see SECURITY note in /spaces).
 *
 * Both routes require an authenticated session (Lucia cookie). A bare 401 means
 * the caller should bounce through `/login/password`.
 */

import { apiFetch } from "./client";

/** Server clamp range for the per-session auto-lock window (integer minutes). */
export const AUTO_LOCK_MIN = 1;
export const AUTO_LOCK_MAX = 120;
export const AUTO_LOCK_DEFAULT = 15;

/** SSO / identity-provider policies that apply to every member. */
export interface WorkspaceSsoSettings {
  /**
   * Email domains members may sign in from. A flat list of normalized domain
   * strings — the server lowercases, trims, dedupes, validates the shape and
   * silently drops invalid entries, so always reflect the list it returns
   * rather than the value you sent. There is NO verification workflow (no TXT
   * records / verified-pending status) behind this list yet.
   */
  allowedDomains: string[];
  /** When true, members are JIT-provisioned on first SSO sign-in. */
  jitEnabled: boolean;
  /** When true, password sign-in is disabled and members must use SSO. */
  requireSso: boolean;
}

/** Security policies that apply to every member of the workspace. */
export interface WorkspaceSettings {
  /**
   * When true, every member must have TOTP 2FA enrolled. Members without it are
   * blocked from secret routes (vaults/items/folders/sends/attachments/
   * vault-members) and routed through `/setup-2fa` until they enroll. Enforced
   * server-side; the toggle here only mirrors + mutates the policy.
   */
  require2fa: boolean;
  /**
   * Idle minutes before the per-session vault unlock window expires and the
   * Master-password overlay is forced. Integer minutes; the server clamps to
   * [{@link AUTO_LOCK_MIN}, {@link AUTO_LOCK_MAX}]. There is NO "never".
   */
  autoLockMinutes: number;
  /** SSO / identity-provider policies. Always present (server-defaulted). */
  sso: WorkspaceSsoSettings;
}

interface WorkspaceSettingsResponse {
  settings: Partial<WorkspaceSettings> & {
    sso?: Partial<WorkspaceSsoSettings>;
  };
}

/** A partial patch — every field optional, `sso` is deep-merged server-side. */
export interface WorkspaceSettingsPatch {
  require2fa?: boolean;
  autoLockMinutes?: number;
  sso?: Partial<WorkspaceSsoSettings>;
}

/**
 * Coerce a (possibly garbled / partial) settings envelope into the full,
 * defaulted shape. Defensive: a missing/empty backend response still renders
 * sane defaults (OFF toggles, 15-min auto-lock, empty domain list) instead of
 * crashing the page.
 */
function coerceSettings(
  raw: WorkspaceSettingsResponse["settings"] | undefined,
): WorkspaceSettings {
  const sso = raw?.sso;
  const allowedDomains = Array.isArray(sso?.allowedDomains)
    ? sso.allowedDomains.filter((d): d is string => typeof d === "string")
    : [];
  const minutes =
    typeof raw?.autoLockMinutes === "number" &&
    Number.isFinite(raw.autoLockMinutes)
      ? Math.min(AUTO_LOCK_MAX, Math.max(AUTO_LOCK_MIN, Math.round(raw.autoLockMinutes)))
      : AUTO_LOCK_DEFAULT;
  return {
    require2fa: raw?.require2fa === true,
    autoLockMinutes: minutes,
    sso: {
      allowedDomains,
      jitEnabled: sso?.jitEnabled !== false,
      requireSso: sso?.requireSso === true,
    },
  };
}

/**
 * GET /workspace/settings — read the current workspace security policies.
 *
 * Readable by any member; never 403s on role. Returns the full defaulted shape.
 *
 * Errors:
 *   - 401 unauthorized → caller should route to /login/password.
 *   - 404 not_found → caller has no workspace membership.
 */
export async function getWorkspaceSettings(
  signal?: AbortSignal,
): Promise<WorkspaceSettings> {
  const res = await apiFetch<WorkspaceSettingsResponse>("/workspace/settings", {
    signal,
  });
  return coerceSettings(res?.settings);
}

/**
 * PATCH /workspace/settings — update the workspace security policies.
 *
 * Owner + admin only; other roles get 403 `forbidden`. Send only the changed
 * sub-field(s); `sso` is deep-merged server-side. Returns the full re-synced
 * policy. A no-op write returns 200 with no audit row.
 *
 * Errors:
 *   - 403 forbidden — caller is not owner/admin.
 *   - 429 rate_limited — too many changes; honor `Retry-After`.
 */
export async function updateWorkspaceSettings(
  input: WorkspaceSettingsPatch,
): Promise<WorkspaceSettings> {
  const res = await apiFetch<WorkspaceSettingsResponse>("/workspace/settings", {
    method: "PATCH",
    body: input,
  });
  return coerceSettings(res?.settings);
}
