/**
 * Client-driven vault re-key flow (Phase C Wave-3b, AC-024.5 / FR-043). The
 * server holds no vault key, search key, or plaintext, so the browser does ALL
 * the crypto and POSTs the result for an atomic apply.
 *
 * `buildRekeyPayload` rotates a zero-knowledge vault's key: `oldVaultKey`
 * decrypts each item before we re-encrypt it under the freshly generated vault
 * key.
 *
 * It generates a fresh 32-byte vault key, wraps it for every member WITH a
 * public key (members without one are reported separately so the UI can warn —
 * they'd lose access), reconstructs every live item's plaintext, re-encrypts
 * name/username/url/password/notes, and recomputes the blind-index terms under
 * the new vault key. The wrapped-key blob layout matches new-vault-dialog /
 * share-dialog: [ephemeralPublicKey(32) | iv(12) | authTag(16) | ciphertext].
 */

import { listItems, getItem, getItemPassword } from "@/lib/api/items";
import {
  type RekeyPayload,
  type ReEncryptedItem,
  type VaultMemberKey,
  type WrappedKeyInput,
} from "@/lib/api/vaults";
import {
  wrapVaultKey,
  encryptData,
  decryptData,
  deriveSearchKey,
  computeSearchTerms,
  toBase64,
  fromBase64,
} from "@/lib/crypto-client";
import { decodeMeta } from "@/lib/item-meta";

/**
 * Thrown when a field that HAS ciphertext fails to decrypt with the old vault
 * key. This MUST abort the whole rekey/migrate: re-encrypting an empty value
 * over real ciphertext would silently destroy data with no backup. A missing
 * ciphertext (the item simply has no such field) is NOT an error — see
 * `decryptRequired`.
 */
export class RekeyDecryptError extends Error {
  constructor(
    public readonly itemId: string,
    public readonly field: string,
  ) {
    super(`rekey_decrypt_failed:${field}:${itemId}`);
    this.name = "RekeyDecryptError";
  }
}

/**
 * Decrypt a field that, IF it has ciphertext, MUST decrypt successfully.
 *   - no ciphertext (field absent)            → returns null (caller treats as
 *     "this item has no such field" — normal);
 *   - ciphertext present, decrypt yields value → returns the plaintext;
 *   - ciphertext present, decrypt yields null OR throws → RekeyDecryptError
 *     (abort the whole flow — never re-encrypt an empty value over real data).
 */
async function decryptRequired(
  itemId: string,
  field: string,
  ciphertext: string | null | undefined,
  iv: string | null | undefined,
  vaultKey: Uint8Array,
): Promise<string | null> {
  if (!ciphertext) return null;
  let plaintext: string | null;
  try {
    plaintext = await decryptZk(ciphertext, iv, vaultKey);
  } catch {
    throw new RekeyDecryptError(itemId, field);
  }
  if (plaintext === null) throw new RekeyDecryptError(itemId, field);
  return plaintext;
}

/** A member who could NOT receive a wrapped key (no enrolled ZK public key). */
export interface SkippedMember {
  userId: string;
  email: string;
}

export interface BuildRekeyResult {
  payload: RekeyPayload;
  /** Members without a public key — they will lose vault access after apply. */
  skipped: SkippedMember[];
  itemCount: number;
}

/** Wrap a vault key to one member's public key into the standard combined blob. */
async function wrapForMember(
  vaultKey: Uint8Array,
  publicKeyB64: string,
): Promise<string> {
  const wrapped = await wrapVaultKey(vaultKey, fromBase64(publicKeyB64));
  const combined = new Uint8Array(
    wrapped.ephemeralPublicKey.length +
      wrapped.iv.length +
      wrapped.authTag.length +
      wrapped.ciphertext.length,
  );
  let offset = 0;
  combined.set(wrapped.ephemeralPublicKey, offset);
  offset += wrapped.ephemeralPublicKey.length;
  combined.set(wrapped.iv, offset);
  offset += wrapped.iv.length;
  combined.set(wrapped.authTag, offset);
  offset += wrapped.authTag.length;
  combined.set(wrapped.ciphertext, offset);
  return toBase64(combined);
}

/** Encrypt one plaintext value into the wire `{ ciphertext, iv }` base64 pair. */
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

/** Decrypt one wire `{ ciphertext, iv }` base64 pair with the OLD vault key. */
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
 * Reconstruct one zero-knowledge item's plaintext fields, decrypting each
 * ciphertext with the OLD vault key. A field that HAS ciphertext but fails to
 * decrypt throws (abort) rather than collapsing to "" — re-encrypting "" over
 * real data is unrecoverable. A field whose ciphertext is simply absent falls
 * back to the (possibly null) plaintext column — covers any legacy row that was
 * never encrypted.
 */
async function readItemPlaintext(
  itemId: string,
  oldVaultKey: Uint8Array,
): Promise<{
  name: string;
  username: string | null;
  url: string | null;
  password: string | null;
  notes: string;
}> {
  const full = await getItem(itemId);

  // Name / username / url: a present ciphertext must decrypt; absent ciphertext
  // falls back to the plaintext column.
  let name = full.name;
  let username = full.username;
  let url = full.url;
  if (full.nameCiphertext) {
    name =
      (await decryptRequired(itemId, "name", full.nameCiphertext, full.nameIv, oldVaultKey)) ?? "";
    username = await decryptRequired(
      itemId,
      "username",
      full.usernameCiphertext,
      full.usernameIv,
      oldVaultKey,
    );
    url = await decryptRequired(itemId, "url", full.urlCiphertext, full.urlIv, oldVaultKey);
  }

  // Notes blob (carries the meta header: favorite/tags/customFields). A
  // present-but-undecryptable notes blob throws so we never wipe the meta header
  // by re-encrypting an empty string.
  let notes = full.notes ?? "";
  if (full.notesCiphertext) {
    notes =
      (await decryptRequired(itemId, "notes", full.notesCiphertext, full.notesIv, oldVaultKey)) ??
      "";
  }

  // Password is the only field gated behind the reveal endpoint — decrypt the
  // returned ciphertext with the old key (must succeed).
  let password: string | null = null;
  if (full.hasPassword) {
    const res = await getItemPassword(itemId);
    if ("passwordCiphertext" in res && res.passwordCiphertext) {
      password = await decryptRequired(
        itemId,
        "password",
        res.passwordCiphertext as string,
        (res as { passwordIv: string | null }).passwordIv,
        oldVaultKey,
      );
    } else {
      password = (res as { password: string | null }).password ?? null;
    }
  }

  return { name, username, url, password, notes };
}

/**
 * Build the full re-key / migrate payload for a vault.
 *
 * @param vaultId        target vault
 * @param expectedKeyVersion the vault's CURRENT keyVersion (echoed for the
 *                       optimistic-concurrency guard); newKeyVersion = +1
 * @param memberKeys     effective roster from GET /vaults/:id/member-keys
 * @param oldVaultKey    the current vault key (decrypts each item before re-encrypt)
 */
export async function buildRekeyPayload(
  vaultId: string,
  expectedKeyVersion: number,
  memberKeys: VaultMemberKey[],
  oldVaultKey: Uint8Array,
): Promise<BuildRekeyResult> {
  // 1. Fresh 32-byte vault key for the new generation.
  const newVaultKey = crypto.getRandomValues(new Uint8Array(32));

  // 2. Wrap it for every member who has enrolled ZK; record the rest as skipped.
  const wrappedKeys: WrappedKeyInput[] = [];
  const skipped: SkippedMember[] = [];
  for (const m of memberKeys) {
    if (!m.publicKey) {
      skipped.push({ userId: m.userId, email: m.email });
      continue;
    }
    wrappedKeys.push({
      userId: m.userId,
      wrappedKey: await wrapForMember(newVaultKey, m.publicKey),
    });
  }

  // 3. Re-encrypt every live item under the new key + recompute blind-index terms.
  const summaries = await listItems(vaultId);
  const searchKey = await deriveSearchKey(newVaultKey, vaultId);

  const items: ReEncryptedItem[] = [];
  for (const summary of summaries) {
    const plain = await readItemPlaintext(summary.id, oldVaultKey);

    // The notes blob carries the meta header; keep it intact (re-encrypt as-is).
    // Searchable fields follow the same kind-based mapping the create path uses:
    // username for login/api_key, url for login only.
    const { meta } = decodeMeta(plain.notes, summary.type);
    const tags = meta.tags ?? [];
    const searchableUsername =
      summary.type === "login" || summary.type === "api_key" ? plain.username : null;
    const searchableUrl = summary.type === "login" ? plain.url : null;

    const nameEnc = await encryptZk(plain.name, newVaultKey);
    const reItem: ReEncryptedItem = {
      id: summary.id,
      nameCiphertext: nameEnc.ciphertext,
      nameIv: nameEnc.iv,
    };

    if (searchableUsername) {
      const enc = await encryptZk(searchableUsername, newVaultKey);
      reItem.usernameCiphertext = enc.ciphertext;
      reItem.usernameIv = enc.iv;
    } else {
      reItem.usernameCiphertext = null;
      reItem.usernameIv = null;
    }

    if (searchableUrl) {
      const enc = await encryptZk(searchableUrl, newVaultKey);
      reItem.urlCiphertext = enc.ciphertext;
      reItem.urlIv = enc.iv;
    } else {
      reItem.urlCiphertext = null;
      reItem.urlIv = null;
    }

    if (plain.password) {
      const enc = await encryptZk(plain.password, newVaultKey);
      reItem.passwordCiphertext = enc.ciphertext;
      reItem.passwordIv = enc.iv;
    } else {
      reItem.passwordCiphertext = null;
      reItem.passwordIv = null;
    }

    if (plain.notes) {
      const enc = await encryptZk(plain.notes, newVaultKey);
      reItem.notesCiphertext = enc.ciphertext;
      reItem.notesIv = enc.iv;
    } else {
      reItem.notesCiphertext = null;
      reItem.notesIv = null;
    }

    reItem.searchTerms = await computeSearchTerms(searchKey, {
      name: plain.name,
      username: searchableUsername,
      url: searchableUrl,
      tags,
    });

    items.push(reItem);
  }

  return {
    payload: {
      expectedKeyVersion,
      newKeyVersion: expectedKeyVersion + 1,
      wrappedKeys,
      items,
    },
    skipped,
    itemCount: items.length,
  };
}
