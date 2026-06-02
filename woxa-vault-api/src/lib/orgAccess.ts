import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orgMembers } from "@/db/schema";

// Org role hierarchy: owner > admin > member > guest. We accept any role text
// at the DB layer (DESIGN.md §3) but the API surface narrows to this union.
export const ORG_ROLES = ["owner", "admin", "auditor", "member", "guest"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

// Numeric rank for the single-owner hierarchy (DESIGN.md §3 — Owner > Admin >
// Member > Guest). Higher = more privileged. Use `outranks()` rather than
// comparing role strings ad hoc so the precedence rule lives in one place.
const ROLE_RANK: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  auditor: 2,
  member: 1,
  guest: 0,
};

// True iff `actor` strictly outranks `target`. An Admin does NOT outrank an
// Owner (and never another Admin), so this is what gates "can A act on B".
// Equal ranks return false — peers cannot manage each other.
export function outranks(actor: OrgRole, target: OrgRole): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

// Roles that may be granted/targeted via the member-management surface
// (PATCH role / invite). `owner` is intentionally excluded — ownership changes
// hands ONLY through `POST /workspace/transfer-ownership`, which atomically
// demotes the previous owner to keep the single-owner invariant. Granting
// `owner` directly via PATCH would create a second owner and break the index.
export const ASSIGNABLE_ORG_ROLES = ["admin", "auditor", "member", "guest"] as const;
export type AssignableOrgRole = (typeof ASSIGNABLE_ORG_ROLES)[number];

export function isOwner(role: OrgRole): boolean {
  return role === "owner";
}

// Owner-only capabilities (DESIGN.md §3): delete the workspace, transfer
// ownership, manage billing. Distinct from `canManageOrgMembers` which also
// admits admins.
export function canManageWorkspace(role: OrgRole): boolean {
  return role === "owner";
}

// Returns the caller's DEFAULT org id + role — the first membership by
// joined_at. This is the fallback when a session has no (valid) active-org
// selection. Prefer `resolveActiveOrg` at request handlers so a multi-
// workspace user acts on the workspace they actually selected (finding M-1).
export async function currentOrgForUser(
  userId: string,
): Promise<{ orgId: string; role: OrgRole } | null> {
  const rows = await db
    .select({ orgId: orgMembers.orgId, role: orgMembers.role })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .orderBy(orgMembers.joinedAt)
    .limit(1);
  const first = rows[0];
  if (!first) return null;
  return { orgId: first.orgId, role: first.role as OrgRole };
}

// ---------------------------------------------------------------------------
// resolveActiveOrg — the single, centralized "which workspace is this request
// acting on?" decision (finding M-1).
//
// Threat model:
//   Asset: every org-scoped capability — member list/role/remove, invites,
//     security policy, ownership transfer, audit view. These are gated by the
//     RBAC role we return here, so getting the org OR the role wrong is a
//     direct authorization bug.
//   Adversaries:
//     * A multi-workspace user whose `sessions.active_org_id` points at org B
//       while their session was minted before they joined B, or after they
//       LEFT B (stale pointer) — must not act on B.
//     * A foraged/tampered active_org_id naming an org the caller never joined
//       (IDOR) — must not act on it.
//     * A user who is owner of org A and member of org B switching to B and
//       expecting A's owner powers to carry over (privilege escalation across
//       workspaces) — the role MUST come from the B membership.
//   Mitigations:
//     * We re-derive the membership for (userId, sessionActiveOrgId) from the
//       DB on EVERY call. The selection is only honoured if that membership
//       row still exists — which simultaneously proves the org exists, the
//       user is still a member, and yields the role to use. No membership =>
//       the pointer is ignored and we fall back to the default org.
//     * The role ALWAYS comes from the resolved membership row, never from a
//       cached/session value — so switching workspaces never carries another
//       workspace's privileges.
//   Residual risk:
//     * Two queries (active lookup + fallback) in the fallback path; acceptable
//       — both are indexed point lookups on org_members.
// ---------------------------------------------------------------------------
export async function resolveActiveOrg(args: {
  userId: string;
  sessionActiveOrgId: string | null | undefined;
}): Promise<{ orgId: string; role: OrgRole } | null> {
  const { userId, sessionActiveOrgId } = args;

  if (sessionActiveOrgId) {
    // Validate the selection against a LIVE membership row. A hit proves the
    // org exists AND the caller is still a member, and hands us the role to
    // enforce. A miss (left the org / org deleted / forged id) silently falls
    // through to the default below — we never error on a stale pointer.
    const rows = await db
      .select({ orgId: orgMembers.orgId, role: orgMembers.role })
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, sessionActiveOrgId)))
      .limit(1);
    const match = rows[0];
    if (match) {
      return { orgId: match.orgId, role: match.role as OrgRole };
    }
  }

  // No (valid) selection — fall back to the first membership by joined_at.
  return currentOrgForUser(userId);
}

// All of the caller's org memberships (the workspace-switcher list). Returns an
// empty array for a user with no membership (e.g. fresh signup pre-creation).
// Ordered by joinedAt so the workspace list is stable across requests.
export async function orgsForUser(
  userId: string,
): Promise<{ orgId: string; role: OrgRole; joinedAt: Date }[]> {
  const rows = await db
    .select({ orgId: orgMembers.orgId, role: orgMembers.role, joinedAt: orgMembers.joinedAt })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .orderBy(orgMembers.joinedAt);
  return rows.map((r) => ({ orgId: r.orgId, role: r.role as OrgRole, joinedAt: r.joinedAt }));
}

// Look up a specific (org, user) membership. Returns null when the target user
// is NOT in the org — keeps the route logic free of role-existence vs
// membership-existence branches.
export async function getOrgMembership(
  orgId: string,
  userId: string,
): Promise<{ orgId: string; userId: string; role: OrgRole; joinedAt: Date } | null> {
  const rows = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);
  const first = rows[0];
  if (!first) return null;
  return {
    orgId: first.orgId,
    userId: first.userId,
    role: first.role as OrgRole,
    joinedAt: first.joinedAt,
  };
}

export function canManageOrgMembers(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

// Admins/owners get the broad audit view (all org events). Everyone else only
// sees rows where they are the actor.
export function canViewAllOrgAudit(role: OrgRole): boolean {
  return role === "owner" || role === "admin" || role === "auditor";
}
