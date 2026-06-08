---
name: my-activity-and-folder-reorder
description: Frontend-added endpoints My Activity (AC-041.1-3) + folder drag-reorder (US-011.4) — backend must implement matching routes
metadata:
  type: project
---

Two frontend features shipped that call backend endpoints the API may not have yet — confirm/implement backend side.

**AC-041.1-3 — My Activity tab** (account page `?tab=activity`):
- `GET /me/activity?page&limit&action` → `{ events: ActivityEvent[]; total; page }` (1-based page). Wrapper `getMyActivity` in `src/lib/api/me.ts`; `ActivityEvent` type there too.
- Scoped to caller, last 90 days. Suspicious actions hardcoded in UI: `account.vault_unlock_failed`, `account.login_failed` (show amber "Unrecognized?" → jumps to security tab). If backend uses different action codes for failed unlock/login, update `SUSPICIOUS_ACTIONS` in `src/app/app/account/page.tsx`.
- Action label formatting strips `account.` prefix, `_`→space, capitalizes.

**US-011.4 — folder drag-reorder**:
- `PATCH /vaults/:id/folders/reorder` body `{ order: string[] }` → `{ ok: boolean }`. Wrapper `reorderFolders` in `src/lib/api/vaults.ts`.
- Backend must persist folder display order and return folders in that order from `listFolders`.
- Frontend: `FoldersProvider.reorder(vaultId, order)` is optimistic + reverts on throw. dnd-kit handle (GripVertical) only shown when `canEdit`.

**Why:** delivered as frontend-first; both wrappers send real requests so missing routes 404.
**How to apply:** if backend lacks either route, these surfaces error (Activity shows load_failed state; reorder toasts save_failed + reverts). Coordinate via [[reference-api-contract]].

deps installed: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
