---
name: v1-removal-and-delete-gate
description: Post-V1-removal residuals (plaintext metadata still acceptable) + DeleteWithPasswordDialog is client-only gate, deletes have no server proof
metadata:
  type: project
---

After the 2026-06-04 "remove V1" change, the codebase is V2/ZK-only by intent but the server still accepts and persists plaintext metadata.

**V1 removal residuals (re-grep each audit):**
- `routes/items.ts` createSchema/patchSchema still accept plaintext `name`/`username`/`url` (and `password`/`notes`, which are silently dropped since no plaintext secret column exists). When `nameCiphertext` is omitted, server stores plaintext `name`/`username`/`url` (items.ts ~1364, ~806-808). `zkMeta = body.nameCiphertext !== undefined` is the ONLY switch — nothing forces ZK. Not zero-knowledge for any client that omits ciphertext.
- `db/schema.ts`: `vaults.encryption_version` default = 2 (line ~315) but `item_versions.encryption_version` default = 1 (~879). Comments throughout still say "v1 / legacy v2". No DB CHECK forcing version=2.
- `search.ts` toResult returns plaintext `it.name/username/url`; leak is upstream (stored plaintext), not the search itself. Blind search never leaks the query. Good: requireAuth + requireTwoFactorEnrolled + per-user RBAC filter + anti-enumeration.
- `vault_migration_backups` table + migrate/rollback/purge: removed from src (no live refs); stale mention only in backend-builder memory.

**Delete-with-password gate is CLIENT-ONLY (HIGH):**
- FE `woxa-vault-web/src/components/shared/delete-with-password-dialog.tsx`: calls verifyPassword() then SEPARATELY calls onConfirmed() which hits the real delete API. Two unlinked calls.
- BE delete handlers (vaults.ts:634, trash.ts:270, members.ts:309, vaultMembers.ts:531) require only requireAuth + role check. NO password proof, NO requireVaultUnlocked. Stolen-cookie attacker bypasses the gate entirely.
- `requireVaultUnlocked` middleware (middleware/auth.ts:109) exists and is the right server-side primitive but is applied ONLY to plaintext-read routes (items reveal, attachments download, sends create), NOT to destructive deletes.
- Residual weakening the gate: `lib/session.ts:69` auto-stamps `vaultUnlockedAt` at session creation, so a fresh session counts as "unlocked" without ever verifying the master password. verify-password proof is not bound to the delete (no nonce/proof token).

**IP spoofing fix (verified good):** `lib/clientIp.ts` gates cf-connecting-ip/fly-client-ip/XFF behind env.TRUST_PROXY, else socket peer. Regression test present.

Related: [[project-phase-c-zk-crypto]], [[auth-session-patterns]], [[two-password-model]].
