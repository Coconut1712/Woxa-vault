import { argon2id } from "hash-wasm";
import nacl from "tweetnacl";

/**
 * Phase C: Zero-Knowledge Cryptography Library (Client-side).
 * 
 * This module handles all cryptographic operations in the browser to ensure
 * the server never sees master passwords, private keys, or plaintext item data.
 * 
 * Key Hierarchy:
 * 1. Master Password -> Argon2id -> Stretched Master Key (256-bit)
 * 2. Stretched Master Key -> AES-GCM -> Wraps User Private Key (X25519)
 * 3. User Private Key -> ECDH -> Wraps Vault Keys (AES-256)
 * 4. Vault Key -> AES-GCM -> Encrypts Item Data
 */

/**
 * Re-backs a Uint8Array onto a guaranteed `ArrayBuffer` so it satisfies the
 * Web Crypto `BufferSource` type (`ArrayBufferView<ArrayBuffer>`). Values here
 * are always plain-ArrayBuffer-backed at runtime (created via `new Uint8Array`,
 * `getRandomValues`, `argon2id`, or `nacl`); the copy only enforces what the
 * lib.dom types can't infer from the generic `Uint8Array<ArrayBufferLike>`.
 */
function bufferSource(view: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(view.length);
  copy.set(view);
  return copy;
}

// Argon2id parameters (aligned with DESIGN.md §6.1)
const ARGON_PARAMS = {
  iterations: 3,
  memorySize: 65536, // 64MB
  parallelism: 4,
  hashLength: 32, // 256-bit
  outputType: "binary",
} as const;

/**
 * Derives a 256-bit Stretched Master Key from the password and a server-issued
 * per-user salt.
 *
 * Phase C crypto fix #2: the salt is now random bytes generated and stored by
 * the server (delivered via `GET /auth/kdf-salt?email=` pre-login and the
 * `kdfSalt` field on `GET /me` post-login), NOT derived from the userId. A
 * predictable userId-salt let two users with the same password derive related
 * keys and allowed precomputed (rainbow) attacks; a random per-user salt closes
 * both. The salt is NOT secret — it is stored plaintext server-side.
 *
 * CRITICAL: the exact same salt bytes the server stored at credential setup
 * MUST be used again at unlock, or the master key won't match. Callers fetch it
 * from the server every time rather than re-deriving it client-side, which
 * guarantees setup↔unlock consistency.
 */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return await argon2id({
    password,
    salt: bufferSource(salt),
    ...ARGON_PARAMS,
  }) as Uint8Array;
}

/**
 * Derives an authentication hash to be sent to the server for login.
 * This is a second-layer Argon2id of the master key so the server cannot
 * reverse it back to the master key.
 *
 * The auth salt is derived deterministically from the same server-issued KDF
 * salt (prefixed with a fixed domain-separation string) so it is unique per
 * user and stays consistent across setup↔unlock without an extra round-trip.
 */
export async function deriveAuthKeyHash(
  masterKey: Uint8Array,
  salt: Uint8Array,
): Promise<string> {
  const authSalt = new Uint8Array(5 + salt.length);
  authSalt.set(new TextEncoder().encode("auth:"));
  authSalt.set(salt, 5);
  const hash = await argon2id({
    password: masterKey,
    salt: authSalt,
    ...ARGON_PARAMS,
    outputType: "hex",
  }) as string;
  return hash;
}

/**
 * Generates a new User Keypair (X25519) for asymmetric encryption.
 */
export function generateUserKeypair() {
  const keypair = nacl.box.keyPair();
  return {
    publicKey: keypair.publicKey,
    privateKey: keypair.secretKey,
  };
}

/**
 * Encrypts a private key using the stretched master key.
 */
export async function encryptPrivateKey(privateKey: Uint8Array, masterKey: Uint8Array) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    bufferSource(masterKey),
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    bufferSource(privateKey)
  );

  const combined = new Uint8Array(ciphertext);
  const tag = combined.slice(-16);
  const data = combined.slice(0, -16);

  return { ciphertext: data, iv, authTag: tag };
}

/**
 * Decrypts a private key using the stretched master key.
 */
export async function decryptPrivateKey(
  encrypted: { ciphertext: Uint8Array; iv: Uint8Array; authTag: Uint8Array },
  masterKey: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    bufferSource(masterKey),
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const combined = new Uint8Array(encrypted.ciphertext.length + 16);
  combined.set(encrypted.ciphertext);
  combined.set(encrypted.authTag, encrypted.ciphertext.length);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(encrypted.iv) },
    cryptoKey,
    bufferSource(combined)
  );

  return new Uint8Array(decrypted);
}

/**
 * Encrypts data with a vault key (AES-256-GCM).
 */
export async function encryptData(plaintext: string, key: Uint8Array) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    bufferSource(key),
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    bufferSource(data)
  );

  const combined = new Uint8Array(ciphertext);
  return {
    ciphertext: combined.slice(0, -16),
    authTag: combined.slice(-16),
    iv,
  };
}

/**
 * Decrypts data with a vault key (AES-256-GCM).
 */
export async function decryptData(
  encrypted: { ciphertext: Uint8Array; iv: Uint8Array; authTag: Uint8Array },
  key: Uint8Array
): Promise<string> {
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    bufferSource(key),
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const combined = new Uint8Array(encrypted.ciphertext.length + 16);
  combined.set(encrypted.ciphertext);
  combined.set(encrypted.authTag, encrypted.ciphertext.length);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(encrypted.iv) },
    cryptoKey,
    bufferSource(combined)
  );

  return new TextDecoder().decode(decrypted);
}

/* ===================================================================
   Vault-key wrapping — ECIES (X25519 + HKDF-SHA256 + AES-256-GCM).

   Hardened over the previous "SHA-256(sharedSecret) → AES key" scheme:
   - the raw ECDH shared secret is checked for all-zero (rejects
     small-subgroup / invalid-point shared secrets that would otherwise
     produce a predictable key);
   - the AES key is derived with HKDF-SHA256 (proper KDF with salt+info
     domain separation) instead of a bare hash;
   - the ephemeral public key is fed in as HKDF `salt` AND bound as
     AES-GCM `additionalData`, so the ciphertext is cryptographically
     tied to the exact ephemeral key in the blob — a tampered/swapped
     ephemeral key fails the GCM tag check.

   Blob layout is UNCHANGED:
     [ephemeralPublicKey(32) | iv(12) | authTag(16) | ciphertext]
   (lock-provider/share/migrate/rekey parse by these fixed offsets).
   Only the derivation + AAD changed, so wrapped keys produced before
   this change can no longer be unwrapped — acceptable pre-launch
   (regenerate dev vaults).
   =================================================================== */

const KEY_WRAP_INFO = "woxa-vault-key-wrap-v1";

function assertNonZeroSharedSecret(sharedSecret: Uint8Array): void {
  let acc = 0;
  for (const byte of sharedSecret) acc |= byte;
  if (acc === 0) {
    throw new Error("Invalid ECDH shared secret (all-zero / small-subgroup point)");
  }
}

/**
 * HKDF-SHA256(ikm = ECDH sharedSecret, salt = ephemeralPublicKey,
 *             info = utf8("woxa-vault-key-wrap-v1"), len = 256 bits)
 * → raw AES-256-GCM key. Deterministic across wrap/unwrap because both
 * sides supply the same sharedSecret and the same ephemeralPublicKey.
 */
async function deriveKeyWrapAesKey(
  sharedSecret: Uint8Array,
  ephemeralPublicKey: Uint8Array,
): Promise<CryptoKey> {
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    bufferSource(sharedSecret),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await window.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: bufferSource(ephemeralPublicKey),
      info: new TextEncoder().encode(KEY_WRAP_INFO),
    },
    baseKey,
    256,
  );
  return window.crypto.subtle.importKey(
    "raw",
    new Uint8Array(bits),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Wraps (encrypts) a vault key for a specific user using their public key.
 * Implements ECIES: X25519 ephemeral ECDH + HKDF-SHA256 + AES-256-GCM,
 * with the ephemeral public key bound as additional authenticated data.
 */
export async function wrapVaultKey(vaultKey: Uint8Array, recipientPublicKey: Uint8Array) {
  // 1. Generate ephemeral keypair
  const ephemeral = nacl.box.keyPair();

  // 2. Perform ECDH to get shared secret + reject degenerate points
  const sharedSecret = nacl.scalarMult(ephemeral.secretKey, recipientPublicKey);
  assertNonZeroSharedSecret(sharedSecret);

  // 3. Derive the AES key via HKDF (salt = ephemeral pubkey, fixed info)
  const cryptoKey = await deriveKeyWrapAesKey(sharedSecret, ephemeral.publicKey);

  // 4. Encrypt vault key, binding the ephemeral pubkey as AAD
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: bufferSource(ephemeral.publicKey),
    },
    cryptoKey,
    bufferSource(vaultKey)
  );

  const combined = new Uint8Array(ciphertext);

  return {
    ephemeralPublicKey: ephemeral.publicKey,
    ciphertext: combined.slice(0, -16),
    authTag: combined.slice(-16),
    iv,
  };
}

/**
 * Unwraps (decrypts) a vault key using the user's private key.
 * Inverse of wrapVaultKey: same all-zero guard, same HKDF derivation,
 * and the ephemeral public key re-supplied as AES-GCM AAD.
 */
export async function unwrapVaultKey(
  wrapped: { ephemeralPublicKey: Uint8Array; ciphertext: Uint8Array; iv: Uint8Array; authTag: Uint8Array },
  userPrivateKey: Uint8Array
): Promise<Uint8Array> {
  // 1. Perform ECDH with ephemeral public key + reject degenerate points
  const sharedSecret = nacl.scalarMult(userPrivateKey, wrapped.ephemeralPublicKey);
  assertNonZeroSharedSecret(sharedSecret);

  // 2. Derive the same AES key (salt = ephemeral pubkey, fixed info)
  const cryptoKey = await deriveKeyWrapAesKey(sharedSecret, wrapped.ephemeralPublicKey);

  // 3. Decrypt, re-binding the ephemeral pubkey as AAD
  const combined = new Uint8Array(wrapped.ciphertext.length + 16);
  combined.set(wrapped.ciphertext);
  combined.set(wrapped.authTag, wrapped.ciphertext.length);

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bufferSource(wrapped.iv),
      additionalData: bufferSource(wrapped.ephemeralPublicKey),
    },
    cryptoKey,
    bufferSource(combined)
  );

  return new Uint8Array(decrypted);
}

// Helpers for buffer/string conversion.
//
// `toBase64` must NOT spread the buffer into `String.fromCharCode(...buf)`:
// spreading a large array exceeds the engine's argument-count limit and throws
// `RangeError: Maximum call stack size exceeded` on big ciphertexts (long
// secure notes), which would fail a whole-vault migrate/rekey. Build the binary
// string in fixed chunks instead.
export function toBase64(buf: Uint8Array): string {
  const CHUNK = 0x8000; // 32K bytes per fromCharCode call — safely under arg limit
  let binary = "";
  for (let i = 0; i < buf.length; i += CHUNK) {
    const chunk = buf.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/* ===================================================================
   Phase C — Blind-index search (FR-043 / AC-017.2 / NFR-032).

   The client tokenizes the searchable metadata (name/username/url/tags),
   HMACs each token under a per-vault search key derived from the vault key,
   and ships the resulting base64 digests as opaque `searchTerms` (on write)
   / `terms` (on query). The server stores and equality-matches the digests
   without ever seeing the plaintext, the query, or the search key.

   This MUST byte-match the backend reference in
   woxa-vault-api/src/routes/searchBlind.test.ts — any drift makes a search
   silently return nothing. The matching unit test lives in
   `crypto-client.blind-index.test.mjs` and cross-checks these functions
   against a Node `node:crypto` reproduction of that same contract.

   Uses the global `crypto.subtle` (not `window.crypto`) so the module loads
   and runs identically in the browser and under `node --test`.
   =================================================================== */

const BLIND_INDEX_INFO_PREFIX = "woxa-blind-index-v1";

/**
 * Derive the per-vault search key:
 *   HKDF-SHA256(ikm = vaultKey, salt = 0x00*32,
 *               info = utf8("woxa-blind-index-v1" + vaultId), len = 32).
 * The key never leaves the client. Each vault gets its own key, so a query
 * token must be HMAC'd separately per vault (the same word yields different
 * digests across vaults — anti-correlation).
 */
export async function deriveSearchKey(
  vaultKey: Uint8Array,
  vaultId: string,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    bufferSource(vaultKey),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const info = new TextEncoder().encode(BLIND_INDEX_INFO_PREFIX + vaultId);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info,
    },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * Normalize a field/query value before tokenization: lowercase then trim.
 */
function normalizeForIndex(value: string): string {
  return value.toLowerCase().trim();
}

/**
 * Tokenize one normalized field into a deduped set of:
 *   - words: split on any run of non-letter/non-digit chars, empties dropped;
 *   - trigrams: every length-3 substring of the field with internal
 *     whitespace collapsed to a single space.
 * Returns the deduped token list (insertion-order is irrelevant — each is
 * HMAC'd and the server matches by set membership).
 *
 * The word split uses the Unicode property classes `\p{L}` (any letter) and
 * `\p{N}` (any number) with the `u` flag so Thai / CJK / accented scripts are
 * preserved as tokens — a plain `[^a-z0-9]+` split silently dropped every
 * non-ASCII character, making Thai-named items unsearchable. Both write
 * (`computeSearchTerms`) and query (`computeQueryTerms`) paths call this one
 * function, so they stay byte-consistent. The backend does not tokenize: it
 * stores and equality-matches the HMAC digests the client sends, so widening
 * the client tokenizer is safe without a server change.
 */
export function tokenizeField(value: string): string[] {
  const norm = normalizeForIndex(value);
  if (!norm) return [];
  const tokens = new Set<string>();
  for (const word of norm.split(/[^\p{L}\p{N}]+/u)) {
    if (word) tokens.add(word);
  }
  const compact = norm.replace(/\s+/g, " ");
  for (let i = 0; i + 3 <= compact.length; i++) {
    tokens.add(compact.slice(i, i + 3));
  }
  return [...tokens];
}

/**
 * HMAC-SHA256(searchKey, utf8(token)) → base64. The 32-byte digest encodes to
 * a 44-char base64 string (the wire format the backend equality-matches on).
 */
export async function blindToken(
  searchKey: Uint8Array,
  token: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    bufferSource(searchKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token),
  );
  return toBase64(new Uint8Array(sig));
}

/**
 * Build the full blind-index term set for an item's searchable fields:
 * union the tokens of name + username + url + every tag, HMAC each, dedup.
 * Send the result as `searchTerms` on item create/update.
 */
export async function computeSearchTerms(
  searchKey: Uint8Array,
  fields: {
    name?: string | null;
    username?: string | null;
    url?: string | null;
    tags?: string[];
  },
): Promise<string[]> {
  const tokens = new Set<string>();
  const values: string[] = [];
  if (fields.name) values.push(fields.name);
  if (fields.username) values.push(fields.username);
  if (fields.url) values.push(fields.url);
  for (const tag of fields.tags ?? []) {
    if (tag) values.push(tag);
  }
  for (const value of values) {
    for (const token of tokenizeField(value)) tokens.add(token);
  }
  return Promise.all([...tokens].map((token) => blindToken(searchKey, token)));
}

/**
 * Tokenize + HMAC a query string under one vault's search key → the `terms`
 * for `POST /search/blind`. Identical tokenization to the write path, so a
 * query word lines up with the item's stored digest.
 */
export async function computeQueryTerms(
  searchKey: Uint8Array,
  query: string,
): Promise<string[]> {
  return Promise.all(
    tokenizeField(query).map((token) => blindToken(searchKey, token)),
  );
}
