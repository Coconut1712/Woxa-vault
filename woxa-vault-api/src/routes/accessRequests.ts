import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessRequests,
  auditEvents,
  items,
  users,
  vaults,
  vaultMembers,
  itemMembers,
  orgMembers,
  notifications,
  type AccessRequest,
} from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/rateLimit";
import { jsonValidator, paramValidator } from "@/lib/validator";
import { requireAuth, type AuthVariables } from "@/middleware/auth";
import { activeOrgForContext } from "@/middleware/auth";
import { createNotification } from "@/lib/notifications";

const createRequestSchema = z.object({
  targetType: z.enum(["item", "folder", "vault"]),
  targetId: z.string().uuid(),
  requestedRole: z.enum(["user", "editor", "manager"]),
  durationMinutes: z.number().int().min(1).max(43200).optional().nullable(), // max 30 days
  reason: z.string().min(1).max(500),
});

const decideRequestSchema = z.object({
  status: z.enum(["approved", "denied"]),
  approvedRole: z.enum(["user", "editor", "manager"]).optional(),
  approvedDurationMinutes: z.number().int().min(1).max(43200).optional().nullable(),
  decisionReason: z.string().max(500).optional(),
});

export const accessRequestRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)

  // ------------------------------------------------------------------
  // POST / — Create a new access request.
  // ------------------------------------------------------------------
  .post("/", jsonValidator(createRequestSchema), async (c) => {
    const user = c.get("user")!;
    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) throw errors.notFound("Workspace not found");

    const input = c.req.valid("json");

    const limitRes = rateLimit(`access-request:create:${user.id}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000, // 10 per hour
    });
    if (!limitRes.allowed) {
      const retry = Math.ceil(limitRes.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many requests", retry);
    }

    // Verify the target exists and belongs to the active org.
    let targetName = "";
    if (input.targetType === "item") {
      const [item] = await db
        .select({ name: items.name, orgId: vaults.orgId })
        .from(items)
        .innerJoin(vaults, eq(items.vaultId, vaults.id))
        .where(eq(items.id, input.targetId))
        .limit(1);
      if (!item || item.orgId !== activeOrg.orgId) {
        throw errors.notFound("Item not found");
      }
      targetName = item.name;
    } else if (input.targetType === "vault") {
      const [vault] = await db
        .select({ name: vaults.name, orgId: vaults.orgId })
        .from(vaults)
        .where(eq(vaults.id, input.targetId))
        .limit(1);
      if (!vault || vault.orgId !== activeOrg.orgId) {
        throw errors.notFound("Vault not found");
      }
      targetName = vault.name;
    } else {
      // folders (not fully implemented in this round, but schema supports)
      throw errors.validation("Validation failed", { targetType: ["Folders not supported yet"] });
    }

    const [created] = await db
      .insert(accessRequests)
      .values({
        orgId: activeOrg.orgId,
        requesterId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        targetName,
        requestedRole: input.requestedRole,
        durationMinutes: input.durationMinutes,
        reason: input.reason,
      })
      .returning();

    if (!created) throw errors.internal("Failed to create request");

    // Audit log
    await db.insert(auditEvents).values({
      orgId: activeOrg.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "access_request.created",
      targetType: input.targetType,
      targetId: input.targetId,
      targetName: targetName,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { requestId: created.id, requestedRole: input.requestedRole, reason: input.reason, durationMinutes: input.durationMinutes },
    });

    // Notify vault managers (simplification for Phase A: notify all managers of the vault).
    // In a real system we'd use a worker for this.
    if (input.targetType === "item" || input.targetType === "vault") {
      const vaultId = input.targetType === "item" 
        ? (await db.select({ id: items.vaultId }).from(items).where(eq(items.id, input.targetId)).limit(1))[0]?.id
        : input.targetId;
      
      if (vaultId) {
        const managers = await db
          .select({ userId: vaultMembers.userId })
          .from(vaultMembers)
          .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.role, "manager")));
        
        await db.transaction(async (tx) => {
          for (const m of managers) {
            await createNotification(tx, {
              userId: m.userId,
              orgId: activeOrg.orgId,
              type: "access_request.created",
              actorUserId: user.id,
              actorEmail: user.email,
              targetType: input.targetType,
              targetId: input.targetId,
              targetName: targetName,
              metadata: { 
                resourceKind: input.targetType as any, 
                role: input.requestedRole 
              },
            });
          }
        });
      }
    }

    return c.json({ request: created }, 201);
  })

  // ------------------------------------------------------------------
  // GET / — List requests (requester view + approver view).
  // ------------------------------------------------------------------
  .get("/", async (c) => {
    const user = c.get("user")!;
    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) throw errors.notFound("Workspace not found");

    // Approvers (managers/admins) see all pending requests in the org.
    // Requesters see their own requests.
    const isApprover = activeOrg.role === "owner" || activeOrg.role === "admin";

    const rows = await db
      .select({
        request: accessRequests,
        requesterEmail: users.email,
        requesterDisplayName: users.displayName,
        requesterName: users.name,
      })
      .from(accessRequests)
      .innerJoin(users, eq(accessRequests.requesterId, users.id))
      .where(
        and(
          eq(accessRequests.orgId, activeOrg.orgId),
          isApprover 
            ? sql`1=1` // Approvers see all
            : eq(accessRequests.requesterId, user.id) // Requesters see only their own
        )
      )
      .orderBy(desc(accessRequests.createdAt))
      .limit(100);

    const requests = rows.map(r => ({
      ...r.request,
      requesterEmail: r.requesterEmail,
      requesterDisplayName: r.requesterDisplayName || r.requesterName || r.requesterEmail,
    }));

    await db.insert(auditEvents).values({
      orgId: activeOrg.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "access_request.list_viewed",
      targetType: "organization",
      targetId: activeOrg.orgId,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { count: requests.length },
    });

    return c.json({ requests });
  })

  // ------------------------------------------------------------------
  // POST /:id/decide — Approve or deny a request.
  // ------------------------------------------------------------------
  .post("/:id/decide", paramValidator(z.object({ id: z.string().uuid() })), jsonValidator(decideRequestSchema), async (c) => {
    const user = c.get("user")!;
    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) throw errors.notFound("Workspace not found");

    const { id } = c.req.valid("param");
    const input = c.req.valid("json");

    if (activeOrg.role !== "owner" && activeOrg.role !== "admin") {
      throw errors.forbidden("Only workspace admins may decide on access requests");
    }

    const [request] = await db
      .select()
      .from(accessRequests)
      .where(and(eq(accessRequests.id, id), eq(accessRequests.orgId, activeOrg.orgId)))
      .limit(1);

    if (!request) throw errors.notFound("Request not found");
    if (request.status !== "pending") throw errors.conflict("Request already decided");

    const approvedRole = input.approvedRole ?? request.requestedRole;
    const approvedDuration = input.approvedDurationMinutes ?? request.durationMinutes;
    let accessExpiresAt: Date | null = null;
    if (approvedDuration) {
      accessExpiresAt = new Date();
      accessExpiresAt.setMinutes(accessExpiresAt.getMinutes() + approvedDuration);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(accessRequests)
        .set({
          status: input.status,
          approverId: user.id,
          approvedRole: input.status === "approved" ? approvedRole : null,
          approvedDurationMinutes: input.status === "approved" ? approvedDuration : null,
          decisionReason: input.decisionReason,
          decidedAt: new Date(),
          accessExpiresAt,
        })
        .where(eq(accessRequests.id, id));

      if (input.status === "approved") {
        // Fetch existing role to track for revert.
        let originalRole: string | null = null;

        if (request.targetType === "item") {
          const [existing] = await tx
            .select({ role: itemMembers.role })
            .from(itemMembers)
            .where(and(eq(itemMembers.itemId, request.targetId), eq(itemMembers.userId, request.requesterId)))
            .limit(1);
          originalRole = existing?.role ?? null;

          await tx
            .insert(itemMembers)
            .values({
              itemId: request.targetId,
              userId: request.requesterId,
              role: approvedRole,
              originalRole,
              expiresAt: accessExpiresAt,
            })
            .onConflictDoUpdate({
              target: [itemMembers.itemId, itemMembers.userId],
              set: { 
                role: approvedRole,
                originalRole,
                expiresAt: accessExpiresAt,
              },
            });
        } else if (request.targetType === "vault") {
          const [existing] = await tx
            .select({ role: vaultMembers.role })
            .from(vaultMembers)
            .where(and(eq(vaultMembers.vaultId, request.targetId), eq(vaultMembers.userId, request.requesterId)))
            .limit(1);
          originalRole = existing?.role ?? null;

          await tx
            .insert(vaultMembers)
            .values({
              vaultId: request.targetId,
              userId: request.requesterId,
              role: approvedRole,
              originalRole,
              expiresAt: accessExpiresAt,
            })
            .onConflictDoUpdate({
              target: [vaultMembers.vaultId, vaultMembers.userId],
              set: { 
                role: approvedRole,
                originalRole,
                expiresAt: accessExpiresAt,
              },
            });
        }
      }

      // Notify the requester.
      await createNotification(tx, {
        userId: request.requesterId,
        orgId: activeOrg.orgId,
        type: input.status === "approved" ? "access_request.approved" : "access_request.denied",
        actorUserId: user.id,
        actorEmail: user.email,
        targetType: request.targetType,
        targetId: request.targetId.toString(),
        targetName: request.targetName,
        metadata: { 
          resourceKind: request.targetType as any, 
          role: approvedRole,
          decisionReason: input.decisionReason
        },
      });

      // Audit log
      await tx.insert(auditEvents).values({
        orgId: activeOrg.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: input.status === "approved" ? "access_request.approved" : "access_request.denied",
        targetType: request.targetType,
        targetId: request.targetId,
        targetName: request.targetName,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { requestId: request.id, requesterId: request.requesterId, approvedRole, approvedDurationMinutes: approvedDuration, decisionReason: input.decisionReason },
      });
    });

    return c.json({ ok: true });
  });
