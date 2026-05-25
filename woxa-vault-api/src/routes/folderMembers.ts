import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, folderMembers, folders, users, type Folder } from "@/db/schema";
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
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  type AuthVariables,
} from "@/middleware/auth";
import { loadVaultForViewer } from "@/routes/vaults";

// ---------------------------------------------------------------------------
// Threat model — folder-level sharing (DESIGN.md §11.3)
//
// Asset: folder_members rows (grant a role over ALL items in the folder —
//   ranks below an item override, above vault membership). Same escalation /
//   modify-above-authority adversaries as item sharing; authority here is
//   purely the effective FOLDER role rank (no per-folder creator concept), and
//   sharing requires effective manager|editor on the folder.
// Mitigations: 404 when no folder access at all; 403 when access exists but
//   authority < editor or the target/new role outranks authority. Grantee is
//   pinned to the vault's org. Audit on every state-change.
// ---------------------------------------------------------------------------

const ROLES = ["manager", "editor", "user", "viewer"] as const;
const roleSchema = z.enum(ROLES);

const folderParam = z.object({ id: z.string().uuid() });
const folderUserParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

const createSchema = z.object({ userId: z.string().uuid(), role: roleSchema });
const patchSchema = z.object({ role: roleSchema });

interface FolderMemberDTO {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

// Load the folder + the caller's effective role + share authority. Returns null
// when the folder is missing OR the caller has no effective access (→ 404).
async function loadFolderContext(
  folderId: string,
  userId: string,
): Promise<{ folder: Folder; effectiveRole: Role | null; authority: number } | null> {
  const folder = await db.query.folders.findFirst({ where: eq(folders.id, folderId) });
  if (!folder) return null;
  const effectiveRole = await resolveFolderRole(userId, {
    id: folder.id,
    vaultId: folder.vaultId,
  });
  if (!effectiveRole) return null;
  const authority = shareAuthorityForFolder(effectiveRole);
  return { folder, effectiveRole, authority };
}

// Look up a user's email (for enriching share audit metadata). Returns null
// when the user is unknown — the audit row still writes with granteeEmail=null
// rather than failing the grant.
async function emailFor(userId: string): Promise<string | null> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return u?.email ?? null;
}

async function loadFolderMember(folderId: string, userId: string): Promise<FolderMemberDTO | null> {
  const rows = await db
    .select({
      userId: folderMembers.userId,
      role: folderMembers.role,
      email: users.email,
      displayName: users.displayName,
      name: users.name,
    })
    .from(folderMembers)
    .innerJoin(users, eq(users.id, folderMembers.userId))
    .where(and(eq(folderMembers.folderId, folderId), eq(folderMembers.userId, userId)))
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

export const folderMemberRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  // List folder members (any caller with effective access to the folder).
  .get("/:id/members", paramValidator(folderParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const ctx = await loadFolderContext(id, user.id);
    if (!ctx) throw errors.notFound("Folder not found");

    const rows = await db
      .select({
        userId: folderMembers.userId,
        role: folderMembers.role,
        email: users.email,
        displayName: users.displayName,
        name: users.name,
      })
      .from(folderMembers)
      .innerJoin(users, eq(users.id, folderMembers.userId))
      .where(eq(folderMembers.folderId, id))
      .orderBy(asc(folderMembers.createdAt));

    const members: FolderMemberDTO[] = rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      displayName: r.displayName ?? r.name ?? r.email,
      role: r.role as Role,
    }));

    return c.json({ members });
  })

  // Add a folder grant.
  .post("/:id/members", paramValidator(folderParam), jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const ctx = await loadFolderContext(id, user.id);
    if (!ctx) throw errors.notFound("Folder not found");

    if (!canGrantRole(ctx.authority, body.role)) {
      throw errors.forbidden("Insufficient authority to share at this role");
    }

    const viewer = await loadVaultForViewer(ctx.folder.vaultId, user.id);
    if (!viewer) throw errors.notFound("Folder not found");
    const targetMembership = await getOrgMembership(viewer.vault.orgId, body.userId);
    if (!targetMembership) throw errors.notFound("Target user is not a member of this workspace");

    const existing = await loadFolderMember(id, body.userId);
    if (existing) {
      return c.json(
        { error: { code: "member_conflict", message: "User already has a folder grant" } },
        409,
      );
    }

    const granteeEmail = await emailFor(body.userId);

    await db.transaction(async (tx) => {
      await tx.insert(folderMembers).values({ folderId: id, userId: body.userId, role: body.role });
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "folder.share",
        targetType: "folder",
        targetId: id,
        targetName: ctx.folder.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { granteeUserId: body.userId, granteeEmail, role: body.role },
      });
      await createNotification(tx, {
        userId: body.userId,
        orgId: viewer.vault.orgId,
        type: "share.received",
        actorUserId: user.id,
        actorEmail: user.email,
        targetType: "folder",
        targetId: id,
        targetName: ctx.folder.name,
        metadata: { resourceKind: "folder", role: body.role },
      });
    });

    const created = await loadFolderMember(id, body.userId);
    if (!created) throw errors.internal("Failed to reload folder member after insert");
    return c.json({ member: created }, 201);
  })

  // Change a folder grant's role.
  .patch(
    "/:id/members/:userId",
    paramValidator(folderUserParam),
    jsonValidator(patchSchema),
    async (c) => {
      const user = c.get("user")!;
      const { id, userId } = c.req.valid("param");
      const { role } = c.req.valid("json");

      const ctx = await loadFolderContext(id, user.id);
      if (!ctx) throw errors.notFound("Folder not found");

      const target = await loadFolderMember(id, userId);
      if (!target) throw errors.notFound("Folder member not found");

      if (!canModifyGrant(ctx.authority, target.role) || !canGrantRole(ctx.authority, role)) {
        throw errors.forbidden("Insufficient authority to modify this grant");
      }

      const viewer = await loadVaultForViewer(ctx.folder.vaultId, user.id);
      if (!viewer) throw errors.notFound("Folder not found");

      await db.transaction(async (tx) => {
        await tx
          .update(folderMembers)
          .set({ role })
          .where(and(eq(folderMembers.folderId, id), eq(folderMembers.userId, userId)));

        await tx.insert(auditEvents).values({
          orgId: viewer.vault.orgId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: "folder.role_change",
          targetType: "folder",
          targetId: id,
          targetName: ctx.folder.name,
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
        await createNotification(tx, {
          userId,
          orgId: viewer.vault.orgId,
          type: "role.changed",
          actorUserId: user.id,
          actorEmail: user.email,
          targetType: "folder",
          targetId: id,
          targetName: ctx.folder.name,
          metadata: { resourceKind: "folder", from: target.role, to: role },
        });
      });

      const updated = await loadFolderMember(id, userId);
      if (!updated) throw errors.internal("Failed to reload folder member after update");
      return c.json({ member: updated });
    },
  )

  // Remove a folder grant.
  .delete("/:id/members/:userId", paramValidator(folderUserParam), async (c) => {
    const user = c.get("user")!;
    const { id, userId } = c.req.valid("param");

    const ctx = await loadFolderContext(id, user.id);
    if (!ctx) throw errors.notFound("Folder not found");

    const target = await loadFolderMember(id, userId);
    if (!target) throw errors.notFound("Folder member not found");

    if (!canModifyGrant(ctx.authority, target.role)) {
      throw errors.forbidden("Insufficient authority to revoke this grant");
    }

    const viewer = await loadVaultForViewer(ctx.folder.vaultId, user.id);
    if (!viewer) throw errors.notFound("Folder not found");

    await db.transaction(async (tx) => {
      await tx
        .delete(folderMembers)
        .where(and(eq(folderMembers.folderId, id), eq(folderMembers.userId, userId)));
      await tx.insert(auditEvents).values({
        orgId: viewer.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "folder.revoke",
        targetType: "folder",
        targetId: id,
        targetName: ctx.folder.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { revokedUserId: userId, revokedEmail: target.email, role: target.role },
      });
      await createNotification(tx, {
        userId,
        orgId: viewer.vault.orgId,
        type: "access.revoked",
        actorUserId: user.id,
        actorEmail: user.email,
        targetType: "folder",
        targetId: id,
        targetName: ctx.folder.name,
        metadata: { resourceKind: "folder" },
      });
    });

    return c.body(null, 204);
  });

export type FolderMemberRoutes = typeof folderMemberRoutes;
