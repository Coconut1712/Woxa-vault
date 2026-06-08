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
  listItemVersions as apiListVersions,
  getItemVersion as apiGetVersion,
} from "@/lib/api/items";
import { listItemMembers as apiListMembers } from "@/lib/api/grants";
import type {
  ItemCreateInput,
  ItemFull,
  ItemSummary,
  ItemUpdateInput,
  ItemVersionContent,
  ItemVersionListResponse,
  ItemVersionSummary,
  VaultRole,
  VaultMember,
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
  deriveSearchKey,
  computeSearchTerms,
  computeQueryTerms,
} from "@/lib/crypto-client";
import { searchBlindItems, type SearchResult } from "@/lib/api/search";

/**
 * Placeholder shown for a v2 (ZK) item's name when the vault is locked and we
 * therefore have no vault key to decrypt `nameCiphertext`. Rendering this (vs.
 * a blank row) keeps locked lists legible; the real name appears once the user
 * unlocks and the page refetches. The lock emoji is intentional UI affordance,
 * not decorative — it signals "encrypted, unlock to read".
 */
export const ZK_LOCKED_PLACEHOLDER = "🔒";

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
    // Server `type` is authoritative for rich kinds (FR-030); only fall back to
    // the per-browser cache hint when the wire reports the collapsible
    // login/note, so a stale cache can't mislabel a migrated rich item.
    displayKind:
      item.type !== "login" && item.type !== "note"
        ? item.type
        : cached?.displayKind ?? item.type,
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
  vaultKey?: Uint8Array,
): Promise<DisplayItemSummary[]> {
  const items = await apiList(vaultId, signal);
  // Fast path: a row WITHOUT metadata ciphertext (e.g. legacy migration data)
  // passes through its plaintext columns — `decryptItemMeta` handles that case
  // per-row, so a mixed list still renders correctly.
  const hasZk = items.some((it) => it.nameCiphertext);
  if (!hasZk) return items.map(decorateSummary);

  return Promise.all(
    items.map(async (it) => {
      const decoded = await decryptItemMeta(it, vaultKey);
      return decorateSummary({ ...it, ...decoded });
    }),
  );
}

export async function getDisplayItem(
  id: string,
  signal?: AbortSignal,
  vaultKey?: Uint8Array,
): Promise<DisplayItemFull> {
  const item = await apiGet(id, signal);
  
  let decryptedNotes = item.notes || "";
  if (vaultKey && item.notesCiphertext && item.notesIv) {
    decryptedNotes =
      (await decryptZk(item.notesCiphertext, item.notesIv, vaultKey)) ?? "";
  }

  const { meta, notes } = decodeMeta(decryptedNotes, item.type);

  // Re-seed the summary cache so list views in this browser render the
  // correct kind/folder/tags immediately on next render.
  setSummaryMeta(item.id, cacheFromMeta(meta));

  // v2: decrypt the metadata ciphertext (name/username/url) for display. v1
  // rows pass through plaintext. A locked vault (no key) degrades to the 🔒
  // placeholder rather than a blank detail view.
  const decoded = await decryptItemMeta(item, vaultKey);

  return buildDisplay({ ...item, ...decoded }, meta, notes);
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
    return decryptZk(
      res.passwordCiphertext as string,
      res.passwordIv as string,
      vaultKey,
    );
  }

  // Phase A: Server returned plaintext
  return (res as { password: string | null }).password;
}

/**
 * Decrypt one ZK ciphertext+iv pair (base64) with the vault key. The wire packs
 * the GCM auth tag as the trailing 16 bytes of the ciphertext blob — the same
 * layout `getDisplayItem` / `getItemPassword` decode. Returns null when either
 * input is missing (e.g. a version that had no password).
 */
async function decryptZk(
  ciphertext: string | null | undefined,
  iv: string | null | undefined,
  vaultKey: Uint8Array,
): Promise<string | null> {
  if (!ciphertext || !iv) return null;
  const combined = fromBase64(ciphertext);
  return decryptData(
    {
      ciphertext: combined.slice(0, -16),
      authTag: combined.slice(-16),
      iv: fromBase64(iv),
    },
    vaultKey,
  );
}

/**
 * Decrypt a v2 (ZK) item's `nameCiphertext`/`nameIv` for display (e.g. the
 * dashboard rotation widget, which only has the name blob — not a full item).
 * Returns null on a missing/undecryptable blob so callers can fall back to the
 * 🔒 placeholder. Public thin wrapper over the internal `decryptZk`.
 */
export async function decryptZkName(
  ciphertext: string | null | undefined,
  iv: string | null | undefined,
  vaultKey: Uint8Array,
): Promise<string | null> {
  try {
    return await decryptZk(ciphertext, iv, vaultKey);
  } catch {
    return null;
  }
}

/**
 * Encrypt one plaintext value with the vault key into the wire `{ ciphertext,
 * iv }` base64 pair (GCM tag packed as the trailing 16 bytes of the blob — the
 * exact layout `decryptZk` expects).
 */
async function encryptZk(
  plaintext: string,
  vaultKey: Uint8Array,
): Promise<{ ciphertext: string; iv: string }> {
  const enc = await encryptData(plaintext, vaultKey);
  const combined = new Uint8Array(enc.ciphertext.length + enc.authTag.length);
  combined.set(enc.ciphertext);
  combined.set(enc.authTag, enc.ciphertext.length);
  return { ciphertext: toBase64(combined), iv: toBase64(enc.iv) };
}

/**
 * Decrypt the ZK metadata ciphertext (name/username/url) on a summary/full row
 * into display strings. v1 rows (no `nameCiphertext`) pass through their
 * plaintext columns unchanged. v2 rows WITHOUT a key (locked vault) get the
 * 🔒 placeholder for the name and null username/url, so a locked list stays
 * legible instead of rendering blank rows. The backend blanks the plaintext
 * `name`/`username`/`url` for a v2 item, so the ciphertext is the only source.
 */
async function decryptItemMeta(
  row: {
    name: string;
    username: string | null;
    url: string | null;
    nameCiphertext?: string | null;
    nameIv?: string | null;
    usernameCiphertext?: string | null;
    usernameIv?: string | null;
    urlCiphertext?: string | null;
    urlIv?: string | null;
  },
  vaultKey?: Uint8Array,
): Promise<{ name: string; username: string | null; url: string | null }> {
  // v1 / plaintext item: no metadata ciphertext present.
  if (!row.nameCiphertext) {
    return { name: row.name, username: row.username, url: row.url };
  }
  // v2 item but the vault is locked (no key): show a placeholder, don't crash.
  if (!vaultKey) {
    return { name: ZK_LOCKED_PLACEHOLDER, username: null, url: null };
  }
  try {
    const [name, username, url] = await Promise.all([
      decryptZk(row.nameCiphertext, row.nameIv, vaultKey),
      decryptZk(row.usernameCiphertext, row.usernameIv, vaultKey),
      decryptZk(row.urlCiphertext, row.urlIv, vaultKey),
    ]);
    return {
      name: name ?? ZK_LOCKED_PLACEHOLDER,
      username: username,
      url: url,
    };
  } catch {
    // A bad key / corrupt blob shouldn't blank the whole list — degrade to the
    // placeholder for this one row.
    return { name: ZK_LOCKED_PLACEHOLDER, username: null, url: null };
  }
}

/** Reveal-ready version content after any ZK ciphertext has been decrypted. */
export interface DisplayItemVersion {
  version: number;
  type: ItemVersionContent["type"];
  name: string;
  username: string | null;
  url: string | null;
  password: string | null;
  notesPlain: string;
  createdAt: string;
  editedByEmail: string;
}

/**
 * List an item's password version history (US-015 / FR-037). Pure passthrough —
 * metadata only, no decryption. `canReveal` is `false` for viewer/auditor.
 */
export async function listDisplayItemVersions(
  id: string,
  signal?: AbortSignal,
): Promise<ItemVersionListResponse> {
  return apiListVersions(id, signal);
}

/**
 * Reveal a single historical version's content. In ZK mode (vaultKey supplied)
 * the password/notes come back as ciphertext and we decrypt client-side with
 * the SAME helper the item detail uses; in Phase A the server already decrypted
 * them. The notes blob carries the meta header, so we strip it back to plain
 * user notes for display.
 */
export async function getDisplayItemVersion(
  id: string,
  version: number,
  signal?: AbortSignal,
  vaultKey?: Uint8Array,
): Promise<DisplayItemVersion> {
  const v = await apiGetVersion(id, version, signal);

  // ZK detection: in encryptionVersion=2 the server returns only ciphertext
  // (password/notes come back null/empty). If we have ciphertext but no vault
  // key we CANNOT decrypt — surfacing an empty version silently would hide a
  // real failure (the dialog would open showing nothing). Throw so the caller's
  // revealError path shows a meaningful message instead.
  const isZk = Boolean(v.passwordCiphertext || v.notesCiphertext);
  if (isZk && !vaultKey) {
    throw new Error("zk_vault_key_missing");
  }

  let password = v.password;
  let notesRaw = v.notes ?? "";
  // Metadata-ciphertext snapshot (Wave-2a): a v2 version blanks name/username/
  // url and ships them as ciphertext. Legacy v2 snapshots return null here →
  // `decryptItemMeta` falls back to the plaintext fields.
  let name = v.name;
  let username = v.username;
  let url = v.url;
  if (vaultKey) {
    if (v.passwordCiphertext) {
      password = await decryptZk(v.passwordCiphertext, v.passwordIv, vaultKey);
    }
    if (v.notesCiphertext) {
      notesRaw = (await decryptZk(v.notesCiphertext, v.notesIv, vaultKey)) ?? "";
    }
    const decoded = await decryptItemMeta(v, vaultKey);
    name = decoded.name;
    username = decoded.username;
    url = decoded.url;
  }

  const { notes } = decodeMeta(notesRaw, v.type);

  return {
    version: v.version,
    type: v.type,
    name,
    username,
    url,
    password,
    notesPlain: notes,
    createdAt: v.createdAt,
    editedByEmail: v.editedByEmail,
  };
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

  /** US-060 — per-item rotation window in days. null/0/undefined = inherit org default. */
  rotationPolicyDays?: number | null;

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
  const wirePassword: string | null = input.password ?? null;
  const wireType = wireTypeFor(input.displayKind);
  const userNotes = (input.notes ?? "").trim();
  const wireNotes = encodeMeta(meta, userNotes);

  // The searchable username/url depend on the item kind (matches the plaintext
  // mapping below) so the blind index never tokenizes a field the UI hides.
  const wireUsername =
    input.displayKind === "login" || input.displayKind === "api_key"
      ? (input.username ?? null)
      : null;
  const wireUrl = input.displayKind === "login" ? (input.url ?? null) : null;

  const payload: ItemCreateInput = {
    type: wireType,
    name: input.name,
    username: wireUsername,
    url: wireUrl,
    password: null, // Set below
    notes: null,    // Set below
    folderId: input.folderId ?? null,
    // US-060: per-item rotation window. null/0 = inherit org default.
    rotationPolicyDays: input.rotationPolicyDays ?? null,
  };

  if (input.vaultKey) {
    // Phase C: Client-side encryption
    if (wirePassword) {
      const enc = await encryptZk(wirePassword, input.vaultKey);
      payload.passwordCiphertext = enc.ciphertext;
      payload.passwordIv = enc.iv;
    }
    if (wireNotes) {
      const enc = await encryptZk(wireNotes, input.vaultKey);
      payload.notesCiphertext = enc.ciphertext;
      payload.notesIv = enc.iv;
    }

    // ZK metadata: encrypt name/username/url and blank the plaintext columns
    // (the backend requires `name: ""` XOR `nameCiphertext`). Then compute the
    // blind-index terms over the SAME searchable fields + tags.
    payload.name = "";
    const nameEnc = await encryptZk(input.name, input.vaultKey);
    payload.nameCiphertext = nameEnc.ciphertext;
    payload.nameIv = nameEnc.iv;

    if (wireUsername) {
      const enc = await encryptZk(wireUsername, input.vaultKey);
      payload.usernameCiphertext = enc.ciphertext;
      payload.usernameIv = enc.iv;
    }
    payload.username = null;

    if (wireUrl) {
      const enc = await encryptZk(wireUrl, input.vaultKey);
      payload.urlCiphertext = enc.ciphertext;
      payload.urlIv = enc.iv;
    }
    payload.url = null;

    const searchKey = await deriveSearchKey(input.vaultKey, input.vaultId);
    payload.searchTerms = await computeSearchTerms(searchKey, {
      name: input.name,
      username: wireUsername,
      url: wireUrl,
      tags: meta.tags,
    });
  } else {
    // Phase A: Server-side mode
    payload.password = wirePassword;
    payload.notes = wireNotes;
  }

  const created = await apiCreate(input.vaultId, payload);
  setSummaryMeta(created.id, cacheFromMeta(meta));
  // The created summary comes back with name="" / ciphertext for a v2 item;
  // overlay the plaintext we just sent so the caller's optimistic row (e.g. the
  // success toast) shows the real name instead of "".
  if (input.vaultKey) {
    return decorateSummary({
      ...created,
      name: input.name,
      username: wireUsername,
      url: wireUrl,
    });
  }
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
    /** US-060 — per-item rotation window in days. null = inherit org default. */
    rotationPolicyDays?: number | null;
  },
  vaultKey?: Uint8Array,
): Promise<void> {
  const patch: ItemUpdateInput = {};

  if (next.name.trim() !== current.name) patch.name = next.name.trim();

  // US-060 — rotation policy is metadata-only (does not reset passwordChangedAt
  // or snapshot a version). Send only when it actually changed; `null` clears
  // the override back to the org default.
  if (next.rotationPolicyDays !== undefined) {
    const nextRotation = next.rotationPolicyDays ?? null;
    if (nextRotation !== (current.rotationPolicyDays ?? null)) {
      patch.rotationPolicyDays = nextRotation;
    }
  }

  // Item type-change (FR-030). The backend now persists all six types verbatim
  // and accepts `type` on PATCH. We send it ONLY when the kind actually changed
  // so an ordinary edit doesn't carry a redundant type. The per-type secrets
  // (card/ssh/identity/totp/custom fields) still travel encrypted inside the
  // notes meta blob below — changing `type` never moves a secret to plaintext.
  const nextWireType = wireTypeFor(next.meta.displayKind);
  if (nextWireType !== current.type) {
    patch.type = nextWireType;
  }

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

  // Password for login / api_key / ssh.
  //
  // `wirePassword === undefined` means "leave the existing ciphertext untouched"
  // — we then OMIT the password key entirely from the PATCH. This is critical
  // for US-015 / FR-037: the backend only bumps `passwordChangedAt` and snapshots
  // a version when a PATCH carries a non-empty password. If we sent the password
  // on every save (the old `null` default) we'd both wipe an unchanged secret
  // AND, in ZK mode, send `""` (clear). So we send the key ONLY when the value
  // actually changed: a string to set, `null` to clear.
  const passwordRelevant =
    next.meta.displayKind === "login" ||
    next.meta.displayKind === "api_key" ||
    next.meta.displayKind === "ssh";
  const currentPassword = current.password ?? "";

  let wirePassword: string | null | undefined;
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
        // Backend treats a falsy (empty-string) ciphertext as "clear the
        // password" — see PATCH /items/:id (`body.passwordCiphertext ? ... : null`).
        // The wire type is `string`, so send "" rather than null.
        patch.passwordCiphertext = "";
        patch.passwordIv = "";
      } else {
        const enc = await encryptZk(wirePassword, vaultKey);
        patch.passwordCiphertext = enc.ciphertext;
        patch.passwordIv = enc.iv;
      }
    }
    // Always send notes in ZK mode (since meta is in it)
    const notesEnc = await encryptZk(wireNotes, vaultKey);
    patch.notesCiphertext = notesEnc.ciphertext;
    patch.notesIv = notesEnc.iv;

    // ZK metadata (name/username/url): the plaintext diff above wrote `patch.
    // name`/`patch.username`/`patch.url`. In ZK mode those plaintext columns
    // are blank server-side — convert each changed value to its ciphertext form
    // and scrub the plaintext. `patch.x === undefined` means "unchanged" → leave
    // the existing ciphertext untouched (omit the key).
    const nameChanged = patch.name !== undefined;
    const usernameChanged = patch.username !== undefined;
    const urlChanged = patch.url !== undefined;

    if (nameChanged) {
      // Sending nameCiphertext re-encrypts AND blanks the plaintext name to "".
      patch.name = "";
      const enc = await encryptZk(next.name.trim(), vaultKey);
      patch.nameCiphertext = enc.ciphertext;
      patch.nameIv = enc.iv;
    }
    if (usernameChanged) {
      const value = patch.username; // string to set, null to clear
      patch.username = null;
      if (value) {
        const enc = await encryptZk(value, vaultKey);
        patch.usernameCiphertext = enc.ciphertext;
        patch.usernameIv = enc.iv;
      } else {
        patch.usernameCiphertext = null;
        patch.usernameIv = null;
      }
    }
    if (urlChanged) {
      const value = patch.url;
      patch.url = null;
      if (value) {
        const enc = await encryptZk(value, vaultKey);
        patch.urlCiphertext = enc.ciphertext;
        patch.urlIv = enc.iv;
      } else {
        patch.urlCiphertext = null;
        patch.urlIv = null;
      }
    }

    // Blind index: REPLACE the term set only when a searchable field actually
    // changed (name/username/url/tags). Omitting `searchTerms` leaves the index
    // untouched, so a notes-only or folder-only edit doesn't re-index. Tokens
    // are computed over the SAME relevance-filtered values the columns hold.
    const tagsChanged =
      JSON.stringify(next.meta.tags) !== JSON.stringify(current.displayTags);
    if (nameChanged || usernameChanged || urlChanged || tagsChanged) {
      const nextUsername = usernameRelevant ? next.username.trim() || null : null;
      const nextUrl = urlRelevant ? next.url.trim() || null : null;
      const searchKey = await deriveSearchKey(vaultKey, current.vaultId);
      patch.searchTerms = await computeSearchTerms(searchKey, {
        name: next.name.trim(),
        username: nextUsername,
        url: nextUrl,
        tags: next.meta.tags,
      });
    }
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
 *
 * v2 (ZK) items carry the meta INSIDE `notesCiphertext`. To persist a favorite
 * we must decrypt the notes blob with the vault key, flip the flag, and
 * re-encrypt — so the caller passes `vaultKey`. We omit `searchTerms` from the
 * PATCH because favorite is not a searchable field (the blind index is
 * untouched). If the vault is locked (no key) we can't persist: we throw a
 * `VaultLockedError` so the caller can prompt the user to unlock instead of
 * silently flipping a browser-local-only state.
 */
export class VaultLockedError extends Error {
  constructor() {
    super("vault_locked");
    this.name = "VaultLockedError";
  }
}

export async function toggleFavorite(
  id: string,
  opts?: { persist?: boolean; vaultKey?: Uint8Array | null },
): Promise<DisplayItemFull> {
  const persist = opts?.persist ?? true;
  const item = await apiGet(id);
  const isZk = Boolean(item.notesCiphertext);

  // For a v2 item the notes blob is ciphertext — decrypt it with the vault key
  // so we read the CURRENT meta (favorite lives in it). v1 items expose the
  // blob in plaintext `notes`.
  let notesRaw = item.notes ?? "";
  if (isZk && opts?.vaultKey && item.notesCiphertext) {
    // A present notes blob MUST decrypt: decoding "" then re-encoding would wipe
    // the meta header (favorite/tags/customFields) AND the user's notes. If the
    // key is wrong/stale (decrypt → null) we throw so the caller can prompt for
    // a re-unlock instead of silently destroying the blob.
    const decrypted = await decryptZk(item.notesCiphertext, item.notesIv, opts.vaultKey);
    if (decrypted === null) throw new VaultLockedError();
    notesRaw = decrypted;
  }
  const { meta, notes } = decodeMeta(notesRaw, item.type);

  // Prefer the local cache as the source of truth for the CURRENT state so a
  // guest's browser-local toggles flip correctly across calls (the notes-blob
  // `meta.favorite` is the global value they can't write to).
  const cached = getSummaryMeta(id);
  const currentFavorite = cached?.favorite ?? meta.favorite;
  const nextMeta: ItemMeta = { ...meta, favorite: !currentFavorite };

  if (persist) {
    if (isZk) {
      // ZK persist requires the vault key to re-encrypt the meta blob. A locked
      // vault (no key) can't persist — surface it so the caller prompts unlock
      // rather than silently keeping a browser-only toggle.
      if (!opts?.vaultKey) throw new VaultLockedError();
      const encoded = encodeMeta(nextMeta, notes);
      const enc = await encryptZk(encoded, opts.vaultKey);
      // Omit searchTerms — favorite is not searchable, so the blind index stays.
      await apiUpdate(id, { notesCiphertext: enc.ciphertext, notesIv: enc.iv });
    } else {
      const encoded = encodeMeta(nextMeta, notes);
      await apiUpdate(id, { notes: encoded });
    }
  }
  setSummaryMeta(id, cacheFromMeta(nextMeta));
  return buildDisplay(item, nextMeta, notes);
}

export async function deleteDisplayItem(id: string): Promise<void> {
  await apiDelete(id);
  deleteSummaryMeta(id);
}

/* ===================================================================
   Search (v2 ZK blind index) — FR-043 / AC-017.2 / NFR-032
   =================================================================== */

/** A search vault descriptor the orchestrator needs to route a query. */
export interface SearchVaultRef {
  id: string;
}

export interface SearchOutcome {
  results: SearchResult[];
  /**
   * True when at least one v2 (ZK) vault was skipped because it was locked
   * (no key available). The UI surfaces a "unlock to search encrypted vaults"
   * hint rather than silently omitting those items.
   */
  hadLockedZkVault: boolean;
}

/**
 * Run a global search across every zero-knowledge vault via the blind-index
 * path and merge client-side (FR-043).
 *
 * Tokenize the query, then HMAC each token under EACH unlocked vault's per-vault
 * search key (the same word yields a different digest per vault). Union the
 * per-vault tokens into ONE `POST /search/blind`. Decrypt the returned
 * ciphertext metadata with the matching vault key for display. Locked vaults are
 * skipped (no key) and flagged via `hadLockedZkVault`.
 *
 * The server already RBAC-filters and ranks results; we render them as-is — no
 * client re-sort, matching the contract's "merge client-side" guidance.
 */
export async function searchAllItems(
  query: string,
  vaults: SearchVaultRef[],
  getVaultKey: (vaultId: string) => Promise<Uint8Array | null>,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  // Derive a key per vault, tokenize the query under each. Track which vaults we
  // actually got a key for so we can decrypt their rows and report locked ones.
  const keyByVault = new Map<string, Uint8Array>();
  let hadLockedZkVault = false;
  const termSet = new Set<string>();

  await Promise.all(
    vaults.map(async (v) => {
      const key = await getVaultKey(v.id);
      if (!key) {
        hadLockedZkVault = true;
        return;
      }
      keyByVault.set(v.id, key);
      const searchKey = await deriveSearchKey(key, v.id);
      const terms = await computeQueryTerms(searchKey, query);
      for (const t of terms) termSet.add(t);
    }),
  );

  const v2Raw: SearchResult[] =
    termSet.size > 0
      ? await searchBlindItems([...termSet], { signal }).catch(() => [])
      : [];

  // Decrypt rows' metadata with the matching vault key. A row whose vault we
  // somehow lack a key for (shouldn't happen — we only sent its tokens if we
  // had the key) degrades to the placeholder rather than blank.
  const results = await Promise.all(
    v2Raw.map(async (row) => {
      const key = keyByVault.get(row.vaultId);
      const decoded = await decryptItemMeta(row, key);
      return { ...row, ...decoded };
    }),
  );

  return { results, hadLockedZkVault };
}

/** Wrapper for item member list. */
export async function getDisplayItemMembers(
  itemId: string,
  signal?: AbortSignal,
): Promise<{ members: VaultMember[] }> {
  // `listItemMembers` already unwraps the response to a bare array; re-wrap so
  // the consumer-facing shape (`{ members }`) stays stable.
  return { members: await apiListMembers(itemId, signal) };
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
export type {
  CustomField,
  ItemMeta,
  VaultMember,
  ItemVersionSummary,
  ItemVersionListResponse,
};
