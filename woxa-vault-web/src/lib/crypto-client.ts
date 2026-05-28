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

// Argon2id parameters (aligned with DESIGN.md §6.1)
const ARGON_PARAMS = {
  iterations: 3,
  memorySize: 65536, // 64MB
  parallelism: 4,
  hashLength: 32, // 256-bit
  outputType: "binary",
} as const;

/**
 * Derives a 256-bit Stretched Master Key from the password and user ID.
 * The user ID is used as a static salt.
 */
export async function deriveMasterKey(password: string, userId: string): Promise<Uint8Array> {
  const salt = new TextEncoder().encode(userId.padEnd(16, "0")); // Salt must be at least 16 bytes
  return await argon2id({
    password,
    salt,
    ...ARGON_PARAMS,
  }) as Uint8Array;
}

/**
 * Derives an authentication hash to be sent to the server for login.
 * This is a second-layer Argon2id of the master key so the server cannot
 * reverse it back to the master key.
 */
export async function deriveAuthKeyHash(masterKey: Uint8Array, userId: string): Promise<string> {
  const salt = new TextEncoder().encode("auth:" + userId);
  const hash = await argon2id({
    password: masterKey,
    salt,
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
    masterKey,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    privateKey
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
    masterKey,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const combined = new Uint8Array(encrypted.ciphertext.length + 16);
  combined.set(encrypted.ciphertext);
  combined.set(encrypted.authTag, encrypted.ciphertext.length);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: encrypted.iv },
    cryptoKey,
    combined
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
    key,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    data
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
    key,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const combined = new Uint8Array(encrypted.ciphertext.length + 16);
  combined.set(encrypted.ciphertext);
  combined.set(encrypted.authTag, encrypted.ciphertext.length);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: encrypted.iv },
    cryptoKey,
    combined
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Wraps (encrypts) a vault key for a specific user using their public key.
 * Implements a simplified ECIES using X25519 + AES-GCM.
 */
export async function wrapVaultKey(vaultKey: Uint8Array, recipientPublicKey: Uint8Array) {
  // 1. Generate ephemeral keypair
  const ephemeral = nacl.box.keyPair();
  
  // 2. Perform ECDH to get shared secret
  const sharedSecret = nacl.scalarMult(ephemeral.secretKey, recipientPublicKey);
  
  // 3. Derive a symmetric key from shared secret using SHA-256
  const derivationKey = await window.crypto.subtle.digest("SHA-256", sharedSecret);
  
  // 4. Encrypt vault key with derivation key
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    derivationKey,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    vaultKey
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
 */
export async function unwrapVaultKey(
  wrapped: { ephemeralPublicKey: Uint8Array; ciphertext: Uint8Array; iv: Uint8Array; authTag: Uint8Array },
  userPrivateKey: Uint8Array
): Promise<Uint8Array> {
  // 1. Perform ECDH with ephemeral public key
  const sharedSecret = nacl.scalarMult(userPrivateKey, wrapped.ephemeralPublicKey);
  
  // 2. Derive the symmetric key
  const derivationKey = await window.crypto.subtle.digest("SHA-256", sharedSecret);
  
  // 3. Decrypt vault key
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    derivationKey,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const combined = new Uint8Array(wrapped.ciphertext.length + 16);
  combined.set(wrapped.ciphertext);
  combined.set(wrapped.authTag, wrapped.ciphertext.length);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: wrapped.iv },
    cryptoKey,
    combined
  );

  return new Uint8Array(decrypted);
}

// Helpers for buffer/string conversion
export function toBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf));
}

export function fromBase64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}
