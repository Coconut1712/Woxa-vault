---
name: trash-feature
description: Trash (soft-delete/restore/purge/empty) is admin+ only and org-wide; DELETE /items/:id is now SOFT delete; where TRASH_RETENTION_DAYS lives
metadata:
  type: project
---

Trash recycle-bin feature shipped in `src/routes/trash.ts` (mounted `/trash` in app.ts) + migration `0014_funny_firelord.sql` (adds `items.deleted_by` uuid FK → users, ON DELETE SET NULL).

Owner-confirmed decisions (follow exactly if revisiting):
- Deleting an item = SOFT delete (goes to Trash, NOT permanent). `DELETE /items/:id` now UPDATEs `deletedAt=now()/deletedBy=user.id` instead of `tx.delete` — authz still `canManageItem` (manager|editor), audit still `item.delete`.
- Trash surface (view/restore/purge/empty) is **admin+ only**: org owner|admin via `canManageOrgMembers`. Members/editors/guests → 403 on every trash endpoint, even if vault manager.
- Trash is **org-wide for admins**: an admin sees ALL soft-deleted items across every vault in the ACTIVE org without needing vault membership. Queries join items→vaults, filter `vaults.orgId = current.orgId AND items.deletedAt IS NOT NULL`.
- Anti-enumeration: out-of-org / not-trashed id → 404 (never 403) via `loadTrashedItem(id, orgId)` returning null.
- `TRASH_RETENTION_DAYS = 30` exported from trash.ts; `purgeAt = deletedAt + 30d`. **Informational only — NO auto-purge job in this phase.**

Endpoints: GET /trash → {items: TrashItemDTO[]}; POST /trash/:id/restore → {item:{id,vaultId,name}} (audit item.restore); DELETE /trash/:id → 204 (audit item.purge); POST /trash/empty → {purged:N} (audit trash.empty, metadata.count). `/trash/empty` is declared BEFORE `/:id` routes so "empty" isn't parsed as a uuid.

Purge deletes attachment BLOBS first (FK cascade only drops attachment ROWS, not storage bytes): `deleteAttachmentBlobs(itemIds)` loads `attachments.storageKey` and calls `getStorage().delete()` best-effort (swallows errors, same as attachments.ts DELETE).

Audit `item.restore` / `item.purge` / `trash.empty` are new action strings. New audit `targetType` values: "item" (restore/purge) and "trash" (empty, targetId=null).

See [[drizzle-migration-quirks]] — 0014's journal `when` was the real-clock value (1779421908306) < 0013's fake 1779900000000; bumped to 1780000000000 so the migrator doesn't silently skip it.
