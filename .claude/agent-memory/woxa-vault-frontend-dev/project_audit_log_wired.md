---
name: project-audit-log-wired
description: Audit Log page wired to real GET /audit (PAGE-based pagination, all-server-side filters + /audit/actors, CSV export); action-code → i18n map and which codes are guessed
metadata:
  type: project
---

The Audit Log page (`src/app/app/audit/page.tsx`) is wired to the real backend, replacing the `auditEvents` mock. API wrapper at `src/lib/api/audit.ts`.

**Why:** Backend shipped admin-only `GET /audit` with **page-based** pagination + all-server-side filters. Page keeps the existing admin-only redirect guard + BootSplash.

**Current contract (page-based — replaced the old cursor model):**
- `listAudit({ page, limit, action?, from?, to?, q?, actor? }, signal)` → `{ events, total, page, limit }`. `page` 1-based default 1; `limit` ∈ {25,50,75,100} default **25**; `actor` is `string[]` of userIds serialized as REPEATED `actor=` params (URLSearchParams.append); `q` is server-side free-text. `total` = all rows matching filters.
- `listAuditActors(signal)` → `AuditActor[]` (`{ userId, email }`) for the actor dropdown (org-wide distinct actors, fetched once on mount when admin — NOT derived from loaded rows).
- Dashboard `app/page.tsx` calls `listAudit({ page:1, limit:50 })` and reads `.events`; its "N+" stat uses `total > events.length`.

**How to apply / design decisions baked in:**
- Pagination = Prev/Next buttons (ChevronLeft/Right) + "Page X of Y" (`totalPages = max(1, ceil(total/pageSize))`) + a per-page Select (25/50/75/100, default 25) in a footer row. List REPLACES on every fetch (no append).
- Count pill in toolbar = `audit.showing_range` "Showing {start}–{end} of {total}". Popover footer = `audit.total_events` "{total} events".
- ALL filters server-side now: action (exact single-select), date-range (→ `from` ISO, open `to`), `q` (search input, **debounced ~300ms** before refetch), `actor` (multi-select checkboxes storing userIds, chips show email via a userId→email map). Changing ANY filter or pageSize resets `page` to 1.
- **Page-reset must happen in event handlers, not a `setPage(1)` effect** — eslint `react-hooks/set-state-in-effect` forbids the effect. Wrapper setters (`changeAction`/`changeDateRange`/`changePageSize`/`clearActors`/`clearAll`/`toggleActor`) call `setPage(1)`; for the debounced query, `setPage(1)` runs inside the `setTimeout` callback when the term actually changed.
- CSV export is client-side over the *current page* rows (`events`). Columns: occurredAt, actorEmail, action, targetType, targetName, success, ipHash. Toast on success.
- `actionLabelKey` maps backend codes → `audit.action.*` i18n keys; unmapped fall back to `prettyAction()`.
- Uses shared `ApiLoadingState`/`ApiErrorState` (variant="inline"); empty state when `total === 0`.
- Pre-existing eslint baseline for this file: 2 errors (`Date.now` purity in the `fromIso` useMemo + `setLoading(true)` in the fetch effect) — these predate the pagination work; don't churn them.

**Action codes I could NOT confirm against backend (guessed the dotted form from the task spec):** `member.add/remove/role_change/invite`, `vault.role_change/revoke`, `folder.role_change/revoke`, `item.role_change/revoke/purge`. The contract examples only literally named: `item.reveal`, `vault.share`, `auth.login`, `account.vault_unlock_success`, `workspace.security_policy_updated`, `item.restore`, `trash.empty`. If these guessed codes differ on the wire they'll still render via `prettyAction` fallback — but the i18n label won't bind. Verify exact strings when backend audit emitters are inspectable.

Related: [[project-api-scaffolding]], [[reference-api-contract]], [[project-folder-item-sharing]].
