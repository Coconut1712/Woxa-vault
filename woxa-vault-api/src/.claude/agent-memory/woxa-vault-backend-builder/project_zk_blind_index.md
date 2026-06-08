---
name: zk-blind-index
description: Phase C ZK metadata encryption + blind-index search model (FR-043/AC-017.2/NFR-032) — schema, endpoints, token contract
metadata:
  type: project
---

Phase C Wave 1 added zero-knowledge metadata + blind-index search for **v2 vaults only** (encryptionVersion=2). v1 unchanged.

**Why:** FR-043 requires search via HMAC blind index in ZK mode; previously v2 only encrypted password+notes, leaving name/username/url plaintext (ILIKE-searchable).

**How to apply (contract the frontend wave-3 follows):**
- Schema: `items` gained nullable `name_ciphertext/name_iv`, `username_ciphertext/username_iv`, `url_ciphertext/url_iv`. New table `item_search_terms(item_id FK cascade, term_hash bytea, PK(item_id,term_hash))` + btree index on term_hash. Migration `0027_zk_blind_index` (manual SQL, idempotent; journal `when=1780600000002`).
- v2 create/update: client sends `name:""` + `nameCiphertext` (Zod superRefine enforces name XOR nameCiphertext on create). Server forces name="", username/url=NULL when ciphertext present; tolerates legacy plaintext v2 too. `searchTerms[]` (base64 HMAC, 44-char strict) replaces the item's term set in the write tx (delete+insert). PATCH: searchTerms present (even []) replaces; omit leaves intact.
- Search SPLIT into two endpoints: `GET /search?q=` = v1 ILIKE (now filters `encryptionVersion=1`, excludes v2); `POST /search/blind {terms[],limit}` = v2 blind match (term_hash IN, rank by distinct match count). Shared RBAC via resolveItemRolesBatch + auditor short-circuit; shared result shape carries both plaintext + ciphertext metadata fields.
- Token model (client-only, server never runs): searchKey=HKDF-SHA256(vaultKey, salt=32 zero bytes, info="woxa-blind-index-v1"+vaultId, 32B). normalize=lowercase+trim. tokenize=words(split non-[a-z0-9]) + 3-grams. token=HMAC-SHA256(searchKey,token)→base64. Searchable fields: name/username/url/tags.
- Threat model residual: blind index leaks equality/pattern (same plaintext→same hash within a vault) and trigram-frequency; documented as accepted. Server never sees plaintext/searchKey/query preimage.
- Tests: `src/routes/searchBlind.test.ts` (5 tests). All 209 suite tests green; tsc clean.

See [[zk-encryption-model]] if/when created for the broader key hierarchy.
