---
name: bulk-share-action
description: POST /items/bulk supports share action (user+team) — per-item authority, partial success, plain permanent grant
metadata:
  type: project
---

`POST /items/bulk` (src/routes/items.ts) supports action `share` alongside `delete`/`move` (US-052 / AC-052.4, AC-052.5).

**Why:** frontend Bulk Share needs a batch path that reuses single-share security, not a looser endpoint.

**How to apply / invariants future rounds must not regress:**
- bulkSchema uses `superRefine`: share REQUIRES `payload.role` + EXACTLY ONE of `payload.userId`/`payload.teamId` (else 400). move keeps folderId/vaultId.
- Authority is computed PER ITEM via `shareAuthorityForItem(role, isCreator)` + `canGrantRole` (NOT `canManageItem` — a vault `user` who created the item may still share up to editor). delete/move still gate on `canManageItem`.
- No-rights item → pushed to `failed` (reason `forbidden`/`not_found`/`user_not_in_workspace`/`team_not_in_workspace`), never throws the whole batch. Always returns 200 with `{success, failed}`.
- Grant = idempotent upsert via `onConflictDoUpdate` setting `role` ONLY — never writes originalRole/expiresAt (preserves temp-grant baseline; same fix as accessRequests.ts FINDING 3). Plain permanent grant, mirrors `POST /items/:id/members`.
- Audit `item.share`/`item.team_share` + `share.received` notification per success, all with `metadata.bulk: true`. No secret values logged.
- Tests in src/routes/sharing.rbac.test.ts: partial-success, no-escalation, schema 400. See [[vault-items-schema]].
