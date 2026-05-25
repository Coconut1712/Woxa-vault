---
name: active-workspace-model
description: M-1 fix — sessions.active_org_id + resolveActiveOrg + POST /workspace/switch; how every org-scoped op resolves the active workspace
metadata:
  type: project
---

Finding M-1 fix (multi-workspace users acted on the wrong org). Migration 0012
adds `sessions.active_org_id uuid` FK → organizations ON DELETE SET NULL.

**Why:** `currentOrgForUser(userId)` returned the FIRST membership by joined_at
on every request, so a user in >1 workspace had members/invite/settings/transfer/
audit/vaults all silently target the wrong org.

**How to apply / invariants future rounds must NOT regress:**
- `resolveActiveOrg({userId, sessionActiveOrgId})` in `src/lib/orgAccess.ts` is the
  single source of truth: validates the pointer against a LIVE membership row each
  call; role ALWAYS comes from the active-org membership (no privilege carry-over);
  falls back to `currentOrgForUser` (first membership) when unset/stale/deleted.
- `activeOrgForContext(c)` in `src/middleware/auth.ts` is the per-handler seam —
  reads `c.var.session.activeOrgId` (already loaded by sessionMiddleware, no extra
  session fetch). EVERY org-scoped handler uses this, NOT `currentOrgForUser`.
  Call sites migrated: workspace.ts (GET / + settings + PATCH settings + transfer),
  members.ts (list/PATCH/DELETE/invite/resend/revoke), audit.ts, sends.ts (create),
  vaults.ts (helper renamed `currentOrgIdForUser` → `activeOrgIdForContext`; GET
  /vaults now scoped to active org via `vaults.orgId`, POST /vaults targets active).
  me.ts buildUserPayload now takes sessionActiveOrgId → activeOrgId+role reflect active.
- `currentOrgForUser` is KEPT only as the fallback inside resolveActiveOrg — do not
  reintroduce it as a handler call site.

**POST /workspace/switch** (workspace.ts): body `{orgId}`; IDOR-gated via
getOrgMembership → 404 (masks existence) if non-member; persists pointer on caller's
own session row (sha256(token) id); audited `workspace.switched`; RL 60/min/user;
returns `{workspace:{id,name,slug,role}}`. `switchSchema` exported for unit tests.

Tests: `src/routes/workspaceSwitch.test.ts` (integration, real PG) covers switch-as-
member, active-org scoping of /workspace+/settings+/members, IDOR 404 (no pointer
change), deleted-org fallback, role-from-active-org (owner A / admin B → admin after
switch B). See [[migration-history-handwritten]] and [[single-owner-workspace]].
