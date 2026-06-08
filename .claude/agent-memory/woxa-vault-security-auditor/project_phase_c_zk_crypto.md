---
name: project-phase-c-zk-crypto
description: Phase C zero-knowledge crypto map — where blind-index, rekey/migrate, and the client crypto lib live, plus the standing weaknesses found in the first ZK audit
metadata:
  type: project
---

Phase C (Zero-Knowledge) crypto is implemented as working-tree changes (migrations 0027/0028/0029). Map of the moving parts and the recurring weaknesses to re-grep on future audits.

**File map**
- Client crypto: `woxa-vault-web/src/lib/crypto-client.ts` — Argon2id (hash-wasm), X25519 (tweetnacl), AES-GCM (Web Crypto), HKDF blind-index (`deriveSearchKey`/`tokenizeField`/`blindToken`/`computeSearchTerms`).
- Client rekey orchestration: `woxa-vault-web/src/lib/vault-rekey.ts`.
- Backend blind search: `woxa-vault-api/src/routes/search.ts` (GET / = v1 ILIKE, POST /blind = v2 HMAC).
- Backend rekey/migrate/rollback: `woxa-vault-api/src/routes/vaultRekey.ts` + `src/lib/rekey.ts` (revoke helpers).
- Item write path (v2 ciphertext + blind-index write): `woxa-vault-api/src/routes/items.ts` (create at `/:id/items`, PATCH `/:id`), `replaceSearchTerms`/`decodeSearchTerms`.
- member-keys roster endpoint: `vaultMembers.ts` GET `/:id/member-keys`.
- Logger redact: `src/lib/logger.ts` REDACT_PATHS.

**Standing weaknesses found (first ZK audit) — re-verify each future pass:**
- crypto-client.ts `wrapVaultKey`/`unwrapVaultKey` use raw `SHA-256(ECDH)` as the KDF (NOT HKDF) and put NO ephemeral pubkey / context in AAD — homemade ECIES, diverges from FR-111 X25519 + proper KDF. Watch for reuse.
- `deriveMasterKey` uses `userId.padEnd(16,"0")` as Argon2 salt (non-random, predictable, cross-user-distinguishable). `deriveAuthKeyHash` salt = "auth:"+userId. Both static-salt by design but weak.
- Migration backups (`vault_migration_backups.snapshot`) store v1 PLAINTEXT name/username/url + the LOCAL_KEK-wrapped DEK for 30 days. Not ZK-clean for that window. Purge job `purgeExpiredMigrationBackups` exists but is NOT scheduled.
- Blind index residual leakage is per design (token frequency / co-occurrence within a vault). Per-vault HKDF key blocks cross-vault correlation. Trigram tokens stored unbounded (max 2000/item).
- Rekey requires VAULT MANAGER; migrate/rollback require ORG owner/admin. member-keys = org admin OR vault manager.
- Revoke (AC-024.5) deletes vault_keys row + sets rekey_pending atomically; residual cached-key documented.

Related: [[project-zk-blind-index]] (if present), [[team-access-and-integrations]].
