---
name: trash-feature
description: Trash page is wired to real backend /trash endpoints (admin-only, org-wide soft-delete recovery)
metadata:
  type: project
---

The Trash page (`src/app/app/trash/page.tsx`) is now wired to the real backend via `src/lib/api/trash.ts`, replacing the old `trashItems` mock from `@/lib/mock/members`.

**Why:** Item deletes app-wide now SOFT-delete (land in Trash); the page needed to manage real recovery/purge instead of static mock rows.

**How to apply:**
- `/trash` endpoints are admin+ only (org owner|admin). Page keeps an admin-only redirect guard (`isWorkspaceAdmin`) + `BootSplash` until role known — KEEP it.
- API: `listTrash(signal?)`, `restoreTrashItem(id)`, `purgeTrashItem(id)`, `emptyTrash()`. `TrashItem` exported from there.
- Backend `TrashItem.type` is ONLY `"login" | "note"` (not the wider mock union). Backend computes `purgeAt` (deletedAt+30d, informational, no auto-purge). `deletedBy` is `{ id, displayName } | null` (render `?.displayName ?? "—"`).
- "purge in N days" uses `differenceInDays(new Date(item.purgeAt), new Date())`; urgent (<7d) styling = `text-rose-400` + AlertTriangle.
- Bulk restore/delete use `Promise.allSettled` so one failure doesn't abort the rest; refetch list after; summary toast.
- After any restore/purge/empty, call `useVaults().refresh()` so sidebar vault item-counts update.
- Per-row + bulk permanent-delete use confirm Dialogs (not window.confirm) tracking the target item; empty-all uses the existing `emptyOpen` Dialog.
- i18n keys live under `trash.*` in `src/lib/i18n/translations.ts`. Added: `trash.toast.restored_desc/purged/purged_desc/restore_failed/purge_failed/bulk_restored(_partial)/bulk_purged(_partial)/empty_failed`, `trash.row_confirm.*`, `trash.bulk_confirm.*`.
