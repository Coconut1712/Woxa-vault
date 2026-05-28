/**
 * Folder endpoints — see /API_CONTRACT.md ("Endpoints — Folders").
 *
 * Per-vault, flat folders. Any vault member may list. Mutations require
 * vault role `manager`, `editor`, or `user` (same as items).
 *
 * Round 2.x ships flat folders only — `parent_id` is not exposed on the wire.
 */

import { apiFetch } from "./client";
import type {
  Folder,
  FolderCreateInput,
  FolderUpdateInput,
} from "./types";

interface FolderListResponse {
  folders: Folder[];
}

interface FolderResponse {
  folder: Folder;
}

/** GET /vaults/:vaultId/folders */
export async function listFolders(
  vaultId: string,
  signal?: AbortSignal,
): Promise<Folder[]> {
  const res = await apiFetch<FolderListResponse>(
    `/vaults/${encodeURIComponent(vaultId)}/folders`,
    { signal },
  );
  return res.folders;
}

/** POST /vaults/:vaultId/folders — caller needs manager/editor/user role. */
export async function createFolder(
  vaultId: string,
  input: FolderCreateInput,
): Promise<Folder> {
  const res = await apiFetch<FolderResponse>(
    `/vaults/${encodeURIComponent(vaultId)}/folders`,
    { method: "POST", body: input },
  );
  return res.folder;
}

/** PATCH /folders/:id */
export async function updateFolder(
  id: string,
  input: FolderUpdateInput,
): Promise<Folder> {
  const res = await apiFetch<FolderResponse>(
    `/folders/${encodeURIComponent(id)}`,
    { method: "PATCH", body: input },
  );
  return res.folder;
}

/** DELETE /folders/:id — 204 on success. Item rows have folderId SET NULL. */
export async function deleteFolder(id: string): Promise<void> {
  await apiFetch<void>(`/folders/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
