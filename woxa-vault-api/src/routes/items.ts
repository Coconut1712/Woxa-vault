import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  folderMembers,
  folders,
  itemMembers,
  itemTeamMembers,
  itemVersions,
  items,
  teamMembers,
  teams,
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
  activeOrgForContext,
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
  canGrantRole,
  canRevealItem,
  resolveFolderRole,
  resolveItemRole,
  shareAuthorityForItem,
  type Role as AccessRole,
} from "@/lib/access";
import { getOrgMembership } from "@/lib/orgAccess";
import { createNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// US-012 / FR-030: six item kinds. `type` is PLAINTEXT metadata (a label that
// drives which form/icon the UI renders) — it is NOT a secret. All type-
// specific SECRET values (api_key key, ssh private key/passphrase, card
// number/CVV, identity PII, and any customField marked `secret`) are encrypted
// by the client into the item's password/notes ciphertext columns via the
// existing item-DEK envelope. The server therefore needs no new secret columns
// to support the extra kinds — only a wider `type` vocabulary. Kept in sync
// with the frontend DisplayKind union (woxa-vault-web/src/lib/item-meta.ts):
// note the ssh kind is spelled `ssh`, NOT `ssh_key`.
const TYPES = ["login", "note", "api_key", "ssh", "card", "identity"] as const;
const typeSchema = z.enum(TYPES);
type ItemTypeName = (typeof TYPES)[number];

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
  // Phase C: ZK fields
  passwordCiphertext: z.string().optional(), // base64
  passwordIv: z.string().optional(), // base64
  notesCiphertext: z.string().optional(), // base64
  notesIv: z.string().optional(), // base64
});

const patchSchema = z.object({
  // Allow converting an item between the six kinds (e.g. note → card). Plaintext
  // label only; secret payload migration is the client's job (it re-encodes the
  // notes meta blob + re-routes the primary secret).
  type: typeSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  username: z.string().trim().max(254).nullable().optional(),
  url: z.string().trim().max(2048).nullable().optional(),
  password: z.string().max(8192).nullable().optional(),
  notes: z.string().max(32768).nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  // Phase C: ZK fields
  passwordCiphertext: z.string().optional(), // base64
  passwordIv: z.string().optional(),
  notesCiphertext: z.string().optional(),
  notesIv: z.string().optional(),
});

const bulkRoleSchema = z.enum(["manager", "editor", "user", "viewer"]);

const bulkSchema = z
  .object({
    action: z.enum(["delete", "move", "share"]),
    itemIds: z.array(z.string().uuid()).min(1).max(100),
    payload: z
      .object({
        folderId: z.string().uuid().nullable().optional(),
        vaultId: z.string().uuid().optional(), // For future cross-vault move
        // Share principal — mirrors single-share (itemMembers.ts). Exactly ONE
        // of userId / teamId must be present, validated by superRefine below.
        userId: z.string().uuid().optional(),
        teamId: z.string().uuid().optional(),
        role: bulkRoleSchema.optional(),
      })
      .optional(),
  })
  // Per-action payload shape. `move` needs nothing mandatory (folderId may be
  // null = move to root); `share` REQUIRES role + exactly one principal so the
  // bulk path can never grant with a missing/ambiguous target.
  .superRefine((val, ctx) => {
    if (val.action !== "share") return;
    const p = val.payload;
    if (!p || !p.role) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "share requires payload.role", path: ["payload", "role"] });
      return;
    }
    const hasUser = !!p.userId;
    const hasTeam = !!p.teamId;
    if (hasUser === hasTeam) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "share requires exactly one of payload.userId or payload.teamId",
        path: ["payload"],
      });
    }
  });

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

interface ItemSummary {
  id: string;
  vaultId: string;
  folderId: string | null;
  type: ItemTypeName;
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
  // US-015 AC-015.3 / FR-039: when the password was last set/rotated. NULL when
  // the item has never had a password. ISO-8601 string for the frontend to
  // render "password last changed X ago".
  passwordChangedAt: string | null;
  createdBy: { id: string; displayName: string };
  // Effective role of the CURRENT caller for this item (DESIGN.md §11 most-
  // specific-wins). Optional so single-item serializers that don't compute it
  // (create/patch responses) can omit it.
  effectiveRole?: Role;
}

interface ItemFull extends ItemSummary {
  password: string | null;
  notes: string | null;
  // totpSecret + type-specific secrets (api_key/ssh/card/identity) and custom
  // fields live INSIDE the encrypted notes blob (the client `__WOXA_META__`
  // overlay), so the server never surfaces them as discrete plaintext fields.
  // These two keys are kept null/empty for wire-shape stability with the
  // frontend ItemFull contract; the client decodes the real values from notes.
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
    passwordChangedAt: it.passwordChangedAt ? it.passwordChangedAt.toISOString() : null,
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

    if (!canRevealItem(access.role)) {
      throw errors.forbidden("Read-only access to this item");
    }

    // Phase C: If ZK, return encrypted fields
    if (access.vault.encryptionVersion === 2) {
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
        metadata: { encryptionVersion: 2 },
      });

      return c.json({
        passwordCiphertext: access.item.passwordCiphertext?.toString("base64"),
        passwordIv: access.item.passwordIv?.toString("base64"),
      });
    }

    // Phase A: Server-side mode
    let dek: Buffer | null = null;
    try {
      const password =
        access.item.passwordCiphertext && access.item.passwordIv
          ? (() => {
              dek = unwrapDek({
                dekCiphertext: access.item.dekCiphertext!,
                dekIv: access.item.dekIv!,
              });
              return decryptField(dek, access.item.passwordCiphertext, access.item.passwordIv);
            })()
          : null;

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
        metadata: { encryptionVersion: 1 },
      });

      return c.json({ password });
    } finally {
      zeroize(dek);
    }
  })

  // US-015 AC-015.2 / FR-037: list an item's version history (last 10).
  // VIEW-gated — anyone with effective access to the item (including a metadata-
  // only viewer / org auditor) may see the LIST of versions. The list carries
  // NO secret material — only metadata (version number, who edited, when, and
  // presence flags). No access → 404 (anti-enumeration). MUST be registered
  // BEFORE the generic `/:id` so `/:id/versions` isn't shadowed.
  .get("/:id/versions", paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const access = await loadItemForUser(id, user.id);
    if (!access) throw errors.notFound("Item not found");

    const rows = await db
      .select({
        versionNumber: itemVersions.versionNumber,
        type: itemVersions.type,
        name: itemVersions.name,
        modifiedByEmail: itemVersions.modifiedByEmail,
        modifiedAt: itemVersions.modifiedAt,
        hasPassword: sql<boolean>`${itemVersions.passwordCiphertext} is not null`,
        hasNotes: sql<boolean>`${itemVersions.notesCiphertext} is not null`,
        encryptionVersion: itemVersions.encryptionVersion,
      })
      .from(itemVersions)
      .where(eq(itemVersions.itemId, id))
      .orderBy(desc(itemVersions.versionNumber))
      // FR-037 / AC-015.2: surface the "10 most recent" versions. Pruning keeps
      // at most 10 rows per item, but LIMIT makes the contract explicit and
      // resilient to any pre-prune backlog.
      .limit(10);

    return c.json({
      // Whether the CALLER may reveal a version's secret content. Lets the
      // frontend hide/disable the "view content" affordance for viewers.
      canReveal: canRevealItem(access.role),
      versions: rows.map((r) => ({
        version: r.versionNumber,
        type: r.type,
        name: r.name,
        editedByEmail: r.modifiedByEmail,
        createdAt: r.modifiedAt.toISOString(),
        hasPassword: r.hasPassword,
        hasNotes: r.hasNotes,
      })),
    });
  })

  // US-015 AC-015.2: reveal a single historical version's decrypted CONTENT.
  // REVEAL-gated — same capability as GET /:id/password (viewer / auditor →
  // 403). Each version snapshot carries its own wrapped DEK so it decrypts
  // self-contained even after the live item rotated keys. Audited as
  // `item.version_view` (like a reveal). MUST precede the generic `/:id`.
  .get(
    "/:id/versions/:version",
    requireVaultUnlocked,
    paramValidator(z.object({ id: z.string().uuid(), version: z.coerce.number().int().positive() })),
    async (c) => {
      const user = c.get("user")!;
      const { id, version } = c.req.valid("param");

      const access = await loadItemForUser(id, user.id);
      if (!access) throw errors.notFound("Item not found");

      // REVEAL-gate on the EFFECTIVE role only — mirrors GET /:id/password.
      // resolveItemRole already maps a pure org-auditor to `viewer` (blocked by
      // canRevealItem), so a redundant `isAuditor` check here would WRONGLY block
      // an auditor who also holds an editor/manager item/folder/vault grant
      // (their effective role is editor/manager, not viewer). Viewers stay 403.
      if (!canRevealItem(access.role)) {
        throw errors.forbidden("Read-only access to this item");
      }

      const snap = await db.query.itemVersions.findFirst({
        where: and(eq(itemVersions.itemId, id), eq(itemVersions.versionNumber, version)),
      });
      if (!snap) throw errors.notFound("Version not found");

      const audit = async (encVersion: number) => {
        await db.insert(auditEvents).values({
          orgId: access.vault.orgId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: "item.version_view",
          targetType: "item",
          targetId: id,
          targetName: access.item.name,
          ipHash: hashIp(getClientIp(c)),
          userAgent: c.req.header("user-agent") ?? null,
          success: true,
          metadata: { version, encryptionVersion: encVersion },
        });
      };

      // Phase C ZK: hand back the snapshot ciphertext blobs; client decrypts.
      if (snap.encryptionVersion === 2) {
        await audit(2);
        return c.json({
          version: snap.versionNumber,
          type: snap.type,
          name: snap.name,
          username: snap.username,
          url: snap.url,
          passwordCiphertext: snap.passwordCiphertext?.toString("base64") ?? null,
          passwordIv: snap.passwordIv?.toString("base64") ?? null,
          notesCiphertext: snap.notesCiphertext?.toString("base64") ?? null,
          notesIv: snap.notesIv?.toString("base64") ?? null,
          createdAt: snap.modifiedAt.toISOString(),
          editedByEmail: snap.modifiedByEmail,
        });
      }

      // Phase A: unwrap the snapshot's OWN DEK, decrypt its fields, zeroize.
      let dek: Buffer | null = null;
      try {
        const password =
          snap.passwordCiphertext && snap.passwordIv && snap.dekCiphertext && snap.dekIv
            ? (() => {
                dek = unwrapDek({ dekCiphertext: snap.dekCiphertext!, dekIv: snap.dekIv! });
                return decryptField(dek, snap.passwordCiphertext!, snap.passwordIv!);
              })()
            : null;
        const notes =
          snap.notesCiphertext && snap.notesIv && snap.dekCiphertext && snap.dekIv
            ? (() => {
                dek ??= unwrapDek({ dekCiphertext: snap.dekCiphertext!, dekIv: snap.dekIv! });
                return decryptField(dek, snap.notesCiphertext!, snap.notesIv!);
              })()
            : null;

        await audit(1);

        return c.json({
          version: snap.versionNumber,
          type: snap.type,
          name: snap.name,
          username: snap.username,
          url: snap.url,
          password,
          notes,
          createdAt: snap.modifiedAt.toISOString(),
          editedByEmail: snap.modifiedByEmail,
        });
      } finally {
        zeroize(dek);
      }
    },
  )

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

    const ipHashStr = hashIp(getClientIp(c));
    const ua = c.req.header("user-agent") ?? null;

    // Debounce audit log for 10 seconds to prevent noisy React double-fetches
    const recentAudit = await db.query.auditEvents.findFirst({
      where: and(
        eq(auditEvents.action, "item.view"),
        eq(auditEvents.targetId, access.item.id),
        eq(auditEvents.actorUserId, user.id),
        eq(auditEvents.ipHash, ipHashStr),
        sql`${auditEvents.occurredAt} >= now() - interval '10 seconds'`
      ),
    });

    const recordAudit = async (version: number) => {
      if (!recentAudit) {
        await db.insert(auditEvents).values({
          orgId: access.vault.orgId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: "item.view",
          targetType: "item",
          targetId: access.item.id,
          targetName: access.item.name,
          ipHash: ipHashStr,
          userAgent: ua,
          success: true,
          metadata: { encryptionVersion: version },
        });
      }
    };

    const activeOrg = await activeOrgForContext(c);
    const isAuditor = activeOrg?.role === "auditor";
    // notes are SECRET-equivalent: gate them with the same capability used for
    // the password reveal (access.ts:65 canRevealItem). A vault `viewer` is
    // metadata-only — they keep name/tags/timestamps (summary) but get
    // notes withheld (null). Auditor is org-wide read-only → never decrypts.
    const canReveal = canRevealItem(access.role) && !isAuditor;

    // Phase C: If ZK, return encrypted fields
    if (access.vault.encryptionVersion === 2) {
      const full = {
        ...summary,
        password: null,
        notes: null,
        notesCiphertext: canReveal
          ? access.item.notesCiphertext?.toString("base64")
          : null,
        notesIv: canReveal ? access.item.notesIv?.toString("base64") : null,
        totpSecret: null,
        customFields: [],
      };

      await recordAudit(2);

      return c.json({ item: full });
    }

    // Phase A: Server-side mode
    let dek: Buffer | null = null;
    try {
      const notes =
        canReveal && access.item.notesCiphertext && access.item.notesIv
          ? (() => {
              dek = unwrapDek({
                dekCiphertext: access.item.dekCiphertext!,
                dekIv: access.item.dekIv!,
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

      await recordAudit(1);

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

    const patch: Partial<typeof items.$inferInsert> = { updatedAt: new Date() };

    // US-015 AC-015.3 / FR-039: a password CHANGE resets password_changed_at.
    // "Changed" is signaled by the password field being PRESENT in the body
    // (the frontend contract is: omit the key to leave the ciphertext untouched,
    // send a value to replace it, send null/"" to clear it). Phase A signals via
    // `password`; ZK (Phase C) via `passwordCiphertext`. Clearing the password
    // (null/empty) does NOT count as a rotation — it removes the secret.
    //
    // CONTRACT (presence-based, deliberate): we CANNOT detect "same value
    // re-sent" server-side. AES-256-GCM uses a fresh random IV per encryption
    // (Phase A) and the client supplies opaque ciphertext (Phase C), so equal
    // plaintext yields different bytes every time — there is nothing to compare.
    // The frontend therefore MUST omit `password`/`passwordCiphertext` from the
    // PATCH body when the user did not touch the field (it does). The downside
    // of a stale `password_changed_at` is cosmetic (a rotation-age badge), not a
    // security boundary, so we keep the cheap presence-based rule rather than add
    // an explicit `passwordChanged` flag the client could get wrong or spoof.
    const pwPresent =
      access.vault.encryptionVersion === 2
        ? body.passwordCiphertext !== undefined
        : body.password !== undefined;
    const pwCleared =
      access.vault.encryptionVersion === 2
        ? body.passwordCiphertext === undefined || body.passwordCiphertext === ""
        : body.password === null || body.password === "";
    const passwordChanged = pwPresent && !pwCleared;
    if (passwordChanged) patch.passwordChangedAt = new Date();

    // US-015 AC-015.2 / FR-037: snapshot the item's CURRENT state into
    // item_versions BEFORE applying the edit, but ONLY when an edit touches
    // CONTENT (name/username/url/type/password/notes). Metadata-only PATCHes
    // (e.g. just folderId) do not create a version — they don't change the
    // material a user would want to roll back / inspect.
    const contentChanged =
      body.name !== undefined ||
      body.username !== undefined ||
      body.url !== undefined ||
      body.type !== undefined ||
      body.password !== undefined ||
      body.notes !== undefined ||
      body.passwordCiphertext !== undefined ||
      body.notesCiphertext !== undefined;

    if (body.type !== undefined) patch.type = body.type;
    if (body.name !== undefined) patch.name = body.name;
    if (body.username !== undefined) patch.username = body.username;
    if (body.url !== undefined) patch.url = body.url;
    if (body.folderId !== undefined) {
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

    if (access.vault.encryptionVersion === 2) {
      // Phase C: ZK mode - trust client ciphertexts
      if (body.passwordCiphertext !== undefined) {
        patch.passwordCiphertext = body.passwordCiphertext ? Buffer.from(body.passwordCiphertext, "base64") : null;
        patch.passwordIv = body.passwordIv ? Buffer.from(body.passwordIv, "base64") : null;
      }
      if (body.notesCiphertext !== undefined) {
        patch.notesCiphertext = body.notesCiphertext ? Buffer.from(body.notesCiphertext, "base64") : null;
        patch.notesIv = body.notesIv ? Buffer.from(body.notesIv, "base64") : null;
      }
    } else {
      // Phase A: Server-side mode
      let dek: Buffer | null = null;
      try {
        const needsDek = body.password !== undefined || body.notes !== undefined;
        if (needsDek) {
          dek = unwrapDek({
            dekCiphertext: access.item.dekCiphertext!,
            dekIv: access.item.dekIv!,
          });
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
      } finally {
        zeroize(dek);
      }
    }

    // Atomic: snapshot (if content changed) + prune to last 10 + update + audit
    // all commit or roll back together (FR-037 / AC-015.2). The snapshot is the
    // state BEFORE this edit, copied from `access.item` (the row we loaded).
    const updated = await db.transaction(async (tx) => {
      // Serialize concurrent PATCHes on THE SAME item: take a row lock on the
      // items row first. Two parallel edits (or a double-click) would otherwise
      // both read MAX(version_number) and compute the same nextVersion, then
      // collide on the unique (item_id, version_number) index → 500 + rollback
      // of the whole edit. FOR UPDATE makes the second transaction block until
      // the first commits, so it reads the post-insert MAX and gets +1. The lock
      // is released at commit/rollback; metadata-only PATCHes also take it so the
      // serialization point is consistent regardless of contentChanged.
      const lockRows = await tx
        .select({ id: items.id })
        .from(items)
        .where(eq(items.id, id))
        .for("update");
      if (lockRows.length === 0) throw errors.notFound("Item not found");

      if (contentChanged) {
        const prev = access.item;
        // version_number = max + 1 (running per item). The FOR UPDATE lock above
        // serializes this read-then-insert; the unique index (item_id,
        // version_number) remains the last-line backstop.
        const [maxRow] = await tx
          .select({ max: sql<number | null>`max(${itemVersions.versionNumber})` })
          .from(itemVersions)
          .where(eq(itemVersions.itemId, id));
        const nextVersion = (maxRow?.max ?? 0) + 1;

        await tx.insert(itemVersions).values({
          itemId: id,
          versionNumber: nextVersion,
          type: prev.type,
          name: prev.name,
          username: prev.username,
          url: prev.url,
          passwordCiphertext: prev.passwordCiphertext,
          passwordIv: prev.passwordIv,
          notesCiphertext: prev.notesCiphertext,
          notesIv: prev.notesIv,
          // Snapshot the DEK wrap so this version decrypts self-contained even
          // after the live item's DEK rotates (NULL in ZK mode).
          dekCiphertext: prev.dekCiphertext,
          dekIv: prev.dekIv,
          encryptionVersion: access.vault.encryptionVersion,
          modifiedBy: user.id,
          modifiedByEmail: user.email,
          changeSummary: Object.keys(body).join(","),
        });

        // FR-037: keep only the last 10 versions per item. Delete anything
        // older than the 10 highest version_numbers.
        await tx.execute(sql`
          DELETE FROM ${itemVersions}
          WHERE ${itemVersions.itemId} = ${id}
            AND ${itemVersions.id} NOT IN (
              SELECT id FROM ${itemVersions}
              WHERE ${itemVersions.itemId} = ${id}
              ORDER BY ${itemVersions.versionNumber} DESC
              LIMIT 10
            )
        `);
      }

      const [row] = await tx.update(items).set(patch).where(eq(items.id, id)).returning();
      if (!row) throw errors.notFound("Item not found");

      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "item.update",
        targetType: "item",
        targetId: id,
        targetName: row.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: {
          fields: Object.keys(body),
          encryptionVersion: access.vault.encryptionVersion,
          versioned: contentChanged,
          passwordChanged,
        },
      });

      return row;
    });

    const creator = await creatorFor(updated);
    return c.json({ item: toSummary(updated, creator) });
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
  })

  .post("/bulk", jsonValidator(bulkSchema), async (c) => {
    const user = c.get("user")!;
    const { action, itemIds, payload } = c.req.valid("json");

    const results = {
      success: [] as string[],
      failed: [] as { id: string; reason: string }[],
    };

    // Share principal is the SAME for every item in the batch. Resolve the
    // grantee's identity ONCE here; per-item we only re-check authority and
    // org-scoping (the principal must belong to each item's org). For `share`,
    // the Zod superRefine guarantees role + exactly one of userId/teamId.
    const shareRole = action === "share" ? (payload!.role as AccessRole) : null;
    const granteeUserId = action === "share" ? (payload!.userId ?? null) : null;
    const granteeTeamId = action === "share" ? (payload!.teamId ?? null) : null;

    await db.transaction(async (tx) => {
      for (const id of itemIds) {
        try {
          const access = await loadItemForUser(id, user.id);
          if (!access) {
            results.failed.push({ id, reason: "not_found" });
            continue;
          }

          if (action === "share") {
            // Authority is per-item: effective item role OR creator floor
            // (mirrors itemMembers.loadItemContext + shareAuthorityForItem).
            // canManageItem is NOT the right gate here — a vault `user` who
            // CREATED the item may share up to editor even though they can't
            // manage the item generally.
            const isCreator = access.item.createdBy === user.id;
            const authority = shareAuthorityForItem(access.role as AccessRole, isCreator);

            // No escalation: granted role must be <= caller's authority, and
            // the caller must have at least editor-level share authority. A
            // caller lacking share rights on THIS item → forbidden (skip), not
            // a thrown 4xx for the whole batch (AC-052.5 partial success).
            if (!canGrantRole(authority, shareRole!)) {
              results.failed.push({ id, reason: "forbidden" });
              continue;
            }

            // Grantee must belong to THIS item's org (cross-org block).
            if (granteeUserId) {
              const targetMembership = await getOrgMembership(access.vault.orgId, granteeUserId);
              if (!targetMembership) {
                results.failed.push({ id, reason: "user_not_in_workspace" });
                continue;
              }

              // Idempotent upsert. Mirrors single-share semantics: a PLAIN
              // permanent grant (no originalRole / expiresAt — those belong to
              // the temp-grant / access-request path). onConflict updates the
              // role only, never touching originalRole, so a pre-existing temp
              // grant's baseline is preserved (avoids the originalRole-overwrite
              // bug fixed in accessRequests.ts).
              await tx
                .insert(itemMembers)
                .values({ itemId: id, userId: granteeUserId, role: shareRole! })
                .onConflictDoUpdate({
                  target: [itemMembers.itemId, itemMembers.userId],
                  set: { role: shareRole! },
                });

              const grantee = await tx.query.users.findFirst({ where: eq(users.id, granteeUserId) });
              await tx.insert(auditEvents).values({
                orgId: access.vault.orgId,
                actorUserId: user.id,
                actorEmail: user.email,
                action: "item.share",
                targetType: "item",
                targetId: id,
                targetName: access.item.name,
                ipHash: hashIp(getClientIp(c)),
                userAgent: c.req.header("user-agent") ?? null,
                success: true,
                metadata: { bulk: true, granteeUserId, granteeEmail: grantee?.email ?? null, role: shareRole },
              });
              await createNotification(tx, {
                userId: granteeUserId,
                orgId: access.vault.orgId,
                type: "share.received",
                actorUserId: user.id,
                actorEmail: user.email,
                targetType: "item",
                targetId: id,
                targetName: access.item.name,
                metadata: { resourceKind: "item", role: shareRole!, bulk: true },
              });
            } else {
              // Team grant. Team must belong to THIS item's org.
              const team = await tx.query.teams.findFirst({
                where: and(eq(teams.id, granteeTeamId!), eq(teams.orgId, access.vault.orgId)),
              });
              if (!team) {
                results.failed.push({ id, reason: "team_not_in_workspace" });
                continue;
              }

              await tx
                .insert(itemTeamMembers)
                .values({ itemId: id, teamId: granteeTeamId!, role: shareRole! })
                .onConflictDoUpdate({
                  target: [itemTeamMembers.itemId, itemTeamMembers.teamId],
                  set: { role: shareRole! },
                });

              await tx.insert(auditEvents).values({
                orgId: access.vault.orgId,
                actorUserId: user.id,
                actorEmail: user.email,
                action: "item.team_share",
                targetType: "item",
                targetId: id,
                targetName: access.item.name,
                ipHash: hashIp(getClientIp(c)),
                userAgent: c.req.header("user-agent") ?? null,
                success: true,
                metadata: { bulk: true, granteeTeamId, granteeTeamName: team.name, role: shareRole },
              });

              const members = await tx
                .select({ userId: teamMembers.userId })
                .from(teamMembers)
                .where(eq(teamMembers.teamId, granteeTeamId!));
              for (const m of members) {
                await createNotification(tx, {
                  userId: m.userId,
                  orgId: access.vault.orgId,
                  type: "share.received",
                  actorUserId: user.id,
                  actorEmail: user.email,
                  targetType: "item",
                  targetId: id,
                  targetName: access.item.name,
                  metadata: { resourceKind: "item", role: shareRole!, viaTeamId: granteeTeamId!, viaTeamName: team.name, bulk: true },
                });
              }
            }

            results.success.push(id);
            continue;
          }

          // delete / move require general item-management authority.
          if (!canManageItem(access.role)) {
            results.failed.push({ id, reason: "forbidden" });
            continue;
          }

          if (action === "delete") {
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
              metadata: { bulk: true },
            });
          } else if (action === "move") {
            const folderId = payload?.folderId ?? null;
            if (folderId) {
              const f = await tx.query.folders.findFirst({
                where: eq(folders.id, folderId),
              });
              if (!f || f.vaultId !== access.item.vaultId) {
                results.failed.push({ id, reason: "folder_not_found" });
                continue;
              }
            }

            await tx.update(items).set({ folderId, updatedAt: new Date() }).where(eq(items.id, id));

            await tx.insert(auditEvents).values({
              orgId: access.vault.orgId,
              actorUserId: user.id,
              actorEmail: user.email,
              action: "item.update",
              targetType: "item",
              targetId: id,
              targetName: access.item.name,
              ipHash: hashIp(getClientIp(c)),
              userAgent: c.req.header("user-agent") ?? null,
              success: true,
              metadata: { bulk: true, fields: ["folderId"] },
            });
          }

          results.success.push(id);
        } catch (err: any) {
          results.failed.push({ id, reason: err.message });
        }
      }
    });

    return c.json(results);
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

      let created: Item;

      if (viewer.vault.encryptionVersion === 2) {
        // Phase C: ZK mode
        const [row] = await db
          .insert(items)
          .values({
            vaultId: id,
            type: body.type,
            name: body.name,
            username: body.username ?? null,
            url: body.url ?? null,
            folderId: body.folderId ?? null,
            passwordCiphertext: body.passwordCiphertext ? Buffer.from(body.passwordCiphertext, "base64") : null,
            passwordIv: body.passwordIv ? Buffer.from(body.passwordIv, "base64") : null,
            notesCiphertext: body.notesCiphertext ? Buffer.from(body.notesCiphertext, "base64") : null,
            notesIv: body.notesIv ? Buffer.from(body.notesIv, "base64") : null,
            dekCiphertext: null,
            dekIv: null,
            // AC-015.3: stamp the initial rotation time when created with a password.
            passwordChangedAt: body.passwordCiphertext ? new Date() : null,
            createdBy: user.id,
          })
          .returning();
        created = row!;
      } else {
        // Phase A: Server-side mode
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

          const [row] = await db
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
              // AC-015.3: stamp the initial rotation time when created with a password.
              passwordChangedAt: body.password ? new Date() : null,
              createdBy: user.id,
            })
            .returning();
          created = row!;
        } finally {
          zeroize(dek);
        }
      }

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
        metadata: { encryptionVersion: viewer.vault.encryptionVersion },
      });

      const creator = {
        id: user.id,
        displayName: user.displayName ?? user.name ?? user.email,
      };
      return c.json({ item: toSummary(created, creator) }, 201);
    },
  );

export type VaultItemRoutes = typeof vaultItemRoutes;
