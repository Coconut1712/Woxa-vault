---
name: project-item-meta-overlay
description: How the 6 item kinds store secrets — frontend __WOXA_META__ blob packed into the encrypted notes column; backend stores no per-kind columns
metadata:
  type: project
---

The 6 item kinds (login/note/api_key/ssh/card/identity — note `ssh`, NOT `ssh_key`) share the SAME backend columns. The backend added no per-kind secret columns.

**Why:** The frontend (`woxa-vault-web/src/lib/item-meta.ts` + `items-overlay.ts`) packs all type-specific secrets (totpSecret, customFields, card number/CVV, ssh passphrase/publicKey, identity PII) into a `__WOXA_META__:{json}\n<notes>` header string, then encrypts the whole thing into `notesCiphertext`. The PRIMARY secret (login password / api_key value / ssh private key) is routed into the `password` column → `passwordCiphertext`. Both columns are AES-256-GCM under the per-item DEK. So all secrets are already encrypted at rest; the only backend gap was the Zod `type` enum.

**How to apply:** `type` is PLAINTEXT metadata (label for UI form/icon), never a secret. Only `name/username/url/type` are plaintext/searchable. To support a new kind, widen the `TYPES` enum in `routes/items.ts` only — no migration, no new columns (the `items.type` column is `text`, no PG enum/check). The frontend previously collapsed types via `wireTypeFor()`; backend now accepts the real 6 so the client can stop collapsing. See [[project-item-search]]. Full table of which field goes where lives in API_CONTRACT.md "Where each kind's secrets live".
