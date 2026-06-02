import { randomBytes } from "node:crypto";
import * as bip39 from "bip39";
import { hashPassword, verifyPassword } from "./password";

// ---------------------------------------------------------------------------
// Recovery kit (DESIGN.md §6 — Phase C: BIP39 Mnemonic).
//
// Threat model:
//   Asset: ability to reset a forgotten master password without admin help.
//   Adversaries:
//     * Online brute-forcer at /auth/password/reset-with-recovery — defeated
//       by 256 bits of entropy (24 BIP39 words) + Argon2id verify
//       cost (~200ms) + aggressive rate limits at the route layer.
//     * Database leaker — defeated by storing only Argon2id hash of the words.
//     * Phishing victim handing mnemonic to attacker — out of scope; the
//       kit is single-use so disclosure is detectable on next login.
//   Mitigations:
//     * 256-bit (32 byte) cryptographic random source for BIP39.
//     * Argon2id hash with the same params as password hashing (t=3, m=64MB,
//       p=4) — verify is intentionally slow.
//     * Single-use: route handler clears the hash + sets `used_at` on
//       successful reset.
//     * BIP39 Checksum: the last word of a mnemonic contains a checksum of
//       the entropy, so typos are caught BEFORE the slow Argon2 verify.
// ---------------------------------------------------------------------------

/** Generates a 24-word BIP39 mnemonic (256 bits of entropy). */
export function generateRecoveryCode(): string {
  const entropy = randomBytes(32);
  return bip39.entropyToMnemonic(entropy.toString("hex"));
}

/** 
 * Normalizes a mnemonic by trimming, lowercasing, and collapsing all 
 * whitespace/dashes into single spaces.
 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, " ") // collapse spaces/newlines/dashes into single space
    .split(" ")
    .filter(Boolean)
    .join(" ");
}

/** 
 * Validates the BIP39 checksum. Returns the normalized mnemonic if valid,
 * otherwise returns null.
 */
export function splitAndValidateChecksum(normalized: string): string | null {
  if (bip39.validateMnemonic(normalized)) {
    return normalized;
  }
  return null;
}

export async function hashRecoveryCode(plain: string): Promise<string> {
  const normalized = normalizeRecoveryCode(plain);
  const validated = splitAndValidateChecksum(normalized);
  if (!validated) {
    throw new Error("recovery mnemonic checksum did not validate during hash");
  }
  // We hash the normalized string of 24 words.
  return hashPassword(validated);
}

export async function verifyRecoveryCode(
  hashed: string,
  plain: string,
): Promise<boolean> {
  const normalized = normalizeRecoveryCode(plain);
  const validated = splitAndValidateChecksum(normalized);
  if (!validated) return false;
  return verifyPassword(hashed, validated);
}
