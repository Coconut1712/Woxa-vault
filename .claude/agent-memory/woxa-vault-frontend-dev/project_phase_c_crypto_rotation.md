---
name: project-phase-c-crypto-rotation
description: Phase C client-driven vault re-key / v1→v2 migration + rotation tracking — wrapped-key blob layout, where the flow lives, and the non-obvious crypto contract
metadata:
  type: project
---

Phase C Wave-3b frontend: vault crypto rotation + password-rotation tracking (US-060, AC-024.5, FR-043).

**Wrapped-key blob layout (CRITICAL — must byte-match everywhere):** a vault key wrapped to a member is serialized as `[ephemeralPublicKey(32) | iv(12) | authTag(16) | ciphertext]` then base64. `wrapVaultKey` returns those 4 fields separately; the lock-provider `getVaultKey` unwraps by slicing 0:32 / 32:44 / 44:60 / 60:. Used by new-vault-dialog, share-dialog, and `src/lib/vault-rekey.ts`.

**Client-driven rotation flow** (`src/lib/vault-rekey.ts` → `buildRekeyPayload`): server holds NO vault key/plaintext, so the browser does all crypto. Generate fresh 32B key → wrap for every member WITH a publicKey (members with `publicKey===null` are "skipped" and LOSE access — must warn) → reconstruct each item's plaintext (v2: decrypt with OLD key; v1 migrate: server plaintext) → re-encrypt name/username/url/password/notes under new key → `computeSearchTerms` under new search key. Searchable-field mapping mirrors create: username for login/api_key, url for login only.

**Endpoints:** `GET /vaults/:id/member-keys` → `{memberKeys:[{userId,email,publicKey}]}` (owner/admin OR vault manager). `POST /vaults/:id/rekey` (manager, v2 only, after revoke when `rekeyPending`), `POST /vaults/:id/migrate` (owner/admin, v1→v2, reversible 30d), `POST /vaults/:id/migrate/rollback`. Error codes: `rekey_conflict` (keyVersion changed → reload+retry), `migrate_not_v1`, `rekey_not_zk`, `rollback_unavailable`. API clients in `src/lib/api/vaults.ts`.

**UI:** `MigrateRekeyDialog` (one dialog, mode="migrate"|"rekey") at src/components/vault/migrate-rekey-dialog.tsx. Banners on the vault page hero (re-key needed / upgrade to ZK / migrated+rollback). Rekey needs the CURRENT vault key (fetch via getVaultKey before opening) — locked vault blocks with an unlock hint. `VaultSummary` gained optional `keyVersion`/`rekeyPending`.

**Rotation tracking (US-060):** ItemSummary has optional `rotationStatus`("none"|"fresh"|"due"|"overdue")/`rotationDueAt`/`rotationPolicyDays` (server-computed). `RotationBadge` + `RotationPolicyField` + `parseRotationDays` live in src/components/vault/rotation-badge.tsx. Dashboard widget `RotationWidget` (self-hides when nothing due) hits `GET /items/rotation-due`. Org default `rotationDefaultDays` in workspace settings (Sessions card). Item forms show the policy field only for password kinds (login/api_key/ssh).

**toggleFavorite v2 fix:** favorite lives in the encrypted notes meta blob, so persisting on a v2 vault now requires `vaultKey` (decrypt notes → flip → re-encrypt → PATCH notesCiphertext, omit searchTerms). Locked vault throws `VaultLockedError` (exported from items-overlay) → callers show "unlock first" toast.

**Why:** zero-knowledge means the server can never re-encrypt; every rotation is a client compute+POST. **How to apply:** any future ZK vault mutation that touches the key or item ciphertext must go through this wrap/re-encrypt pattern and recompute searchTerms; never send plaintext for a v2 vault.

**Gotcha:** `set-state-in-effect` eslint rule fires across the codebase (dashboard, dialogs, settings) for data-load-on-mount/open effects — it's an accepted baseline, NOT build-blocking. tsc + `npm run build` are the real gates.
