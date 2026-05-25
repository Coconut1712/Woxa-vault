---
name: project-spaces-workspace-hub
description: The post-auth /spaces workspace hub (create/select), its API client, and the workspace-selection routing wall in SessionGuard
metadata:
  type: project
---

`/spaces` (post-auth workspace hub) landed 2026-05-21. Decision by user: new SSO flow is Google SSO → (new user) /setup-password → /spaces → /app. Single Owner per workspace; the creator is always Owner (backend enforces, frontend display-only).

- `src/app/spaces/page.tsx` — client page, OUTSIDE `/app` (like /setup-password) so it runs its OWN auth check and is NOT wrapped by SessionGuard — that separation is what stops the no-workspace→/spaces redirect from looping. Sections: "Your workspaces" (list rows from `listMyWorkspaces()`, avatar initial + name + role Badge reusing the members-page `roleIconColor` map + `{slug} · {count} members · joined {date}` meta) and "Create a new workspace" (name input, maxLength 50, trim, amber Owner-notice banner, error code map). Empty state shows when the list resolves to zero. Entering a workspace currently just `router.push("/app")` — NO client-side active-workspace switch exists (backend scopes /app by session); TODO(api) call a switch endpoint here when one lands. NO `useSearchParams`/`next` param, so no Suspense wrapper and no open-redirect surface.
- `src/lib/api/workspaces.ts` — `listMyWorkspaces()` (GET /me/workspaces, normalizes missing array → []), `createWorkspace({name})` (POST /workspace, accepts enveloped `{workspace}` OR bare object), `MyWorkspace`/`CreatedWorkspace` types, `WORKSPACE_NAME_MAX = 50`. Role typed as `OrgRole` from members.ts.
- `src/lib/auth/workspace-routing.ts` — `needsWorkspaceSelection(me)` is the SINGLE source of truth shared by SessionGuard and (implicitly) /spaces. Resolution: `hasWorkspace` boolean wins; else `workspaceCount > 0`; else UNKNOWN → returns false (FAILS OPEN to /app so existing users on an older backend are never bounced into /spaces).
- `src/lib/api/me.ts` — `MeUser` gained optional `hasWorkspace?: boolean` + `workspaceCount?: number`. Both optional on purpose (fail-open). Prefer `hasWorkspace` when present.
- `src/lib/auth/session-guard.tsx` — routing ladder: (1) `requiresPasswordSetup` → /setup-password (2) `needsWorkspaceSelection(me)` → /spaces (3) render /app. `ready` gate now also requires `!needsWorkspaceSelection(me)`.
- `src/app/setup-password/page.tsx` — `handleRecoveryConfirm` now `router.replace("/spaces")` (was `/app`).

Translation namespace: `spaces.*` (title, subtitle, joined_heading, create_heading, workspace_meta `{slug}·{count}`, joined_on `{date}`, enter_aria `{name}`, load_error, empty.{title,desc,cta}, create.{name_label,name_placeholder,owner_notice,submit,submitting,success_toast}, create.error.{required,invalid_name,name_taken,rate_limited,generic}). Role badges reuse existing `members.role.{owner,admin,member,guest}`. "workspace"/"Owner" kept English-ish in TH per project rules.

**API CONTRACT this wires to** (backend building in parallel — see [[reference-api-contract]]):
- GET /me → adds `hasWorkspace`/`workspaceCount`
- GET /me/workspaces → `{ workspaces: [{ id, name, slug, role, memberCount, joinedAt }] }`
- POST /workspace → body `{ name }` → `{ id, name, slug, role: "owner" }`

**Why**: AC-005 first-Owner workspace setup + FR-025 multi-workspace membership. The OLD `/welcome` (pre-auth email discovery, [[project-welcome-onboarding]]) is UNTOUCHED and is a different surface. The `/setup` 4-step wizard (AC-005.1 domain/TXT/JIT) is still a separate pending route — /spaces is the lighter create-or-join hub, not the full wizard.

**How to apply**:
- Need post-auth membership-gated routing? Use `needsWorkspaceSelection(me)` — never re-derive the hasWorkspace/workspaceCount logic inline.
- /spaces is a legit hub: do NOT make it auto-bounce to /app when the user already has a workspace (FR-025 lets users belong to multiple). Only SessionGuard bounces no-workspace users INTO it.
- Verified 2026-05-21: `npx tsc --noEmit` clean + `npm run build` clean (/spaces shows as ƒ Dynamic).
