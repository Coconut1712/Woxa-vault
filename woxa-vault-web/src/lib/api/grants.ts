/**
 * Per-resource sharing (grants) — item-level and folder-level ACLs.
 *
 * Backend implements the "most specific wins" effective-role model
 * (item override > folder grant > vault membership). These wrappers mirror the
 * vault-member wrappers in `src/lib/api/vaults.ts` exactly — same `apiFetch`
 * patterns, same `{ member }` / void return shapes.
 *
 * Endpoints (identical shapes for items and folders):
 *   GET    /items/:id/members             → { members: VaultMember[] }
 *   POST   /items/:id/members             → 201 { member }
 *   PATCH  /items/:id/members/:userId     → { member }
 *   DELETE /items/:id/members/:userId     → 204
 *   …and the /folders/:id/members equivalents.
 *
 * Errors (ApiError carries status + code):
 *   403 `forbidden`        — insufficient share authority (mirror in UI to
 *                            avoid showing buttons that 403).
 *   404 `not_found`        — caller has no access / target not in workspace.
 *   409 `member_conflict`  — a grant already exists for that user.
 *
 * Unlike vaults, items/folders have NO "last manager" concern.
 */

import { apiFetch } from "./client";
import type { VaultMember, VaultTeamMember, VaultRole } from "./types";

interface MembersResponse {
  members: VaultMember[];
}

interface MemberResponse {
  member: VaultMember;
}

interface TeamMembersResponse {
  teamMembers: VaultTeamMember[];
}

interface TeamMemberResponse {
  member: VaultTeamMember;
}

/* ---------------------------------------------------------------------------
 * Item grants
 * ------------------------------------------------------------------------- */

/** GET /items/:id/members — any caller with access may list. */
export async function listItemMembers(
  itemId: string,
  signal?: AbortSignal,
): Promise<VaultMember[]> {
  const res = await apiFetch<MembersResponse>(
    `/items/${encodeURIComponent(itemId)}/members`,
    { signal },
  );
  return Array.isArray(res?.members) ? res.members : [];
}

/** GET /items/:id/team-members — any caller with access may list. */
export async function listItemTeamMembers(
  itemId: string,
  signal?: AbortSignal,
): Promise<VaultTeamMember[]> {
  const res = await apiFetch<TeamMembersResponse>(
    `/items/${encodeURIComponent(itemId)}/team-members`,
    { signal },
  );
  return Array.isArray(res?.teamMembers) ? res.teamMembers : [];
}

/**
 * POST /items/:id/members — grant an existing workspace member access to this
 * item. 201 returns the new member. Throws `ApiError` with
 * `code: "member_conflict"` (409) when a grant already exists, `not_found`
 * (404) when the target isn't reachable, `forbidden` (403) for insufficient
 * authority (or attempting to grant above one's own rank).
 */
export async function addItemMember(
  itemId: string,
  userId: string,
  role: VaultRole,
): Promise<VaultMember> {
  const res = await apiFetch<MemberResponse>(
    `/items/${encodeURIComponent(itemId)}/members`,
    { method: "POST", body: { userId, role } },
  );
  return res.member;
}

/**
 * POST /items/:id/team-members — grant an existing team access to this item.
 */
export async function addItemTeamMember(
  itemId: string,
  teamId: string,
  role: VaultRole,
): Promise<VaultTeamMember> {
  const res = await apiFetch<TeamMemberResponse>(
    `/items/${encodeURIComponent(itemId)}/team-members`,
    { method: "POST", body: { teamId, role } },
  );
  return res.member;
}

/** PATCH /items/:id/members/:userId — change an item grant's role. */
export async function updateItemMemberRole(
  itemId: string,
  userId: string,
  role: VaultRole,
): Promise<VaultMember> {
  const res = await apiFetch<MemberResponse>(
    `/items/${encodeURIComponent(itemId)}/members/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: { role } },
  );
  return res.member;
}

/** PATCH /items/:id/team-members/:teamId — change a team item grant's role. */
export async function updateItemTeamMemberRole(
  itemId: string,
  teamId: string,
  role: VaultRole,
): Promise<VaultTeamMember> {
  const res = await apiFetch<TeamMemberResponse>(
    `/items/${encodeURIComponent(itemId)}/team-members/${encodeURIComponent(teamId)}`,
    { method: "PATCH", body: { role } },
  );
  return res.member;
}

/** DELETE /items/:id/members/:userId — revoke an item grant; 204 on success. */
export async function removeItemMember(
  itemId: string,
  userId: string,
): Promise<void> {
  await apiFetch<void>(
    `/items/${encodeURIComponent(itemId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

/** DELETE /items/:id/team-members/:teamId — revoke a team item grant; 204. */
export async function removeItemTeamMember(
  itemId: string,
  teamId: string,
): Promise<void> {
  await apiFetch<void>(
    `/items/${encodeURIComponent(itemId)}/team-members/${encodeURIComponent(teamId)}`,
    { method: "DELETE" },
  );
}

/* ---------------------------------------------------------------------------
 * Folder grants
 * ------------------------------------------------------------------------- */

/** GET /folders/:id/members — any caller with access may list. */
export async function listFolderMembers(
  folderId: string,
  signal?: AbortSignal,
): Promise<VaultMember[]> {
  const res = await apiFetch<MembersResponse>(
    `/folders/${encodeURIComponent(folderId)}/members`,
    { signal },
  );
  return Array.isArray(res?.members) ? res.members : [];
}

/** GET /folders/:id/team-members — any caller with access may list. */
export async function listFolderTeamMembers(
  folderId: string,
  signal?: AbortSignal,
): Promise<VaultTeamMember[]> {
  const res = await apiFetch<TeamMembersResponse>(
    `/folders/${encodeURIComponent(folderId)}/team-members`,
    { signal },
  );
  return Array.isArray(res?.teamMembers) ? res.teamMembers : [];
}

/**
 * POST /folders/:id/members — grant an existing workspace member access to this
 * folder. 201 returns the new member. Same error contract as item grants.
 */
export async function addFolderMember(
  folderId: string,
  userId: string,
  role: VaultRole,
): Promise<VaultMember> {
  const res = await apiFetch<MemberResponse>(
    `/folders/${encodeURIComponent(folderId)}/members`,
    { method: "POST", body: { userId, role } },
  );
  return res.member;
}

/**
 * POST /folders/:id/team-members — grant an existing team access to this folder.
 */
export async function addFolderTeamMember(
  folderId: string,
  teamId: string,
  role: VaultRole,
): Promise<VaultTeamMember> {
  const res = await apiFetch<TeamMemberResponse>(
    `/folders/${encodeURIComponent(folderId)}/team-members`,
    { method: "POST", body: { teamId, role } },
  );
  return res.member;
}

/** PATCH /folders/:id/members/:userId — change a folder grant's role. */
export async function updateFolderMemberRole(
  folderId: string,
  userId: string,
  role: VaultRole,
): Promise<VaultMember> {
  const res = await apiFetch<MemberResponse>(
    `/folders/${encodeURIComponent(folderId)}/members/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: { role } },
  );
  return res.member;
}

/** PATCH /folders/:id/team-members/:teamId — change a team folder grant's role. */
export async function updateFolderTeamMemberRole(
  folderId: string,
  teamId: string,
  role: VaultRole,
): Promise<VaultTeamMember> {
  const res = await apiFetch<TeamMemberResponse>(
    `/folders/${encodeURIComponent(folderId)}/team-members/${encodeURIComponent(teamId)}`,
    { method: "PATCH", body: { role } },
  );
  return res.member;
}

/** DELETE /folders/:id/members/:userId — revoke a folder grant; 204 on success. */
export async function removeFolderMember(
  folderId: string,
  userId: string,
): Promise<void> {
  await apiFetch<void>(
    `/folders/${encodeURIComponent(folderId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

/** DELETE /folders/:id/team-members/:teamId — revoke a team folder grant; 204. */
export async function removeFolderTeamMember(
  folderId: string,
  teamId: string,
): Promise<void> {
  await apiFetch<void>(
    `/folders/${encodeURIComponent(folderId)}/team-members/${encodeURIComponent(teamId)}`,
    { method: "DELETE" },
  );
}
