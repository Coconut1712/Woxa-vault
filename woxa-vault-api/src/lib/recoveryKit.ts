import { createHash, randomBytes } from "node:crypto";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import { hashPassword, verifyPassword } from "./password";

// ---------------------------------------------------------------------------
// Recovery kit (DESIGN.md §6 — recovery flow scaffolding for Phase A).
//
// Threat model:
//   Asset: ability to reset a forgotten master password without admin help.
//   Adversaries:
//     * Online brute-forcer at /auth/password/reset-with-recovery — defeated
//       by 256 bits of entropy (encoded as ~52 base32 chars) + Argon2id verify
//       cost (~200ms) + aggressive rate limits at the route layer.
//     * Database leaker — defeated by storing only Argon2id hash of the code.
//     * Phishing victim handing recovery code to attacker — out of scope; the
//       code is single-use so disclosure is detectable on next login when the
//       user finds the kit invalidated.
//   Mitigations:
//     * 256-bit (32 byte) cryptographic random source.
//     * Argon2id hash with the same params as password hashing (t=3, m=64MB,
//       p=4) — verify is intentionally slow.
//     * Single-use: route handler clears the hash + sets `used_at` on
//       successful reset.
//     * WARN-7 — checksum: a 4-char SHA-256-derived checksum is appended to
//       the code so a typo is caught BEFORE the slow Argon2 verify burns
//       the user's per-email rate-limit window. The checksum is not a
//       security control on its own (it's deterministic from the body) but
//       it keeps a fat-fingered legitimate user from being locked out for
//       an hour because they mis-typed one block.
//   Residual risk:
//     * If the user prints/screenshots the code and stores it in cloud sync
//       with weak protection, an attacker with that store can take over the
//       account once. Acceptable — the kit IS the recovery secret.
//     * Checksum doesn't help against intentional brute-force; attackers
//       will compute it correctly. That's fine — the Argon2 cost +
//       rate-limit are the actual brute-force defenses.
//
// DESIGN.md note (deviation): we deviate from the §6 BIP39 24-word format in
//   favour of base32 here because the dev/Phase-A UX prefers a shorter,
//   easier-to-copy code. The Phase C zero-knowledge flow will revisit.
// ---------------------------------------------------------------------------

// 32 bytes → 256 bits of entropy. encodeBase32LowerCaseNoPadding produces
// ceil(32 * 8 / 5) = 52 chars. We split into 13 groups of 4 chars separated
// by dashes for readability when printed/copied, plus a 14th 4-char block
// holding the checksum.
const RECOVERY_CODE_BYTES = 32;
const GROUP_SIZE = 4;
const CHECKSUM_LEN = 4; // 4 hex chars = 16 bits — typo-detection grade.

// Compute checksum over the normalized BODY (no dashes/spaces, lowercase).
// Independent of grouping/casing so the user can re-type freely.
function computeChecksum(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, CHECKSUM_LEN);
}

export function generateRecoveryCode(): string {
  const raw = encodeBase32LowerCaseNoPadding(randomBytes(RECOVERY_CODE_BYTES));
  const checksum = computeChecksum(raw);
  // Group the BODY into dashed blocks for readability. The checksum is the
  // final 4-char block — visually indistinguishable from the body groups but
  // distinguishable to the verifier (last 4 chars after normalization).
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP_SIZE) {
    groups.push(raw.slice(i, i + GROUP_SIZE));
  }
  groups.push(checksum);
  return groups.join("-");
}

// Strip whitespace and dashes, lowercase everything. Public — the reset
// handler also uses this to compare a user-supplied recovery code to a
// candidate hash. The returned form includes the trailing checksum.
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]+/g, "").toLowerCase();
}

// Validate the checksum without invoking Argon2. Returns the body half so the
// caller can hash/verify it. Returns null if the checksum doesn't match.
// CALLERS MUST treat a null return as a recovery-kit-invalid outcome and
// fall through to the constant-time dummy verify so the timing oracle is
// preserved — see the route handler in auth.ts.
export function splitAndValidateChecksum(normalized: string): string | null {
  if (normalized.length <= CHECKSUM_LEN) return null;
  const body = normalized.slice(0, normalized.length - CHECKSUM_LEN);
  const checksum = normalized.slice(normalized.length - CHECKSUM_LEN);
  const expected = computeChecksum(body);
  // Plain string compare is fine — checksum is not a secret; an attacker can
  // compute it themselves. We just need to catch typos, not resist timing.
  if (checksum !== expected) return null;
  return body;
}

export async function hashRecoveryCode(plain: string): Promise<string> {
  // Argon2 over the BODY only (no checksum). Re-derive it from the normalized
  // generated code: the body is the prefix preceding the last 4 chars.
  const normalized = normalizeRecoveryCode(plain);
  const body = splitAndValidateChecksum(normalized);
  // For freshly-generated codes the checksum always validates; if a caller
  // somehow passes a malformed string here we surface it as an error so the
  // route handler doesn't silently store a hash over an unverified input.
  if (!body) {
    throw new Error("recovery code checksum did not validate during hash");
  }
  return hashPassword(body);
}

export async function verifyRecoveryCode(
  hashed: string,
  plain: string,
): Promise<boolean> {
  const normalized = normalizeRecoveryCode(plain);
  const body = splitAndValidateChecksum(normalized);
  if (!body) return false;
  return verifyPassword(hashed, body);
}
