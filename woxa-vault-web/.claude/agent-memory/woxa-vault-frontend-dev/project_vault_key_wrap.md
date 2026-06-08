---
name: phase-c-vault-key-wrap
description: Phase C crypto fix #1 — wrapVaultKey/unwrapVaultKey ECIES now uses HKDF-SHA256 + AAD + all-zero check
metadata:
  type: project
---

`wrapVaultKey`/`unwrapVaultKey` in `src/lib/crypto-client.ts` (ECIES X25519+AES-GCM) hardened:
- raw ECDH `nacl.scalarMult` shared secret is rejected if all-zero (`assertNonZeroSharedSecret`) — guards small-subgroup/invalid-point.
- AES key derived via HKDF-SHA256: ikm=sharedSecret, salt=ephemeralPublicKey, info=utf8`"woxa-vault-key-wrap-v1"`, 256 bits (`deriveKeyWrapAesKey`). Was a bare `SHA-256(sharedSecret)`.
- ephemeralPublicKey bound as AES-GCM `additionalData` on both wrap and unwrap.

**Why:** old scheme had no KDF, didn't bind the ephemeral key, no degenerate-point check.

**How to apply:** blob layout UNCHANGED `[ephemeralPublicKey(32)|iv(12)|authTag(16)|ciphertext]` and function signatures UNCHANGED, so callers (new-vault-dialog, share-dialog, lock-provider getVaultKey, vault-rekey.ts) untouched. But wrapped keys produced before this change can't unwrap — pre-launch, regenerate dev vaults.

Related: [[kdf-salt-contract]].
