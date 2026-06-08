---
name: send-item-attribution
description: POST /sends optional itemId attributes the CREATE audit event to the source item so it appears in GET /items/:id/activity
metadata:
  type: project
---

`POST /sends` accepts an OPTIONAL `itemId` (uuid). When provided + accessible + same org, the **create** audit event is item-attributed instead of send-scoped, so it surfaces in `GET /items/:id/activity`.

Handler: `woxa-vault-api/src/routes/sends.ts` POST "/" (~line 231). After the send insert it loads the item (`isNull(items.deletedAt)`), runs `resolveItemRole` from `@/lib/access`, then loads the vault and checks `vault.orgId === current.orgId` (from `activeOrgForContext`). On all-pass → `targetType:"item", targetId:item.id, targetName:item.name`, `metadata.sendId` carries the send id. Otherwise falls back to legacy `targetType:"send"` — LENIENT (no 403, no existence leak; send always 201).

**Why:** item activity feed (`itemActivity.ts`) filters strictly on `targetType='item' AND targetId AND orgId`, so a send.create could never show in the source item before this.

**How to apply:** Only the CREATE event is item-attributed. Lifecycle events (burn/view/view_and_burn/reveal_deferred/reveal_failed) stay send-scoped — do not change them. A v2/ZK item has `name=""`; that's fine. Test: `src/routes/sendItemAttribution.test.ts` (createSession(uid,{},true) for vault-unlock gate; org member alone has no item access so grant vault role).
