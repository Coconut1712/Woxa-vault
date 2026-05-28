import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  teams,
  teamMembers,
  users,
  auditEvents,
  orgMembers,
  type Team,
  type TeamMember,
} from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/rateLimit";
import { jsonValidator, paramValidator } from "@/lib/validator";
import {
  requireAuth,
  activeOrgForContext,
  type AuthVariables,
} from "@/middleware/auth";
import { canManageOrgMembers } from "@/lib/orgAccess";

const teamParam = z.object({ id: z.string().uuid() });
const teamUserParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
});

const memberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["lead", "member"]),
});

interface TeamDTO {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

interface TeamMemberDTO {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  addedAt: string;
}

export const teamRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)

  // ------------------------------------------------------------------
  // List teams in the active workspace
  // ------------------------------------------------------------------
  .get("/", async (c) => {
    const user = c.get("user")!;
    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) throw errors.notFound("Workspace not found");

    const rows = await db
      .select({
        team: teams,
        memberCount: sql<number>`count(${teamMembers.userId})`,
      })
      .from(teams)
      .leftJoin(teamMembers, eq(teams.id, teamMembers.teamId))
      .where(eq(teams.orgId, activeOrg.orgId))
      .groupBy(teams.id)
      .orderBy(asc(teams.name));

    await db.insert(auditEvents).values({
      orgId: activeOrg.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "team.list_viewed",
      targetType: "organization",
      targetId: activeOrg.orgId,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { count: rows.length },
    });

    return c.json({
      teams: rows.map((r) => ({
        id: r.team.id,
        name: r.team.name,
        description: r.team.description,
        memberCount: Number(r.memberCount),
        createdAt: r.team.createdAt.toISOString(),
      })),
    });
  })

  // ------------------------------------------------------------------
  // Create a new team
  // ------------------------------------------------------------------
  .post("/", jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) throw errors.notFound("Workspace not found");

    if (!canManageOrgMembers(activeOrg.role)) {
      throw errors.forbidden("Only admins can create teams");
    }

    const body = c.req.valid("json");

    const [created] = await db
      .insert(teams)
      .values({
        orgId: activeOrg.orgId,
        name: body.name,
        description: body.description,
      })
      .returning();

    if (!created) throw errors.internal("Failed to create team");

    await db.insert(auditEvents).values({
      orgId: activeOrg.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "team.create",
      targetType: "team",
      targetId: created.id,
      targetName: created.name,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
    });

    return c.json({ team: created }, 201);
  })

  // ------------------------------------------------------------------
  // Get team details + members
  // ------------------------------------------------------------------
  .get("/:id", paramValidator(teamParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) throw errors.notFound("Workspace not found");

    const [teamRow] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, id), eq(teams.orgId, activeOrg.orgId)))
      .limit(1);

    if (!teamRow) throw errors.notFound("Team not found");

    const memberRows = await db
      .select({
        userId: teamMembers.userId,
        role: teamMembers.role,
        addedAt: teamMembers.addedAt,
        email: users.email,
        displayName: users.displayName,
        name: users.name,
      })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, id))
      .orderBy(asc(teamMembers.addedAt));

    await db.insert(auditEvents).values({
      orgId: activeOrg.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "team.view",
      targetType: "team",
      targetId: id,
      targetName: teamRow.name,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
    });

    return c.json({
      team: {
        ...teamRow,
        memberCount: memberRows.length,
      },
      members: memberRows.map((r) => ({
        userId: r.userId,
        email: r.email,
        displayName: r.displayName || r.name || r.email,
        role: r.role,
        addedAt: r.addedAt.toISOString(),
      })),
    });
  })

  // ------------------------------------------------------------------
  // Update team
  // ------------------------------------------------------------------
  .patch("/:id", paramValidator(teamParam), jsonValidator(createSchema.partial()), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) throw errors.notFound("Workspace not found");

    if (!canManageOrgMembers(activeOrg.role)) {
      throw errors.forbidden("Only admins can update teams");
    }

    const body = c.req.valid("json");

    const [updated] = await db
      .update(teams)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      })
      .where(and(eq(teams.id, id), eq(teams.orgId, activeOrg.orgId)))
      .returning();

    if (!updated) throw errors.notFound("Team not found");

    await db.insert(auditEvents).values({
      orgId: activeOrg.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "team.update",
      targetType: "team",
      targetId: id,
      targetName: updated.name,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { patch: body },
    });

    return c.json({ team: updated });
  })

  // ------------------------------------------------------------------
  // Delete team
  // ------------------------------------------------------------------
  .delete("/:id", paramValidator(teamParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) throw errors.notFound("Workspace not found");

    if (!canManageOrgMembers(activeOrg.role)) {
      throw errors.forbidden("Only admins can delete teams");
    }

    const [deleted] = await db
      .delete(teams)
      .where(and(eq(teams.id, id), eq(teams.orgId, activeOrg.orgId)))
      .returning();

    if (!deleted) throw errors.notFound("Team not found");

    await db.insert(auditEvents).values({
      orgId: activeOrg.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "team.delete",
      targetType: "team",
      targetId: id,
      targetName: deleted.name,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
    });

    return c.body(null, 204);
  })

  // ------------------------------------------------------------------
  // Add member to team
  // ------------------------------------------------------------------
  .post("/:id/members", paramValidator(teamParam), jsonValidator(memberSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) throw errors.notFound("Workspace not found");

    if (!canManageOrgMembers(activeOrg.role)) {
      throw errors.forbidden("Only admins can add members to teams");
    }

    const body = c.req.valid("json");

    // Verify team exists in org
    const team = await db.query.teams.findFirst({
      where: and(eq(teams.id, id), eq(teams.orgId, activeOrg.orgId)),
    });
    if (!team) throw errors.notFound("Team not found");

    // Verify user exists and belongs to org
    const membership = await db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.orgId, activeOrg.orgId), eq(orgMembers.userId, body.userId)),
    });
    if (!membership) throw errors.notFound("User not found in workspace");

    await db.insert(teamMembers).values({
      teamId: id,
      userId: body.userId,
      role: body.role,
    }).onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.userId],
      set: { role: body.role },
    });

    const targetUser = await db.query.users.findFirst({ where: eq(users.id, body.userId) });

    await db.insert(auditEvents).values({
      orgId: activeOrg.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "team.member_add",
      targetType: "team",
      targetId: id,
      targetName: team.name,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { userId: body.userId, userEmail: targetUser?.email, role: body.role },
    });

    return c.json({ ok: true });
  })

  // ------------------------------------------------------------------
  // Remove member from team
  // ------------------------------------------------------------------
  .delete("/:id/members/:userId", paramValidator(teamUserParam), async (c) => {
    const user = c.get("user")!;
    const { id, userId } = c.req.valid("param");
    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) throw errors.notFound("Workspace not found");

    if (!canManageOrgMembers(activeOrg.role)) {
      throw errors.forbidden("Only admins can remove members from teams");
    }

    const team = await db.query.teams.findFirst({
      where: and(eq(teams.id, id), eq(teams.orgId, activeOrg.orgId)),
    });
    if (!team) throw errors.notFound("Team not found");

    const [deleted] = await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, userId)))
      .returning();

    if (!deleted) throw errors.notFound("Member not found in team");

    const targetUser = await db.query.users.findFirst({ where: eq(users.id, userId) });

    await db.insert(auditEvents).values({
      orgId: activeOrg.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "team.member_remove",
      targetType: "team",
      targetId: id,
      targetName: team.name,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { userId, userEmail: targetUser?.email },
    });

    return c.body(null, 204);
  });
