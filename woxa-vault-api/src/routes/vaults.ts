import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, count } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  folderMembers,
  folders,
  itemMembers,
  items,
  orgMembers,
  users,
  vaultMembers,
  vaults,
  type Vault,
} from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { jsonValidator, paramValidator } from "@/lib/validator";
import {
  activeOrgForContext,
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  type AuthVariables,
} from "@/middleware/auth";
import type { Context } from "hono";

// ---------------------------------------------------------------------------
// Shared schemas / helpers
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

const ROLES = ["manager", "editor", "user", "viewer"] as const;
type Role = (typeof ROLES)[number];

const uuidParam = z.object({ id: z.string().uuid() });

// Look up the caller's vault row + role. Returns null when the vault is
// invisible to the caller (missing OR they have no membership). We do NOT
// reveal a 403 vs 404 distinction at the *vault* membership boundary — that
// would let a probe enumerate vault ids inside their own org.
async function loadVaultForUser(
  vaultId: string,
  userId: string,
): Promise<{ vault: Vault; role: Role } | null> {
  const row = await db
    .select({
      vault: vaults,
      role: vaultMembers.role,
    })
    .from(vaults)
    .innerJoin(
      vaultMembers,
      and(eq(vaultMembers.vaultId, vaults.id), eq(vaultMembers.userId, userId)),
    )
    .where(and(eq(vaults.id, vaultId), isNull(vaults.deletedAt)))
    .limit(1);

  const first = row[0];
  if (!first) return null;
  return { vault: first.vault, role: first.role as Role };
}

// Load a vault for a SURFACING (read-only) caller. Access is granted when the
// caller is a vault member (vaultRole set) OR holds >=1 folder grant for a
// folder in the vault OR >=1 item grant for an item in the vault (sub-grant-
// only viewer → vaultRole = null). Returns null only when the vault is missing
// or the caller has no membership AND no sub-grant anywhere in the vault.
//
// DESIGN.md §11: a user shared a single item/folder should still SEE the parent
// vault (showing only the shared subset) without becoming a full vault member.
async function loadVaultForViewer(
  vaultId: string,
  userId: string,
): Promise<{ vault: Vault; vaultRole: Role | null } | null> {
  const vaultRow = await db.query.vaults.findFirst({
    where: and(eq(vaults.id, vaultId), isNull(vaults.deletedAt)),
  });
  if (!vaultRow) return null;

  // Direct vault membership (the common path).
  const member = await db
    .select({ role: vaultMembers.role })
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)))
    .limit(1);
  if (member[0]) return { vault: vaultRow, vaultRole: member[0].role as Role };

  // Sub-grant: any folder grant for a folder in this vault.
  const folderGrant = await db
    .select({ folderId: folderMembers.folderId })
    .from(folderMembers)
    .innerJoin(folders, eq(folders.id, folderMembers.folderId))
    .where(and(eq(folders.vaultId, vaultId), eq(folderMembers.userId, userId)))
    .limit(1);
  if (folderGrant[0]) return { vault: vaultRow, vaultRole: null };

  // Sub-grant: any item grant for an item in this vault.
  const itemGrant = await db
    .select({ itemId: itemMembers.itemId })
    .from(itemMembers)
    .innerJoin(items, eq(items.id, itemMembers.itemId))
    .where(and(eq(items.vaultId, vaultId), eq(itemMembers.userId, userId)))
    .limit(1);
  if (itemGrant[0]) return { vault: vaultRow, vaultRole: null };

  return null;
}

function canEditVault(role: Role): boolean {
  return role === "manager";
}

// Create / edit / delete items, folders and attachments. Per DESIGN.md §3 the
// `user` role is USE-ONLY (view + reveal/copy) — it may NOT write. Only manager
// and editor can manage content; `viewer` sees metadata only.
function canManageItem(role: Role): boolean {
  return role === "manager" || role === "editor";
}

// Resolve the org a vault operation should target — the session's ACTIVE
// workspace (M-1), validated against a live membership, falling back to the
// caller's first membership when unset. Returns null only when the caller has
// no membership at all.
async function activeOrgIdForContext(
  c: Context<{ Variables: AuthVariables }>,
): Promise<string | null> {
  const m = await activeOrgForContext(c);
  return m?.orgId ?? null;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

interface VaultSummary {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  color: (typeof COLOR_VALUES)[number] | null;
  itemCount: number;
  memberCount: number;
  encryptionVersion: number;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

interface VaultFull extends VaultSummary {
  createdBy: string | null;
}

function toSummary(
  v: Vault,
  role: Role,
  itemCount: number,
  memberCount: number,
): VaultSummary {
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    iconKey: v.iconKey,
    color: (v.color as VaultSummary["color"]) ?? null,
    itemCount,
    memberCount,
    encryptionVersion: v.encryptionVersion,
    role,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

function toFull(v: Vault, role: Role, itemCount: number, memberCount: number): VaultFull {
  return { ...toSummary(v, role, itemCount, memberCount), createdBy: v.createdBy };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  iconKey: z.string().trim().max(60).nullable().optional(),
  color: colorSchema.nullable().optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  iconKey: z.string().trim().max(60).nullable().optional(),
  color: colorSchema.nullable().optional(),
});

export const vaultRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  // List vaults the caller is a member of, SCOPED to the active workspace
  // (M-1). Vaults belong to an org (`vaults.orgId`); a multi-workspace user
  // would otherwise see vaults from every org they have membership in mixed
  // together, not the workspace they're viewing. We resolve the active org
  // (validated against membership) and filter the list to it. When the caller
  // has no membership at all we return an empty list rather than 404 so the
  // /spaces empty-state renders without an error branch.
  .get("/", async (c) => {
    const user = c.get("user")!;

    const orgId = await activeOrgIdForContext(c);
    if (!orgId) return c.json({ vaults: [] });

    const rows = await db
      .select({
        vault: vaults,
        role: vaultMembers.role,
      })
      .from(vaultMembers)
      .innerJoin(vaults, eq(vaults.id, vaultMembers.vaultId))
      .where(
        and(
          eq(vaultMembers.userId, user.id),
          eq(vaults.orgId, orgId),
          isNull(vaults.deletedAt),
        ),
      )
      .orderBy(desc(vaults.updatedAt));

    // DESIGN.md §11 surfacing: also include vaults the caller is NOT a member of
    // but holds a folder or item grant inside (sub-grant-only). These render
    // with role = "viewer" at the vault level (the caller can only see the
    // shared subset; GET /vaults/:id/items computes per-item effective roles).
    const memberVaultIds = new Set(rows.map((r) => r.vault.id));

    const folderGrantVaults = await db
      .selectDistinct({ vault: vaults })
      .from(folderMembers)
      .innerJoin(folders, eq(folders.id, folderMembers.folderId))
      .innerJoin(vaults, eq(vaults.id, folders.vaultId))
      .where(
        and(
          eq(folderMembers.userId, user.id),
          eq(vaults.orgId, orgId),
          isNull(vaults.deletedAt),
        ),
      );
    const itemGrantVaults = await db
      .selectDistinct({ vault: vaults })
      .from(itemMembers)
      .innerJoin(items, eq(items.id, itemMembers.itemId))
      .innerJoin(vaults, eq(vaults.id, items.vaultId))
      .where(
        and(
          eq(itemMembers.userId, user.id),
          eq(vaults.orgId, orgId),
          isNull(vaults.deletedAt),
        ),
      );

    const subGrantRows: { vault: Vault; role: Role }[] = [];
    for (const r of [...folderGrantVaults, ...itemGrantVaults]) {
      if (memberVaultIds.has(r.vault.id)) continue;
      if (subGrantRows.some((s) => s.vault.id === r.vault.id)) continue;
      // Sub-grant-only callers surface the vault as a "viewer" at the vault
      // chrome level; their real per-item access is finer-grained.
      subGrantRows.push({ vault: r.vault, role: "viewer" });
    }

    const allRows = [...rows, ...subGrantRows].sort(
      (a, b) => b.vault.updatedAt.getTime() - a.vault.updatedAt.getTime(),
    );

    if (allRows.length === 0) return c.json({ vaults: [] });

    // Bulk-count items + members per vault in two single round-trips.
    const vaultIds = allRows.map((r) => r.vault.id);
    const itemCounts = await db
      .select({ vaultId: items.vaultId, c: count() })
      .from(items)
      .where(and(inArray(items.vaultId, vaultIds), isNull(items.deletedAt)))
      .groupBy(items.vaultId);
    const memberCounts = await db
      .select({ vaultId: vaultMembers.vaultId, c: count() })
      .from(vaultMembers)
      .where(inArray(vaultMembers.vaultId, vaultIds))
      .groupBy(vaultMembers.vaultId);

    const itemCountMap = new Map(itemCounts.map((r) => [r.vaultId, Number(r.c)]));
    const memberCountMap = new Map(memberCounts.map((r) => [r.vaultId, Number(r.c)]));

    return c.json({
      vaults: allRows.map((r) =>
        toSummary(
          r.vault,
          r.role as Role,
          itemCountMap.get(r.vault.id) ?? 0,
          memberCountMap.get(r.vault.id) ?? 0,
        ),
      ),
    });
  })

  // Create a vault. Creator becomes a `manager` automatically.
  .post("/", jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");

    const orgId = await activeOrgIdForContext(c);
    if (!orgId) {
      throw errors.forbidden("User is not a member of any organization");
    }

    const created = await db.transaction(async (tx) => {
      const [vaultRow] = await tx
        .insert(vaults)
        .values({
          orgId,
          name: body.name,
          description: body.description ?? null,
          iconKey: body.iconKey ?? null,
          color: body.color ?? null,
          createdBy: user.id,
        })
        .returning();
      if (!vaultRow) throw new Error("vault insert returned no row");

      await tx.insert(vaultMembers).values({
        vaultId: vaultRow.id,
        userId: user.id,
        role: "manager",
      });

      await tx.insert(auditEvents).values({
        orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "vault.create",
        targetType: "vault",
        targetId: vaultRow.id,
        targetName: vaultRow.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
      });

      return vaultRow;
    });

    return c.json({ vault: toFull(created, "manager", 0, 1) }, 201);
  })

  .get("/:id", paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    // Surfacing: members AND sub-grant-only callers may view the vault chrome.
    const access = await loadVaultForViewer(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    // Sub-grant-only callers (vaultRole = null) surface as "viewer" at the
    // vault level; per-item effective roles come from GET /vaults/:id/items.
    const vaultRole: Role = access.vaultRole ?? "viewer";

    const itemCountRow = await db
      .select({ value: count() })
      .from(items)
      .where(and(eq(items.vaultId, id), isNull(items.deletedAt)));
    const itemCount = Number(itemCountRow[0]?.value ?? 0);

    const memberRows = await db
      .select({
        userId: vaultMembers.userId,
        role: vaultMembers.role,
        email: users.email,
        displayName: users.displayName,
        name: users.name,
      })
      .from(vaultMembers)
      .innerJoin(users, eq(users.id, vaultMembers.userId))
      .where(eq(vaultMembers.vaultId, id));

    return c.json({
      vault: toFull(access.vault, vaultRole, itemCount, memberRows.length),
      members: memberRows.map((m) => ({
        userId: m.userId,
        email: m.email,
        displayName: m.displayName ?? m.name ?? m.email,
        role: m.role,
      })),
    });
  })

  .patch("/:id", paramValidator(uuidParam), jsonValidator(patchSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (!canEditVault(access.role)) throw errors.forbidden("Only managers may edit this vault");

    if (Object.keys(body).length === 0) {
      // Nothing to update — return the current vault for symmetry.
      const [counts] = await db
        .select({ items: count() })
        .from(items)
        .where(and(eq(items.vaultId, id), isNull(items.deletedAt)));
      const memberCount = await db
        .select({ value: count() })
        .from(vaultMembers)
        .where(eq(vaultMembers.vaultId, id));
      return c.json({
        vault: toFull(
          access.vault,
          access.role,
          Number(counts?.items ?? 0),
          Number(memberCount[0]?.value ?? 0),
        ),
      });
    }

    const [updated] = await db
      .update(vaults)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.iconKey !== undefined ? { iconKey: body.iconKey } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        updatedAt: new Date(),
      })
      .where(eq(vaults.id, id))
      .returning();

    if (!updated) throw errors.notFound("Vault not found");

    await db.insert(auditEvents).values({
      orgId: updated.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "vault.update",
      targetType: "vault",
      targetId: updated.id,
      targetName: updated.name,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { fields: Object.keys(body) },
    });

    const itemCountRow = await db
      .select({ value: count() })
      .from(items)
      .where(and(eq(items.vaultId, id), isNull(items.deletedAt)));
    const memberCountRow = await db
      .select({ value: count() })
      .from(vaultMembers)
      .where(eq(vaultMembers.vaultId, id));

    return c.json({
      vault: toFull(
        updated,
        access.role,
        Number(itemCountRow[0]?.value ?? 0),
        Number(memberCountRow[0]?.value ?? 0),
      ),
    });
  })

  .delete("/:id", paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (!canEditVault(access.role)) {
      throw errors.forbidden("Only managers may delete this vault");
    }

    // Refuse non-empty vault deletion to give the UI a chance to confirm.
    const itemCountRow = await db
      .select({ value: count() })
      .from(items)
      .where(and(eq(items.vaultId, id), isNull(items.deletedAt)));
    const itemCount = Number(itemCountRow[0]?.value ?? 0);
    if (itemCount > 0) {
      // 409 conflict.
      return c.json(
        {
          error: {
            code: "vault_not_empty",
            message: "Delete the items before deleting this vault",
            details: { itemCount },
          },
        },
        409,
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(vaults).where(eq(vaults.id, id));
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "vault.delete",
        targetType: "vault",
        targetId: id,
        targetName: access.vault.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
      });
    });

    return c.body(null, 204);
  });

export type VaultRoutes = typeof vaultRoutes;

// Re-exported helpers for the items routes — keeps vault permission logic
// in one file. (Avoids importing private functions; both routes need them.)
export {
  loadVaultForUser,
  loadVaultForViewer,
  canManageItem,
  canEditVault,
  activeOrgIdForContext,
  type Role,
};
