import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, orgMembers, vaultKeys, vaults, vaultMembers } from "@/db/schema";
import { createNotification } from "@/lib/notifications";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface RevokeContext {
  orgId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  ipHash: string | null;
  userAgent: string | null;
}

// AC-024.5 — when a member loses access to a v2 (zero-knowledge) vault, cut
// their SERVER-SIDE access immediately by deleting their vault_keys row, then
// flag the vault `rekey_pending` so an admin/manager re-keys it (client-driven)
// and re-encrypts every item. The server cannot re-encrypt itself (no key /
// plaintext) — this only marks the work + revokes the wrapped key the server
// was storing for them.
//
// Residual (documented): a revoked member who CACHED the old vault key in their
// browser can still locally decrypt ciphertext they already pulled, until the
// rekey rotates the key + re-encrypts. Inherent to client-side E2E.
//
// `vaultIds` scopes which vaults to check (a single vault for a vault-member
// removal, or all of an org's vaults for an org-member removal). Returns the
// vaults that were flagged so the caller can report / notify.

// Notify all managers of a vault that it needs re-keying. Runs inside the
// caller's transaction. Skips the actor (they triggered the revoke) and
// skips the removed user (they no longer have access).
async function notifyVaultManagers(
  tx: Tx,
  ctx: RevokeContext,
  vaultId: string,
  vaultName: string | null,
  removedUserId: string,
): Promise<void> {
  const managers = await tx
    .select({ userId: vaultMembers.userId })
    .from(vaultMembers)
    .where(
      and(
        eq(vaultMembers.vaultId, vaultId),
        inArray(vaultMembers.role, ["manager"]),
      ),
    );

  let notified = 0;
  for (const m of managers) {
    if (m.userId === removedUserId) continue;
    await createNotification(tx, {
      userId: m.userId,
      orgId: ctx.orgId,
      type: "vault.rekey_pending",
      actorUserId: ctx.actorUserId,
      actorEmail: ctx.actorEmail,
      targetType: "vault",
      targetId: vaultId,
      targetName: vaultName,
    });
    notified++;
  }

  // Escalation (MEDIUM finding): if NO vault manager could be notified (the
  // only manager was the removed user, or the vault has no other managers), the
  // rekey would silently stall — nobody is told the vault needs re-keying. Fall
  // back to the org owner/admins so the work is never orphaned. Skip the actor
  // (they triggered the revoke) and the removed user (access already cut).
  if (notified === 0) {
    const orgAdmins = await tx
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, ctx.orgId),
          inArray(orgMembers.role, ["owner", "admin"]),
          ne(orgMembers.userId, removedUserId),
        ),
      );
    for (const admin of orgAdmins) {
      if (admin.userId === ctx.actorUserId) continue;
      await createNotification(tx, {
        userId: admin.userId,
        orgId: ctx.orgId,
        type: "vault.rekey_pending",
        actorUserId: ctx.actorUserId,
        actorEmail: ctx.actorEmail,
        targetType: "vault",
        targetId: vaultId,
        targetName: vaultName,
      });
    }
  }
}

// Flag a SINGLE v2 vault after a vault-member removal. No-op for v1 vaults.
export async function revokeVaultKeyAndFlag(
  tx: Tx,
  ctx: RevokeContext,
  vaultId: string,
  removedUserId: string,
  vaultName: string | null,
  encryptionVersion: number,
): Promise<boolean> {
  if (encryptionVersion !== 2) return false;

  await tx
    .delete(vaultKeys)
    .where(and(eq(vaultKeys.vaultId, vaultId), eq(vaultKeys.userId, removedUserId)));

  await tx
    .update(vaults)
    .set({ rekeyPending: true, updatedAt: new Date() })
    .where(eq(vaults.id, vaultId));

  await tx.insert(auditEvents).values({
    orgId: ctx.orgId,
    actorUserId: ctx.actorUserId,
    actorEmail: ctx.actorEmail,
    action: "vault.rekey_pending",
    targetType: "vault",
    targetId: vaultId,
    targetName: vaultName,
    ipHash: ctx.ipHash,
    userAgent: ctx.userAgent,
    success: true,
    metadata: { revokedUserId: removedUserId, reason: "member_revoked" },
  });

  await notifyVaultManagers(tx, ctx, vaultId, vaultName, removedUserId);
  return true;
}

// Flag EVERY v2 vault in an org where the removed user held a wrapped key
// (org-member removal). Deletes their vault_keys rows, flags each affected v2
// vault rekey_pending, and audits one `vault.rekey_pending` per vault. Returns
// the affected vault ids.
export async function revokeOrgKeysAndFlag(
  tx: Tx,
  ctx: RevokeContext,
  removedUserId: string,
): Promise<string[]> {
  // Find the v2 vaults in this org where the user currently holds a key.
  const rows = await tx
    .select({ vaultId: vaults.id, vaultName: vaults.name })
    .from(vaultKeys)
    .innerJoin(vaults, eq(vaults.id, vaultKeys.vaultId))
    .where(
      and(
        eq(vaultKeys.userId, removedUserId),
        eq(vaults.orgId, ctx.orgId),
        eq(vaults.encryptionVersion, 2),
      ),
    );

  const affected: string[] = [];
  for (const r of rows) {
    await tx
      .delete(vaultKeys)
      .where(and(eq(vaultKeys.vaultId, r.vaultId), eq(vaultKeys.userId, removedUserId)));
    await tx
      .update(vaults)
      .set({ rekeyPending: true, updatedAt: new Date() })
      .where(eq(vaults.id, r.vaultId));
    await tx.insert(auditEvents).values({
      orgId: ctx.orgId,
      actorUserId: ctx.actorUserId,
      actorEmail: ctx.actorEmail,
      action: "vault.rekey_pending",
      targetType: "vault",
      targetId: r.vaultId,
      targetName: r.vaultName,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      success: true,
      metadata: { revokedUserId: removedUserId, reason: "org_member_removed" },
    });

    await notifyVaultManagers(tx, ctx, r.vaultId, r.vaultName, removedUserId);
    affected.push(r.vaultId);
  }
  return affected;
}
