import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, items, vaults } from "@/db/schema";
import { errors } from "@/lib/errors";
import { resolveItemRole } from "@/lib/access";
import { canManageOrgMembers, canViewAllOrgAudit, getOrgMembership } from "@/lib/orgAccess";
import { paramValidator, queryValidator } from "@/lib/validator";
import { toAuditDto } from "@/routes/audit";
import { requireAuth, requireTwoFactorEnrolled, type AuthVariables } from "@/middleware/auth";

// ---------------------------------------------------------------------------
// GET /items/:id/activity — per-item "Recent activity" widget.
//
// Returns audit events scoped to ONE item (targetType='item', targetId=:id)
// so the item detail page can render its own activity feed without exposing the
// full org audit log.
//
// Authorization (the security boundary):
//   * A vault MANAGER of the item (effective item role === "manager", which
//     covers a vault `manager` OR an item/folder-level "manager" override) may
//     view it — even when their ORG role is only `member`.
//   * An org owner/admin OF THE ITEM'S ORG may also view it (they see
//     everything in their workspace).
//   * Every other vault role (editor/user/viewer) → 403. Any non-member or
//     unknown item → 404 (anti-enumeration; never reveal the item exists).
//
// This deliberately does NOT widen the full audit log: `GET /audit` stays
// admin+ only and is unchanged. A vault manager who is just an org `member`
// can read THIS endpoint but still gets 403 from `GET /audit`.
//
// Threat model:
//   Asset: the per-item activity feed — actor identities, IP hashes, user
//     agents and timestamps of who touched this secret. A leak is a privacy +
//     reconnaissance problem (who has the keys, when they used them), and a
//     mis-scoped query could become a backdoor into the org-wide audit log.
//   Adversaries:
//     * A vault editor/user/viewer trying to see managerial oversight data
//       they have no business reading → 403 (they can see the item, so 404
//       would be a lie; 403 is correct and not an enumeration leak).
//     * A non-member probing item ids → 404, identical to a missing item, so
//       existence cannot be enumerated.
//     * A cross-org admin: owner/admin of org A pointing at an item in org B.
//       The org-admin check resolves the caller's membership in the ITEM'S org
//       (item.vault.orgId) via getOrgMembership — NOT activeOrgForContext — so
//       being admin of A grants nothing in B. Access to a B item is only via
//       the vault-manager path (or actual B admin/owner).
//   Mitigations:
//     * resolveItemRole drives the effective-role check (single source of truth
//       for most-specific-wins resolution).
//     * The query is pinned to (targetType='item' AND targetId=:id AND
//       orgId=item.vault.orgId) so it can never spill another item's or
//       another org's rows.
//     * No write path here (read-only over existing audit_events) — no audit
//       row is emitted for viewing activity, mirroring how `GET /audit` is
//       itself unaudited.
//   Residual risk:
//     * A vault manager sees IP hashes / user agents of co-members; acceptable
//       — managers are the oversight role for their vault by design.
// ---------------------------------------------------------------------------

const uuidParam = z.object({ id: z.string().uuid() });

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const itemActivityRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)

  // NOTE: NOT gated by requireVaultUnlocked — activity is metadata (who/when),
  // not decrypted secret plaintext, so the lock screen does not apply.
  .get("/:id/activity", paramValidator(uuidParam), queryValidator(querySchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const q = c.req.valid("query");
    const limit = q.limit ?? 20;

    // 1. Load the non-deleted item. Missing → 404.
    const item = await db.query.items.findFirst({
      where: and(eq(items.id, id), isNull(items.deletedAt)),
    });
    if (!item) throw errors.notFound("Item not found");

    // 2a. Effective item role (item override → folder grant → vault membership).
    const itemRole = await resolveItemRole(user.id, {
      id: item.id,
      vaultId: item.vaultId,
      folderId: item.folderId,
    });

    // 2b. The item's ORG comes from its vault — needed both for the org-admin
    // check and to scope the audit query. We MUST judge the caller's role in
    // THIS org (not the active org): admin of org A must not read an item in
    // org B. Read the vault directly for its orgId.
    const vault = await db.query.vaults.findFirst({ where: eq(vaults.id, item.vaultId) });
    // A live (non-deleted) item ALWAYS has a live vault (FK + cascade). If the
    // vault is somehow missing, fail closed (404) rather than fall through to an
    // org-UNPINNED audit query below — the org pin is a hard guard, not best-effort.
    if (!vault) throw errors.notFound("Item not found");
    const orgId = vault.orgId;

    // 3. No access at all (no effective item role AND not an admin/owner/auditor
    // of the item's org) → 404 (anti-enumeration; don't reveal the item exists).
    const orgMembership = await getOrgMembership(orgId, user.id);
    const isOrgAuditManager = orgMembership ? canViewAllOrgAudit(orgMembership.role) : false;

    if (!itemRole && !isOrgAuditManager) {
      throw errors.notFound("Item not found");
    }

    // 4. Allowed = effective item role is manager OR org owner/admin/auditor of the
    // item's org. Otherwise the caller can SEE the item (editor/user/viewer)
    // but is neither a manager nor an admin/auditor → 403.
    const allowed = itemRole === "manager" || isOrgAuditManager;
    if (!allowed) {
      throw errors.forbidden("Only vault managers or auditors can view item activity");
    }

    // 5. Fetch the item's events. ALWAYS pinned to (targetType='item', targetId,
    // orgId). The org pin is a REQUIRED guard, not best-effort: `targetId` is a
    // free-text column with no unique constraint, so the org filter is what
    // guarantees we never spill another org's rows. Order matches /audit:
    // (occurred_at DESC, id DESC).
    const conds = [
      eq(auditEvents.targetType, "item"),
      eq(auditEvents.targetId, id),
      eq(auditEvents.orgId, orgId),
    ];

    const rows = await db
      .select()
      .from(auditEvents)
      .where(and(...conds))
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(limit);

    return c.json({ events: rows.map(toAuditDto) });
  });

export type ItemActivityRoutes = typeof itemActivityRoutes;
