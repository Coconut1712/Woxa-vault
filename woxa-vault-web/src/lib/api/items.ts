/**
 * Item endpoints — see /API_CONTRACT.md ("Endpoints — Items").
 *
 * NOTE (2026-05-18): contract is finalized but backend routes are not deployed
 * yet. Until then pages should keep their mock-data import with
 * `// TODO: swap to API when backend ships`.
 *
 * Important reminders:
 *  - List responses NEVER include decrypted secrets. Use the `hasPassword` /
 *    `hasNotes` flags on `ItemSummary` to drive UI affordances.
 *  - `getItem(id)` is the only call that decrypts. Backend audits an
 *    `item.reveal` event on every successful call — callers should treat it as
 *    a "reveal" action, not a "list/refresh" action.
 *  - For PATCH: send a string to update, `null` to clear, omit the key to leave
 *    the existing ciphertext untouched.
 */

import { apiFetch } from "./client";
import type {
  ItemCreateInput,
  ItemFull,
  ItemSummary,
  ItemUpdateInput,
} from "./types";

interface ItemListResponse {
  items: ItemSummary[];
}

interface ItemSummaryResponse {
  item: ItemSummary;
}

interface ItemFullResponse {
  item: ItemFull;
}

/** GET /vaults/:vaultId/items — list metadata, sorted by updatedAt DESC. */
export async function listItems(
  vaultId: string,
  signal?: AbortSignal,
): Promise<ItemSummary[]> {
  const res = await apiFetch<ItemListResponse>(
    `/vaults/${encodeURIComponent(vaultId)}/items`,
    { signal },
  );
  return res.items;
}

/** POST /vaults/:vaultId/items — caller needs manager/editor/user role. */
export async function createItem(
  vaultId: string,
  input: ItemCreateInput,
): Promise<ItemSummary> {
  const res = await apiFetch<ItemSummaryResponse>(
    `/vaults/${encodeURIComponent(vaultId)}/items`,
    { method: "POST", body: input },
  );
  return res.item;
}

/**
 * GET /items/:id — returns metadata + notes + the `hasPassword` flag, but the
 * decrypted `password` is ALWAYS null here. Opening an item logs an `item.view`
 * audit event ("Item viewed"). To actually reveal the password use
 * `getItemPassword` (the only reveal path).
 */
export async function getItem(
  id: string,
  signal?: AbortSignal,
): Promise<ItemFull> {
  const res = await apiFetch<ItemFullResponse>(
    `/items/${encodeURIComponent(id)}`,
    { signal },
  );
  return res.item;
}

/**
 * GET /items/:id/password — the ONLY reveal path. Returns the decrypted
 * password (or null if the item has none) and logs an `item.reveal` audit
 * event ("Secret revealed") on every successful call. Callers must trigger it
 * ONLY on a user action (show / copy / open-edit), never on mount.
 *
 * Errors (ApiError carries status + code):
 *   - 403 `forbidden` — caller is an effective viewer (no reveal access).
 *   - 404 `not_found` — no access to the item.
 *   - 401 `vault_locked` — the vault is locked; the lock overlay handles it.
 */
export async function getItemPassword(
  id: string,
  signal?: AbortSignal,
): Promise<{ password: string | null } | { passwordCiphertext: string | null; passwordIv: string | null }> {
  return apiFetch<{ password: string | null } | { passwordCiphertext: string | null; passwordIv: string | null }>(
    `/items/${encodeURIComponent(id)}/password`,
    { signal },
  );
}

/**
 * PATCH /items/:id.
 *   `{ password: "secret" }`  → re-encrypt with new value
 *   `{ password: null }`      → clear ciphertext
 *   omit `password`           → leave existing ciphertext untouched
 */
export async function updateItem(
  id: string,
  input: ItemUpdateInput,
): Promise<ItemSummary> {
  const res = await apiFetch<ItemSummaryResponse>(
    `/items/${encodeURIComponent(id)}`,
    { method: "PATCH", body: input },
  );
  return res.item;
}

/** DELETE /items/:id — 204 on success. */
export async function deleteItem(id: string): Promise<void> {
  await apiFetch<void>(`/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * POST /items/bulk — execute a batch action (delete, move, share) on multiple items.
 * returns a report of success vs failed item IDs.
 */
export async function bulkItems(
  action: "delete" | "move" | "share",
  itemIds: string[],
  payload?: { folderId?: string | null; vaultId?: string },
): Promise<{ success: string[]; failed: { id: string; reason: string }[] }> {
  return apiFetch<{ success: string[]; failed: { id: string; reason: string }[] }>(
    "/items/bulk",
    {
      method: "POST",
      body: JSON.stringify({ action, itemIds, payload }),
    },
  );
}
