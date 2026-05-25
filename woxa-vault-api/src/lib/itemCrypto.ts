import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/config/env";

// ---------------------------------------------------------------------------
// Phase A envelope encryption (DESIGN.md §6, simplified).
//
// Threat model:
//   - Asset: item secret plaintext (passwords, notes).
//   - Adversary: DB-only read access (e.g. accidental backup leak), insider
//     with selective table read but not envvar access.
//   - Mitigations:
//     * Per-item DEK (32 random bytes) — leaking one row's ciphertext can't
//       decrypt another row.
//     * DEK wrapped with the LOCAL_KEK (32 bytes from env). DB never stores
//       a plaintext DEK.
//     * AES-256-GCM with random 12-byte IV per encryption; auth tag appended
//       to ciphertext so tampering is detected.
//   - Residual risk:
//     * Anyone with both DB read AND env read can decrypt every item — this
//       is *exactly* what AWS KMS addresses in Phase B (the KEK never leaves
//       a hardware boundary).
//     * Plaintext DEK lives in memory during request processing; Node.js
//       Buffer is best-effort zeroized via `dek.fill(0)` but the GC may have
//       already copied it. Acceptable in Phase A.
//   - Verification before declaring complete:
//     * envelope.test.ts asserts round-trip + tamper detection.
// ---------------------------------------------------------------------------

const ALGO = "aes-256-gcm";
const KEY_LEN = 32; // AES-256
const IV_LEN = 12;  // 96-bit nonce recommended for GCM

let cachedKek: Buffer | null = null;
function getKek(): Buffer {
  if (cachedKek) return cachedKek;
  const raw = env.LOCAL_KEK_BASE64;
  if (!raw || raw === "REPLACE_ME_WITH_BASE64_32_BYTES") {
    throw new Error(
      "LOCAL_KEK_BASE64 is not configured. Generate one with `openssl rand -base64 32` and add it to .env.",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LEN) {
    throw new Error(
      `LOCAL_KEK_BASE64 must decode to ${KEY_LEN} bytes (got ${buf.length}). Regenerate with openssl rand -base64 32.`,
    );
  }
  cachedKek = buf;
  return buf;
}

function encryptBuffer(key: Buffer, plaintext: Buffer): { ciphertext: Buffer; iv: Buffer } {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Concatenate auth tag after ciphertext so decrypt can slice it off.
  return { ciphertext: Buffer.concat([enc, tag]), iv };
}

function decryptBuffer(key: Buffer, ciphertext: Buffer, iv: Buffer): Buffer {
  // Last 16 bytes are the GCM auth tag.
  if (ciphertext.length < 16) throw new Error("ciphertext too short");
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const enc = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Public API used by item routes.
// ---------------------------------------------------------------------------

export interface WrappedDek {
  dekCiphertext: Buffer;
  dekIv: Buffer;
}

// Generate a fresh DEK and immediately wrap it under the KEK. Caller stores
// `dekCiphertext` + `dekIv` on the item row; the plaintext DEK is returned
// for use only within the current request and MUST be zeroized after use.
export function generateWrappedDek(): { dek: Buffer; wrapped: WrappedDek } {
  const dek = randomBytes(KEY_LEN);
  const wrappedBlob = encryptBuffer(getKek(), dek);
  return {
    dek,
    wrapped: { dekCiphertext: wrappedBlob.ciphertext, dekIv: wrappedBlob.iv },
  };
}

export function unwrapDek(wrapped: WrappedDek): Buffer {
  return decryptBuffer(getKek(), wrapped.dekCiphertext, wrapped.dekIv);
}

export function encryptField(
  dek: Buffer,
  plaintext: string,
): { ciphertext: Buffer; iv: Buffer } {
  return encryptBuffer(dek, Buffer.from(plaintext, "utf8"));
}

export function decryptField(dek: Buffer, ciphertext: Buffer, iv: Buffer): string {
  return decryptBuffer(dek, ciphertext, iv).toString("utf8");
}

// Binary variants for attachment bodies — same AES-256-GCM construction but
// callers supply / receive raw Buffer payloads instead of utf-8 strings. The
// auth tag is appended to the returned ciphertext, just like `encryptField`.
export function encryptBytes(
  dek: Buffer,
  plaintext: Buffer,
): { ciphertext: Buffer; iv: Buffer } {
  return encryptBuffer(dek, plaintext);
}

export function decryptBytes(dek: Buffer, ciphertext: Buffer, iv: Buffer): Buffer {
  return decryptBuffer(dek, ciphertext, iv);
}

// Best-effort wipe — Node Buffers don't guarantee no copy was made, but
// zeroing the slot blocks accidental re-reads via a leaked reference.
export function zeroize(...buffers: (Buffer | undefined | null)[]): void {
  for (const b of buffers) if (b) b.fill(0);
}
