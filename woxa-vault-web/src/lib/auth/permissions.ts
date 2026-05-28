/**
 * Org-role permission helpers — the UI mirror of the backend's role gate.
 *
 * The org/workspace role (`useAuth().me?.role`) layers ON TOP of the per-vault
 * role (`vault.role`: manager|editor|user|viewer). These helpers answer the
 * ORG-level question only ("may this role ever see workspace settings / write
 * vault data at all?"); the per-vault role still further narrows what a
 * non-guest may do inside a given vault, and that logic stays untouched.
 *
 * Backend mirror (so the UI never shows an action that would just 403):
 *   - GET /audit is admin-only — non-admins receive 403, so we hide the Audit
 *     log nav + page from member/guest.
 *   - Workspace settings mutations are admin-only.
 *   - Every NON-GET vault / item / folder / attachment / send / vault-member
 *     endpoint is blocked for guests (`blockGuestWrites` → 403). Guests keep
 *     read access: list, open, reveal, copy, download attachments.
 *
 * All functions are pure and accept `OrgRole | null`. `null` means the user is
 * not in a workspace yet — treat as "no privileges" everywhere.
 */

import type { OrgRole } from "@/lib/api/members";
import type { VaultRole } from "@/lib/api/types";

/** owner + admin — the two roles that administer the workspace. */
export function isWorkspaceAdmin(role: OrgRole | null): boolean {
  return role === "owner" || role === "admin";
}

/** Read-only role: may view/reveal/copy/download but never write. */
export function isGuest(role: OrgRole | null): boolean {
  return role === "guest";
}

/** Workspace Settings page + nav link — owner/admin only. */
export function canViewWorkspaceSettings(role: OrgRole | null): boolean {
  return isWorkspaceAdmin(role);
}

/** Audit log page + nav link — owner/admin only (GET /audit is admin-only). */
export function canViewAuditLog(role: OrgRole | null): boolean {
  return isWorkspaceAdmin(role);
}

/**
 * May this role perform ANY vault data write (create / edit / delete / share /
 * move / send)? False for guests and for users with no workspace; true for
 * member/admin/owner. NOTE: a `true` here is necessary but not sufficient — the
 * per-vault `vault.role` still narrows the action inside a specific vault. Use
 * this with AND alongside the existing vault-role checks.
 */
export function canWriteVaultData(role: OrgRole | null): boolean {
  return role != null && role !== "guest";
}

/* ---------------------------------------------------------------------------
 * Per-resource (item/folder) effective-role helpers — the "most specific wins"
 * model surfaced by the backend (item override > folder grant > vault role).
 *
 * These answer the resource-level question only. They must be ANDed with the
 * org-level `canWriteVaultData(orgRole)` guard at call sites: a guest is
 * read-only everywhere regardless of a generous effectiveRole, and the backend
 * blocks their writes with 403.
 * ------------------------------------------------------------------------- */

/** May reveal/copy the secret? Everyone except an effective viewer. */
export function canRevealItem(effectiveRole: VaultRole): boolean {
  return effectiveRole !== "viewer";
}

/**
 * May create/edit/delete the item? Only manager|editor. Per DESIGN.md §3 the
 * `user` role is USE-ONLY (view + reveal/copy) — it cannot write; `viewer` is
 * metadata-only. The org-level guest gate is separate — callers AND this with
 * canWriteVaultData(orgRole). Mirrors the backend `canManageItem`.
 */
export function canEditItemRole(effectiveRole: VaultRole): boolean {
  return effectiveRole === "manager" || effectiveRole === "editor";
}

/** May share the item? Effective editor/manager (creators are handled at call sites). */
export function canShareResourceRole(effectiveRole: VaultRole): boolean {
  return effectiveRole === "manager" || effectiveRole === "editor";
}
