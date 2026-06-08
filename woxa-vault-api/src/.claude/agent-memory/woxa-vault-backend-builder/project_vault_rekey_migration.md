---
name: project-vault-rekey-migration
description: Phase C Wave-2b — client-driven vault re-key (AC-024.5), revoke→rekey_pending, reversible v1→v2 migration; endpoints, schema, concurrency model
metadata:
  type: project
---

Phase C Wave-2b backend: client-driven vault re-key + reversible v1→v2 migration.

**Why:** ZK means the server holds no vault key / search key / plaintext — it
cannot re-encrypt or re-wrap itself. All re-encryption happens in an authorized
member's browser; the server only validates + persists atomically. Frontend
wave 3 implements the client crypto against this contract.

**How to apply:** when touching vault key rotation / migration / member revoke.

- Endpoints in `src/routes/vaultRekey.ts` (mounted in app.ts under `/vaults`
  BEFORE generic `vaultRoutes` so `/:id/rekey` etc. win over `/:id`):
  - `POST /vaults/:id/rekey` — vault manager; v2 only; replaces all vault_keys,
    re-encrypts every item, REPLACES item_search_terms, bumps keyVersion, clears rekeyPending.
  - `POST /vaults/:id/migrate` — org owner/admin; v1→v2; snapshots v1 state to
    `vault_migration_backups` then applies v2 payload. Reversible 30 days.
  - `POST /vaults/:id/migrate/rollback` — org owner/admin; restores from backup, resets to v1.
- Revoke→rekey wiring in `src/lib/rekey.ts`: `revokeVaultKeyAndFlag` (single vault,
  called from vaultMembers.ts DELETE) + `revokeOrgKeysAndFlag` (all org v2 vaults,
  called from members.ts DELETE /:userId). Org-member remove now ALSO strips
  vault_members + vault_keys (those FK users.id, NOT org membership → no cascade).
- Schema (migration 0029, when=1780600000004, hand-written idempotent like 0027/0028):
  `vaults.keyVersion` int default 1, `vaults.rekeyPending` bool default false,
  table `vault_migration_backups (id, vault_id, item_id, snapshot jsonb, created_at)`.
- Optimistic concurrency: payload carries `expectedKeyVersion` (= current row) +
  `newKeyVersion` (= expected+1); SELECT…FOR UPDATE on vault row; mismatch → 409 rekey_conflict.
- Completeness: payload `items` must equal ALL live items; `wrappedKeys` must equal
  the EFFECTIVE roster (direct ∪ team-derived, deduped — IDENTICAL to /member-keys)
  filtered to ZK-ENROLLED members (userKeys.publicKey != null). Gaps → 409
  rekey_incomplete_items/_members. publicKey=null members are EXCLUDED both sides:
  not required, and a wrap "for" them → 400 validation_error (silent-lockout guard).
  `validateWrappedKeys(tx,...)` resolves the roster INSIDE the FOR UPDATE tx so a
  concurrent add/remove can't break the invariant (review fix #1-#3, 2026-06).
- Residual risk: revoked member who cached old vault key can still locally decrypt
  ciphertext they already had until rekey rotates+re-encrypts. Server access cut instantly.
- Backup purge: `purgeExpiredMigrationBackups` in vaultRekey.ts, wired into the
  expirationSweeper interval (hourly). Move to BullMQ when queue lands.
- VaultSummary returns `keyVersion` + `rekeyPending` + `rollbackAvailableUntil`
  (ISO|null = oldest vault_migration_backups.created_at + 30d; null when no backup).
  Computed in vaults.ts `rollbackUntilFor` (GET /:id, v2 only) + bulk min-grouped
  query in the list handler. Lets UI keep rollback button after refresh (review #5).
- keyVersion is DYNAMIC: rollback bumps it (+1) to retire the v2 generation, so a
  re-migrate must echo the CURRENT keyVersion from GET (NOT hardcoded 1) — migrate
  already validates `expectedKeyVersion === locked.keyVersion` so this works.
- Audit actions added: `vault.rekey`, `vault.rekey_pending`, `vault.migrate`, `vault.migrate_rollback`.
- Tests: `src/routes/vaultRekey.test.ts` (10, real PG). Contract: API_CONTRACT.md "Vault re-key & migration".
- Wave-3b: `GET /vaults/:id/member-keys` in vaultMembers.ts — effective member roster + X25519 publicKey for re-key/migration wrapping. UNION of direct vault_members + team-derived (vault_team_members→teamMembers), deduped by userId. RBAC: org owner/admin OR vault manager. publicKey=null = member not ZK-enrolled (client warns access loss). Shape: `{memberKeys:[{userId,email,publicKey|null}]}`. Org-level `GET /members` already returns publicKey but only direct org members, no team-expansion / vault-scope — member-keys is the vault-scoped one.
- Wave-3b: `GET /trash` now returns v2 ciphertext metadata (name/username/url Ciphertext+Iv) so frontend can decrypt deleted-item names; secrets (password/notes) still never returned. TrashItem shape documented in API_CONTRACT.md "Trash" section (newly added — trash had no docs before).
