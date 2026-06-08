---
name: item-versions-and-password-rotation
description: How item version history (US-015 AC-015.2/FR-037) and password_changed_at (AC-015.3) are implemented in items.ts
metadata:
  type: project
---

US-015 version history + password_changed_at, implemented in `woxa-vault-api/src/routes/items.ts` (migration 0025_premium_hellcat).

**Schema decisions:**
- `item_versions` table existed UNUSED from migration 0021 with an opaque-blob shape (`encrypted_data/iv/auth_tag/change_summary`). Rather than edit the committed migration, 0025 made those three columns NULLABLE (left as dead legacy — do NOT write them) and ADDED per-field snapshot columns: type/name/username/url + password/notes ciphertext+iv + **dek_ciphertext/dek_iv** (snapshot of the wrapped DEK so a version decrypts self-contained after the live item's DEK rotates) + encryption_version + modified_by_email.
- `items.password_changed_at` (timestamptz nullable) added in 0025.

**Logic (PATCH /items/:id):**
- Snapshot of CURRENT state inserted into item_versions BEFORE the update, in the SAME transaction, ONLY when CONTENT changes (name/username/url/type/password/notes or ZK ciphertexts). Metadata-only PATCH (folderId) → NO version.
- version_number = max+1; prune keeps last 10 (FR-037) via a NOT IN (… ORDER BY version_number DESC LIMIT 10) delete.
- password_changed_at advances when password field is PRESENT and NOT cleared. Phase A signals via `body.password`; ZK via `body.passwordCiphertext`. Clearing (null/"") is NOT a rotation.

**Endpoints (registered BEFORE generic `/:id` to avoid shadowing):**
- `GET /items/:id/versions` — view-gated (any effective role incl. viewer/auditor), metadata-only list, returns `{ canReveal, versions[] }`. No secrets.
- `GET /items/:id/versions/:version` — reveal-gated (`canRevealItem` + not auditor + requireVaultUnlocked); decrypts the snapshot's OWN DEK; audits `item.version_view`. ZK returns ciphertext blobs.

passwordChangedAt is exposed on the ItemSummary serializer (toSummary), so it appears in list/create/patch/GET responses. Test: `src/routes/itemVersions.test.ts`. See [[migration-history-handwritten]] for the journal `when` high-water-mark quirk that made migrate skip 0025 until its `when` was bumped to 1780600000000.
