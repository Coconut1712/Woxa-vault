---
name: bulk-share-backend-missing
description: RESOLVED — POST /items/bulk now implements the share action; frontend Bulk Share is wired (US-052 / AC-052)
metadata:
  type: project
---

RESOLVED (2026-06-02). The `share` action on `POST /items/bulk` is implemented backend-side and the frontend is wired.

**Contract (live):** `POST /items/bulk` body `{ action:"share", itemIds:[1..100], payload:{ role:"manager"|"editor"|"user"|"viewer", userId?|teamId? } }` — exactly one of userId/teamId. Always responds 200 with `{ success:[id], failed:[{id, reason}] }` even on partial/total failure. `reason` ∈ `not_found | forbidden | user_not_in_workspace | team_not_in_workspace`. `forbidden` = caller can't share that item or role exceeds authority — a normal skip (AC-052.5), not an error.

**Frontend wiring:**
- `bulkItems()` in `src/lib/api/items.ts` — added `BulkSharePayload` + `BulkItemsResult` types. NOTE: fixed a double-stringify bug here — it was passing `body: JSON.stringify({...})` but `apiFetch` already stringifies `init.body`. Now passes a plain object like move/delete should.
- `src/components/vault/bulk-share-dialog.tsx` (NEW) — self-contained BulkShareDialog. Reuses single-share's *visual language* (search-picker dropdown, RolePicker w/ role.* + role.*_desc, ROLE_COLOR, MemberAvatar) but NOT ShareDialog's handleAdd (that's bound to one resource's grant list + ZK key-wrapping). Recipient picker pulls candidates from listMembers()+listTeams(). Confirm fires onConfirm(principal, role).
- `src/components/vault/bulk-actions.tsx` — Share button (Share2 icon) next to Move/Delete; handleBulkShare maps principal.type→{userId}|{teamId}, reads {success,failed}, toasts `bulk.success.shared` (all ok) or `bulk.share.partial` (X·skipped Y) — mirrors the move/delete partial pattern. On success: onComplete() clears selection + refetches.

**Gotcha for clean lint in new files:** `react-hooks/set-state-in-effect` flags a synchronous `setLoadingSearch(true)` in an effect body (ShareDialog carries this as debt). In BulkShareDialog the fetch effect wraps everything in an inner `async load()` + `void load()` so the setState isn't synchronous in the effect body. Also reset-on-close lives in a `handleOpenChange` wrapper, not in the effect.
