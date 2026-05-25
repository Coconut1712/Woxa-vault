import { Hono } from "hono";
import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, folders, type Folder } from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { jsonValidator, paramValidator } from "@/lib/validator";
import {
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  type AuthVariables,
} from "@/middleware/auth";
import { canManageItem, loadVaultForViewer } from "@/routes/vaults";
import { folderMembers } from "@/db/schema";
import { resolveFolderRole } from "@/lib/access";

// ---------------------------------------------------------------------------
// Folders — flat per-vault containers (DESIGN.md §7.3; parent_id nesting is
// deferred). Folder access mirrors the parent vault's role gate.
// ---------------------------------------------------------------------------

const COLOR_VALUES = [
  "violet",
  "blue",
  "emerald",
  "amber",
  "rose",
  "fuchsia",
  "cyan",
  "indigo",
] as const;
const colorSchema = z.enum(COLOR_VALUES);

const vaultParam = z.object({ id: z.string().uuid() });
const folderParam = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  iconKey: z.string().trim().max(60).nullable().optional(),
  color: colorSchema.nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  iconKey: z.string().trim().max(60).nullable().optional(),
  color: colorSchema.nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});

interface FolderDTO {
  id: string;
  vaultId: string;
  name: string;
  iconKey: string | null;
  color: (typeof COLOR_VALUES)[number] | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

function toDto(f: Folder): FolderDTO {
  return {
    id: f.id,
    vaultId: f.vaultId,
    name: f.name,
    iconKey: f.iconKey,
    color: (f.color as FolderDTO["color"]) ?? null,
    position: f.position,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

// Sub-router mounted under /vaults/:id/folders for list + create.
export const vaultFolderRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  .get("/:id/folders", paramValidator(vaultParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    // Surfacing: members see all folders; sub-grant-only callers see only the
    // folders they hold a folder-grant for (items they hold item-grants-for but
    // no folder-grant render with their folderId in GET items, but the folder
    // itself may be absent here — the frontend groups orphans as uncategorized).
    const viewer = await loadVaultForViewer(id, user.id);
    if (!viewer) throw errors.notFound("Vault not found");

    const rows = await db
      .select()
      .from(folders)
      .where(eq(folders.vaultId, id))
      .orderBy(asc(folders.position), asc(folders.createdAt));

    if (viewer.vaultRole !== null) {
      return c.json({ folders: rows.map(toDto) });
    }

    // Non-member: restrict to folders the caller holds a grant on.
    const grantRows = await db
      .select({ folderId: folderMembers.folderId })
      .from(folderMembers)
      .where(eq(folderMembers.userId, user.id));
    const granted = new Set(grantRows.map((r) => r.folderId));
    return c.json({ folders: rows.filter((f) => granted.has(f.id)).map(toDto) });
  })

  .post("/:id/folders", paramValidator(vaultParam), jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    // Creating a NEW folder is a vault-level write (no folder grant can exist
    // yet) → require a vault role with content-edit authority.
    const viewer = await loadVaultForViewer(id, user.id);
    if (!viewer) throw errors.notFound("Vault not found");
    if (!viewer.vaultRole || !canManageItem(viewer.vaultRole)) {
      throw errors.forbidden("Read-only access to this vault");
    }
    const access = { vault: viewer.vault };

    // Default position = max(position) + 1 so new folders land at the end of
    // the user's existing list. The frontend may still pass an explicit
    // `position` to insert at a specific slot.
    let position = body.position;
    if (position === undefined) {
      const [tail] = await db
        .select({ p: folders.position })
        .from(folders)
        .where(eq(folders.vaultId, id))
        .orderBy(desc(folders.position))
        .limit(1);
      position = (tail?.p ?? -1) + 1;
    }

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(folders)
        .values({
          vaultId: id,
          name: body.name,
          iconKey: body.iconKey ?? null,
          color: body.color ?? null,
          position,
        })
        .returning();
      if (!row) throw new Error("folder insert returned no row");

      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "folder.create",
        targetType: "folder",
        targetId: row.id,
        targetName: row.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { vaultId: id },
      });
      return row;
    });

    return c.json({ folder: toDto(created) }, 201);
  });

// Top-level /folders/:id router for PATCH + DELETE.
export const folderRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  .patch("/:id", paramValidator(folderParam), jsonValidator(patchSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const row = await db.query.folders.findFirst({ where: eq(folders.id, id) });
    if (!row) throw errors.notFound("Folder not found");

    // EFFECTIVE folder role (folder grant → vault membership).
    const role = await resolveFolderRole(user.id, { id: row.id, vaultId: row.vaultId });
    if (!role) throw errors.notFound("Folder not found");
    if (!canManageItem(role)) {
      throw errors.forbidden("Read-only access to this vault");
    }
    const viewer = await loadVaultForViewer(row.vaultId, user.id);
    if (!viewer) throw errors.notFound("Folder not found");
    const access = { vault: viewer.vault };

    if (Object.keys(body).length === 0) {
      return c.json({ folder: toDto(row) });
    }

    const [updated] = await db
      .update(folders)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.iconKey !== undefined ? { iconKey: body.iconKey } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
        updatedAt: new Date(),
      })
      .where(eq(folders.id, id))
      .returning();

    if (!updated) throw errors.notFound("Folder not found");

    await db.insert(auditEvents).values({
      orgId: access.vault.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "folder.update",
      targetType: "folder",
      targetId: id,
      targetName: updated.name,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { fields: Object.keys(body) },
    });

    return c.json({ folder: toDto(updated) });
  })

  .delete("/:id", paramValidator(folderParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const row = await db.query.folders.findFirst({ where: eq(folders.id, id) });
    if (!row) throw errors.notFound("Folder not found");

    const role = await resolveFolderRole(user.id, { id: row.id, vaultId: row.vaultId });
    if (!role) throw errors.notFound("Folder not found");
    if (!canManageItem(role)) {
      throw errors.forbidden("Read-only access to this vault");
    }
    const viewer = await loadVaultForViewer(row.vaultId, user.id);
    if (!viewer) throw errors.notFound("Folder not found");
    const access = { vault: viewer.vault };

    // FK on items.folder_id is ON DELETE SET NULL — items survive the folder
    // delete and end up unfiled. Audit row written in the same transaction.
    await db.transaction(async (tx) => {
      await tx.delete(folders).where(eq(folders.id, id));
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "folder.delete",
        targetType: "folder",
        targetId: id,
        targetName: row.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { vaultId: row.vaultId },
      });
    });

    return c.body(null, 204);
  });

export type VaultFolderRoutes = typeof vaultFolderRoutes;
export type FolderRoutes = typeof folderRoutes;
