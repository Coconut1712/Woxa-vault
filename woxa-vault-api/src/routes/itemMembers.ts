import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, itemMembers, items, users, type Item } from "@/db/schema";
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
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  type AuthVariables,
} from "@/middleware/auth";
import { loadVaultForViewer } from "@/routes/vaults";

// ---------------------------------------------------------------------------
// Threat model — item-level sharing (DESIGN.md §11.3 most-specific-wins)
//
// Asset: item_members rows (the per-item ACL — the MOST specific access level).
// Adversaries:
//   * A vault Editor escalating an item grant to Manager (privilege escalation)
//     — blocked by `shareAuthorityForItem` + `canGrantRole`: a sharer may only
//     grant a role rank <= their authority, and authority caps at editor unless
//     they are an effective manager.
//   * A Viewer (effective) trying to share at all — authority < editor → 403.
//   * A sharer modifying/removing a grant ABOVE their own authority (e.g. an
//     editor revoking a manager's grant) — blocked by `canModifyGrant`.
//   * Cross-org targeting — `getOrgMembership` pins the grantee to the vault's
//     org; outside → 404 (anti-enumeration).
//   * Probing item ids the caller can't see — `resolveItemRole` returns null →
//     404 BEFORE any authority check leaks 403-vs-404.
// Mitigations: 404 when no access at all; 403 only when access exists but
//   authority is insufficient. Audit on every state-change. Creators retain
//   editor-level share authority over their own items (DESIGN.md §11.2).
// Residual risk: no per-grant expiry / explicit-deny yet (deferred §11.3).
// ---------------------------------------------------------------------------

const ROLES = ["manager", "editor", "user", "viewer"] as const;
const roleSchema = z.enum(ROLES);

const itemParam = z.object({ id: z.string().uuid() });
const itemUserParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

const createSchema = z.object({ userId: z.string().uuid(), role: roleSchema });
const patchSchema = z.object({ role: roleSchema });

interface ItemMemberDTO {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

// Load the item (non-deleted) + the caller's effective role + share authority.
// Returns null when the item is missing OR the caller has no effective access
// at all (→ 404). `authority` is the max role rank the caller may grant/modify.
async function loadItemContext(
  itemId: string,
  userId: string,
): Promise<{ item: Item; effectiveRole: Role | null; authority: number } | null> {
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), isNull(items.deletedAt)),
  });
  if (!item) return null;
  const effectiveRole = await resolveItemRole(userId, {
    id: item.id,
    vaultId: item.vaultId,
    folderId: item.folderId,
  });
  const isCreator = item.createdBy === userId;
  // No effective role AND not the creator → no access at all.
  if (!effectiveRole && !isCreator) return null;
  const authority = shareAuthorityForItem(effectiveRole, isCreator);
  return { item, effectiveRole, authority };
}

// Look up a user's email (for enriching share audit metadata). Returns null
// when the user is unknown — the audit row still writes with granteeEmail=null
// rather than failing the grant.
async function emailFor(userId: string): Promise<string | null> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return u?.email ?? null;
}

async function loadItemMember(itemId: string, userId: string): Promise<ItemMemberDTO | null> {
  const rows = await db
    .select({
      userId: itemMembers.userId,
      role: itemMembers.role,
      email: users.email,
      displayName: users.displayName,
      name: users.name,
    })
    .from(itemMembers)
    .innerJoin(users, eq(users.id, itemMembers.userId))
    .where(and(eq(itemMembers.itemId, itemId), eq(itemMembers.userId, userId)))
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

export const itemMemberRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  // ------------------------------------------------------------------
  // List item members (any caller with effective access to the item).
  // ------------------------------------------------------------------
  .get("/:id/members", paramValidator(itemParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const ctx = await loadItemContext(id, user.id);
    if (!ctx) throw errors.notFound("Item not found");

    const rows = await db
      .select({
        userId: itemMembers.userId,
        role: itemMembers.role,
        email: users.email,
        displayName: users.displayName,
        name: users.name,
      })
      .from(itemMembers)
      .innerJoin(users, eq(users.id, itemMembers.userId))
      .where(eq(itemMembers.itemId, id))
      .orderBy(asc(itemMembers.createdAt));

    const members: ItemMemberDTO[] = rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      displayName: r.displayName ?? r.name ?? r.email,
      role: r.role as Role,
    }));

    return c.json({ members });
  })

  // ------------------------------------------------------------------
  // Add an item grant.
  // ------------------------------------------------------------------
  .post("/:id/members", paramValidator(itemParam), jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const ctx = await loadItemContext(id, user.id);
    if (!ctx) throw errors.notFound("Item not found");

    // Authority gate: must be effective editor+ (or creator) AND may only grant
    // a role rank <= their authority. Insufficient authority → 403 (the caller
    // CAN see the item, they just can't share at this level).
    if (!canGrantRole(ctx.authority, body.role)) {
      throw errors.forbidden("Insufficient authority to share at this role");
    }

    // Resolve the vault's org so we can pin the grantee to it.
    const viewer = await loadVaultForViewer(ctx.item.vaultId, user.id);
    if (!viewer) throw errors.notFound("Item not found");
    const targetMembership = await getOrgMembership(viewer.vault.orgId, body.userId);
    if (!targetMembership) throw errors.notFound("Target user is not a member of this workspace");

    const existing = await loadItemMember(id, body.userId);
    if (existing) {
      return c.json(
        { error: { code: "member_conflict", message: "User already has an item grant" } },
        409,
      );
    }

    // Resolve the grantee's email up-front so the audit row carries it (the UI
    // shows "shared with <email>" without a follow-up lookup). Email is not a
    // secret; granteeUserId is kept too.
    const granteeEmail = await emailFor(body.userId);

    await db.transaction(async (tx) => {
      await tx.insert(itemMembers).values({ itemId: id, userId: body.userId, role: body.role });
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "item.share",
        targetType: "item",
        targetId: id,
        targetName: ctx.item.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { granteeUserId: body.userId, granteeEmail, role: body.role },
      });
      // Notify the grantee (recipient = body.userId). Self-share is skipped by
      // the writer's actor-guard.
      await createNotification(tx, {
        userId: body.userId,
        orgId: viewer.vault.orgId,
        type: "share.received",
        actorUserId: user.id,
        actorEmail: user.email,
        targetType: "item",
        targetId: id,
        targetName: ctx.item.name,
        metadata: { resourceKind: "item", role: body.role },
      });
    });

    const created = await loadItemMember(id, body.userId);
    if (!created) throw errors.internal("Failed to reload item member after insert");
    return c.json({ member: created }, 201);
  })

  // ------------------------------------------------------------------
  // Change an item grant's role.
  // ------------------------------------------------------------------
  .patch(
    "/:id/members/:userId",
    paramValidator(itemUserParam),
    jsonValidator(patchSchema),
    async (c) => {
      const user = c.get("user")!;
      const { id, userId } = c.req.valid("param");
      const { role } = c.req.valid("json");

      const ctx = await loadItemContext(id, user.id);
      if (!ctx) throw errors.notFound("Item not found");

      const target = await loadItemMember(id, userId);
      if (!target) throw errors.notFound("Item member not found");

      // Can't touch a grant ranked above your authority, and can't set above it.
      if (!canModifyGrant(ctx.authority, target.role) || !canGrantRole(ctx.authority, role)) {
        throw errors.forbidden("Insufficient authority to modify this grant");
      }

      const viewer = await loadVaultForViewer(ctx.item.vaultId, user.id);
      if (!viewer) throw errors.notFound("Item not found");

      // Role change + audit + notification in ONE transaction so the grantee's
      // "your role changed" notification can never be written for a change that
      // rolled back (and vice versa).
      await db.transaction(async (tx) => {
        await tx
          .update(itemMembers)
          .set({ role })
          .where(and(eq(itemMembers.itemId, id), eq(itemMembers.userId, userId)));

        await tx.insert(auditEvents).values({
          orgId: viewer.vault.orgId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: "item.role_change",
          targetType: "item",
          targetId: id,
          targetName: ctx.item.name,
          ipHash: hashIp(getClientIp(c)),
          userAgent: c.req.header("user-agent") ?? null,
          success: true,
          metadata: {
            granteeUserId: userId,
            granteeEmail: target.email,
            from: target.role,
            to: role,
          },
        });
        // Notify the grantee whose role changed (recipient = userId).
        await createNotification(tx, {
          userId,
          orgId: viewer.vault.orgId,
          type: "role.changed",
          actorUserId: user.id,
          actorEmail: user.email,
          targetType: "item",
          targetId: id,
          targetName: ctx.item.name,
          metadata: { resourceKind: "item", from: target.role, to: role },
        });
      });

      const updated = await loadItemMember(id, userId);
      if (!updated) throw errors.internal("Failed to reload item member after update");
      return c.json({ member: updated });
    },
  )

  // ------------------------------------------------------------------
  // Remove an item grant.
  // ------------------------------------------------------------------
  .delete("/:id/members/:userId", paramValidator(itemUserParam), async (c) => {
    const user = c.get("user")!;
    const { id, userId } = c.req.valid("param");

    const ctx = await loadItemContext(id, user.id);
    if (!ctx) throw errors.notFound("Item not found");

    const target = await loadItemMember(id, userId);
    if (!target) throw errors.notFound("Item member not found");

    if (!canModifyGrant(ctx.authority, target.role)) {
      throw errors.forbidden("Insufficient authority to revoke this grant");
    }

    const viewer = await loadVaultForViewer(ctx.item.vaultId, user.id);
    if (!viewer) throw errors.notFound("Item not found");

    await db.transaction(async (tx) => {
      await tx
        .delete(itemMembers)
        .where(and(eq(itemMembers.itemId, id), eq(itemMembers.userId, userId)));
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "item.revoke",
        targetType: "item",
        targetId: id,
        targetName: ctx.item.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { revokedUserId: userId, revokedEmail: target.email, role: target.role },
      });
      // Notify the removed user (recipient = userId).
      await createNotification(tx, {
        userId,
        orgId: viewer.vault.orgId,
        type: "access.revoked",
        actorUserId: user.id,
        actorEmail: user.email,
        targetType: "item",
        targetId: id,
        targetName: ctx.item.name,
        metadata: { resourceKind: "item" },
      });
    });

    return c.body(null, 204);
  });

export type ItemMemberRoutes = typeof itemMemberRoutes;
