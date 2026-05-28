import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  folderMembers,
  folderTeamMembers,
  itemMembers,
  itemTeamMembers,
  teamMembers,
  vaultMembers,
  vaultTeamMembers,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Granular access engine — DESIGN.md §11.3 "most specific wins".
//
// Effective role of (user, item) is taken from the MOST SPECIFIC level that
// has a grant:
//   item override  →  folder grant  →  vault membership  →  (none)
// Teams (Phase B) are skipped. Org membership alone grants NO item access —
// a user must be a vault member or hold a folder/item grant.
//
// Threat model:
//   Asset: per-item plaintext + the share ACL itself. Getting the effective
//     role wrong is a direct authorization bug (over-share → leak, under-share
//     → DoS). Privilege escalation via the share endpoints (a low-rank sharer
//     minting a higher-rank grant) is the headline adversary.
//   Adversaries:
//     * A vault Editor who shares an item up to Manager (escalation) — blocked
//       by `shareAuthority*` caps (a sharer may only grant a role <= their own
//       authority, and may only touch a grant whose CURRENT role <= authority).
//     * A Viewer attempting to reveal/copy — blocked by `canRevealItem`.
//     * Cross-tenant probing — callers with no effective access get 404 at the
//       route layer (anti-enumeration); 403 only when they have access but
//       insufficient authority.
//   Mitigations: single source of truth for resolution + authority here; routes
//     feed the EFFECTIVE role to the existing capability helpers.
//   Residual risk: explicit-deny and time-limited grants (DESIGN.md §11.3) are
//     deferred — every grant is an allow with no expiry in this phase.
// ---------------------------------------------------------------------------

export const ROLES = ["manager", "editor", "user", "viewer"] as const;
export type Role = (typeof ROLES)[number];

// Higher = more privileged. `viewer` is the floor of a *granted* role.
export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  user: 1,
  editor: 2,
  manager: 3,
};

export function roleRank(role: Role): number {
  return ROLE_RANK[role];
}

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

// REVEAL/USE capability gate (deliberate tightening). A viewer is metadata-only
// — they can SEE that an item exists (name/tags/timestamps) but may NOT decrypt
// the password/notes, download attachments, or pour the secret into a send.
export function canRevealItem(role: Role): boolean {
  return role !== "viewer";
}

// Resolve the effective role for (user, item) per the most-specific-wins order.
// Returns null when the user has NO access at any level. Uses up to three
// indexed point lookups (item PK → folder PK → vault PK); short-circuits on the
// first hit so the common "vault member, no overrides" case still costs one
// extra query at most.
export async function resolveItemRole(
  userId: string,
  item: { id: string; vaultId: string; folderId: string | null },
): Promise<Role | null> {
  // 1. Item level (most specific).
  const itemUserGrant = await db
    .select({
      role: itemMembers.role,
      originalRole: itemMembers.originalRole,
      expiresAt: itemMembers.expiresAt,
    })
    .from(itemMembers)
    .where(and(eq(itemMembers.itemId, item.id), eq(itemMembers.userId, userId)))
    .limit(1);

  const itemTeamGrants = await db
    .select({
      role: itemTeamMembers.role,
      originalRole: itemTeamMembers.originalRole,
      expiresAt: itemTeamMembers.expiresAt,
    })
    .from(itemTeamMembers)
    .innerJoin(teamMembers, eq(teamMembers.teamId, itemTeamMembers.teamId))
    .where(and(eq(itemTeamMembers.itemId, item.id), eq(teamMembers.userId, userId)));

  const itemRole = highestRole([
    ...itemUserGrant,
    ...itemTeamGrants
  ]);
  if (itemRole) return itemRole;

  // 2. Folder level
  if (item.folderId) {
    const folderUserGrant = await db
      .select({
        role: folderMembers.role,
        originalRole: folderMembers.originalRole,
        expiresAt: folderMembers.expiresAt,
      })
      .from(folderMembers)
      .where(and(eq(folderMembers.folderId, item.folderId), eq(folderMembers.userId, userId)))
      .limit(1);

    const folderTeamGrants = await db
      .select({
        role: folderTeamMembers.role,
        originalRole: folderTeamMembers.originalRole,
        expiresAt: folderTeamMembers.expiresAt,
      })
      .from(folderTeamMembers)
      .innerJoin(teamMembers, eq(teamMembers.teamId, folderTeamMembers.teamId))
      .where(and(eq(folderTeamMembers.folderId, item.folderId), eq(teamMembers.userId, userId)));

    const folderRole = highestRole([
      ...folderUserGrant,
      ...folderTeamGrants
    ]);
    if (folderRole) return folderRole;
  }

  // 3. Vault level (least specific).
  const vaultUserGrant = await db
    .select({
      role: vaultMembers.role,
      originalRole: vaultMembers.originalRole,
      expiresAt: vaultMembers.expiresAt,
    })
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, item.vaultId), eq(vaultMembers.userId, userId)))
    .limit(1);

  const vaultTeamGrants = await db
    .select({
      role: vaultTeamMembers.role,
      originalRole: vaultTeamMembers.originalRole,
      expiresAt: vaultTeamMembers.expiresAt,
    })
    .from(vaultTeamMembers)
    .innerJoin(teamMembers, eq(teamMembers.teamId, vaultTeamMembers.teamId))
    .where(and(eq(vaultTeamMembers.vaultId, item.vaultId), eq(teamMembers.userId, userId)));

  const vaultRole = highestRole([
    ...vaultUserGrant,
    ...vaultTeamGrants
  ]);
  return vaultRole;
}

// Resolve the effective role for (user, folder): folder grant → vault
// membership → null. Used to gate folder mutations + folder-share authority.
export async function resolveFolderRole(
  userId: string,
  folder: { id: string; vaultId: string },
): Promise<Role | null> {
  // 1. Folder level
  const folderUserGrant = await db
    .select({
      role: folderMembers.role,
      originalRole: folderMembers.originalRole,
      expiresAt: folderMembers.expiresAt,
    })
    .from(folderMembers)
    .where(and(eq(folderMembers.folderId, folder.id), eq(folderMembers.userId, userId)))
    .limit(1);

  const folderTeamGrants = await db
    .select({
      role: folderTeamMembers.role,
      originalRole: folderTeamMembers.originalRole,
      expiresAt: folderTeamMembers.expiresAt,
    })
    .from(folderTeamMembers)
    .innerJoin(teamMembers, eq(teamMembers.teamId, folderTeamMembers.teamId))
    .where(and(eq(folderTeamMembers.folderId, folder.id), eq(teamMembers.userId, userId)));

  const folderRole = highestRole([
    ...folderUserGrant,
    ...folderTeamGrants
  ]);
  if (folderRole) return folderRole;

  // 2. Vault level
  const vaultUserGrant = await db
    .select({
      role: vaultMembers.role,
      originalRole: vaultMembers.originalRole,
      expiresAt: vaultMembers.expiresAt,
    })
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, folder.vaultId), eq(vaultMembers.userId, userId)))
    .limit(1);

  const vaultTeamGrants = await db
    .select({
      role: vaultTeamMembers.role,
      originalRole: vaultTeamMembers.originalRole,
      expiresAt: vaultTeamMembers.expiresAt,
    })
    .from(vaultTeamMembers)
    .innerJoin(teamMembers, eq(teamMembers.teamId, vaultTeamMembers.teamId))
    .where(and(eq(vaultTeamMembers.vaultId, folder.vaultId), eq(teamMembers.userId, userId)));

  const vaultRole = highestRole([
    ...vaultUserGrant,
    ...vaultTeamGrants
  ]);
  return vaultRole;
}

/** Helper to pick the highest role among multiple applicable grants. */
function highestRole(grants: { role: string; originalRole: string | null; expiresAt: Date | null }[]): Role | null {
  const activeRoles = grants
    .map(g => {
      if (g.expiresAt && g.expiresAt < new Date()) {
        return (g.originalRole as Role) ?? null;
      }
      return g.role as Role;
    })
    .filter((r): r is Role => r !== null);

  if (activeRoles.length === 0) return null;
  return activeRoles.reduce((prev, curr) => 
    ROLE_RANK[curr] > ROLE_RANK[prev] ? curr : prev
  );
}

// Rank just below `viewer` (no grant). Used as the floor when a non-creator has
// no effective item role at all.
const BELOW_VIEWER = -1;

// Share authority over an ITEM. A user may share an item if they hold an
// effective role of editor+ OR they created the item (creators always retain
// at least editor-level share authority over their own items — DESIGN.md §11.2
// Editor has `share`). The returned NUMBER is the max role rank the sharer may
// grant or modify; allowed-to-share iff it is >= roleRank('editor').
export function shareAuthorityForItem(
  effectiveItemRole: Role | null,
  isCreator: boolean,
): number {
  const fromRole = effectiveItemRole ? roleRank(effectiveItemRole) : BELOW_VIEWER;
  const fromCreator = isCreator ? roleRank("editor") : BELOW_VIEWER;
  return Math.max(fromRole, fromCreator);
}

// Share authority over a FOLDER. Folders have no per-resource "creator" concept
// in this phase, so authority is purely the effective folder role rank. Allowed
// to share iff >= roleRank('editor').
export function shareAuthorityForFolder(effectiveFolderRole: Role | null): number {
  return effectiveFolderRole ? roleRank(effectiveFolderRole) : BELOW_VIEWER;
}

// True iff a sharer with `authority` may set a grant to `targetRole`. No
// escalation: the granted role's rank must be <= the sharer's authority.
export function canGrantRole(authority: number, targetRole: Role): boolean {
  return authority >= roleRank("editor") && roleRank(targetRole) <= authority;
}

// True iff a sharer with `authority` may modify/remove a grant whose CURRENT
// role is `currentRole`. Can't touch someone ranked above your authority.
export function canModifyGrant(authority: number, currentRole: Role): boolean {
  return authority >= roleRank("editor") && roleRank(currentRole) <= authority;
}
