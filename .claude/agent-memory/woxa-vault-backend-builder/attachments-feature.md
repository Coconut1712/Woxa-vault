---
name: attachments-feature
description: Round-3 attachments feature — schema, local-FS storage adapter, MIME allow-list, envelope-encryption pattern, route layout
metadata:
  type: project
---

Round 3 added secure-note **file attachments** (REQUIREMENTS.md FR-038, DESIGN.md §7.3).

Key implementation facts:
- Migration `0003_special_human_robot.sql` adds `attachments` (and `invitations`) tables.
- Storage adapter abstraction lives in `src/lib/storage.ts` — Phase A is a sandboxed local-FS driver; `STORAGE_DRIVER` env enum currently only allows `"local"`. R2/S3 adapter is the Phase B drop-in.
- Storage root is `STORAGE_LOCAL_DIR` (default `./storage/attachments`). Added `storage` to `.gitignore`.
- Per-attachment envelope encryption: fresh DEK → AES-256-GCM body → DEK wrapped by `LOCAL_KEK_BASE64`. Same `itemCrypto.ts` helpers (`encryptBytes` / `decryptBytes` added for binary buffers).
- Caps: `ATTACHMENT_MAX_BYTES` (25 MB default per FR-038) and `ATTACHMENT_ITEM_MAX_BYTES` (100 MB aggregate per item — DESIGN.md does not pin a value; we picked conservatively).
- MIME allow-list lives at `src/routes/attachments.ts` (`ALLOWED_MIME` set).
- Routes:
  - `GET /items/:id/attachments`, `POST /items/:id/attachments` (multipart) → mounted as `itemAttachmentRoutes` BEFORE `itemRoutes` so `/:id/attachments` doesn't get eaten by `/:id`.
  - `GET /attachments/:id/download`, `DELETE /attachments/:id` → `attachmentRoutes` mounted at `/attachments`.
- Audit actions: `attachment.uploaded`, `attachment.downloaded`, `attachment.deleted` — metadata never includes filename (treated as sensitive).
- `c.body(buffer)` needs an ArrayBuffer slice, not a raw Node Buffer, to satisfy Hono types (see download handler).

Open items / future rounds:
- AV scanning before persist (Phase B).
- Streaming chunked encryption (currently buffers full plaintext in memory; OK at 25 MB cap).
- Filename encryption-at-rest (DESIGN.md §7.3 hints at `encrypted_metadata`; deferred).
