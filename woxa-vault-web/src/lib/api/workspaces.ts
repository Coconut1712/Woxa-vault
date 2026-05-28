/**
 * Workspace membership + creation endpoints — see /API_CONTRACT.md
 * ("Endpoints — Workspaces").
 *
 * These power the post-auth `/spaces` surface where a user picks a workspace to
 * enter or creates a brand-new one (becoming its sole Owner). The server is the
 * source of truth for `role`: the client never assigns or trusts it for gating
 * sensitive actions — RBAC enforcement lives entirely in the backend.
 *
 * Both routes require an authenticated session (Lucia cookie). A bare 401 means
 * the caller should bounce through `/login/password`.
 */

import { apiFetch } from "./client";
import type { OrgRole } from "./members";
import type { VaultColor } from "./types";

/** A workspace the current user belongs to, as returned by GET /me/workspaces. */
export interface MyWorkspace {
  id: string;
  name: string;
  /** URL-safe slug / domain handle the backend derives from the name. */
  slug: string;
  /** The caller's role within THIS workspace — from the server, never trusted client-side for gating. */
  role: OrgRole;
  /** Total active members in the workspace. */
  memberCount: number;
  /** ISO timestamp of when the caller joined (or created) this workspace. */
  joinedAt: string;
}

interface MyWorkspacesResponse {
  workspaces: MyWorkspace[];
}

/**
 * A vault that exists in the workspace but the caller is NOT a member of —
 * metadata only (no items, no role). Owner/admin sees these as the workspace
 * inventory; they still cannot open them (item routes stay membership-gated).
 */
export interface WorkspaceVault {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  color: VaultColor | null;
  itemCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /workspace/vaults — owner/admin only (403 otherwise). Lists org vaults the
 * caller is NOT a member of (their own come from `listVaults`). Throws ApiError
 * `forbidden` for non-admins, `not_found` when the caller has no workspace.
 */
export async function listWorkspaceVaults(
  signal?: AbortSignal,
): Promise<WorkspaceVault[]> {
  const res = await apiFetch<{ vaults: WorkspaceVault[] }>("/workspace/vaults", {
    signal,
  });
  return Array.isArray(res?.vaults) ? res.vaults : [];
}

/** Response from POST /workspace — the freshly created workspace, caller is Owner. */
export interface CreatedWorkspace {
  id: string;
  name: string;
  slug: string;
  /** Always "owner" for the creator — the backend enforces this. */
  role: OrgRole;
}

/** Summary returned by POST /workspace/switch — the now-active workspace. */
export interface SwitchedWorkspace {
  id: string;
  name: string;
  slug: string;
  /** The caller's role within the workspace they just switched to — from the server. */
  role: OrgRole;
}

/**
 * GET /me/workspaces — list every workspace the current user belongs to.
 *
 * Defensive: normalizes a missing/non-array `workspaces` to `[]` so the empty
 * state renders rather than the page crashing if the backend ships the route
 * before the field is populated.
 *
 * Errors:
 *   - 401 unauthorized → caller should route to /login/password.
 */
export async function listMyWorkspaces(
  signal?: AbortSignal,
): Promise<MyWorkspace[]> {
  const res = await apiFetch<MyWorkspacesResponse>("/me/workspaces", { signal });
  return Array.isArray(res?.workspaces) ? res.workspaces : [];
}

/**
 * POST /workspace — create a new workspace. The creator becomes its Owner
 * (single Owner per workspace; the backend assigns the role, the client must
 * never imply it). Returns the new workspace so the caller can route into /app.
 *
 * Body: `{ name }` with `1 <= name.length <= WORKSPACE_NAME_MAX` after trim.
 * `WORKSPACE_NAME_MAX` is kept in sync with the backend's `max(80)` validator.
 *
 * Errors:
 *   - 400 validation_error — empty/too-long name.
 *   - 409 workspace_name_taken — a workspace with that name/slug already exists.
 *   - 429 rate_limited — too many create attempts.
 */
export async function createWorkspace(input: {
  name: string;
}): Promise<CreatedWorkspace> {
  const res = await apiFetch<{ workspace: CreatedWorkspace } | CreatedWorkspace>(
    "/workspace",
    { method: "POST", body: input },
  );
  // Accept either an enveloped `{ workspace }` or a bare object — both shapes
  // appear in draft contracts; normalize so the caller has one path.
  return "workspace" in (res as { workspace?: CreatedWorkspace })
    ? (res as { workspace: CreatedWorkspace }).workspace
    : (res as CreatedWorkspace);
}

/**
 * POST /workspace/switch — set the caller's ACTIVE workspace for the session.
 *
 * After a successful switch, every org-scoped surface (vaults / members /
 * workspace settings) is re-scoped to the new org and a subsequent GET /me
 * reflects the new `activeOrgId` + `role`. Callers MUST follow this with a
 * fresh /me (e.g. AuthProvider.refresh()) and reload any cached org-scoped
 * data so the UI never shows the previous workspace's contents.
 *
 * SECURITY: the client only sends `orgId` — it never asserts a role. The
 * backend re-validates that the caller is actually a member of `orgId` and
 * returns the authoritative `role`. A non-member is rejected with 404.
 *
 * Body: `{ orgId }`.
 *
 * Errors:
 *   - 404 not_found — the caller is not a member of `orgId` (or it doesn't
 *     exist). The two are deliberately indistinguishable.
 *   - 400 validation_error — missing/invalid `orgId`.
 *   - 429 rate_limited — too many switch attempts (Retry-After header).
 */
export async function switchWorkspace(
  orgId: string,
): Promise<SwitchedWorkspace> {
  const res = await apiFetch<
    { workspace: SwitchedWorkspace } | SwitchedWorkspace
  >("/workspace/switch", { method: "POST", body: { orgId } });
  // Accept either an enveloped `{ workspace }` or a bare object — both shapes
  // appear in draft contracts; normalize so the caller has one path.
  return "workspace" in (res as { workspace?: SwitchedWorkspace })
    ? (res as { workspace: SwitchedWorkspace }).workspace
    : (res as SwitchedWorkspace);
}

/** Response from PATCH /workspace — the renamed active workspace. */
export interface RenamedWorkspace {
  id: string;
  name: string;
  slug: string;
  /** The caller's role within the workspace — from the server. */
  role: OrgRole;
  memberCount: number;
  vaultCount: number;
  createdAt: string;
}

/**
 * PATCH /workspace — rename the caller's ACTIVE workspace. Owner + admin only.
 *
 * The slug AUTO-FOLLOWS the name: the backend re-derives it from the new name
 * (server-side via `slugifyBase` — never client-supplied) and may append a short
 * suffix on a uniqueness collision, returning the resulting slug. `name` is
 * trimmed and must be 1..WORKSPACE_NAME_MAX chars; a same-name write is a no-op
 * that still returns the current workspace. Audited as `workspace.renamed`.
 *
 * Errors (ApiError carries status + code):
 *   - 403 forbidden — caller is not owner/admin.
 *   - 400 validation_error — empty / too-long name.
 *   - 409 workspace_slug_conflict — a concurrent rename raced the slug; retry.
 *   - 401 unauthorized → route to /login/password.
 */
export async function renameWorkspace(input: {
  name: string;
}): Promise<RenamedWorkspace> {
  const res = await apiFetch<{ workspace: RenamedWorkspace } | RenamedWorkspace>(
    "/workspace",
    { method: "PATCH", body: input },
  );
  // Accept either an enveloped `{ workspace }` or a bare object — matches the
  // create/switch normalization above.
  return "workspace" in (res as { workspace?: RenamedWorkspace })
    ? (res as { workspace: RenamedWorkspace }).workspace
    : (res as RenamedWorkspace);
}

/**
 * Max length for a workspace name (validated client-side; backend re-validates).
 * Synced with the backend contract (`max(80)`).
 */
export const WORKSPACE_NAME_MAX = 80;

/**
 * Best-effort preview of the slug the backend auto-derives from a workspace
 * name on rename. MUST mirror the API's `slugifyBase` (lowercase, NFKD,
 * non-alphanumerics → "-", collapse + trim hyphens, max 40 chars, fallback
 * "workspace"). The server is authoritative and may append a short suffix on a
 * uniqueness collision, so this is a preview only — never the source of truth.
 */
export function slugifyWorkspaceName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "workspace";
}
