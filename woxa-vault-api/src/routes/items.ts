import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  folderMembers,
  folders,
  itemMembers,
  items,
  users,
  vaults,
  type Item,
  type Vault,
} from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import {
  decryptField,
  encryptField,
  generateWrappedDek,
  unwrapDek,
  zeroize,
} from "@/lib/itemCrypto";
import { jsonValidator, paramValidator } from "@/lib/validator";
import {
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  requireVaultUnlocked,
  type AuthVariables,
} from "@/middleware/auth";
import {
  canManageItem,
  loadVaultForViewer,
  type Role,
} from "@/routes/vaults";
import {
  canRevealItem,
  resolveFolderRole,
  resolveItemRole,
  type Role as AccessRole,
} from "@/lib/access";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const TYPES = ["login", "note"] as const;
const typeSchema = z.enum(TYPES);

const uuidParam = z.object({ id: z.string().uuid() });
const vaultIdParam = z.object({ id: z.string().uuid() });

// Inputs accept the reserved fields from the contract but the handler
// silently ignores them in round 2.
const createSchema = z.object({
  type: typeSchema,
  name: z.string().trim().min(1).max(120),
  username: z.string().trim().max(254).nullable().optional(),
  url: z.string().trim().max(2048).nullable().optional(),
  password: z.string().max(8192).nullable().optional(),
  notes: z.string().max(32768).nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  favorite: z.boolean().optional(),
  totpSecret: z.string().nullable().optional(),
  customFields: z.array(z.unknown()).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  username: z.string().trim().max(254).nullable().optional(),
  url: z.string().trim().max(2048).nullable().optional(),
  password: z.string().max(8192).nullable().optional(),
  notes: z.string().max(32768).nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

interface ItemSummary {
  id: string;
  vaultId: string;
  folderId: string | null;
  type: "login" | "note";
  name: string;
  username: string | null;
  url: string | null;
  tags: string[];
  favorite: boolean;
  hasPassword: boolean;
  hasNotes: boolean;
  hasTotp: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  createdBy: { id: string; displayName: string };
  // Effective role of the CURRENT caller for this item (DESIGN.md §11 most-
  // specific-wins). Optional so single-item serializers that don't compute it
  // (create/patch responses) can omit it.
  effectiveRole?: Role;
}

interface ItemFull extends ItemSummary {
  password: string | null;
  notes: string | null;
  totpSecret: null;
  customFields: [];
}

function toSummary(
  it: Item,
  creator: { id: string; displayName: string },
): ItemSummary {
  return {
    id: it.id,
    vaultId: it.vaultId,
    folderId: it.folderId,
    type: it.type as ItemSummary["type"],
    name: it.name,
    username: it.username,
    url: it.url,
    tags: [],
    favorite: false,
    hasPassword: it.passwordCiphertext !== null,
    hasNotes: it.notesCiphertext !== null,
    hasTotp: false,
    createdAt: it.createdAt.toISOString(),
    updatedAt: it.updatedAt.toISOString(),
    lastUsedAt: it.lastUsedAt ? it.lastUsedAt.toISOString() : null,
    createdBy: creator,
  };
}

async function creatorFor(item: Item): Promise<{ id: string; displayName: string }> {
  if (!item.createdBy) return { id: "", displayName: "unknown" };
  const u = await db.query.users.findFirst({ where: eq(users.id, item.createdBy) });
  return {
    id: item.createdBy,
    displayName: u?.displayName ?? u?.name ?? u?.email ?? "unknown",
  };
}

// Load an item AND resolve the caller's EFFECTIVE role via the granular access
// engine (item override → folder grant → vault membership). Returns null when
// the item is missing OR the caller has no access at ANY level — both surface
// as `not_found` (anti-enumeration). `role` is the effective role; downstream
// gates feed it to canRevealItem / canManageItem.
async function loadItemForUser(
  itemId: string,
  userId: string,
): Promise<{ item: Item; vault: Vault; role: Role } | null> {
  const row = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), isNull(items.deletedAt)),
  });
  if (!row) return null;

  const role = await resolveItemRole(userId, {
    id: row.id,
    vaultId: row.vaultId,
    folderId: row.folderId,
  });
  if (!role) return null;

  // We still need the vault row (for orgId in audit + serialization). The
  // caller may not be a vault MEMBER (sub-grant-only), so load the vault for a
  // viewer rather than a member.
  const viewer = await loadVaultForViewer(row.vaultId, userId);
  if (!viewer) return null;

  return { item: row, vault: viewer.vault, role };
}

// ---------------------------------------------------------------------------
// Top-level /items/:id routes (mounted under /items in app.ts).
// ---------------------------------------------------------------------------

export const itemRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  // WARN-I: GET /items/:id/password is the REVEAL endpoint — the ONLY path that
  // returns the decrypted password. Gate it with `requireVaultUnlocked` so a
  // session-thief with a valid cookie cannot bypass the frontend lock screen by
  // hitting this JSON path directly. MUST be registered BEFORE the generic
  // `/:id` so `/:id/password` is not shadowed (mirrors `/:id/members`,
  // `/:id/activity` mounting order). Authorization: effective access AND
  // `canRevealItem(role)` (viewer → 403). No access → 404 (anti-enumeration).
  .get("/:id/password", requireVaultUnlocked, paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const access = await loadItemForUser(id, user.id);
    if (!access) throw errors.notFound("Item not found");

    // REVEAL gate (DESIGN.md §11): a viewer is metadata-only — they may SEE the
    // item via GET /:id but may NOT decrypt its password. They have access, so
    // 403 (not 404) is correct here and is not an enumeration leak.
    if (!canRevealItem(access.role)) {
      throw errors.forbidden("Read-only access to this item");
    }

    let dek: Buffer | null = null;
    try {
      const password =
        access.item.passwordCiphertext && access.item.passwordIv
          ? (() => {
              dek = unwrapDek({
                dekCiphertext: access.item.dekCiphertext,
                dekIv: access.item.dekIv,
              });
              return decryptField(dek, access.item.passwordCiphertext, access.item.passwordIv);
            })()
          : null;

      // item.reveal is the REAL "Secret revealed" event — emitted only when the
      // plaintext password is handed to the caller.
      await db.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "item.reveal",
        targetType: "item",
        targetId: access.item.id,
        targetName: access.item.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
      });

      return c.json({ password });
    } finally {
      zeroize(dek);
    }
  })

  // GET /items/:id is now VIEW-only — it returns item metadata + decrypted
  // `notes` (the frontend decodes folder/tags/favorite/totp meta out of the
  // notes blob) but NEVER the password (`password: null`, WITHHELD). The real
  // password lives behind GET /:id/password. Audit action is `item.view` for
  // EVERYONE — merely opening the detail page is a view, not a reveal. Still
  // gated by `requireVaultUnlocked` because it returns decrypted notes plaintext.
  .get("/:id", requireVaultUnlocked, paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const access = await loadItemForUser(id, user.id);
    if (!access) throw errors.notFound("Item not found");

    const creator = await creatorFor(access.item);
    const summary = toSummary(access.item, creator);
    summary.effectiveRole = access.role;

    let dek: Buffer | null = null;
    try {
      // Notes are returned to ALL roles with access (incl. viewer) — the
      // frontend depends on them for non-secret metadata. The password is
      // ALWAYS withheld here regardless of role.
      const notes =
        access.item.notesCiphertext && access.item.notesIv
          ? (() => {
              dek = unwrapDek({
                dekCiphertext: access.item.dekCiphertext,
                dekIv: access.item.dekIv,
              });
              return decryptField(dek, access.item.notesCiphertext, access.item.notesIv);
            })()
          : null;

      const full: ItemFull = {
        ...summary,
        password: null,
        notes,
        totpSecret: null,
        customFields: [],
      };

      await db.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "item.view",
        targetType: "item",
        targetId: access.item.id,
        targetName: access.item.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
      });

      return c.json({ item: full });
    } finally {
      zeroize(dek);
    }
  })

  .patch("/:id", paramValidator(uuidParam), jsonValidator(patchSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const access = await loadItemForUser(id, user.id);
    if (!access) throw errors.notFound("Item not found");
    if (!canManageItem(access.role)) throw errors.forbidden("Read-only access to this vault");

    // Re-encrypt only the fields the caller sent. Omitted → untouched.
    let dek: Buffer | null = null;
    try {
      const patch: Partial<typeof items.$inferInsert> = { updatedAt: new Date() };
      const needsDek =
        body.password !== undefined || body.notes !== undefined;
      if (needsDek) {
        dek = unwrapDek({
          dekCiphertext: access.item.dekCiphertext,
          dekIv: access.item.dekIv,
        });
      }

      if (body.name !== undefined) patch.name = body.name;
      if (body.username !== undefined) patch.username = body.username;
      if (body.url !== undefined) patch.url = body.url;
      if (body.folderId !== undefined) {
        // Moving to a folder requires the folder to live in this item's
        // vault; null clears the assignment.
        if (body.folderId !== null) {
          const f = await db.query.folders.findFirst({
            where: eq(folders.id, body.folderId),
          });
          if (!f || f.vaultId !== access.item.vaultId) {
            throw errors.notFound("Folder not found");
          }
        }
        patch.folderId = body.folderId;
      }

      if (body.password !== undefined) {
        if (body.password === null || body.password === "") {
          patch.passwordCiphertext = null;
          patch.passwordIv = null;
        } else {
          const enc = encryptField(dek!, body.password);
          patch.passwordCiphertext = enc.ciphertext;
          patch.passwordIv = enc.iv;
        }
      }
      if (body.notes !== undefined) {
        if (body.notes === null || body.notes === "") {
          patch.notesCiphertext = null;
          patch.notesIv = null;
        } else {
          const enc = encryptField(dek!, body.notes);
          patch.notesCiphertext = enc.ciphertext;
          patch.notesIv = enc.iv;
        }
      }

      const [updated] = await db.update(items).set(patch).where(eq(items.id, id)).returning();
      if (!updated) throw errors.notFound("Item not found");

      await db.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "item.update",
        targetType: "item",
        targetId: id,
        targetName: updated.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { fields: Object.keys(body) },
      });

      const creator = await creatorFor(updated);
      return c.json({ item: toSummary(updated, creator) });
    } finally {
      zeroize(dek);
    }
  })

  .delete("/:id", paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const access = await loadItemForUser(id, user.id);
    if (!access) throw errors.notFound("Item not found");
    if (!canManageItem(access.role)) throw errors.forbidden("Read-only access to this vault");

    // SOFT delete → moves the item to Trash (DESIGN.md §7.2 retention). The
    // row is not removed; `deletedAt`/`deletedBy` flag it so it disappears from
    // every normal surface (all of which filter `isNull(items.deletedAt)`) but
    // remains visible to org admins under /trash, where it can be restored or
    // permanently purged. An editor/manager "delete" therefore never destroys
    // data — only an admin's purge does.
    await db.transaction(async (tx) => {
      await tx
        .update(items)
        .set({ deletedAt: new Date(), deletedBy: user.id })
        .where(eq(items.id, id));
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "item.delete",
        targetType: "item",
        targetId: id,
        targetName: access.item.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
      });
    });

    return c.body(null, 204);
  });

export type ItemRoutes = typeof itemRoutes;

// ---------------------------------------------------------------------------
// Sub-routes mounted UNDER /vaults/:id/items for list + create. Exported as
// a Hono instance so app.ts can wire them on the vault router.
// ---------------------------------------------------------------------------

export const vaultItemRoutes = new Hono<{
  Variables: AuthVariables;
}>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  .get("/:id/items", paramValidator(vaultIdParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    // Surfacing: vault members see ALL items; sub-grant-only callers see only
    // the items they hold an item-grant for OR whose folder they hold a
    // folder-grant for (DESIGN.md §11).
    const viewer = await loadVaultForViewer(id, user.id);
    if (!viewer) throw errors.notFound("Vault not found");

    const rows = await db
      .select({
        item: items,
        creatorId: users.id,
        displayName: users.displayName,
        name: users.name,
        email: users.email,
      })
      .from(items)
      .leftJoin(users, eq(users.id, items.createdBy))
      .where(and(eq(items.vaultId, id), isNull(items.deletedAt)))
      .orderBy(desc(items.updatedAt));

    // Load the caller's grant maps for THIS vault once (set-based, no N+1):
    //   - item grants: itemId -> role
    //   - folder grants: folderId -> role
    const itemGrantRows = await db
      .select({ itemId: itemMembers.itemId, role: itemMembers.role })
      .from(itemMembers)
      .innerJoin(items, eq(items.id, itemMembers.itemId))
      .where(and(eq(items.vaultId, id), eq(itemMembers.userId, user.id)));
    const folderGrantRows = await db
      .select({ folderId: folderMembers.folderId, role: folderMembers.role })
      .from(folderMembers)
      .innerJoin(folders, eq(folders.id, folderMembers.folderId))
      .where(and(eq(folders.vaultId, id), eq(folderMembers.userId, user.id)));

    const itemGrants = new Map(itemGrantRows.map((r) => [r.itemId, r.role as AccessRole]));
    const folderGrants = new Map(
      folderGrantRows.map((r) => [r.folderId, r.role as AccessRole]),
    );

    // Effective role for one row, in memory (item grant → folder grant →
    // vaultRole). Returns null when there is no applicable grant — only happens
    // for sub-grant-only callers on items they don't hold.
    const effectiveFor = (it: Item): AccessRole | null => {
      const ig = itemGrants.get(it.id);
      if (ig) return ig;
      if (it.folderId) {
        const fg = folderGrants.get(it.folderId);
        if (fg) return fg;
      }
      return viewer.vaultRole;
    };

    const out: ItemSummary[] = [];
    for (const r of rows) {
      const role = effectiveFor(r.item);
      // Sub-grant-only caller with no grant on this specific item → skip it.
      if (!role) continue;
      const summary = toSummary(r.item, {
        id: r.creatorId ?? "",
        displayName: r.displayName ?? r.name ?? r.email ?? "unknown",
      });
      summary.effectiveRole = role;
      out.push(summary);
    }

    return c.json({ items: out });
  })

  .post(
    "/:id/items",
    paramValidator(vaultIdParam),
    jsonValidator(createSchema),
    async (c) => {
      const user = c.get("user")!;
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      // Surfacing: the caller may be a vault member OR a sub-grant-only folder
      // editor creating an item inside a folder they hold a grant for.
      const viewer = await loadVaultForViewer(id, user.id);
      if (!viewer) throw errors.notFound("Vault not found");

      // Validate folderId belongs to THIS vault. Cross-vault folder ids
      // collapse to 404 (anti-enumeration).
      if (body.folderId) {
        const f = await db.query.folders.findFirst({ where: eq(folders.id, body.folderId) });
        if (!f || f.vaultId !== id) throw errors.notFound("Folder not found");
      }

      // Effective create-role: when creating inside a folder, the most-specific
      // role is the folder grant (falling back to vault membership); otherwise
      // the vault role is required. A sub-grant-only caller with no folder role
      // (e.g. only an item grant elsewhere) cannot create new items.
      let createRole: Role | null = viewer.vaultRole;
      if (body.folderId) {
        createRole = await resolveFolderRole(user.id, {
          id: body.folderId,
          vaultId: id,
        });
      }
      if (!createRole || !canManageItem(createRole)) {
        throw errors.forbidden("Read-only access to this vault");
      }

      // Generate a fresh DEK, encrypt password/notes if present, then wrap
      // the DEK before persisting. Plaintext DEK is zeroized in `finally`.
      const { dek, wrapped } = generateWrappedDek();
      try {
        let pwCipher: Buffer | null = null;
        let pwIv: Buffer | null = null;
        let notesCipher: Buffer | null = null;
        let notesIv: Buffer | null = null;
        if (body.password) {
          const e = encryptField(dek, body.password);
          pwCipher = e.ciphertext;
          pwIv = e.iv;
        }
        if (body.notes) {
          const e = encryptField(dek, body.notes);
          notesCipher = e.ciphertext;
          notesIv = e.iv;
        }

        const [created] = await db
          .insert(items)
          .values({
            vaultId: id,
            type: body.type,
            name: body.name,
            username: body.username ?? null,
            url: body.url ?? null,
            folderId: body.folderId ?? null,
            passwordCiphertext: pwCipher,
            passwordIv: pwIv,
            notesCiphertext: notesCipher,
            notesIv: notesIv,
            dekCiphertext: wrapped.dekCiphertext,
            dekIv: wrapped.dekIv,
            createdBy: user.id,
          })
          .returning();
        if (!created) throw new Error("item insert returned no row");

        await db.insert(auditEvents).values({
          orgId: viewer.vault.orgId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: "item.create",
          targetType: "item",
          targetId: created.id,
          targetName: created.name,
          ipHash: hashIp(getClientIp(c)),
          userAgent: c.req.header("user-agent") ?? null,
          success: true,
          metadata: { type: created.type },
        });

        const creator = {
          id: user.id,
          displayName: user.displayName ?? user.name ?? user.email,
        };
        return c.json({ item: toSummary(created, creator) }, 201);
      } finally {
        zeroize(dek);
      }
    },
  );

export type VaultItemRoutes = typeof vaultItemRoutes;
