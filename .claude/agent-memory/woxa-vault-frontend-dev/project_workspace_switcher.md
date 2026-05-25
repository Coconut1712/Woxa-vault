---
name: project-workspace-switcher
description: The live workspace switcher in the /app sidebar + the POST /workspace/switch active-org flow and how /spaces enter wires to it
metadata:
  type: project
---

Live workspace switcher + active-org switching landed 2026-05-21 (backend shipped `sessions.active_org_id` + `POST /workspace/switch` first). Replaces the old MOCK switcher that read `workspace`/`currentUser` from `@/lib/mock/data` in the sidebar.

**API contract this wires to** (see [[reference-api-contract]]):
- `POST /workspace/switch` body `{ orgId }` → 200 `{ workspace: { id, name, slug, role } }` (role = role in the org switched to). Errors: 404 `not_found` (not a member / doesn't exist — deliberately indistinguishable), 429 `rate_limited` (Retry-After), 400 validation.
- `GET /me` now carries `activeOrgId` + `role` reflecting the ACTIVE workspace. After switch, all org-scoped surfaces (vaults/members/workspace settings) re-scope to active org.

**Files**:
- `src/lib/api/workspaces.ts` — `switchWorkspace(orgId)` → POST /workspace/switch, normalizes enveloped `{workspace}` OR bare obj. `SwitchedWorkspace` type. (`WORKSPACE_NAME_MAX = 80` in code, NOT 50 — older [[project-spaces-workspace-hub]] memory said 50, the code is authoritative.)
- `src/lib/api/me.ts` — `MeUser` gained optional `activeOrgId?: string | null` (optional = fail-open for older backends; switcher falls back to single-membership / displayName when absent).
- `src/components/layout/workspace-switcher.tsx` — NEW `<WorkspaceSwitcher onSignOut={...} />`. Self-contained: fetches `listMyWorkspaces()` on mount, resolves active via `me.activeOrgId` (fallback: single membership). Dropdown lists all memberships, active row has Check + role Badge (reuses `members.role.*` + the `roleIconColor` map shared with /spaces). DISAMBIGUATES duplicate names (e.g. two "Woxa Corp") by showing a `{slug} · {count} members` sub-line ONLY on rows whose name collides. Switch → `switchWorkspace` → `refresh()` → `toast` → `router.refresh()` (re-runs org-scoped server fetches, no stale data). Footer: "Manage workspaces" → /spaces, "Workspace settings" → /app/settings, destructive Sign out. Single-workspace user still works (shows name; dropdown has the one row + manage link).
- `src/components/layout/sidebar.tsx` — old inline mock switcher block REMOVED, replaced by `<WorkspaceSwitcher onSignOut={handleSignOut} />`. `currentUser` mock still used by the bottom USER CARD (display name/avatar) — that's a separate control, untouched. Removed now-unused `workspace` + `Building2` imports.
- `src/app/spaces/page.tsx` — `enterWorkspace(ws)` is now ASYNC: `await switchWorkspace(ws.id)` → `await refresh()` → `router.replace("/app")`. 404 → toast `workspace_switcher.error.no_access` + reload list (stale row drops); 429 → rate_limited toast; else generic. Reuses the `entering` busy state. Call site is `() => void enterWorkspace(ws)`.

Translation namespace: `workspace_switcher.*` (label, heading, current, member_count `{count}`, switching, switched_toast `{name}`, manage, load_error, error.{no_access,rate_limited,generic}). Loading row reuses existing `api.loading`.

**Security posture**: client sends ONLY `orgId` — never asserts role; backend re-validates membership + returns authoritative role. No secrets in storage. After switch we ALWAYS refresh /me + router.refresh() so the previous workspace's vaults/members never linger.

**How to apply**:
- Need the active workspace anywhere in chrome? Read `me.activeOrgId` and match against `listMyWorkspaces()`; treat `undefined` as "unknown" (fall back, don't crash).
- Anytime you switch active org programmatically, follow `switchWorkspace` with BOTH `refresh()` (chrome/guards) AND `router.refresh()` (server data) or org-scoped surfaces show stale data.
- Verified 2026-05-21: `npx tsc --noEmit` exit 0 + `npm run build` exit 0 (all routes ƒ Dynamic).
</content>
