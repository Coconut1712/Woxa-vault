/**
 * Org member + invitation endpoints — see /API_CONTRACT.md
 * ("Endpoints — Workspace members").
 *
 * Phase A note: backend does NOT yet send email — `inviteMember` / `resendInvite`
 * return an `acceptUrl` that the admin must share manually. Phase B will deliver
 * via Resend and stop returning `acceptUrl` in the response body.
 */

import { apiFetch } from "./client";

export type OrgRole = "owner" | "admin" | "member" | "guest";
/** Roles assignable at invite time — `owner` is never granted via invite. */
export type InviteRole = Exclude<OrgRole, "owner">;
export type OrgMemberStatus = "active" | "disabled";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface OrgMember {
  userId: string;
  email: string;
  displayName: string;
  role: OrgRole;
  joinedAt: string;
  status: OrgMemberStatus;
  /** Some backends include this; treat as best-effort metadata. */
  lastActiveAt?: string | null;
  /** Free-form name some endpoints carry. */
  name?: string;

  /** Phase C: ZK info */
  publicKey?: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: InviteRole;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
  lastSentAt: string;
  status: InvitationStatus;
}

export interface MembersResponse {
  members: OrgMember[];
  invitations: Invitation[];
}

interface MemberSingleResponse {
  member: OrgMember;
}

export interface InvitationCreatedResponse {
  invitation: Invitation;
  /**
   * True when the backend successfully handed the invitation email to its
   * transport (Resend in prod, dev SMTP/skip-mode locally). Use this to choose
   * between the toast-only success path and the "copy link" fallback.
   */
  emailSent: boolean;
  /**
   * Populated when `emailSent === false`; gives a human-readable reason
   * (e.g. transport disabled, hard bounce). Treat as advisory copy, NOT as a
   * load-bearing signal.
   */
  emailError?: string;
  /**
   * Only present in development (or when the backend explicitly emits it as a
   * fallback when delivery failed). MUST NOT be displayed if `emailSent` is
   * true — we do not want to encourage admins to share the link manually when
   * the email reached the user.
   */
  acceptUrl?: string;
}

/** GET /members — returns both active members and (for owner/admin) pending invitations. */
export async function listMembers(
  signal?: AbortSignal,
): Promise<MembersResponse> {
  const res = await apiFetch<MembersResponse>("/members", { signal });
  return {
    members: Array.isArray(res?.members) ? res.members : [],
    invitations: Array.isArray(res?.invitations) ? res.invitations : [],
  };
}

/**
 * PATCH /members/:userId — change role. Owner/admin only.
 *
 * `role` is constrained to `InviteRole` (admin|member|guest): the backend
 * rejects `owner` here (a single Owner per workspace; ownership only moves via
 * transfer-ownership), so we never let a caller send it.
 */
export async function updateMemberRole(
  userId: string,
  role: InviteRole,
): Promise<OrgMember> {
  const res = await apiFetch<MemberSingleResponse>(
    `/members/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: { role } },
  );
  return res.member;
}

/**
 * DELETE /members/:userId — remove. Owner/admin only. Removing the Owner is
 * forbidden (403); ownership must be moved via transfer-ownership first.
 */
export async function removeMember(userId: string): Promise<void> {
  await apiFetch<void>(`/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

/** POST /members/invite — owner/admin only. */
export async function inviteMember(input: {
  email: string;
  role: InviteRole;
}): Promise<InvitationCreatedResponse> {
  return await apiFetch<InvitationCreatedResponse>("/members/invite", {
    method: "POST",
    body: input,
  });
}

/** POST /members/invite/:id/resend — owner/admin only. */
export async function resendInvite(
  invitationId: string,
): Promise<InvitationCreatedResponse> {
  return await apiFetch<InvitationCreatedResponse>(
    `/members/invite/${encodeURIComponent(invitationId)}/resend`,
    { method: "POST" },
  );
}

/** DELETE /members/invite/:id — owner/admin only. */
export async function revokeInvite(invitationId: string): Promise<void> {
  await apiFetch<void>(
    `/members/invite/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}
