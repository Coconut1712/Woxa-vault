/**
 * Vault endpoints — see /API_CONTRACT.md ("Endpoints — Vaults").
 *
 * NOTE (2026-05-18): contract is finalized but backend routes have not landed
 * yet. The wrappers below compile against the confirmed shape so UI work can
 * proceed; callers will see `not_found` 404s until the routes ship. Until then
 * pages keep their mock-data import with `// TODO: swap to API when backend ships`.
 *
 * Authorization recap (round 2):
 *  - List/read: any vault member.
 *  - Update: manager only (others get 403 `forbidden`).
 *  - Delete: manager only; refuses non-empty vaults with 409 `vault_not_empty`.
 */

import { apiFetch } from "./client";
import type {
  Vault,
  VaultCreateInput,
  VaultDetail,
  VaultMember,
  VaultTeamMember,
  VaultRole,
  VaultSummary,
  VaultUpdateInput,
} from "./types";

interface VaultListResponse {
  vaults: VaultSummary[];
}

interface VaultResponse {
  vault: Vault;
}

interface VaultMemberResponse {
  member: VaultMember;
}

interface VaultTeamMemberResponse {
  member: VaultTeamMember;
}

/** GET /vaults — list vaults the caller is a member of (sorted updatedAt DESC). */
export async function listVaults(signal?: AbortSignal): Promise<VaultSummary[]> {
  const res = await apiFetch<VaultListResponse>("/vaults", { signal });
  return res.vaults;
}

/** POST /vaults — creator is auto-added as `manager`. */
export async function createVault(input: VaultCreateInput): Promise<Vault> {
  const res = await apiFetch<VaultResponse>("/vaults", {
    method: "POST",
    body: input,
  });
  return res.vault;
}

/** GET /vaults/:id — returns vault + members. 404 also covers non-members. */
export async function getVault(
  id: string,
  signal?: AbortSignal,
): Promise<VaultDetail> {
  return apiFetch<VaultDetail>(`/vaults/${encodeURIComponent(id)}`, { signal });
}

/** PATCH /vaults/:id — manager only. */
export async function updateVault(
  id: string,
  input: VaultUpdateInput,
): Promise<Vault> {
  const res = await apiFetch<VaultResponse>(`/vaults/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
  return res.vault;
}

/**
 * DELETE /vaults/:id — manager only; 204 on success. Throws `ApiError` with
 * `code: "vault_not_empty"` (409) when items remain. Callers should surface a
 * "delete items first" affordance on that code.
 */
export async function deleteVault(id: string): Promise<void> {
  await apiFetch<void>(`/vaults/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/* ---------------------------------------------------------------------------
 * Vault membership (sharing). Backend: src/routes/vaultMembers.ts.
 * All mutations are vault-`manager`-only (403 `forbidden` otherwise) and the
 * target must already belong to the same workspace (404 if not). Guests are
 * blocked entirely (403). See API behaviour notes inline.
 * ------------------------------------------------------------------------- */

/** GET /vaults/:id/members — any vault member may list. */
export async function listVaultMembers(
  vaultId: string,
  signal?: AbortSignal,
): Promise<VaultMember[]> {
  const res = await apiFetch<{ members: VaultMember[] }>(
    `/vaults/${encodeURIComponent(vaultId)}/members`,
    { signal },
  );
  return Array.isArray(res?.members) ? res.members : [];
}

/** GET /vaults/:id/team-members — any vault member may list. */
export async function listVaultTeamMembers(
  vaultId: string,
  signal?: AbortSignal,
): Promise<VaultTeamMember[]> {
  const res = await apiFetch<{ teamMembers: VaultTeamMember[] }>(
    `/vaults/${encodeURIComponent(vaultId)}/team-members`,
    { signal },
  );
  return Array.isArray(res?.teamMembers) ? res.teamMembers : [];
}

/**
 * POST /vaults/:id/members — add an existing workspace member to the vault.
 * 201 returns the new member. Throws `ApiError` with `code: "member_conflict"`
 * (409) if the user is already a member, `not_found` (404) if the target isn't
 * in the workspace, `forbidden` (403) for non-managers.
 */
export async function addVaultMember(
  vaultId: string,
  userId: string,
  role: VaultRole,
  wrappedKey?: string,
): Promise<VaultMember> {
  const res = await apiFetch<VaultMemberResponse>(
    `/vaults/${encodeURIComponent(vaultId)}/members`,
    { method: "POST", body: { userId, role, wrappedKey } },
  );
  return res.member;
}

/**
 * POST /vaults/:id/team-members — add an existing team to the vault.
 */
export async function addVaultTeamMember(
  vaultId: string,
  teamId: string,
  role: VaultRole,
): Promise<VaultTeamMember> {
  const res = await apiFetch<VaultTeamMemberResponse>(
    `/vaults/${encodeURIComponent(vaultId)}/team-members`,
    { method: "POST", body: { teamId, role } },
  );
  return res.member;
}

/**
 * PATCH /vaults/:id/members/:userId — change a member's vault role. Throws
 * `ApiError` (409, details.reason === "last_manager") when demoting the only
 * manager.
 */
export async function updateVaultMemberRole(
  vaultId: string,
  userId: string,
  role: VaultRole,
): Promise<VaultMember> {
  const res = await apiFetch<VaultMemberResponse>(
    `/vaults/${encodeURIComponent(vaultId)}/members/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: { role } },
  );
  return res.member;
}

/**
 * PATCH /vaults/:id/team-members/:teamId — change a team's vault role.
 */
export async function updateVaultTeamMemberRole(
  vaultId: string,
  teamId: string,
  role: VaultRole,
): Promise<VaultTeamMember> {
  const res = await apiFetch<VaultTeamMemberResponse>(
    `/vaults/${encodeURIComponent(vaultId)}/team-members/${encodeURIComponent(teamId)}`,
    { method: "PATCH", body: { role } },
  );
  return res.member;
}

/**
 * DELETE /vaults/:id/members/:userId — revoke vault access; 204 on success.
 * Throws `ApiError` (409, details.reason === "last_manager") when removing the
 * only manager.
 */
export async function removeVaultMember(
  vaultId: string,
  userId: string,
): Promise<void> {
  await apiFetch<void>(
    `/vaults/${encodeURIComponent(vaultId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

/**
 * DELETE /vaults/:id/team-members/:teamId — revoke team vault access; 204.
 */
export async function removeVaultTeamMember(
  vaultId: string,
  teamId: string,
): Promise<void> {
  await apiFetch<void>(
    `/vaults/${encodeURIComponent(vaultId)}/team-members/${encodeURIComponent(teamId)}`,
    { method: "DELETE" },
  );
}
