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
  ItemType,
  ItemUpdateInput,
  ItemVersionContent,
  ItemVersionListResponse,
  VaultRole,
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

/**
 * GET /items/:id/versions — password version history, newest first, capped at
 * 10 (US-015 / FR-037). Metadata only; never returns secret content. The
 * `canReveal` flag is `false` for an effective viewer/auditor so the UI can
 * hide the per-version reveal action. A 404 means no access to the item.
 */
export async function listItemVersions(
  id: string,
  signal?: AbortSignal,
): Promise<ItemVersionListResponse> {
  return apiFetch<ItemVersionListResponse>(
    `/items/${encodeURIComponent(id)}/versions`,
    { signal },
  );
}

/**
 * GET /items/:id/versions/:version — reveal a single historical version's
 * content. Gated server-side by reveal access + an unlocked vault.
 *   - Phase A (encryptionVersion=1): `password` / `notes` come back decrypted.
 *   - ZK (encryptionVersion=2): `passwordCiphertext` / `notesCiphertext` come
 *     back instead; the client decrypts with the vault key.
 * Errors: 403 for viewer/auditor, 404 for an unknown version.
 */
export async function getItemVersion(
  id: string,
  version: number,
  signal?: AbortSignal,
): Promise<ItemVersionContent> {
  return apiFetch<ItemVersionContent>(
    `/items/${encodeURIComponent(id)}/versions/${version}`,
    { signal },
  );
}

/**
 * One row of the "secrets need rotation" dashboard feed (US-060 / AC-060.2).
 * Metadata only — NEVER any secret material. For v2 items `name` is `""` and
 * the client decrypts `nameCiphertext` with the vault key.
 */
export interface RotationDueItem {
  id: string;
  vaultId: string;
  vaultName: string;
  type: ItemType;
  name: string;
  nameCiphertext: string | null;
  nameIv: string | null;
  rotationStatus: "due" | "overdue";
  rotationDueAt: string;
  rotationPolicyDays: number | null;
  passwordChangedAt: string;
  effectiveRole: VaultRole;
}

export interface RotationDueResponse {
  items: RotationDueItem[];
  counts: { due: number; overdue: number; total: number };
}

/**
 * GET /items/rotation-due (US-060 / AC-060.2) — items in the active workspace
 * whose password is due/overdue under the effective policy, plus counts.
 * RBAC-filtered to reachable items; not audited (a count is not a reveal).
 * Sorted overdue-first, then soonest-due.
 */
export async function listRotationDue(
  signal?: AbortSignal,
): Promise<RotationDueResponse> {
  return apiFetch<RotationDueResponse>("/items/rotation-due", { signal });
}

/** DELETE /items/:id — 204 on success. */
export async function deleteItem(id: string): Promise<void> {
  await apiFetch<void>(`/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Result envelope for POST /items/bulk — 200 even on partial/total failure. */
export interface BulkItemsResult {
  success: string[];
  failed: { id: string; reason: string }[];
}

/**
 * Payload for the bulk "share" action. Grants `role` to exactly one principal —
 * either `userId` OR `teamId`, never both — across every selected item. The
 * backend skips items the caller can't share (reason `forbidden`) and reports
 * them in `failed` rather than aborting the whole batch (AC-052.5).
 */
export interface BulkSharePayload {
  role: "manager" | "editor" | "user" | "viewer";
  userId?: string;
  teamId?: string;
}

/**
 * POST /items/bulk — execute a batch action (delete, move, share) on multiple
 * items. Always resolves with a `{ success, failed }` report (200) even when
 * some or all items fail; only a transport/auth error throws.
 */
export async function bulkItems(
  action: "delete" | "move" | "share",
  itemIds: string[],
  payload?: { folderId?: string | null; vaultId?: string } | BulkSharePayload,
): Promise<BulkItemsResult> {
  return apiFetch<BulkItemsResult>("/items/bulk", {
    method: "POST",
    body: { action, itemIds, payload },
  });
}
