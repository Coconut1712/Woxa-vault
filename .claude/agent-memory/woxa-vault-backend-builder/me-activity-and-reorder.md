---
name: me-activity-and-reorder
description: AC-041.1-3 GET /me/activity, AC-061.5 stale-access-request auto-deny sweeper, US-011.4 folder reorder
metadata:
  type: project
---

Three features landed together (round adding self-activity, auto-deny, reorder).

- **GET /me/activity** (AC-041.1-3) in `src/routes/me.ts`: self-scoped audit feed
  (`actorUserId = caller` + last 90d). Offset paging `{events,total,page}`; limit
  cap 50/default 25. Wire field is `createdAt` but it maps from the audit table's
  `occurredAt` column — don't rename. Includes vault_unlock_* rows automatically
  (same actor id), no separate query needed.

- **sweepStaleAccessRequests()** (AC-061.5) in `src/lib/expirationSweeper.ts`:
  runs on the SAME 60s interval as sweepExpiredRoles inside startExpirationSweeper.
  Denies `pending` access_requests older than 7d → `decision_reason='auto_denied_after_7_days'`,
  null-actor notification (`access_request.denied`) + audit (`access_request.auto_denied`).
  Idempotent (WHERE only matches pending).

- **PATCH /vaults/:id/folders/reorder** (US-011.4) in `src/routes/folders.ts`
  `vaultFolderRoutes`: canManageItem gate, all ids must belong to vault, no dups,
  position=index. Actions `folder.reorder` / `folder.reorder_failed`.

**Why:** product backlog items; activity feed is the user's private "what did I do"
view, distinct from the admin-only org /audit log.
**How to apply:** reuse the offset-paging shape for other self-scoped lists;
reuse the null-actor system-event pattern (notification + audit) for any future
background-driven state change.
