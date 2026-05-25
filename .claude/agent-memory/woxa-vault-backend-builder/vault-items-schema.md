---
name: vault-items-schema
description: Phase A schema choices for vaults, vault_members, items + envelope encryption helper location
metadata:
  type: project
---

Round 2 (2026-05-18) shipped the `vaults`, `vault_members`, and `items` tables in migration `drizzle/0001_wonderful_owl.sql`. Schema mirror lives in `src/db/schema.ts`.

**Key decisions:**
- `vault_members.role` is a free-form `text` (not a pg enum) holding one of `manager | editor | user | viewer`. Picked text so future role additions don't need a migration; route-layer Zod enforces the union.
- `items` stores per-item DEK ciphertext alongside the secret ciphertexts (`dek_ciphertext`, `dek_iv` + `password_ciphertext`/`iv`, `notes_ciphertext`/`iv`). Both column pairs are `bytea`; Drizzle's missing `bytea` is registered via `customType` at the top of `schema.ts`.
- Items aren't `org_id`-FK'd — they reach the org through `vault.org_id`. This keeps the row size small but means org-scoped audit queries need a join. Acceptable for Phase A volumes.
- `users.sso_subject` is `text` with a `UNIQUE` index. Lookup order in `routes/sso.ts` is `sso_subject` then `email`, then JIT-provision.

**Envelope encryption helper** lives at `src/lib/itemCrypto.ts`. Public API:
- `generateWrappedDek()` — fresh DEK + immediately wrap under `LOCAL_KEK_BASE64`.
- `unwrapDek({ dekCiphertext, dekIv })` — returns plaintext DEK (caller MUST `zeroize` after use).
- `encryptField(dek, plaintext)` / `decryptField(dek, ct, iv)` — AES-256-GCM, 12-byte IV, auth tag appended to ciphertext.

**`generated wrapped DEK is only safe while the `LOCAL_KEK_BASE64` env stays on the box.** Anyone with both DB + env wins. AWS KMS is the Phase B fix.

**Why:** DESIGN.md §6 asks for envelope encryption now to keep the wire shape stable; the KMS swap is a 1-line change inside `getKek()`.

**How to apply:**
- Touching item secret columns? Pass them through `encryptField` / `decryptField`. Never write raw plaintext to the DB.
- Adding a new encrypted field? Add bytea columns for `_ciphertext` and `_iv`, run `npm run db:generate`, then update the create/patch/get handlers in `src/routes/items.ts` to encrypt/decrypt and bump `Item.hasX` accordingly.
- The DEK plaintext buffer is zeroized in `finally` blocks in `items.ts`. Keep that pattern.

Related: [[google-sso]], [[api-contract]].
