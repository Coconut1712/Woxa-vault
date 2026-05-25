---
name: project-audit-log-wired
description: Audit Log page wired to real GET /audit (keyset pagination, server+client filters, CSV export); action-code → i18n map and which codes are guessed
metadata:
  type: project
---

The Audit Log page (`src/app/app/audit/page.tsx`) is wired to the real backend, replacing the `auditEvents` mock. API wrapper added at `src/lib/api/audit.ts` (`listAudit(params, signal)` → `{ events, nextCursor }`, exports `AuditEvent` type).

**Why:** Backend shipped admin-only `GET /audit?cursor&limit&actor&action&from&to` with keyset pagination (occurredAt DESC, opaque cursor). Page keeps the existing admin-only redirect guard + BootSplash.

**How to apply / design decisions baked in:**
- Pagination = "Load more" button appending via `nextCursor` (hidden when null). Not page numbers.
- Filter split: **server-side** = action (exact, single-select via Select) + date-range (mapped to `from` ISO, open `to`). **client-side over loaded rows** = free-text search (actorEmail/action/targetName/targetType) + actor checkboxes (derived from loaded `actorEmail`s). Changing a server-side filter bumps a `reloadKey` to refetch-from-top.
- `actionLabelKey` maps backend codes → `audit.action.*` i18n keys; unmapped codes fall back to `prettyAction()` (dots/underscores → spaces, capitalized).
- CSV export is client-side over the *filtered* (loaded) rows. Columns: occurredAt, actorEmail, action, targetType, targetName, success, ipHash. Toast on success.
- Uses shared `ApiLoadingState`/`ApiErrorState` (variant="inline") inside the Card; separate empty state for zero events.

**Action codes I could NOT confirm against backend (guessed the dotted form from the task spec):** `member.add/remove/role_change/invite`, `vault.role_change/revoke`, `folder.role_change/revoke`, `item.role_change/revoke/purge`. The contract examples only literally named: `item.reveal`, `vault.share`, `auth.login`, `account.vault_unlock_success`, `workspace.security_policy_updated`, `item.restore`, `trash.empty`. If these guessed codes differ on the wire they'll still render via `prettyAction` fallback — but the i18n label won't bind. Verify exact strings when backend audit emitters are inspectable.

Related: [[project-api-scaffolding]], [[reference-api-contract]], [[project-folder-item-sharing]].
