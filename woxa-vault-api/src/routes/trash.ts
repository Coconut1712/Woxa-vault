import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments, auditEvents, items, users, vaults } from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { getStorage } from "@/lib/storage";
import { paramValidator } from "@/lib/validator";
import {
  activeOrgForContext,
  requireAuth,
  requireTwoFactorEnrolled,
  type AuthVariables,
} from "@/middleware/auth";
import { canManageOrgMembers } from "@/lib/orgAccess";

// ---------------------------------------------------------------------------
// Trash — soft-delete recycle bin (REQUIREMENTS.md FR "Trash & restore").
//
// Threat model
//   Assets: soft-deleted secret items (still envelope-encrypted at rest) and
//     their attachment blobs. Restoring re-exposes them; purging destroys them.
//   Adversaries:
//     * A lower-privileged org member (member/editor/guest) who deleted an item
//       and wants to inspect/restore/purge OTHER users' deleted items, or peers
//       into vaults they don't belong to. Mitigated: every handler re-resolves
//       the active-org role via `activeOrgForContext` and gates on
//       `canManageOrgMembers` (owner|admin only) — vault membership is NOT
//       consulted, so an admin sees the whole org's trash, and a non-admin gets
//       403 even on items they personally deleted.
//     * Cross-tenant access via guessed item UUIDs. Mitigated: every query
//       joins items→vaults and filters `vaults.orgId = current.orgId` AND
//       `items.deletedAt IS NOT NULL`; an id outside the active org or not in
//       trash collapses to 404 (anti-enumeration: 404, never 403, so the admin
//       cannot distinguish "wrong org" from "not deleted" from "never existed").
//     * Storage-volume leak after purge. Mitigated: purge deletes attachment
//       BLOBS (the FK cascade only removes attachment ROWS) before dropping the
//       item row.
//   Residual risk: no auto-purge job in this phase — `purgeAt` is advisory only
//     (TRASH_RETENTION_DAYS), so deleted secrets linger encrypted until an admin
//     empties the trash. Accepted for this phase; a sweep job lands later.
// ---------------------------------------------------------------------------

// Informational retention horizon surfaced to the UI as `purgeAt`. There is NO
// auto-purge job yet — admins must empty the trash manually.
export const TRASH_RETENTION_DAYS = 30;

const uuidParam = z.object({ id: z.string().uuid() });

interface TrashItemDTO {
  id: string;
  vaultId: string;
  vaultName: string;
  type: string;
  name: string;
  username: string | null;
  deletedAt: string;
  deletedBy: { id: string; displayName: string } | null;
  purgeAt: string;
}

function purgeAtFor(deletedAt: Date): string {
  return new Date(
    deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

// Resolve the caller's active org and assert admin+ authority. Throws the
// standard 404 "No workspace" when the caller belongs to no org, and 403 when
// they are a member but not owner/admin. Returns the validated org id on
// success — every trash handler routes through this first.
async function requireTrashAdmin(
  c: Context<{ Variables: AuthVariables }>,
): Promise<{ orgId: string }> {
  const current = await activeOrgForContext(c);
  if (!current) throw errors.notFound("No workspace");
  if (!canManageOrgMembers(current.role)) {
    throw errors.forbidden("Trash is restricted to workspace admins");
  }
  return { orgId: current.orgId };
}

export const trashRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)

  // List ALL soft-deleted items across every vault in the active org. Admin+
  // only; vault membership is NOT required (org-wide trash view).
  .get("/", async (c) => {
    const { orgId } = await requireTrashAdmin(c);

    const rows = await db
      .select({
        id: items.id,
        vaultId: items.vaultId,
        vaultName: vaults.name,
        type: items.type,
        name: items.name,
        username: items.username,
        deletedAt: items.deletedAt,
        deletedById: users.id,
        deletedByDisplayName: users.displayName,
        deletedByName: users.name,
        deletedByEmail: users.email,
      })
      .from(items)
      .innerJoin(vaults, eq(vaults.id, items.vaultId))
      // LEFT join: deletedBy may be NULL (deleter removed, or legacy soft-delete).
      .leftJoin(users, eq(users.id, items.deletedBy))
      .where(and(eq(vaults.orgId, orgId), isNotNull(items.deletedAt)))
      .orderBy(desc(items.deletedAt));

    const out: TrashItemDTO[] = rows.map((r) => ({
      id: r.id,
      vaultId: r.vaultId,
      vaultName: r.vaultName,
      type: r.type,
      name: r.name,
      username: r.username,
      // deletedAt cannot be null here (filtered isNotNull) — assert for TS.
      deletedAt: r.deletedAt!.toISOString(),
      deletedBy: r.deletedById
        ? {
            id: r.deletedById,
            displayName:
              r.deletedByDisplayName ?? r.deletedByName ?? r.deletedByEmail ?? "unknown",
          }
        : null,
      purgeAt: purgeAtFor(r.deletedAt!),
    }));

    return c.json({ items: out });
  })

  // Permanently empty the trash for the active org. MUST be declared BEFORE the
  // parameterized `/:id` purge route so "empty" is not parsed as an item id.
  .post("/empty", async (c) => {
    const user = c.get("user")!;
    const { orgId } = await requireTrashAdmin(c);

    // Collect every soft-deleted item in the org first, so we can purge their
    // attachment blobs (FK cascade only removes the attachment ROWS).
    const trashed = await db
      .select({ id: items.id })
      .from(items)
      .innerJoin(vaults, eq(vaults.id, items.vaultId))
      .where(and(eq(vaults.orgId, orgId), isNotNull(items.deletedAt)));

    const itemIds = trashed.map((r) => r.id);
    if (itemIds.length === 0) {
      await db.insert(auditEvents).values({
        orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "trash.empty",
        targetType: "trash",
        targetId: null,
        targetName: null,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { count: 0 },
      });
      return c.json({ purged: 0 });
    }

    await deleteAttachmentBlobs(itemIds);

    await db.transaction(async (tx) => {
      await tx.delete(items).where(inArray(items.id, itemIds));
      await tx.insert(auditEvents).values({
        orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "trash.empty",
        targetType: "trash",
        targetId: null,
        targetName: null,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { count: itemIds.length },
      });
    });

    return c.json({ purged: itemIds.length });
  })

  // Restore a soft-deleted item back to its vault.
  .post("/:id/restore", paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const { orgId } = await requireTrashAdmin(c);

    const found = await loadTrashedItem(id, orgId);
    if (!found) throw errors.notFound("Item not found");

    const [restored] = await db
      .update(items)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(items.id, id))
      .returning();
    if (!restored) throw errors.notFound("Item not found");

    await db.insert(auditEvents).values({
      orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "item.restore",
      targetType: "item",
      targetId: restored.id,
      targetName: restored.name,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
    });

    return c.json({
      item: { id: restored.id, vaultId: restored.vaultId, name: restored.name },
    });
  })

  // Permanently delete a single soft-deleted item (blobs + row).
  .delete("/:id", paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const { orgId } = await requireTrashAdmin(c);

    const found = await loadTrashedItem(id, orgId);
    if (!found) throw errors.notFound("Item not found");

    await deleteAttachmentBlobs([id]);

    await db.transaction(async (tx) => {
      await tx.delete(items).where(eq(items.id, id));
      await tx.insert(auditEvents).values({
        orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "item.purge",
        targetType: "item",
        targetId: id,
        targetName: found.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
      });
    });

    return c.body(null, 204);
  });

export type TrashRoutes = typeof trashRoutes;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Verify the id is a soft-deleted item whose vault belongs to `orgId`. Returns
// the minimal item row (name for audit) or null → handlers map null to a 404
// (anti-enumeration; never 403 for an existing-but-out-of-scope id).
async function loadTrashedItem(
  itemId: string,
  orgId: string,
): Promise<{ id: string; name: string } | null> {
  const rows = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .innerJoin(vaults, eq(vaults.id, items.vaultId))
    .where(
      and(eq(items.id, itemId), eq(vaults.orgId, orgId), isNotNull(items.deletedAt)),
    )
    .limit(1);
  return rows[0] ?? null;
}

// Delete the storage blobs for every attachment under the given items. The FK
// cascade removes attachment ROWS when the item row is dropped, but the bytes
// on the storage volume are NOT cascaded — purge them here first. Best-effort:
// a failed blob delete is swallowed (the row will still be cascaded; a future
// GC sweep reconciles orphans), mirroring attachments.ts DELETE behavior.
async function deleteAttachmentBlobs(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const rows = await db
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .where(inArray(attachments.itemId, itemIds));
  const storage = getStorage();
  for (const r of rows) {
    try {
      await storage.delete(r.storageKey);
    } catch {
      // Swallow — the attachment row cascades on item delete; a sweep job
      // reconciles any orphan blob left behind.
    }
  }
}
