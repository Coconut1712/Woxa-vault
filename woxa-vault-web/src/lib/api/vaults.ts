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

/* ---------------------------------------------------------------------------
 * Phase C Wave-3b — client-driven vault re-key + v1→v2 migration.
 *
 * All three mutations are client-driven (the server holds no vault key,
 * search key, or plaintext): the browser fetches every member's public key,
 * generates/rotates the vault key, wraps it for each member, re-encrypts every
 * item + recomputes the blind-index terms, and POSTs the result. The server
 * applies it atomically. See /API_CONTRACT.md "Vault re-key & migration".
 * ------------------------------------------------------------------------- */

/**
 * One member's public key, for wrapping the vault key during a re-key/migrate.
 * `publicKey === null` means the member has NOT enrolled zero-knowledge yet —
 * they CANNOT receive a wrapped key and will lose access after the rotation
 * unless the admin enrolls them first. The UI must warn before proceeding.
 */
export interface VaultMemberKey {
  userId: string;
  email: string;
  publicKey: string | null;
}

/** A vault key wrapped to one member's public key (base64). */
export interface WrappedKeyInput {
  userId: string;
  wrappedKey: string;
}

/**
 * One item's re-encrypted v2 payload. Every field is a client blob the server
 * stores verbatim. `nameCiphertext`/`nameIv` are required; the rest may clear
 * with `null`. `searchTerms` REPLACES the item's whole blind-index term set.
 */
export interface ReEncryptedItem {
  id: string;
  nameCiphertext: string;
  nameIv: string;
  usernameCiphertext?: string | null;
  usernameIv?: string | null;
  urlCiphertext?: string | null;
  urlIv?: string | null;
  passwordCiphertext?: string | null;
  passwordIv?: string | null;
  notesCiphertext?: string | null;
  notesIv?: string | null;
  searchTerms?: string[];
}

export interface RekeyPayload {
  expectedKeyVersion: number;
  newKeyVersion: number;
  wrappedKeys: WrappedKeyInput[];
  items: ReEncryptedItem[];
}

/**
 * GET /vaults/:id/member-keys — the EFFECTIVE roster of vault members (direct +
 * team-derived, deduped) with each member's X25519 public key, for wrapping the
 * new vault key. Owner/admin OR vault manager only. `publicKey === null` flags
 * a member who hasn't enrolled ZK.
 */
export async function listVaultMemberKeys(
  vaultId: string,
  signal?: AbortSignal,
): Promise<VaultMemberKey[]> {
  const res = await apiFetch<{ memberKeys: VaultMemberKey[] }>(
    `/vaults/${encodeURIComponent(vaultId)}/member-keys`,
    { signal },
  );
  return Array.isArray(res?.memberKeys) ? res.memberKeys : [];
}

/**
 * POST /vaults/:id/rekey — rotate a v2 vault's key and re-encrypt every item
 * (used after a revoke when `rekeyPending` is true). Vault manager only.
 * Throws `ApiError` with `code: "rekey_conflict"` (409) when the key version
 * changed under us — reload and retry.
 */
export async function rekeyVault(
  vaultId: string,
  payload: RekeyPayload,
): Promise<{ keyVersion: number; rekeyPending: boolean; itemCount: number }> {
  return apiFetch(`/vaults/${encodeURIComponent(vaultId)}/rekey`, {
    method: "POST",
    body: payload,
  });
}

/**
 * POST /vaults/:id/migrate — opt-in, reversible v1→v2 migration. Owner/admin
 * only. Same payload shape as re-key (expectedKeyVersion is the v1 key version,
 * normally 1). Returns the rollback window. Throws `migrate_not_v1` /
 * `rekey_conflict` on conflict.
 */
export async function migrateVault(
  vaultId: string,
  payload: RekeyPayload,
): Promise<{
  encryptionVersion: number;
  keyVersion: number;
  itemCount: number;
  rollbackAvailableUntil: string;
}> {
  return apiFetch(`/vaults/${encodeURIComponent(vaultId)}/migrate`, {
    method: "POST",
    body: payload,
  });
}

/**
 * POST /vaults/:id/migrate/rollback — revert a v1→v2 migration within the 30-day
 * window. Owner/admin only, no body. Throws `rollback_unavailable` when no
 * backup exists (never migrated, or retention elapsed).
 */
export async function rollbackVaultMigration(
  vaultId: string,
): Promise<{ encryptionVersion: number; restoredItemCount: number }> {
  return apiFetch(`/vaults/${encodeURIComponent(vaultId)}/migrate/rollback`, {
    method: "POST",
  });
}

/**
 * PATCH /vaults/:id/folders/reorder — persist a new folder display order
 * (US-011.4). `order` is the full list of folder ids in their desired order.
 * Requires edit rights on the vault. The FoldersProvider applies the new order
 * optimistically and reverts on a thrown error.
 */
export async function reorderFolders(
  vaultId: string,
  order: string[],
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/vaults/${encodeURIComponent(vaultId)}/folders/reorder`,
    {
      method: "PATCH",
      body: { order },
    },
  );
}
