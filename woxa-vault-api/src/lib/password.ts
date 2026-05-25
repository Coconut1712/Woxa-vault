import { hash, verify, type Algorithm } from "@node-rs/argon2";

// Argon2id parameters from REQUIREMENTS.md AC-002.2 / FR-112:
//   t (iterations) = 3
//   m (memory)     = 64 MB
//   p (parallelism)= 4
//   algorithm      = Argon2id (pinned explicitly — see below)
// OWASP 2024 recommendation. `algorithm` is set explicitly so a future
// @node-rs/argon2 default change can't silently switch master-password hashing
// away from Argon2id; existing stored hashes already encode the variant in
// their PHC string, so verify() of legacy hashes is unaffected.
const ARGON_OPTS = {
  memoryCost: 64 * 1024, // KiB → 64 MB
  timeCost: 3,
  parallelism: 4,
  // Argon2id. @node-rs/argon2 ships `Algorithm` as an ambient const enum, which
  // `isolatedModules` forbids dereferencing at runtime — so we use its numeric
  // value (Algorithm.Argon2id === 2) and `satisfies` to keep it type-checked
  // against the enum without emitting an enum member access.
  algorithm: 2 satisfies Algorithm,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, ARGON_OPTS);
  } catch {
    return false;
  }
}
