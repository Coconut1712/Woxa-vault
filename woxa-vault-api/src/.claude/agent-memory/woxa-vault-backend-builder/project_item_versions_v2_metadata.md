---
name: project-item-versions-v2-metadata
description: item_versions now snapshots v2 ciphertext-metadata (name/username/url ciphertext+iv); version reveal returns them; versions never searchable
metadata:
  type: project
---

Closed the Wave-1 gap where `item_versions` did not snapshot v2 (ZK) ciphertext-metadata.

**Why:** Wave 1 added `nameCiphertext/usernameCiphertext/urlCiphertext (+iv)` to `items` (v2) but NOT to `item_versions`, so a v2 snapshot captured `name=""` with no way to show/restore the real (encrypted) metadata of an old version.

**How to apply / where:**
- migration 0028 adds the same 6 ciphertext-metadata columns to `item_versions` (nullable). Mirrors `items`.
- PATCH snapshot in `routes/items.ts` copies `prev.{name,username,url}Ciphertext + iv` into the version row alongside password/notes ciphertext.
- `GET /items/:id/versions/:version` v2 branch returns `nameCiphertext/nameIv/usernameCiphertext/usernameIv/urlCiphertext/urlIv` (base64) for the client to decrypt; legacy v2 snapshots written before 0028 return null → client falls back to plaintext `name/username/url`. v1 branch unchanged (returns decrypted plaintext).
- CONFIRMED: version snapshots are NEVER added to the blind index (`item_search_terms`) — only live items are searchable. No version search terms needed.
