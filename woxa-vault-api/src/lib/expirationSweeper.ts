import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { vaultMembers, folderMembers, itemMembers, vaults, folders, items } from "@/db/schema";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

/**
 * Sweeper to automatically revert or remove expired temporary roles.
 *
 * Runs a background loop to find any member row (vault, folder, or item)
 * where `expiresAt` has passed, then reverts it to `originalRole`.
 */
export async function sweepExpiredRoles() {
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // 1. Vault Members
      const expiredVaults = await tx
        .select({
          member: vaultMembers,
          name: vaults.name,
        })
        .from(vaultMembers)
        .innerJoin(vaults, eq(vaultMembers.vaultId, vaults.id))
        .where(lt(vaultMembers.expiresAt, now));

      for (const row of expiredVaults) {
        const m = row.member;
        if (m.originalRole) {
          await tx
            .update(vaultMembers)
            .set({ role: m.originalRole, originalRole: null, expiresAt: null })
            .where(and(eq(vaultMembers.vaultId, m.vaultId), eq(vaultMembers.userId, m.userId)));
          
          await createNotification(tx, {
            userId: m.userId,
            type: "role.changed",
            targetType: "vault",
            targetId: m.vaultId,
            targetName: row.name,
            metadata: { resourceKind: "vault", from: m.role, to: m.originalRole },
          });
        } else {
          await tx
            .delete(vaultMembers)
            .where(and(eq(vaultMembers.vaultId, m.vaultId), eq(vaultMembers.userId, m.userId)));
          
          await createNotification(tx, {
            userId: m.userId,
            type: "access.revoked",
            targetType: "vault",
            targetId: m.vaultId,
            targetName: row.name,
            metadata: { resourceKind: "vault" },
          });
        }
        logger.info({ userId: m.userId, vaultId: m.vaultId }, "expired vault access reverted");
      }

      // 2. Folder Members
      const expiredFolders = await tx
        .select({
          member: folderMembers,
          name: folders.name,
        })
        .from(folderMembers)
        .innerJoin(folders, eq(folderMembers.folderId, folders.id))
        .where(lt(folderMembers.expiresAt, now));

      for (const row of expiredFolders) {
        const m = row.member;
        if (m.originalRole) {
          await tx
            .update(folderMembers)
            .set({ role: m.originalRole, originalRole: null, expiresAt: null })
            .where(and(eq(folderMembers.folderId, m.folderId), eq(folderMembers.userId, m.userId)));
          
          await createNotification(tx, {
            userId: m.userId,
            type: "role.changed",
            targetType: "folder",
            targetId: m.folderId,
            targetName: row.name,
            metadata: { resourceKind: "folder", from: m.role, to: m.originalRole },
          });
        } else {
          await tx
            .delete(folderMembers)
            .where(and(eq(folderMembers.folderId, m.folderId), eq(folderMembers.userId, m.userId)));
          
          await createNotification(tx, {
            userId: m.userId,
            type: "access.revoked",
            targetType: "folder",
            targetId: m.folderId,
            targetName: row.name,
            metadata: { resourceKind: "folder" },
          });
        }
      }

      // 3. Item Members
      const expiredItems = await tx
        .select({
          member: itemMembers,
          name: items.name,
        })
        .from(itemMembers)
        .innerJoin(items, eq(itemMembers.itemId, items.id))
        .where(lt(itemMembers.expiresAt, now));

      for (const row of expiredItems) {
        const m = row.member;
        if (m.originalRole) {
          await tx
            .update(itemMembers)
            .set({ role: m.originalRole, originalRole: null, expiresAt: null })
            .where(and(eq(itemMembers.itemId, m.itemId), eq(itemMembers.userId, m.userId)));
          
          await createNotification(tx, {
            userId: m.userId,
            type: "role.changed",
            targetType: "item",
            targetId: m.itemId,
            targetName: row.name,
            metadata: { resourceKind: "item", from: m.role, to: m.originalRole },
          });
        } else {
          await tx
            .delete(itemMembers)
            .where(and(eq(itemMembers.itemId, m.itemId), eq(itemMembers.userId, m.userId)));
          
          await createNotification(tx, {
            userId: m.userId,
            type: "access.revoked",
            targetType: "item",
            targetId: m.itemId,
            targetName: row.name,
            metadata: { resourceKind: "item" },
          });
        }
      }
    });
  } catch (err) {
    logger.error({ err }, "failed to sweep expired roles");
  }
}

let sweeperId: NodeJS.Timeout | null = null;

export function startExpirationSweeper(intervalMs = 60 * 1000) {
  if (sweeperId) return;
  sweeperId = setInterval(sweepExpiredRoles, intervalMs);
  sweeperId.unref();
  logger.info({ intervalMs }, "expiration sweeper started");
}

export function stopExpirationSweeper() {
  if (sweeperId) {
    clearInterval(sweeperId);
    sweeperId = null;
  }
}
