import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, itemMembers, itemTeamMembers, items, teamMembers, teams, users, vaults, type Item } from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { getOrgMembership } from "@/lib/orgAccess";
import {
  canGrantRole,
  canModifyGrant,
  resolveItemRole,
  shareAuthorityForItem,
  type Role,
} from "@/lib/access";
import { createNotification } from "@/lib/notifications";
import { jsonValidator, paramValidator } from "@/lib/validator";
import {
  activeOrgForContext,
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  type AuthVariables,
} from "@/middleware/auth";
import { loadVaultForViewer } from "@/routes/vaults";

// ---------------------------------------------------------------------------
// Threat model — item-level sharing (DESIGN.md §11.3)
//
// Asset: item_members & item_team_members rows (the MOST specific access).
// Adversaries:
//   * Privilege escalation / modifying grants above authority.
//   * Cross-org targeting.
//   * Probing item IDs without access.
// Mitigations: granular authority logic, org-scoped lookups, audit logging,
//   and collective access through teams.
// ---------------------------------------------------------------------------

const ROLES = ["manager", "editor", "user", "viewer"] as const;
const roleSchema = z.enum(ROLES);

const itemParam = z.object({ id: z.string().uuid() });
const itemUserParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const itemTeamParam = z.object({ id: z.string().uuid(), teamId: z.string().uuid() });

const createSchema = z.object({ userId: z.string().uuid(), role: roleSchema });
const teamCreateSchema = z.object({ teamId: z.string().uuid(), role: roleSchema });
const patchSchema = z.object({ role: roleSchema });

interface ItemMemberDTO {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

interface ItemTeamMemberDTO {
  teamId: string;
  teamName: string;
  role: Role;
}

async function loadItemContext(
  itemId: string,
  userId: string,
): Promise<{ item: Item; effectiveRole: Role | null; authority: number } | null> {
  const item = await db.query.items.findFirst({ where: and(eq(items.id, itemId), isNull(items.deletedAt)) });
  if (!item) return null;
  const effectiveRole = await resolveItemRole(userId, { id: item.id, vaultId: item.vaultId, folderId: item.folderId });
  const isCreator = item.createdBy === userId;
  if (!effectiveRole && !isCreator) return null;
  const authority = shareAuthorityForItem(effectiveRole, isCreator);
  return { item, effectiveRole, authority };
}

async function emailFor(userId: string): Promise<string | null> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return u?.email ?? null;
}

async function loadItemMember(itemId: string, userId: string): Promise<ItemMemberDTO | null> {
  const rows = await db
    .select({
      userId: itemMembers.userId, role: itemMembers.role,
      email: users.email, displayName: users.displayName, name: users.name,
    })
    .from(itemMembers)
    .innerJoin(users, eq(users.id, itemMembers.userId))
    .where(and(eq(itemMembers.itemId, itemId), eq(itemMembers.userId, userId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    userId: r.userId, email: r.email,
    displayName: r.displayName ?? r.name ?? r.email,
    role: r.role as Role,
  };
}

async function loadItemTeamMember(itemId: string, teamId: string): Promise<ItemTeamMemberDTO | null> {
  const rows = await db
    .select({ teamId: itemTeamMembers.teamId, role: itemTeamMembers.role, teamName: teams.name })
    .from(itemTeamMembers)
    .innerJoin(teams, eq(teams.id, itemTeamMembers.teamId))
    .where(and(eq(itemTeamMembers.itemId, itemId), eq(itemTeamMembers.teamId, teamId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { teamId: r.teamId, teamName: r.teamName, role: r.role as Role };
}

export const itemMemberRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  .get("/:id/members", paramValidator(itemParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const activeOrg = await activeOrgForContext(c);
    const isAuditor = activeOrg?.role === "auditor";

    const ctx = await loadItemContext(id, user.id);
    if (!ctx && !isAuditor) throw errors.notFound("Item not found");

    if (isAuditor) {
      const [itemRow] = await db
        .select({ orgId: vaults.orgId })
        .from(items)
        .innerJoin(vaults, eq(items.vaultId, vaults.id))
        .where(eq(items.id, id))
        .limit(1);
      if (!itemRow || itemRow.orgId !== activeOrg?.orgId) throw errors.notFound("Item not found");
    }

    const rows = await db
      .select({
        userId: itemMembers.userId, role: itemMembers.role,
        email: users.email, displayName: users.displayName, name: users.name,
      })
      .from(itemMembers)
      .innerJoin(users, eq(users.id, itemMembers.userId))
      .where(eq(itemMembers.itemId, id))
      .orderBy(asc(itemMembers.createdAt));

    return c.json({ members: rows.map(r => ({ ...r, displayName: r.displayName ?? r.name ?? r.email })) });
  })

  .get("/:id/team-members", paramValidator(itemParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const activeOrg = await activeOrgForContext(c);
    const isAuditor = activeOrg?.role === "auditor";

    const ctx = await loadItemContext(id, user.id);
    if (!ctx && !isAuditor) throw errors.notFound("Item not found");

    if (isAuditor) {
      const [itemRow] = await db
        .select({ orgId: vaults.orgId })
        .from(items)
        .innerJoin(vaults, eq(items.vaultId, vaults.id))
        .where(eq(items.id, id))
        .limit(1);
      if (!itemRow || itemRow.orgId !== activeOrg?.orgId) throw errors.notFound("Item not found");
    }

    const rows = await db
      .select({ teamId: itemTeamMembers.teamId, role: itemTeamMembers.role, teamName: teams.name })
      .from(itemTeamMembers)
      .innerJoin(teams, eq(teams.id, itemTeamMembers.teamId))
      .where(eq(itemTeamMembers.itemId, id))
      .orderBy(asc(itemTeamMembers.createdAt));

    return c.json({ teamMembers: rows });
  })

  .post("/:id/members", paramValidator(itemParam), jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const ctx = await loadItemContext(id, user.id);
    if (!ctx) throw errors.notFound("Item not found");

    if (!canGrantRole(ctx.authority, body.role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.item.vaultId, user.id);
    if (!viewer) throw errors.notFound("Item not found");
    const targetMembership = await getOrgMembership(viewer.vault.orgId, body.userId);
    if (!targetMembership) throw errors.notFound("User not in workspace");

    const existing = await loadItemMember(id, body.userId);
    if (existing) return c.json({ error: { code: "member_conflict", message: "Already has grant" } }, 409);

    const granteeEmail = await emailFor(body.userId);
    await db.transaction(async (tx) => {
      await tx.insert(itemMembers).values({ itemId: id, userId: body.userId, role: body.role });
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "item.share", targetType: "item", targetId: id, targetName: ctx.item.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { granteeUserId: body.userId, granteeEmail, role: body.role },
      });
      await createNotification(tx, {
        userId: body.userId, orgId: viewer.vault.orgId, type: "share.received",
        actorUserId: user.id, actorEmail: user.email, targetType: "item", targetId: id, targetName: ctx.item.name,
        metadata: { resourceKind: "item", role: body.role },
      });
    });

    const created = await loadItemMember(id, body.userId);
    return c.json({ member: created }, 201);
  })

  .post("/:id/team-members", paramValidator(itemParam), jsonValidator(teamCreateSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const ctx = await loadItemContext(id, user.id);
    if (!ctx) throw errors.notFound("Item not found");

    if (!canGrantRole(ctx.authority, body.role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.item.vaultId, user.id);
    if (!viewer) throw errors.notFound("Item not found");
    const team = await db.query.teams.findFirst({ where: and(eq(teams.id, body.teamId), eq(teams.orgId, viewer.vault.orgId)) });
    if (!team) throw errors.notFound("Team not in workspace");

    const existing = await loadItemTeamMember(id, body.teamId);
    if (existing) return c.json({ error: { code: "member_conflict", message: "Team already has grant" } }, 409);

    await db.transaction(async (tx) => {
      await tx.insert(itemTeamMembers).values({ itemId: id, teamId: body.teamId, role: body.role });
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "item.team_share", targetType: "item", targetId: id, targetName: ctx.item.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { granteeTeamId: body.teamId, granteeTeamName: team.name, role: body.role },
      });

      const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, body.teamId));
      for (const m of members) {
        await createNotification(tx, {
          userId: m.userId, orgId: viewer.vault.orgId, type: "share.received",
          actorUserId: user.id, actorEmail: user.email, targetType: "item", targetId: id, targetName: ctx.item.name,
          metadata: { resourceKind: "item", role: body.role, viaTeamId: body.teamId, viaTeamName: team.name },
        });
      }
    });

    const created = await loadItemTeamMember(id, body.teamId);
    return c.json({ member: created }, 201);
  })

  .patch("/:id/members/:userId", paramValidator(itemUserParam), jsonValidator(patchSchema), async (c) => {
    const user = c.get("user")!;
    const { id, userId } = c.req.valid("param");
    const { role } = c.req.valid("json");
    const ctx = await loadItemContext(id, user.id);
    if (!ctx) throw errors.notFound("Item not found");
    const target = await loadItemMember(id, userId);
    if (!target) throw errors.notFound("Member not found");

    if (!canModifyGrant(ctx.authority, target.role) || !canGrantRole(ctx.authority, role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.item.vaultId, user.id);
    if (!viewer) throw errors.notFound("Item not found");

    await db.transaction(async (tx) => {
      await tx.update(itemMembers).set({ role }).where(and(eq(itemMembers.itemId, id), eq(itemMembers.userId, userId)));
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "item.role_change", targetType: "item", targetId: id, targetName: ctx.item.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { granteeUserId: userId, granteeEmail: target.email, from: target.role, to: role },
      });
      await createNotification(tx, {
        userId, orgId: viewer.vault.orgId, type: "role.changed",
        actorUserId: user.id, actorEmail: user.email, targetType: "item", targetId: id, targetName: ctx.item.name,
        metadata: { resourceKind: "item", from: target.role, to: role },
      });
    });

    const updated = await loadItemMember(id, userId);
    return c.json({ member: updated });
  })

  .patch("/:id/team-members/:teamId", paramValidator(itemTeamParam), jsonValidator(patchSchema), async (c) => {
    const user = c.get("user")!;
    const { id, teamId } = c.req.valid("param");
    const { role } = c.req.valid("json");
    const ctx = await loadItemContext(id, user.id);
    if (!ctx) throw errors.notFound("Item not found");
    const target = await loadItemTeamMember(id, teamId);
    if (!target) throw errors.notFound("Team member not found");

    if (!canModifyGrant(ctx.authority, target.role) || !canGrantRole(ctx.authority, role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.item.vaultId, user.id);
    if (!viewer) throw errors.notFound("Item not found");

    await db.transaction(async (tx) => {
      await tx.update(itemTeamMembers).set({ role }).where(and(eq(itemTeamMembers.itemId, id), eq(itemTeamMembers.teamId, teamId)));
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "item.team_role_change", targetType: "item", targetId: id, targetName: ctx.item.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { granteeTeamId: teamId, granteeTeamName: target.teamName, from: target.role, to: role },
      });

      const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
      for (const m of members) {
        await createNotification(tx, {
          userId: m.userId, orgId: viewer.vault.orgId, type: "role.changed",
          actorUserId: user.id, actorEmail: user.email, targetType: "item", targetId: id, targetName: ctx.item.name,
          metadata: { resourceKind: "item", from: target.role, to: role, viaTeamId: teamId, viaTeamName: target.teamName },
        });
      }
    });

    const updated = await loadItemTeamMember(id, teamId);
    return c.json({ member: updated });
  })

  .delete("/:id/members/:userId", paramValidator(itemUserParam), async (c) => {
    const user = c.get("user")!;
    const { id, userId } = c.req.valid("param");
    const ctx = await loadItemContext(id, user.id);
    if (!ctx) throw errors.notFound("Item not found");
    const target = await loadItemMember(id, userId);
    if (!target) throw errors.notFound("Member not found");

    if (!canModifyGrant(ctx.authority, target.role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.item.vaultId, user.id);
    if (!viewer) throw errors.notFound("Item not found");

    await db.transaction(async (tx) => {
      await tx.delete(itemMembers).where(and(eq(itemMembers.itemId, id), eq(itemMembers.userId, userId)));
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "item.revoke", targetType: "item", targetId: id, targetName: ctx.item.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { revokedUserId: userId, revokedEmail: target.email, role: target.role },
      });
      await createNotification(tx, {
        userId, orgId: viewer.vault.orgId, type: "access.revoked",
        actorUserId: user.id, actorEmail: user.email, targetType: "item", targetId: id, targetName: ctx.item.name,
        metadata: { resourceKind: "item" },
      });
    });

    return c.body(null, 204);
  })

  .delete("/:id/team-members/:teamId", paramValidator(itemTeamParam), async (c) => {
    const user = c.get("user")!;
    const { id, teamId } = c.req.valid("param");
    const ctx = await loadItemContext(id, user.id);
    if (!ctx) throw errors.notFound("Item not found");
    const target = await loadItemTeamMember(id, teamId);
    if (!target) throw errors.notFound("Team member not found");

    if (!canModifyGrant(ctx.authority, target.role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.item.vaultId, user.id);
    if (!viewer) throw errors.notFound("Item not found");

    await db.transaction(async (tx) => {
      await tx.delete(itemTeamMembers).where(and(eq(itemTeamMembers.itemId, id), eq(itemTeamMembers.teamId, teamId)));
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "item.team_revoke", targetType: "item", targetId: id, targetName: ctx.item.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { revokedTeamId: teamId, revokedTeamName: target.teamName, role: target.role },
      });

      const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
      for (const m of members) {
        await createNotification(tx, {
          userId: m.userId, orgId: viewer.vault.orgId, type: "access.revoked",
          actorUserId: user.id, actorEmail: user.email, targetType: "item", targetId: id, targetName: ctx.item.name,
          metadata: { resourceKind: "item", viaTeamId: teamId, viaTeamName: target.teamName },
        });
      }
    });

    return c.body(null, 204);
  });

export type ItemMemberRoutes = typeof itemMemberRoutes;
