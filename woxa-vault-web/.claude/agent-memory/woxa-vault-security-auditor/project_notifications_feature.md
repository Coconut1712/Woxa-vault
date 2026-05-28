---
name: project-notifications-feature
description: Architecture + audit notes for the event-driven Notifications inbox feature (added 2026-05-22)
metadata:
  type: project
---

Event-driven per-user notification inbox (in-app). Writer = `woxa-vault-api/src/lib/notifications.ts` (`createNotification(tx, input)`), routes = `woxa-vault-api/src/routes/notifications.ts` (4 endpoints), table `notifications` in `schema.ts` (migration drizzle/0015). Frontend `woxa-vault-web/src/lib/api/notifications.ts` + `src/components/layout/notifications-panel.tsx`.

Closed type vocabulary: share.received | role.changed | access.revoked | member.role_changed | send.viewed.

**Security design (verified safe):**
- Recipient `userId` always computed server-side from mutation target (grantee / target member / send creator) — never from request body. No endpoint accepts client-supplied recipient.
- `createNotification` self-action guard: skips insert when `userId === actorUserId`.
- Inbox isolation: every read/mark query pinned to `userId = caller.id`; `POST /:id/read` owner-pinned UPDATE → 0 rows → 404 (anti-enumeration). read-all only caller's rows.
- No secrets in rows: metadata only roles/ids/names/counts/booleans. send.viewed has actorUserId/actorEmail = null for anonymous reveals.
- Not vault-unlock gated, not 2FA-gated (carries no plaintext) — intentional, mirrors itemActivity.
- Frontend: t() returns string, rendered as React text (auto-escaped); no dangerouslySetInnerHTML; linkFor uses router.push with server UUID targetId only (no open-redirect).

**Known nuance — atomicity gap in send.viewed (Low):**
In `sends.ts` reveal handler, the view-count increment + burn is a standalone auto-committed `db.update(...)` (~line 442), while audit + `createNotification` are in a SEPARATE `db.transaction` (~line 480). So a crash between them can burn a view without notifying the creator (notification under-delivers; never over-delivers, never leaks). The 5 PATCH/DELETE/share hooks (item/folder/vault/member) DO wrap mutation+audit+notify in one tx correctly. Whether this is acceptable depends on send.viewed delivery guarantee.

**Deferred-by-design (not bugs):** member.remove (org) writes NO notification; folder share/role has no deep-link (frontend linkFor returns null).
