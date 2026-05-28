/**
 * Item metadata overlay — workaround for round-2 API limitations.
 *
 * ## Why this exists
 *
 * The backend `ItemType` enum in round 2 is `"login" | "note"` only, and there
 * is no storage for folders, tags, favorites, TOTP secrets, or custom fields.
 * The mockup, however, shows six item types plus all of those fields.
 *
 * Until the backend ships the schema delta described in
 * `/API_CONTRACT.md` ("Item type expansion (round 2.2)" + folders endpoint),
 * the frontend stashes the missing metadata as a JSON header line at the top
 * of the encrypted `notes` ciphertext. Because the entire notes field is
 * already end-to-end-encrypted, the meta payload inherits that protection
 * without any server-side change.
 *
 * ## Wire shape
 *
 * notes_ciphertext (after backend decrypt) =
 *   "__WOXA_META__:" + JSON.stringify(meta) + "\n" + actualUserNotes
 *
 * On read we `decodeMeta(notes)` once and present the result as if it came
 * from a dedicated wire field. On write we `encodeMeta(meta, userNotes)` and
 * send the combined string as `notes` in the API payload.
 *
 * Backwards compatibility: items created before the overlay landed simply
 * have no sentinel and round-trip as `{ meta: defaults, notes: original }`.
 *
 * ## Migration path
 *
 * When the backend adds real columns for displayKind / tags / totp / etc,
 * the read path can decode meta from the new columns first and fall back to
 * the overlay. New writes can drop the overlay once every existing row has
 * been migrated. See API_CONTRACT.md "Item type expansion (round 2.2)".
 */

import type { ItemSummary, ItemFull, ItemType as ApiItemType } from "@/lib/api/types";

/** Mockup-era item types — only `login` and `note` round-trip to the wire. */
export type DisplayKind =
  | "login"
  | "note"
  | "api_key"
  | "ssh"
  | "card"
  | "identity";

export interface CustomField {
  name: string;
  value: string;
  type: "text" | "secret";
}

export interface CardData {
  cardholder?: string;
  cardNumber?: string;
  expiry?: string;
  cvv?: string;
}

export interface IdentityData {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface SshData {
  publicKey?: string;
  passphrase?: string;
}

export interface ItemMeta {
  /** What the user *wants* this item to render as. */
  displayKind: DisplayKind;
  /**
   * Legacy folder placement carried inside the encrypted meta blob. The
   * source of truth is now `ItemSummary.folderId` (round 2.x folders
   * endpoint); we keep the field here so older ciphertexts decode without
   * loss, but new writes also send `folderId` on the wire.
   */
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  totpSecret: string | null;
  customFields: CustomField[];
  card?: CardData;
  identity?: IdentityData;
  ssh?: SshData;
}

export const META_SENTINEL = "__WOXA_META__:";

export const DEFAULT_META: ItemMeta = {
  displayKind: "login",
  folderId: null,
  tags: [],
  favorite: false,
  totpSecret: null,
  customFields: [],
};

/**
 * Parse the notes ciphertext into `{ meta, notes }`.
 *
 * - If the first line begins with the sentinel → strip + JSON-parse it.
 * - Otherwise the whole string is user-authored notes and meta is defaults.
 * - On parse error we treat the input as legacy notes and never throw, so a
 *   single malformed item can't break the whole list.
 */
export function decodeMeta(
  notes: string | null,
  wireType: ApiItemType,
): { meta: ItemMeta; notes: string } {
  const defaults: ItemMeta = { ...DEFAULT_META, displayKind: wireType };
  if (!notes) return { meta: defaults, notes: "" };

  const newlineIdx = notes.indexOf("\n");
  const firstLine = newlineIdx === -1 ? notes : notes.slice(0, newlineIdx);
  const rest = newlineIdx === -1 ? "" : notes.slice(newlineIdx + 1);

  if (!firstLine.startsWith(META_SENTINEL)) {
    return { meta: defaults, notes };
  }

  try {
    const raw = JSON.parse(firstLine.slice(META_SENTINEL.length)) as Partial<ItemMeta>;
    return {
      meta: {
        displayKind: raw.displayKind ?? wireType,
        folderId: raw.folderId ?? null,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        favorite: Boolean(raw.favorite),
        totpSecret: raw.totpSecret ?? null,
        customFields: Array.isArray(raw.customFields) ? raw.customFields : [],
        card: raw.card,
        identity: raw.identity,
        ssh: raw.ssh,
      },
      notes: rest,
    };
  } catch {
    return { meta: defaults, notes };
  }
}

/**
 * Encode `{ meta, notes }` back into a single ciphertext-bound string.
 *
 * Empty/default meta still emits a sentinel so subsequent decodes are
 * deterministic. Callers should pass `null`/empty notes when the item has
 * no user-authored text — we won't append a trailing newline in that case.
 */
export function encodeMeta(meta: ItemMeta, userNotes: string): string {
  // Drop noisy defaults from the serialized blob so legacy-ish items stay
  // small on the wire. Booleans/strings only — we don't compact arrays.
  const payload: Partial<ItemMeta> = { displayKind: meta.displayKind };
  if (meta.folderId) payload.folderId = meta.folderId;
  if (meta.tags.length) payload.tags = meta.tags;
  if (meta.favorite) payload.favorite = true;
  if (meta.totpSecret) payload.totpSecret = meta.totpSecret;
  if (meta.customFields.length) payload.customFields = meta.customFields;
  if (meta.card && Object.values(meta.card).some(Boolean)) payload.card = meta.card;
  if (meta.identity && Object.values(meta.identity).some(Boolean)) payload.identity = meta.identity;
  if (meta.ssh && Object.values(meta.ssh).some(Boolean)) payload.ssh = meta.ssh;

  const header = META_SENTINEL + JSON.stringify(payload);
  return userNotes ? `${header}\n${userNotes}` : header;
}

/**
 * Round-2 wire type for a given display kind.
 *
 * `login` / `api_key` / `ssh` have a primary secret that maps cleanly to the
 * password column. Everything else (note / card / identity) goes to `note`.
 */
export function wireTypeFor(displayKind: DisplayKind): ApiItemType {
  switch (displayKind) {
    case "login":
    case "api_key":
    case "ssh":
      return "login";
    case "note":
    case "card":
    case "identity":
      return "note";
  }
}

/**
 * Pull the meta off an ItemSummary. Lists don't carry notes ciphertext (only
 * `hasNotes`), so we can only recover defaults + wire type here. UI that needs
 * the meta (folder filter, type icon, tags badge) should call `getItem` on
 * demand, or accept that list affordances are best-effort.
 *
 * For accuracy we additionally encode a `_summaryMeta` hint into the item's
 * `username` field. Actually no — that would leak into the DB unencrypted. We
 * just live with defaults for list views and re-resolve on detail.
 */
export function summaryMeta(item: ItemSummary): ItemMeta {
  return { ...DEFAULT_META, displayKind: item.type };
}

/**
 * Pull the meta + cleaned notes off a fetched `ItemFull`.
 */
export function fullMeta(item: ItemFull): {
  meta: ItemMeta;
  notes: string;
} {
  return decodeMeta(item.notes, item.type);
}
