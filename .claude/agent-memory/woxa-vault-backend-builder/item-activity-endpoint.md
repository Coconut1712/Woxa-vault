---
name: item-activity-endpoint
description: Per-item "Recent activity" widget — GET /items/:id/activity, manager-or-org-admin auth, reuses /audit DTO
metadata:
  type: project
---

Per-item activity feed for the item detail page. Read-only over existing
`audit_events` — NO migration.

**Endpoint:** `GET /items/:id/activity?limit=` → `{ events: AuditEventDTO[] }`.
- `limit` 1–50, default 20; order `(occurred_at DESC, id DESC)`. No cursor.
- Query pinned to `targetType='item' AND targetId=:id AND orgId=item.vault.orgId`.
- Lives in `src/routes/itemActivity.ts` (router `itemActivityRoutes`), mounted in
  app.ts UNDER `/items` BEFORE `itemRoutes` so `/:id/activity` isn't shadowed by
  the generic `/:id` reveal handler. Gated by `requireAuth` +
  `requireTwoFactorEnrolled`; deliberately NOT `requireVaultUnlocked` (metadata,
  not plaintext).

**Authorization rule (the crux):**
1. Load non-deleted item (`isNull(items.deletedAt)`) → 404 if missing.
2. `resolveItemRole` (lib/access) for effective item role; resolve item's org via
   `vault.orgId`; `getOrgMembership(item.vault.orgId, user.id)` + `canManageOrgMembers`
   for the org-admin path. CRITICAL: org-admin check is against the ITEM'S org, NOT
   `activeOrgForContext` — admin of org A must not read an item in org B.
3. No effective item role AND not org admin/owner of item's org → 404 (anti-enum).
4. Allowed = effective item role === "manager" OR org owner/admin of item's org → 200.
5. Else (editor/user/viewer can see item but aren't manager/admin) → 403 "Only vault
   managers can view item activity".

**Shared DTO:** `toAuditDto` + `AuditEventDTO` interface now EXPORTED from
`src/routes/audit.ts` (was a private `toDto`). Both `/audit` and this endpoint use
it so the wire shape stays byte-identical. `GET /audit` itself UNCHANGED (still
admin+ only). A vault manager who is org `member` reads this endpoint but still
gets 403 from `/audit`.

Tests: `src/routes/itemActivity.test.ts` (9 cases, real PG on 5433): manager-as-
member 200 + scoped + still-403-on-/audit; editor/user/viewer 403; org admin (non-
vault-member) 200; no-access 404; item-level manager override 200; cross-org admin
404; limit + ordering; deleted item 404; unknown id 404.

Related: [[require-2fa-policy]], [[active-workspace-model]], [[vault-items-schema]].
