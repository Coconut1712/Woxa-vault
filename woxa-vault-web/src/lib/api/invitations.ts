/**
 * Invitation acceptance flow — see /API_CONTRACT.md
 * ("Endpoints — Workspace members → /invite/:token").
 *
 *  - GET  /invite/:token         — public preview, no auth required
 *  - POST /invite/:token/accept  — auth required (Lucia session cookie)
 *
 * `previewInvitation` is safe to call before login. `acceptInvitation` will
 * surface 401 → caller must bounce through the login flow with a `next` hop
 * back to `/invite/<token>`.
 */

import { apiFetch } from "./client";
import type { InviteRole } from "./members";

/** Preview payload — what the recipient sees BEFORE accepting. */
export interface InvitationPreview {
  email: string;
  role: InviteRole;
  orgName: string;
  /** `null` when the inviter's user row was deleted. */
  invitedByName?: string | null;
  expiresAt: string;
  /**
   * Whether a user row already exists for `email`.
   *  - `false` → recipient must create an account before they can accept.
   *  - `true`  → standard sign-in + accept flow.
   */
  userExists: boolean;
}

/** Membership row returned after a successful POST. */
export interface InvitationAcceptResult {
  membership: {
    orgId: string;
    role: InviteRole;
    joinedAt: string;
  };
}

/** Response from POST /invite/:token/signup-and-accept — session cookie is set. */
export interface InvitationSignupAcceptResult {
  user: {
    id: string;
    email: string;
    displayName?: string;
  };
  membership: {
    orgId: string;
    role: InviteRole;
    joinedAt: string;
  };
}

interface PreviewResponse {
  invitation: InvitationPreview;
}

/** GET /invite/:token — public, no credentials required (cookies still sent). */
export async function previewInvitation(
  token: string,
  signal?: AbortSignal,
): Promise<InvitationPreview> {
  const res = await apiFetch<PreviewResponse>(
    `/invite/${encodeURIComponent(token)}`,
    { signal },
  );
  return res.invitation;
}

/** POST /invite/:token/accept — auth required; 401 means redirect to login. */
export async function acceptInvitation(
  token: string,
): Promise<InvitationAcceptResult> {
  return apiFetch<InvitationAcceptResult>(
    `/invite/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  );
}

/**
 * POST /invite/:token/signup-and-accept — public, no auth required.
 *
 * Atomic call that:
 *  1. Creates the user account using the invitation email + LOGIN password
 *  2. Accepts the invitation in the same transaction
 *  3. Sets the Lucia session cookie → caller is auto-logged in on success
 *
 * `password` here is the account/sign-in (login) password — NOT the Master
 * Password. The Master Password and recovery kit are set later at
 * `/setup-password`; the response therefore carries NO recoveryCode. After a
 * success, `GET /me` returns `requiresPasswordSetup=true`, so the caller should
 * `refresh()` then route to `/app` and let SessionGuard walk to /setup-password.
 *
 * Backend validation: `password.length >= 10`. UI enforces a stronger policy
 * (mix of cases/digit/special) as a recommendation, but does not block based
 * on it — only min length + non-empty are hard requirements.
 *
 * Error codes (see /API_CONTRACT.md):
 *   - 400 validation_error
 *   - 404 not_found
 *   - 409 user_exists
 *   - 409 invitation_already_accepted
 *   - 410 invitation_revoked
 *   - 410 invitation_expired
 *   - 429 rate_limited
 */
export async function signupAndAccept(
  token: string,
  input: { password: string; displayName?: string },
): Promise<InvitationSignupAcceptResult> {
  return apiFetch<InvitationSignupAcceptResult>(
    `/invite/${encodeURIComponent(token)}/signup-and-accept`,
    { method: "POST", body: input },
  );
}
