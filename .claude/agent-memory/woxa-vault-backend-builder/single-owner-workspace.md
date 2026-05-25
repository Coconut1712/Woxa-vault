---
name: single-owner-workspace
description: Single-Owner role model + workspace create/transfer/list flow (migration 0009, /spaces onboarding)
metadata:
  type: project
---

Single-Owner workspace model + create-or-join onboarding (US-005 / US-005b, DESIGN.md §3 + §4.1).

**Decision (user-chosen):** Google SSO → setup master password → `/spaces` create-or-join. Creator of a workspace = **Owner**, exactly one Owner per workspace, ownership transferable.

**RBAC hierarchy lives in `src/lib/orgAccess.ts`:**
- `outranks(actor, target)` — Owner(3) > Admin(2) > Member(1) > Guest(0); equal ranks return false (peers can't manage each other). Use this, not ad-hoc string compares.
- `ASSIGNABLE_ORG_ROLES = [admin, member, guest]` — `owner` excluded; `PATCH /members/:id` schema uses this so granting owner is a `400 validation_error`.
- `canManageWorkspace(role)` = owner-only (delete/transfer/billing). `canManageOrgMembers` = owner+admin (unchanged).
- `orgsForUser(userId)` — all memberships for the workspace switcher (`GET /me/workspaces`).

**Endpoints:**
- `POST /workspace` (`src/routes/workspace.ts`) — tx: org + owner membership + default vaults "Shared"/"{User}'s Personal" (creator=manager). `slugifyBase()` + `allocateSlug()` (random suffix on collision). RL 5/hr/user. Audit `workspace.created`. Returns `{id,name,slug,role:"owner"}` 201.
- `POST /workspace/transfer-ownership` — Owner-only, atomic demote-self→admin THEN promote-target→owner (order matters: frees the partial index before promote). Self-transfer rejected. Audit `workspace.ownership_transferred`. RL 5/hr/user.
- `GET /me/workspaces` (`src/routes/me.ts`) — empty array, never 404.
- `GET /me` now returns `hasWorkspace` / `workspaceCount` / `activeOrgId` (drives `/spaces` redirect). `buildUserPayload` uses `orgsForUser()[0]` as current.

**members.ts changes:** PATCH + DELETE reject touching Owner (`403 forbidden`) and require caller to strictly `outranks()` target. Removed `countOwners()` + the `last_owner` 409 code path entirely.

**Single-owner invariant (2 layers):** (1) atomic tx in transfer; (2) DB partial unique index `org_members_single_owner_idx ON (org_id) WHERE role='owner'` — schema.ts + **migration 0009** (hand-written, see [[migration-history-handwritten]]).

**SSO JIT change (`src/routes/sso.ts`):** no longer auto-creates an org for a brand-new user. Joins existing domain-slug org as `member` if present; otherwise user is org-less → `hasWorkspace:false` → frontend routes to `/spaces`.

**CONTRACT CHANGE flagged to frontend:** `last_owner` (409) is DEPRECATED/unreachable — owner ops on /members now return `403 forbidden`. Updated in `/API_CONTRACT.md`.

Related: [[google-sso]], [[api-contract]], [[account-self-service]].
