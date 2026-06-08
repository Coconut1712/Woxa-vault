import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  vaultMembers,
  folderMembers,
  itemMembers,
  vaults,
  folders,
  items,
  accessRequests,
  auditEvents,
} from "@/db/schema";
import type { ResourceKind } from "@/lib/notifications";
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

/**
 * AC-061.5 — auto-deny access requests left pending for more than 7 days.
 *
 * A stale pending request is a small liability: it keeps an approver's queue
 * noisy and leaves the requester in limbo. After 7 days we close it as
 * `denied` with a machine-readable reason, notify the requester, and write an
 * audit row. The decision is system-driven so `actorUserId` is null on both the
 * notification and the audit event.
 *
 * Idempotent: the WHERE clause only matches `status = 'pending'` rows, and the
 * UPDATE flips them to `denied` in the same transaction, so a request can never
 * be auto-denied twice even if two sweeper ticks overlap.
 */
export async function sweepStaleAccessRequests() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // Atomic claim: flip every stale pending request to `denied` in ONE
      // UPDATE and RETURN only the rows this transaction actually transitioned.
      // The previous SELECT-then-per-row-UPDATE pattern had a race window — two
      // overlapping sweeper ticks (or a concurrent approve/deny) could both
      // SELECT the same pending row and then each fire a notification + audit
      // for it. Filtering on `status = 'pending'` INSIDE the UPDATE means only
      // one writer wins the row; we notify/audit strictly off the RETURNING set.
      const denied = await tx
        .update(accessRequests)
        .set({
          status: "denied",
          decidedAt: now,
          decisionReason: "auto_denied_after_7_days",
        })
        .where(
          and(eq(accessRequests.status, "pending"), lt(accessRequests.createdAt, cutoff)),
        )
        .returning();

      for (const reqRow of denied) {
        await createNotification(tx, {
          userId: reqRow.requesterId,
          orgId: reqRow.orgId,
          type: "access_request.denied",
          actorUserId: null,
          targetType: reqRow.targetType,
          targetId: reqRow.targetId,
          targetName: reqRow.targetName,
          metadata: {
            resourceKind: reqRow.targetType as ResourceKind,
            role: reqRow.requestedRole,
            decisionReason: "Auto-denied after 7 days",
          },
        });

        await tx.insert(auditEvents).values({
          orgId: reqRow.orgId,
          actorUserId: null,
          action: "access_request.auto_denied",
          targetType: reqRow.targetType,
          targetId: reqRow.targetId,
          targetName: reqRow.targetName,
          success: true,
          metadata: { requestedRole: reqRow.requestedRole, ageThresholdDays: 7 },
        });

        logger.info(
          { requestId: reqRow.id, requesterId: reqRow.requesterId },
          "access request auto-denied after 7 days",
        );
      }
    });
  } catch (err) {
    logger.error({ err }, "failed to sweep stale access requests");
  }
}

let sweeperId: NodeJS.Timeout | null = null;

export function startExpirationSweeper(intervalMs = 60 * 1000) {
  if (sweeperId) return;
  sweeperId = setInterval(() => {
    void sweepExpiredRoles();
    // AC-061.5 — same 60s cadence as the role sweeper. Runs after the role
    // revert so a freshly-expired temp grant isn't competing for the same tx.
    void sweepStaleAccessRequests();
  }, intervalMs);
  sweeperId.unref();

  logger.info({ intervalMs }, "expiration sweeper started");
}

export function stopExpirationSweeper() {
  if (sweeperId) {
    clearInterval(sweeperId);
    sweeperId = null;
  }
}
