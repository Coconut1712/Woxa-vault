import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, folderMembers, folderTeamMembers, folders, teamMembers, teams, users, vaults, type Folder } from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { getOrgMembership } from "@/lib/orgAccess";
import {
  canGrantRole,
  canModifyGrant,
  resolveFolderRole,
  shareAuthorityForFolder,
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
// Threat model — folder-level sharing (DESIGN.md §11.3)
//
// Asset: folder_members & folder_team_members rows.
// Adversaries:
//   * Non-manager|editor attempting to share — blocked by authority check.
//   * Granting above one's own rank — blocked by canGrantRole.
//   * Modifying a grant above one's rank — blocked by canModifyGrant.
// Mitigations: granular authority logic, org-scoped lookups, audit logging,
//   and collective access through teams.
// ---------------------------------------------------------------------------

const ROLES = ["manager", "editor", "user", "viewer"] as const;
const roleSchema = z.enum(ROLES);

const folderParam = z.object({ id: z.string().uuid() });
const folderUserParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const folderTeamParam = z.object({ id: z.string().uuid(), teamId: z.string().uuid() });

const createSchema = z.object({ userId: z.string().uuid(), role: roleSchema });
const teamCreateSchema = z.object({ teamId: z.string().uuid(), role: roleSchema });
const patchSchema = z.object({ role: roleSchema });

interface FolderMemberDTO {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

interface FolderTeamMemberDTO {
  teamId: string;
  teamName: string;
  role: Role;
}

async function loadFolderContext(
  folderId: string,
  userId: string,
): Promise<{ folder: Folder; effectiveRole: Role | null; authority: number } | null> {
  const folder = await db.query.folders.findFirst({ where: eq(folders.id, folderId) });
  if (!folder) return null;
  const effectiveRole = await resolveFolderRole(userId, { id: folder.id, vaultId: folder.vaultId });
  if (!effectiveRole) return null;
  const authority = shareAuthorityForFolder(effectiveRole);
  return { folder, effectiveRole, authority };
}

async function emailFor(userId: string): Promise<string | null> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return u?.email ?? null;
}

async function loadFolderMember(folderId: string, userId: string): Promise<FolderMemberDTO | null> {
  const rows = await db
    .select({
      userId: folderMembers.userId, role: folderMembers.role,
      email: users.email, displayName: users.displayName, name: users.name,
    })
    .from(folderMembers)
    .innerJoin(users, eq(users.id, folderMembers.userId))
    .where(and(eq(folderMembers.folderId, folderId), eq(folderMembers.userId, userId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    userId: r.userId, email: r.email,
    displayName: r.displayName ?? r.name ?? r.email,
    role: r.role as Role,
  };
}

async function loadFolderTeamMember(folderId: string, teamId: string): Promise<FolderTeamMemberDTO | null> {
  const rows = await db
    .select({ teamId: folderTeamMembers.teamId, role: folderTeamMembers.role, teamName: teams.name })
    .from(folderTeamMembers)
    .innerJoin(teams, eq(teams.id, folderTeamMembers.teamId))
    .where(and(eq(folderTeamMembers.folderId, folderId), eq(folderTeamMembers.teamId, teamId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { teamId: r.teamId, teamName: r.teamName, role: r.role as Role };
}

export const folderMemberRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  .get("/:id/members", paramValidator(folderParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const activeOrg = await activeOrgForContext(c);
    const isAuditor = activeOrg?.role === "auditor";

    const ctx = await loadFolderContext(id, user.id);
    if (!ctx && !isAuditor) throw errors.notFound("Folder not found");

    if (isAuditor) {
      const [folderRow] = await db
        .select({ orgId: vaults.orgId })
        .from(folders)
        .innerJoin(vaults, eq(folders.vaultId, vaults.id))
        .where(eq(folders.id, id))
        .limit(1);
      if (!folderRow || folderRow.orgId !== activeOrg?.orgId) throw errors.notFound("Folder not found");
    }

    const rows = await db
      .select({
        userId: folderMembers.userId, role: folderMembers.role,
        email: users.email, displayName: users.displayName, name: users.name,
      })
      .from(folderMembers)
      .innerJoin(users, eq(users.id, folderMembers.userId))
      .where(eq(folderMembers.folderId, id))
      .orderBy(asc(folderMembers.createdAt));

    return c.json({ members: rows.map(r => ({ ...r, displayName: r.displayName ?? r.name ?? r.email })) });
  })

  .get("/:id/team-members", paramValidator(folderParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const activeOrg = await activeOrgForContext(c);
    const isAuditor = activeOrg?.role === "auditor";

    const ctx = await loadFolderContext(id, user.id);
    if (!ctx && !isAuditor) throw errors.notFound("Folder not found");

    if (isAuditor) {
      const [folderRow] = await db
        .select({ orgId: vaults.orgId })
        .from(folders)
        .innerJoin(vaults, eq(folders.vaultId, vaults.id))
        .where(eq(folders.id, id))
        .limit(1);
      if (!folderRow || folderRow.orgId !== activeOrg?.orgId) throw errors.notFound("Folder not found");
    }

    const rows = await db
      .select({ teamId: folderTeamMembers.teamId, role: folderTeamMembers.role, teamName: teams.name })
      .from(folderTeamMembers)
      .innerJoin(teams, eq(teams.id, folderTeamMembers.teamId))
      .where(eq(folderTeamMembers.folderId, id))
      .orderBy(asc(folderTeamMembers.createdAt));

    return c.json({ teamMembers: rows });
  })

  .post("/:id/members", paramValidator(folderParam), jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const ctx = await loadFolderContext(id, user.id);
    if (!ctx) throw errors.notFound("Folder not found");

    if (!canGrantRole(ctx.authority, body.role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.folder.vaultId, user.id);
    if (!viewer) throw errors.notFound("Folder not found");
    const targetMembership = await getOrgMembership(viewer.vault.orgId, body.userId);
    if (!targetMembership) throw errors.notFound("User not in workspace");

    const existing = await loadFolderMember(id, body.userId);
    if (existing) return c.json({ error: { code: "member_conflict", message: "Already has grant" } }, 409);

    const granteeEmail = await emailFor(body.userId);
    await db.transaction(async (tx) => {
      await tx.insert(folderMembers).values({ folderId: id, userId: body.userId, role: body.role });
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "folder.share", targetType: "folder", targetId: id, targetName: ctx.folder.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { granteeUserId: body.userId, granteeEmail, role: body.role },
      });
      await createNotification(tx, {
        userId: body.userId, orgId: viewer.vault.orgId, type: "share.received",
        actorUserId: user.id, actorEmail: user.email, targetType: "folder", targetId: id, targetName: ctx.folder.name,
        metadata: { resourceKind: "folder", role: body.role },
      });
    });

    const created = await loadFolderMember(id, body.userId);
    return c.json({ member: created }, 201);
  })

  .post("/:id/team-members", paramValidator(folderParam), jsonValidator(teamCreateSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const ctx = await loadFolderContext(id, user.id);
    if (!ctx) throw errors.notFound("Folder not found");

    if (!canGrantRole(ctx.authority, body.role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.folder.vaultId, user.id);
    if (!viewer) throw errors.notFound("Folder not found");
    const team = await db.query.teams.findFirst({ where: and(eq(teams.id, body.teamId), eq(teams.orgId, viewer.vault.orgId)) });
    if (!team) throw errors.notFound("Team not in workspace");

    const existing = await loadFolderTeamMember(id, body.teamId);
    if (existing) return c.json({ error: { code: "member_conflict", message: "Team already has grant" } }, 409);

    await db.transaction(async (tx) => {
      await tx.insert(folderTeamMembers).values({ folderId: id, teamId: body.teamId, role: body.role });
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "folder.team_share", targetType: "folder", targetId: id, targetName: ctx.folder.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { granteeTeamId: body.teamId, granteeTeamName: team.name, role: body.role },
      });

      const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, body.teamId));
      for (const m of members) {
        await createNotification(tx, {
          userId: m.userId, orgId: viewer.vault.orgId, type: "share.received",
          actorUserId: user.id, actorEmail: user.email, targetType: "folder", targetId: id, targetName: ctx.folder.name,
          metadata: { resourceKind: "folder", role: body.role, viaTeamId: body.teamId, viaTeamName: team.name },
        });
      }
    });

    const created = await loadFolderTeamMember(id, body.teamId);
    return c.json({ member: created }, 201);
  })

  .patch("/:id/members/:userId", paramValidator(folderUserParam), jsonValidator(patchSchema), async (c) => {
    const user = c.get("user")!;
    const { id, userId } = c.req.valid("param");
    const { role } = c.req.valid("json");
    const ctx = await loadFolderContext(id, user.id);
    if (!ctx) throw errors.notFound("Folder not found");
    const target = await loadFolderMember(id, userId);
    if (!target) throw errors.notFound("Member not found");

    if (!canModifyGrant(ctx.authority, target.role) || !canGrantRole(ctx.authority, role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.folder.vaultId, user.id);
    if (!viewer) throw errors.notFound("Folder not found");

    await db.transaction(async (tx) => {
      await tx.update(folderMembers).set({ role }).where(and(eq(folderMembers.folderId, id), eq(folderMembers.userId, userId)));
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "folder.role_change", targetType: "folder", targetId: id, targetName: ctx.folder.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { granteeUserId: userId, granteeEmail: target.email, from: target.role, to: role },
      });
      await createNotification(tx, {
        userId, orgId: viewer.vault.orgId, type: "role.changed",
        actorUserId: user.id, actorEmail: user.email, targetType: "folder", targetId: id, targetName: ctx.folder.name,
        metadata: { resourceKind: "folder", from: target.role, to: role },
      });
    });

    const updated = await loadFolderMember(id, userId);
    return c.json({ member: updated });
  })

  .patch("/:id/team-members/:teamId", paramValidator(folderTeamParam), jsonValidator(patchSchema), async (c) => {
    const user = c.get("user")!;
    const { id, teamId } = c.req.valid("param");
    const { role } = c.req.valid("json");
    const ctx = await loadFolderContext(id, user.id);
    if (!ctx) throw errors.notFound("Folder not found");
    const target = await loadFolderTeamMember(id, teamId);
    if (!target) throw errors.notFound("Team member not found");

    if (!canModifyGrant(ctx.authority, target.role) || !canGrantRole(ctx.authority, role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.folder.vaultId, user.id);
    if (!viewer) throw errors.notFound("Folder not found");

    await db.transaction(async (tx) => {
      await tx.update(folderTeamMembers).set({ role }).where(and(eq(folderTeamMembers.folderId, id), eq(folderTeamMembers.teamId, teamId)));
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "folder.team_role_change", targetType: "folder", targetId: id, targetName: ctx.folder.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { granteeTeamId: teamId, granteeTeamName: target.teamName, from: target.role, to: role },
      });

      const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
      for (const m of members) {
        await createNotification(tx, {
          userId: m.userId, orgId: viewer.vault.orgId, type: "role.changed",
          actorUserId: user.id, actorEmail: user.email, targetType: "folder", targetId: id, targetName: ctx.folder.name,
          metadata: { resourceKind: "folder", from: target.role, to: role, viaTeamId: teamId, viaTeamName: target.teamName },
        });
      }
    });

    const updated = await loadFolderTeamMember(id, teamId);
    return c.json({ member: updated });
  })

  .delete("/:id/members/:userId", paramValidator(folderUserParam), async (c) => {
    const user = c.get("user")!;
    const { id, userId } = c.req.valid("param");
    const ctx = await loadFolderContext(id, user.id);
    if (!ctx) throw errors.notFound("Folder not found");
    const target = await loadFolderMember(id, userId);
    if (!target) throw errors.notFound("Member not found");

    if (!canModifyGrant(ctx.authority, target.role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.folder.vaultId, user.id);
    if (!viewer) throw errors.notFound("Folder not found");

    await db.transaction(async (tx) => {
      await tx.delete(folderMembers).where(and(eq(folderMembers.folderId, id), eq(folderMembers.userId, userId)));
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "folder.revoke", targetType: "folder", targetId: id, targetName: ctx.folder.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { revokedUserId: userId, revokedEmail: target.email, role: target.role },
      });
      await createNotification(tx, {
        userId, orgId: viewer.vault.orgId, type: "access.revoked",
        actorUserId: user.id, actorEmail: user.email, targetType: "folder", targetId: id, targetName: ctx.folder.name,
        metadata: { resourceKind: "folder" },
      });
    });

    return c.body(null, 204);
  })

  .delete("/:id/team-members/:teamId", paramValidator(folderTeamParam), async (c) => {
    const user = c.get("user")!;
    const { id, teamId } = c.req.valid("param");
    const ctx = await loadFolderContext(id, user.id);
    if (!ctx) throw errors.notFound("Folder not found");
    const target = await loadFolderTeamMember(id, teamId);
    if (!target) throw errors.notFound("Team member not found");

    if (!canModifyGrant(ctx.authority, target.role)) throw errors.forbidden("Insufficient authority");

    const viewer = await loadVaultForViewer(ctx.folder.vaultId, user.id);
    if (!viewer) throw errors.notFound("Folder not found");

    await db.transaction(async (tx) => {
      await tx.delete(folderTeamMembers).where(and(eq(folderTeamMembers.folderId, id), eq(folderTeamMembers.teamId, teamId)));
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "folder.team_revoke", targetType: "folder", targetId: id, targetName: ctx.folder.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { revokedTeamId: teamId, revokedTeamName: target.teamName, role: target.role },
      });

      const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
      for (const m of members) {
        await createNotification(tx, {
          userId: m.userId, orgId: viewer.vault.orgId, type: "access.revoked",
          actorUserId: user.id, actorEmail: user.email, targetType: "folder", targetId: id, targetName: ctx.folder.name,
          metadata: { resourceKind: "folder", viaTeamId: teamId, viaTeamName: target.teamName },
        });
      }
    });

    return c.body(null, 204);
  });

export type FolderMemberRoutes = typeof folderMemberRoutes;
