import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, teamMembers, teams, users, vaultMembers, vaultTeamMembers, vaultKeys, vaults } from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { getOrgMembership } from "@/lib/orgAccess";
import { createNotification } from "@/lib/notifications";
import { jsonValidator, paramValidator } from "@/lib/validator";
import {
  activeOrgForContext,
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  type AuthVariables,
} from "@/middleware/auth";
import { loadVaultForUser, type Role } from "@/routes/vaults";

// ---------------------------------------------------------------------------
// Threat model — vault membership management (DESIGN.md §7.2)
//
// Asset: vault_members & vault_team_members rows.
// Adversaries:
//   * Non-manager attempting to share — blocked by explicit manager role check.
//   * Manager attempting to add a user/team OUTSIDE their org — org-scoped
//     lookups ensure resources and principals belong to the same workspace.
//   * Last-manager demotion/removal — blocked by countManagers check.
// Mitigations: strict authorization, org-scoped lookups, audit logging,
//   and last-manager protection.
// ---------------------------------------------------------------------------

const ROLES = ["manager", "editor", "user", "viewer"] as const;
const roleSchema = z.enum(ROLES);

const vaultParam = z.object({ id: z.string().uuid() });
const vaultUserParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const vaultTeamParam = z.object({ id: z.string().uuid(), teamId: z.string().uuid() });

const createSchema = z.object({
  userId: z.string().uuid(),
  role: roleSchema,
  // Phase C: ZK fields
  wrappedKey: z.string().optional(), // base64
});

const teamCreateSchema = z.object({
  teamId: z.string().uuid(),
  role: roleSchema,
});

const patchSchema = z.object({ role: roleSchema });

interface VaultMemberDTO {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

interface VaultTeamMemberDTO {
  teamId: string;
  teamName: string;
  role: Role;
}

async function countManagers(vaultId: string): Promise<number> {
  const rows = await db
    .select({ role: vaultMembers.role })
    .from(vaultMembers)
    .where(eq(vaultMembers.vaultId, vaultId));
  return rows.filter((r) => r.role === "manager").length;
}

async function emailFor(userId: string): Promise<string | null> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return u?.email ?? null;
}

async function loadVaultMember(vaultId: string, userId: string): Promise<VaultMemberDTO | null> {
  const rows = await db
    .select({
      userId: vaultMembers.userId,
      role: vaultMembers.role,
      email: users.email,
      displayName: users.displayName,
      name: users.name,
    })
    .from(vaultMembers)
    .innerJoin(users, eq(users.id, vaultMembers.userId))
    .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    userId: r.userId,
    email: r.email,
    displayName: r.displayName ?? r.name ?? r.email,
    role: r.role as Role,
  };
}

async function loadVaultTeamMember(vaultId: string, teamId: string): Promise<VaultTeamMemberDTO | null> {
  const rows = await db
    .select({
      teamId: vaultTeamMembers.teamId,
      role: vaultTeamMembers.role,
      teamName: teams.name,
    })
    .from(vaultTeamMembers)
    .innerJoin(teams, eq(teams.id, vaultTeamMembers.teamId))
    .where(and(eq(vaultTeamMembers.vaultId, vaultId), eq(vaultTeamMembers.teamId, teamId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    teamId: r.teamId,
    teamName: r.teamName,
    role: r.role as Role,
  };
}

export const vaultMemberRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  // ------------------------------------------------------------------
  // List vault members (individual)
  // ------------------------------------------------------------------
  .get("/:id/members", paramValidator(vaultParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const activeOrg = await activeOrgForContext(c);
    const isAuditor = activeOrg?.role === "auditor";

    const access = await loadVaultForUser(id, user.id);
    if (!access && !isAuditor) throw errors.notFound("Vault not found");

    if (isAuditor) {
      const [vault] = await db
        .select({ orgId: vaults.orgId })
        .from(vaults)
        .where(eq(vaults.id, id))
        .limit(1);
      if (!vault || vault.orgId !== activeOrg?.orgId) throw errors.notFound("Vault not found");
    }

    const rows = await db
      .select({
        userId: vaultMembers.userId,
        role: vaultMembers.role,
        email: users.email,
        displayName: users.displayName,
        name: users.name,
      })
      .from(vaultMembers)
      .innerJoin(users, eq(users.id, vaultMembers.userId))
      .where(eq(vaultMembers.vaultId, id))
      .orderBy(asc(vaultMembers.createdAt));

    const members: VaultMemberDTO[] = rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      displayName: r.displayName ?? r.name ?? r.email,
      role: r.role as Role,
    }));

    return c.json({ members });
  })

  // ------------------------------------------------------------------
  // List vault team members
  // ------------------------------------------------------------------
  .get("/:id/team-members", paramValidator(vaultParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const activeOrg = await activeOrgForContext(c);
    const isAuditor = activeOrg?.role === "auditor";

    const access = await loadVaultForUser(id, user.id);
    if (!access && !isAuditor) throw errors.notFound("Vault not found");

    if (isAuditor) {
      const [vault] = await db
        .select({ orgId: vaults.orgId })
        .from(vaults)
        .where(eq(vaults.id, id))
        .limit(1);
      if (!vault || vault.orgId !== activeOrg?.orgId) throw errors.notFound("Vault not found");
    }

    const rows = await db
      .select({
        teamId: vaultTeamMembers.teamId,
        role: vaultTeamMembers.role,
        teamName: teams.name,
      })
      .from(vaultTeamMembers)
      .innerJoin(teams, eq(teams.id, vaultTeamMembers.teamId))
      .where(eq(vaultTeamMembers.vaultId, id))
      .orderBy(asc(vaultTeamMembers.createdAt));

    return c.json({ teamMembers: rows });
  })

  // ------------------------------------------------------------------
  // Add an individual member
  // ------------------------------------------------------------------
  .post("/:id/members", paramValidator(vaultParam), jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (access.role !== "manager") {
      throw errors.forbidden("Only managers can add members to this vault");
    }

    const targetMembership = await getOrgMembership(access.vault.orgId, body.userId);
    if (!targetMembership) throw errors.notFound("Target user is not a member of this workspace");

    const existing = await loadVaultMember(id, body.userId);
    if (existing) {
      return c.json(
        { error: { code: "member_conflict", message: "User is already a member of this vault" } },
        409,
      );
    }

    const granteeEmail = await emailFor(body.userId);

    await db.transaction(async (tx) => {
      await tx.insert(vaultMembers).values({ vaultId: id, userId: body.userId, role: body.role });
      
      // Phase C: If wrappedKey provided, store it
      if (body.wrappedKey) {
        await tx.insert(vaultKeys).values({
          vaultId: id,
          userId: body.userId,
          wrappedKey: Buffer.from(body.wrappedKey, "base64"),
          wrapAlgo: "x25519-aes256gcm",
        });
      }

      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "vault.share",
        targetType: "vault",
        targetId: id,
        targetName: access.vault.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { 
          granteeUserId: body.userId, 
          granteeEmail, 
          role: body.role,
          isZk: !!body.wrappedKey
        },
      });
      await createNotification(tx, {
        userId: body.userId,
        orgId: access.vault.orgId,
        type: "share.received",
        actorUserId: user.id,
        actorEmail: user.email,
        targetType: "vault",
        targetId: id,
        targetName: access.vault.name,
        metadata: { resourceKind: "vault", role: body.role },
      });
    });

    const created = await loadVaultMember(id, body.userId);
    if (!created) throw errors.internal("Failed to reload member after insert");
    return c.json({ member: created }, 201);
  })

  // ------------------------------------------------------------------
  // Add a team member
  // ------------------------------------------------------------------
  .post("/:id/team-members", paramValidator(vaultParam), jsonValidator(teamCreateSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (access.role !== "manager") {
      throw errors.forbidden("Only managers can add teams to this vault");
    }

    const team = await db.query.teams.findFirst({
      where: and(eq(teams.id, body.teamId), eq(teams.orgId, access.vault.orgId)),
    });
    if (!team) throw errors.notFound("Team not found in workspace");

    const existing = await loadVaultTeamMember(id, body.teamId);
    if (existing) {
      return c.json(
        { error: { code: "member_conflict", message: "Team is already a member of this vault" } },
        409,
      );
    }

    await db.transaction(async (tx) => {
      await tx.insert(vaultTeamMembers).values({ vaultId: id, teamId: body.teamId, role: body.role });
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "vault.team_share",
        targetType: "vault",
        targetId: id,
        targetName: access.vault.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { granteeTeamId: body.teamId, granteeTeamName: team.name, role: body.role },
      });

      const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, body.teamId));
      for (const m of members) {
        await createNotification(tx, {
          userId: m.userId,
          orgId: access.vault.orgId,
          type: "share.received",
          actorUserId: user.id,
          actorEmail: user.email,
          targetType: "vault",
          targetId: id,
          targetName: access.vault.name,
          metadata: { resourceKind: "vault", role: body.role, viaTeamId: body.teamId, viaTeamName: team.name },
        });
      }
    });

    const created = await loadVaultTeamMember(id, body.teamId);
    if (!created) throw errors.internal("Failed to reload team member after insert");
    return c.json({ member: created }, 201);
  })

  // ------------------------------------------------------------------
  // Change an individual member's role
  // ------------------------------------------------------------------
  .patch("/:id/members/:userId", paramValidator(vaultUserParam), jsonValidator(patchSchema), async (c) => {
    const user = c.get("user")!;
    const { id, userId } = c.req.valid("param");
    const { role } = c.req.valid("json");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (access.role !== "manager") {
      throw errors.forbidden("Only managers can change vault member roles");
    }

    const target = await loadVaultMember(id, userId);
    if (!target) throw errors.notFound("Vault member not found");

    if (target.role === "manager" && role !== "manager") {
      const managers = await countManagers(id);
      if (managers <= 1) {
        return c.json({ error: { code: "forbidden", message: "Cannot demote last manager", details: { reason: "last_manager" } } }, 409);
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(vaultMembers).set({ role }).where(and(eq(vaultMembers.vaultId, id), eq(vaultMembers.userId, userId)));
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "vault.role_change", targetType: "vault", targetId: id, targetName: access.vault.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { granteeUserId: userId, granteeEmail: target.email, from: target.role, to: role },
      });
      await createNotification(tx, {
        userId, orgId: access.vault.orgId, type: "role.changed", actorUserId: user.id, actorEmail: user.email,
        targetType: "vault", targetId: id, targetName: access.vault.name,
        metadata: { resourceKind: "vault", from: target.role, to: role },
      });
    });

    const updated = await loadVaultMember(id, userId);
    if (!updated) throw errors.internal("Failed to reload member after update");
    return c.json({ member: updated });
  })

  // ------------------------------------------------------------------
  // Change a team member's role
  // ------------------------------------------------------------------
  .patch("/:id/team-members/:teamId", paramValidator(vaultTeamParam), jsonValidator(patchSchema), async (c) => {
    const user = c.get("user")!;
    const { id, teamId } = c.req.valid("param");
    const { role } = c.req.valid("json");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (access.role !== "manager") {
      throw errors.forbidden("Only managers can change vault team roles");
    }

    const target = await loadVaultTeamMember(id, teamId);
    if (!target) throw errors.notFound("Team member not found");

    await db.transaction(async (tx) => {
      await tx.update(vaultTeamMembers).set({ role }).where(and(eq(vaultTeamMembers.vaultId, id), eq(vaultTeamMembers.teamId, teamId)));
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "vault.team_role_change", targetType: "vault", targetId: id, targetName: access.vault.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { granteeTeamId: teamId, granteeTeamName: target.teamName, from: target.role, to: role },
      });

      const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
      for (const m of members) {
        await createNotification(tx, {
          userId: m.userId, orgId: access.vault.orgId, type: "role.changed", actorUserId: user.id, actorEmail: user.email,
          targetType: "vault", targetId: id, targetName: access.vault.name,
          metadata: { resourceKind: "vault", from: target.role, to: role, viaTeamId: teamId, viaTeamName: target.teamName },
        });
      }
    });

    const updated = await loadVaultTeamMember(id, teamId);
    if (!updated) throw errors.internal("Failed to reload team member after update");
    return c.json({ member: updated });
  })

  // ------------------------------------------------------------------
  // Remove an individual member
  // ------------------------------------------------------------------
  .delete("/:id/members/:userId", paramValidator(vaultUserParam), async (c) => {
    const user = c.get("user")!;
    const { id, userId } = c.req.valid("param");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (access.role !== "manager") {
      throw errors.forbidden("Only managers can remove vault members");
    }

    const target = await loadVaultMember(id, userId);
    if (!target) throw errors.notFound("Vault member not found");

    if (target.role === "manager") {
      const managers = await countManagers(id);
      if (managers <= 1) {
        return c.json({ error: { code: "forbidden", message: "Cannot remove last manager", details: { reason: "last_manager" } } }, 409);
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(vaultMembers).where(and(eq(vaultMembers.vaultId, id), eq(vaultMembers.userId, userId)));
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "vault.revoke", targetType: "vault", targetId: id, targetName: access.vault.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { revokedUserId: userId, revokedEmail: target.email, role: target.role },
      });
      await createNotification(tx, {
        userId, orgId: access.vault.orgId, type: "access.revoked", actorUserId: user.id, actorEmail: user.email,
        targetType: "vault", targetId: id, targetName: access.vault.name,
        metadata: { resourceKind: "vault" },
      });
    });

    return c.body(null, 204);
  })

  // ------------------------------------------------------------------
  // Remove a team
  // ------------------------------------------------------------------
  .delete("/:id/team-members/:teamId", paramValidator(vaultTeamParam), async (c) => {
    const user = c.get("user")!;
    const { id, teamId } = c.req.valid("param");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (access.role !== "manager") {
      throw errors.forbidden("Only managers can remove vault teams");
    }

    const target = await loadVaultTeamMember(id, teamId);
    if (!target) throw errors.notFound("Team member not found");

    await db.transaction(async (tx) => {
      await tx.delete(vaultTeamMembers).where(and(eq(vaultTeamMembers.vaultId, id), eq(vaultTeamMembers.teamId, teamId)));
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId, actorUserId: user.id, actorEmail: user.email,
        action: "vault.team_revoke", targetType: "vault", targetId: id, targetName: access.vault.name,
        ipHash: hashIp(getClientIp(c)), userAgent: c.req.header("user-agent") ?? null, success: true,
        metadata: { revokedTeamId: teamId, revokedTeamName: target.teamName, role: target.role },
      });

      const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
      for (const m of members) {
        await createNotification(tx, {
          userId: m.userId, orgId: access.vault.orgId, type: "access.revoked", actorUserId: user.id, actorEmail: user.email,
          targetType: "vault", targetId: id, targetName: access.vault.name,
          metadata: { resourceKind: "vault", viaTeamId: teamId, viaTeamName: target.teamName },
        });
      }
    });

    return c.body(null, 204);
  });

export type VaultMemberRoutes = typeof vaultMemberRoutes;
