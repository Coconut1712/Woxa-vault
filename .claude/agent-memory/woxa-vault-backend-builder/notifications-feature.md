---
name: notifications-feature
description: Event-driven in-app notifications — migration 0015, writer lib, generation hooks, /notifications CRUD
metadata:
  type: project
---

In-app Notifications system (migration **0015_dusty_swarm**, `notifications` table). Recipient = the AFFECTED user, NEVER the actor.

**Schema (`notifications`):** id, userId (FK users cascade — recipient), orgId (FK orgs set null), type, actorUserId (FK users set null) + actorEmail snapshot, targetType/targetId(free-text)/targetName, metadata jsonb, readAt (null=unread), createdAt. Indexes: `notifications_user_created_idx` (userId, createdAt DESC) for the list; partial `notifications_user_unread_idx` WHERE readAt IS NULL for the badge count.

**Writer — `src/lib/notifications.ts`:** `createNotification(tx, input)` takes a Drizzle `Tx` (postgres-js tx type exported there) so it joins the SAME transaction as the triggering mutation's audit insert (atomic). Hard guard: skips when `userId === actorUserId` (returns false). Closed type vocabulary `NOTIFICATION_TYPES`: share.received | role.changed | access.revoked | member.role_changed | send.viewed. No secrets ever in metadata.

**Generation hooks (call sites):** vaultMembers / folderMembers / itemMembers POST→share.received, PATCH→role.changed, DELETE→access.revoked (recipient=grantee, orgId=vault.orgId; PATCH handlers were rewrapped from bare `db.insert(audit)` into `db.transaction` to keep the notif atomic). members.ts PATCH /members/:userId → member.role_changed (recipient=target). sends.ts public reveal success → send.viewed (recipient=claimed.createdBy, actor null/anonymous, skipped if createdBy null).

**Endpoints — `src/routes/notifications.ts` mounted `/notifications` (requireAuth ONLY; NO requireVaultUnlocked / NO requireTwoFactorEnrolled — no secrets):** GET / (`{notifications, unreadCount}`, limit 1-50 default 30), GET /unread-count, POST /read-all (`{updated}`), POST /:id/read (204, owner-pinned UPDATE → 0 rows = 404 anti-enumeration, idempotent). Static paths (unread-count, read-all) registered BEFORE /:id/read so :id doesn't shadow them. DTO: `{id,type,actorEmail,targetType,targetId,targetName,metadata,read,createdAt}`.

Tests: `src/routes/notifications.test.ts` (12, real-DB). See [[migration-history-handwritten]] for the journal-`when` bump that 0015 needed.
