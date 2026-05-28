/**
 * Items overlay — wraps the raw items API with the meta encode/decode
 * workaround so call sites can pretend the backend already has full type
 * support.
 *
 * Read `src/lib/item-meta.ts` for the rationale. This file is the seam
 * between the round-2 wire shape (login/note only) and the rich item shape
 * the UI wants to render (six types + folder + tags + favorite + totp +
 * custom fields).
 *
 * When the backend ships round-2.2, every function here can be reduced to a
 * direct `apiFetch` call.
 */

import {
  createItem as apiCreate,
  getItem as apiGet,
  getItemPassword as apiGetPassword,
  listItems as apiList,
  updateItem as apiUpdate,
  deleteItem as apiDelete,
} from "@/lib/api/items";
import type {
  ItemCreateInput,
  ItemFull,
  ItemSummary,
  ItemUpdateInput,
  VaultRole,
} from "@/lib/api/types";
import {
  DEFAULT_META,
  decodeMeta,
  encodeMeta,
  wireTypeFor,
  type CardData,
  type CustomField,
  type DisplayKind,
  type IdentityData,
  type ItemMeta,
  type SshData,
} from "@/lib/item-meta";
import {
  deleteSummaryMeta,
  getSummaryMeta,
  setSummaryMeta,
  type CachedSummaryMeta,
} from "@/lib/item-meta-cache";

import {
  encryptData,
  decryptData,
  fromBase64,
  toBase64,
} from "@/lib/crypto-client";

/* ===================================================================
   Display shapes — these are what UI components actually want to read.
   =================================================================== */

/**
 * List view shape. `displayKind` / tags / favorite still come from the local
 * summary cache (round 2 wire doesn't surface them yet). `folderId`, however,
 * is now first-class on the wire — we prefer the wire value over the cache
 * so cross-browser folder assignments stay in sync.
 */
export interface DisplayItemSummary extends ItemSummary {
  displayKind: DisplayKind;
  displayTags: string[];
  displayFavorite: boolean;
  displayHasTotp: boolean;
  displayHasCustomFields: boolean;
  /**
   * The caller's effective role on this item ("most specific wins"). Falls back
   * to the wire `effectiveRole`, then "manager" so legacy responses (which omit
   * it) keep their existing full-access affordances. Callers that know the vault
   * role can pass it via `withVaultRole` to make the fallback the vault role.
   */
  displayEffectiveRole: VaultRole;
}

/** Detail view shape — meta + cleaned notes. */
export interface DisplayItemFull extends DisplayItemSummary {
  password: string | null;
  url: string | null;
  username: string | null;
  /** notes after stripping the meta header */
  notesPlain: string;
  totpSecret: string | null;
  customFields: CustomField[];
  card?: CardData;
  identity?: IdentityData;
  ssh?: SshData;
}

/* ===================================================================
   Helpers
   =================================================================== */

function decorateSummary(item: ItemSummary): DisplayItemSummary {
  const cached = getSummaryMeta(item.id);
  return {
    ...item,
    // folderId now comes from the wire; the cache value is only a hint when
    // the wire has nothing for an old item.
    folderId: item.folderId ?? cached?.folderId ?? null,
    displayKind: cached?.displayKind ?? item.type,
    displayTags: cached?.tags ?? [],
    displayFavorite: cached?.favorite ?? item.favorite,
    displayHasTotp: cached?.hasTotp ?? item.hasTotp,
    displayHasCustomFields: cached?.hasCustomFields ?? false,
    // Wire value wins; fall back to full access for legacy responses that omit
    // it (callers can re-base the fallback to the vault role via withVaultRole).
    displayEffectiveRole: item.effectiveRole ?? "manager",
  };
}

function cacheFromMeta(meta: ItemMeta): CachedSummaryMeta {
  return {
    displayKind: meta.displayKind,
    folderId: meta.folderId,
    tags: meta.tags,
    favorite: meta.favorite,
    hasTotp: Boolean(meta.totpSecret),
    hasCustomFields: meta.customFields.length > 0,
  };
}

function emptyMeta(displayKind: DisplayKind): ItemMeta {
  return { ...DEFAULT_META, displayKind };
}

/* ===================================================================
   Public surface
   =================================================================== */

export async function listDisplayItems(
  vaultId: string,
  signal?: AbortSignal,
): Promise<DisplayItemSummary[]> {
  const items = await apiList(vaultId, signal);
  return items.map(decorateSummary);
}

export async function getDisplayItem(
  id: string,
  signal?: AbortSignal,
  vaultKey?: Uint8Array,
): Promise<DisplayItemFull> {
  const item = await apiGet(id, signal);
  
  let decryptedNotes = item.notes || "";
  if (vaultKey && item.notesCiphertext && item.notesIv) {
    const combined = fromBase64(item.notesCiphertext);
    decryptedNotes = await decryptData({
      ciphertext: combined.slice(0, -16),
      authTag: combined.slice(-16),
      iv: fromBase64(item.notesIv),
    }, vaultKey);
  }

  const { meta, notes } = decodeMeta(decryptedNotes, item.type);

  // Re-seed the summary cache so list views in this browser render the
  // correct kind/folder/tags immediately on next render.
  setSummaryMeta(item.id, cacheFromMeta(meta));

  return buildDisplay(item, meta, notes);
}

/**
 * Reveal the decrypted password for an item — the ONLY reveal path. Logs an
 * `item.reveal` audit event server-side, so callers must trigger it from a
 * user action (show / copy / open-edit), never on mount. Returns null when the
 * item has no stored password.
 */
export async function getItemPassword(
  id: string,
  signal?: AbortSignal,
  vaultKey?: Uint8Array,
): Promise<string | null> {
  const res = await apiGetPassword(id, signal);
  
  // Phase C: If ZK, decrypt on client
  if (vaultKey && "passwordCiphertext" in res && res.passwordCiphertext && res.passwordIv) {
    const combined = fromBase64(res.passwordCiphertext as string);
    return await decryptData({
      ciphertext: combined.slice(0, -16),
      authTag: combined.slice(-16),
      iv: fromBase64(res.passwordIv as string),
    }, vaultKey);
  }

  // Phase A: Server returned plaintext
  return (res as { password: string | null }).password;
}

function buildDisplay(
  item: ItemFull,
  meta: ItemMeta,
  cleanNotes: string,
): DisplayItemFull {
  return {
    ...decorateSummary(item),
    displayKind: meta.displayKind,
    // Wire wins for folderId; meta fallback only matters for legacy items
    // that pre-date the folders endpoint.
    folderId: item.folderId ?? meta.folderId,
    displayTags: meta.tags,
    displayFavorite: meta.favorite,
    displayHasTotp: Boolean(meta.totpSecret),
    displayHasCustomFields: meta.customFields.length > 0,
    password: item.password,
    url: item.url,
    username: item.username,
    notesPlain: cleanNotes,
    totpSecret: meta.totpSecret,
    customFields: meta.customFields,
    card: meta.card,
    identity: meta.identity,
    ssh: meta.ssh,
  };
}

/* ===================================================================
   Create / update
   =================================================================== */

export interface CreateInput {
  vaultId: string;
  displayKind: DisplayKind;
  name: string;
  /** plain user notes (without meta header) */
  notes?: string;
  /** primary login fields */
  username?: string;
  password?: string;
  url?: string;
  /** richer meta */
  folderId?: string | null;
  tags?: string[];
  favorite?: boolean;
  totpSecret?: string | null;
  customFields?: CustomField[];
  card?: CardData;
  identity?: IdentityData;
  ssh?: SshData;
  
  /** Phase C: Zero-Knowledge */
  vaultKey?: Uint8Array;
}

export async function createDisplayItem(
  input: CreateInput,
): Promise<DisplayItemSummary> {
  const meta: ItemMeta = {
    displayKind: input.displayKind,
    folderId: input.folderId ?? null,
    tags: input.tags ?? [],
    favorite: input.favorite ?? false,
    totpSecret: input.totpSecret ?? null,
    customFields: input.customFields ?? [],
    card: input.card,
    identity: input.identity,
    ssh: input.ssh,
  };

  // For api_key/ssh we route the primary secret into the password column so
  // it inherits the existing reveal/audit path. Other types' secrets live in
  // the encrypted notes meta.
  let wirePassword: string | null = input.password ?? null;
  const wireType = wireTypeFor(input.displayKind);
  const userNotes = (input.notes ?? "").trim();
  const wireNotes = encodeMeta(meta, userNotes);

  const payload: ItemCreateInput = {
    type: wireType,
    name: input.name,
    username:
      input.displayKind === "login" || input.displayKind === "api_key"
        ? (input.username ?? null)
        : null,
    url: input.displayKind === "login" ? (input.url ?? null) : null,
    password: null, // Set below
    notes: null,    // Set below
    folderId: input.folderId ?? null,
  };

  if (input.vaultKey) {
    // Phase C: Client-side encryption
    if (wirePassword) {
      const enc = await encryptData(wirePassword, input.vaultKey);
      // Combine ciphertext + tag
      const combined = new Uint8Array(enc.ciphertext.length + enc.authTag.length);
      combined.set(enc.ciphertext);
      combined.set(enc.authTag, enc.ciphertext.length);
      payload.passwordCiphertext = toBase64(combined);
      payload.passwordIv = toBase64(enc.iv);
    }
    if (wireNotes) {
      const enc = await encryptData(wireNotes, input.vaultKey);
      const combined = new Uint8Array(enc.ciphertext.length + enc.authTag.length);
      combined.set(enc.ciphertext);
      combined.set(enc.authTag, enc.ciphertext.length);
      payload.notesCiphertext = toBase64(combined);
      payload.notesIv = toBase64(enc.iv);
    }
  } else {
    // Phase A: Server-side mode
    payload.password = wirePassword;
    payload.notes = wireNotes;
  }

  const created = await apiCreate(input.vaultId, payload);
  setSummaryMeta(created.id, cacheFromMeta(meta));
  return decorateSummary(created);
}

export interface UpdateInput {
  /** plain user notes (without meta header) */
  notes?: string;
  username?: string | null;
  password?: string | null;
  url?: string | null;
  
  /** Phase C: Zero-Knowledge */
  vaultKey?: Uint8Array;
}

/**
 * Update the meta + plain values together. Caller supplies the *desired*
 * full meta (typically derived from a form's current state); this helper
 * encodes the combined notes blob and PATCHes.
 *
 * The full notes blob is always sent (we don't try to diff inside the
 * encrypted blob — the wire is opaque). Other fields are sent only if
 * they differ from the current values, per backend's omit-vs-null contract.
 */
export async function updateDisplayItem(
  current: DisplayItemFull,
  next: {
    name: string;
    notes: string;
    username: string;
    password: string;
    url: string;
    meta: ItemMeta;
  },
  vaultKey?: Uint8Array,
): Promise<void> {
  const patch: ItemUpdateInput = {};

  if (next.name.trim() !== current.name) patch.name = next.name.trim();

  // Folder placement now lives on the wire — diff against the current row.
  // `null` clears the assignment, omitting the key leaves it alone.
  const nextFolderId = next.meta.folderId ?? null;
  if (nextFolderId !== (current.folderId ?? null)) {
    patch.folderId = nextFolderId;
  }

  // Username only meaningful for login/api_key kinds
  const usernameRelevant =
    next.meta.displayKind === "login" || next.meta.displayKind === "api_key";
  const currentUsername = current.username ?? "";
  if (usernameRelevant) {
    if (next.username !== currentUsername) {
      patch.username = next.username.trim() ? next.username.trim() : null;
    }
  } else if (currentUsername) {
    patch.username = null;
  }

  // URL only for login
  const urlRelevant = next.meta.displayKind === "login";
  const currentUrl = current.url ?? "";
  if (urlRelevant) {
    if (next.url !== currentUrl) {
      patch.url = next.url.trim() ? next.url.trim() : null;
    }
  } else if (currentUrl) {
    patch.url = null;
  }

  // Password for login / api_key / ssh
  const passwordRelevant =
    next.meta.displayKind === "login" ||
    next.meta.displayKind === "api_key" ||
    next.meta.displayKind === "ssh";
  const currentPassword = current.password ?? "";
  
  let wirePassword: string | null = null;
  if (passwordRelevant) {
    if (next.password !== currentPassword) {
      wirePassword = next.password ? next.password : null;
    }
  } else if (currentPassword) {
    wirePassword = null;
  }

  // Always re-encode notes (the meta blob is opaque to the server,
  // so we send it as part of notes ciphertext on every save).
  const wireNotes = encodeMeta(next.meta, next.notes.trim());

  if (vaultKey) {
    // Phase C: ZK encryption
    if (wirePassword !== undefined) {
      if (wirePassword === null) {
        patch.passwordCiphertext = null;
        patch.passwordIv = null;
      } else {
        const enc = await encryptData(wirePassword, vaultKey);
        const combined = new Uint8Array(enc.ciphertext.length + enc.authTag.length);
        combined.set(enc.ciphertext);
        combined.set(enc.authTag, enc.ciphertext.length);
        patch.passwordCiphertext = toBase64(combined);
        patch.passwordIv = toBase64(enc.iv);
      }
    }
    // Always send notes in ZK mode (since meta is in it)
    const enc = await encryptData(wireNotes, vaultKey);
    const combined = new Uint8Array(enc.ciphertext.length + enc.authTag.length);
    combined.set(enc.ciphertext);
    combined.set(enc.authTag, enc.ciphertext.length);
    patch.notesCiphertext = toBase64(combined);
    patch.notesIv = toBase64(enc.iv);
  } else {
    // Phase A: Server-side mode
    if (wirePassword !== undefined) patch.password = wirePassword;
    patch.notes = wireNotes;
  }

  await apiUpdate(current.id, patch);
  setSummaryMeta(current.id, cacheFromMeta(next.meta));
}

/* ===================================================================
   Convenience setters for list-row affordances
   =================================================================== */

/**
 * Toggle favorite from a list row. Re-fetches the full item to keep the
 * encrypted notes blob in sync (we can't update meta without round-tripping
 * the existing meta). Treat as a reveal — backend audits it.
 *
 * `persist` (default true) controls whether the new favorite state is written
 * back to the server. Favorites live INSIDE the encrypted notes blob, so
 * persisting means a PATCH /items/:id — which the backend blocks for the
 * read-only `guest` role (`blockGuestWrites`). Guests still get a working
 * Favorite toggle: callers pass `persist: false`, so we update only the local
 * (per-browser) meta cache. That keeps a guest's favorites personal to their
 * browser without touching the shared item, which is also the more correct
 * semantic (favorites should be per-user, not global).
 */
export async function toggleFavorite(
  id: string,
  opts?: { persist?: boolean },
): Promise<DisplayItemFull> {
  const persist = opts?.persist ?? true;
  const item = await apiGet(id);
  const { meta, notes } = decodeMeta(item.notes, item.type);
  // Prefer the local cache as the source of truth for the CURRENT state so a
  // guest's browser-local toggles flip correctly across calls (the notes-blob
  // `meta.favorite` is the global value they can't write to).
  const cached = getSummaryMeta(id);
  const currentFavorite = cached?.favorite ?? meta.favorite;
  const nextMeta: ItemMeta = { ...meta, favorite: !currentFavorite };
  if (persist) {
    const encoded = encodeMeta(nextMeta, notes);
    await apiUpdate(id, { notes: encoded });
  }
  setSummaryMeta(id, cacheFromMeta(nextMeta));
  return buildDisplay(item, nextMeta, notes);
}

export async function deleteDisplayItem(id: string): Promise<void> {
  await apiDelete(id);
  deleteSummaryMeta(id);
}

/**
 * Re-base a display item's `displayEffectiveRole` to the vault role when the
 * wire omitted an item-level `effectiveRole`. `decorateSummary` defaults the
 * fallback to "manager" (so legacy responses keep full access); callers that
 * have the vault role on hand should prefer it as the more accurate baseline.
 */
export function withVaultRole<T extends DisplayItemSummary>(
  item: T,
  vaultRole: VaultRole | null | undefined,
): T {
  if (item.effectiveRole) return item;
  return { ...item, displayEffectiveRole: vaultRole ?? item.displayEffectiveRole };
}

/* Re-exports for convenience */
export { emptyMeta };
export type { CustomField, ItemMeta };
