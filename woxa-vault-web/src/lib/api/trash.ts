/**
 * Trash endpoints — org-wide soft-delete recovery.
 *
 * All /trash routes are admin+ only (org owner|admin). The backend already
 * computes `purgeAt` (deletedAt + 30 days; informational, no auto-purge) and
 * returns items newest-first. Deleting an item elsewhere in the app now
 * SOFT-deletes it, so deleted items land here.
 *
 * Errors (ApiError): 401 unauthorized, 403 forbidden (non-admin),
 * 404 not_found (no workspace / id not a trashed item in this org),
 * 400 validation_error.
 */

import { apiFetch } from "./client";

export interface TrashItem {
  id: string;
  vaultId: string;
  vaultName: string;
  type: "login" | "note";
  name: string;
  username: string | null;
  deletedAt: string;
  deletedBy: { id: string; displayName: string } | null;
  purgeAt: string;
}

interface TrashListResponse {
  items: TrashItem[];
}

interface RestoreResponse {
  item: { id: string; vaultId: string; name: string };
}

interface EmptyResponse {
  purged: number;
}

/** GET /trash — org-wide trashed items, newest first. */
export async function listTrash(signal?: AbortSignal): Promise<TrashItem[]> {
  const res = await apiFetch<TrashListResponse>("/trash", { signal });
  return res.items;
}

/** POST /trash/:id/restore — un-delete; item reappears in its vault. */
export async function restoreTrashItem(
  id: string,
): Promise<RestoreResponse["item"]> {
  const res = await apiFetch<RestoreResponse>(
    `/trash/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
  return res.item;
}

/** DELETE /trash/:id — permanent, irreversible delete (204 on success). */
export async function purgeTrashItem(id: string): Promise<void> {
  await apiFetch<void>(`/trash/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** POST /trash/empty — permanently delete ALL trashed items in the org. */
export async function emptyTrash(): Promise<EmptyResponse> {
  return apiFetch<EmptyResponse>("/trash/empty", { method: "POST" });
}
