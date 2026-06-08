/**
 * Global item search — backs the Cmd+K palette (US-017 / AC-017.2/.3/.5).
 *
 * Backend: woxa-vault-api/src/routes/search.ts. Phase A is SERVER-SIDE search
 * over PLAINTEXT metadata only (name / username / url / type). Passwords,
 * notes and tags are encrypted, so they are intentionally NOT searchable.
 *
 * The server already:
 *  - scopes results to the active workspace,
 *  - filters to items the caller can access (RBAC, most-specific-wins),
 *  - sorts by AC-017.3 priority (exact name > recently used > alphabetical).
 * The frontend MUST NOT re-sort or re-filter.
 *
 * `q` must be 1-200 chars; out-of-range queries 400. Callers debounce and only
 * fire once `q` is long enough, then swallow a stray 400 silently rather than
 * surfacing it as an error toast.
 */

import { apiFetch } from "./client";
import type { ItemType, VaultRole } from "./types";

export interface SearchResult {
  id: string;
  vaultId: string;
  vaultName: string;
  folderId: string | null;
  type: ItemType;
  name: string;
  username: string | null;
  url: string | null;
  hasPassword: boolean;
  hasNotes: boolean;
  lastUsedAt: string | null;
  updatedAt: string;
  effectiveRole: VaultRole;

  /**
   * Phase C ZK (v2 vaults — FR-043). Blind-search rows carry the metadata
   * ciphertext; `name` is `""` and `username`/`url` are null. The client
   * decrypts these with the matching vault key for display. v1 rows leave them
   * null and use the plaintext columns above.
   */
  nameCiphertext?: string | null;
  nameIv?: string | null;
  usernameCiphertext?: string | null;
  usernameIv?: string | null;
  urlCiphertext?: string | null;
  urlIv?: string | null;
}

interface SearchResponse {
  results: SearchResult[];
}

/**
 * GET /search?q=&limit= — returns up to `limit` (default 20, max 50) matches
 * the caller can access in the active workspace. Returns `[]` when there is no
 * active workspace or nothing matches.
 */
export async function searchItems(
  q: string,
  opts?: { limit?: number; signal?: AbortSignal },
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q });
  if (opts?.limit) params.set("limit", String(opts.limit));
  const res = await apiFetch<SearchResponse>(`/search?${params.toString()}`, {
    signal: opts?.signal,
  });
  return res.results;
}

/**
 * POST /search/blind — zero-knowledge blind-index search over v2 vaults
 * (FR-043 / AC-017.2 / NFR-032). `terms` are opaque base64 HMAC tokens the
 * client computed per-vault (a single call may carry tokens for several v2
 * vaults; the server matches any). Returns the SAME row shape as GET /search,
 * with v2 rows carrying ciphertext metadata for the client to decrypt.
 */
export async function searchBlindItems(
  terms: string[],
  opts?: { limit?: number; signal?: AbortSignal },
): Promise<SearchResult[]> {
  if (terms.length === 0) return [];
  const res = await apiFetch<SearchResponse>("/search/blind", {
    method: "POST",
    body: { terms, limit: opts?.limit },
    signal: opts?.signal,
  });
  return res.results;
}
