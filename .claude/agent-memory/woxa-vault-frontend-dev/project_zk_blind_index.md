---
name: zk-blind-index
description: Phase C ZK blind-index + metadata encryption — client token model, where it lives, and how the read/write/search paths use it
metadata:
  type: project
---

Phase C frontend ZK core (Wave 3a) wires v2 (encryptionVersion=2) vaults: metadata (name/username/url) is client-encrypted with the vault key, and a blind-index lets the server search without seeing plaintext.

**Token model (MUST byte-match backend — woxa-vault-api/src/routes/searchBlind.test.ts):**
1. `searchKey = HKDF-SHA256(ikm=vaultKey, salt=0x00*32, info=utf8("woxa-blind-index-v1"+vaultId), len=32)` — per vault.
2. normalize = lowercase + trim.
3. tokenize each field = words (split `/[^a-z0-9]+/`) + trigrams (every len-3 substring, internal whitespace collapsed to single space), deduped.
4. `tokenHash = base64(HMAC-SHA256(searchKey, utf8(token)))` → 44 chars.
5. write: union tokens of name+username+url+tags → `searchTerms`.
6. query: tokenize query, HMAC **per vault key**, union → `terms`.

**Where:** `src/lib/crypto-client.ts` exports `deriveSearchKey / tokenizeField / blindToken / computeSearchTerms / computeQueryTerms` (use global `crypto.subtle`, NOT `window.crypto`, so they run under `node --test` too). Contract test: `src/lib/crypto-client.blind-index.test.mjs`, run via `npm test` (uses `node --experimental-strip-types`, imports the real `.ts`, cross-checks against a `node:crypto` repro of the backend). No vitest in the web project.

**Read/write paths:** `src/lib/items-overlay.ts`.
- `encryptZk` / `decryptItemMeta` helpers; `ZK_LOCKED_PLACEHOLDER = "🔒"` shown when a v2 vault is locked (no key) — never blank/crash.
- `createDisplayItem`/`updateDisplayItem`: when `vaultKey` present, send `name:""` + name/username/urlCiphertext + `searchTerms`. Update only re-indexes (`searchTerms`) when a searchable field or tags changed; omits the key otherwise (so a notes/folder-only edit doesn't re-index).
- `listDisplayItems(vaultId, signal, vaultKey?)` / `getDisplayItem(..., vaultKey)` / `getDisplayItemVersion(..., vaultKey)` decrypt metadata ciphertext for display.
- `toggleFavorite` is v2-safe: skips the persist PATCH when the item has `notesCiphertext` (would clobber the encrypted blob) — favorite goes client-cache only.
- `searchAllItems(query, vaults, getVaultKey, signal)` orchestrates v1 (`GET /search`) + v2 (`POST /search/blind`) in parallel and merges; returns `{ results, hadLockedZkVault }`. Command palette shows `cmd.locked_zk_hint` when a v2 vault was locked.

**vaultKey source:** `useVaultLock().getVaultKey(vaultId)` (lock-provider.tsx) — returns null when locked. Pages pass it into the overlay; degrade gracefully, refetch on `VAULT_UNLOCKED_EVENT`.

**Wave 3b gaps (not done):** migration/rekey/rotation UI; trash rows for v2 items show `trash.encrypted_item` placeholder because `GET /trash` returns no ciphertext metadata (backend gap); dashboard rotation widget not wired.
