import { createHmac, randomBytes } from "node:crypto";
import { env } from "@/config/env";

// ---------------------------------------------------------------------------
// Per-user KDF salt (Phase C — crypto fix #2)
//
// The client derives the master key with Argon2id(masterPassword, salt). The
// salt MUST be unique-per-user and unpredictable so two users with the same
// password derive different keys and an attacker cannot precompute a rainbow
// table. The salt is NOT a secret — the server stores it in plaintext and
// hands it back pre-auth so the client can derive the same key it derived at
// setup time.
//
// Legacy (pre-fix) clients derived with salt = `userId.padEnd(16,"0")`. That
// is predictable but the derivation is deterministic, so existing ZK accounts
// keep working as long as we backfill `users.kdf_salt` with the exact bytes
// of that legacy salt (see migration 0030). New accounts get 32 random bytes.
// ---------------------------------------------------------------------------

export const KDF_SALT_BYTES = 32;

/** Generate a fresh random salt for a new credential. base64-encoded. */
export function generateKdfSalt(): string {
  return randomBytes(KDF_SALT_BYTES).toString("base64");
}

// Server secret for the anti-enumeration fake salt. Reuses MFA_TOKEN_SECRET —
// a stable, high-entropy server secret that already gates a security boundary.
// The fake salt only needs to be (a) deterministic per email and (b) not
// derivable by the client, so reuse is safe: it never authenticates anything,
// it only produces an indistinguishable response shape for unknown emails.
const FAKE_SALT_KEY = Buffer.from(env.MFA_TOKEN_SECRET, "utf8");

/**
 * Deterministic decoy salt for an email with no real `kdf_salt`. Returns the
 * SAME value on every call for a given (lowercased) email so a caller cannot
 * distinguish "user does not exist" from "user exists but never set up ZK" by
 * probing repeatedly. The response shape is identical to the real-salt path.
 *
 * Anti-enumeration only — never used to derive a usable key. A user who later
 * registers gets a real random salt that overwrites this decoy's role.
 */
export function fakeKdfSaltForEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHmac("sha256", FAKE_SALT_KEY)
    .update(`kdf-salt:${normalized}`)
    .digest()
    .subarray(0, KDF_SALT_BYTES)
    .toString("base64");
}
