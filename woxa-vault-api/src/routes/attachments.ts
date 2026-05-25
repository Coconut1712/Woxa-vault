import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull, sum } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attachments,
  auditEvents,
  items,
  type Attachment,
  type Item,
  type Vault,
} from "@/db/schema";
import { env } from "@/config/env";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import {
  decryptBytes,
  encryptBytes,
  generateWrappedDek,
  unwrapDek,
  zeroize,
} from "@/lib/itemCrypto";
import { buildAttachmentKey, getStorage } from "@/lib/storage";
import { paramValidator } from "@/lib/validator";
import {
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  requireVaultUnlocked,
  type AuthVariables,
} from "@/middleware/auth";
import { canManageItem, loadVaultForViewer, type Role } from "@/routes/vaults";
import { canRevealItem, resolveItemRole } from "@/lib/access";

// ---------------------------------------------------------------------------
// Threat model — file attachments (Phase A, REQUIREMENTS.md FR-038)
//
// Assets: attachment plaintext bytes + filename. Filenames may themselves leak
//   secrets (e.g. "aws-prod-root-account-recovery-codes.pdf"), so we treat
//   them as sensitive metadata and never log them.
// Adversaries:
//   * DB-only reader → sees `storage_key` + wrapped DEK; cannot decrypt.
//   * Filesystem reader (storage volume leak) → sees ciphertext; cannot
//     decrypt without LOCAL_KEK_BASE64.
//   * Cross-tenant access via guessed UUIDs → mitigated by joining through
//     `items` + `vault_members`; missing membership returns 404.
//   * Oversized upload / mime-bomb DoS → enforced by ATTACHMENT_MAX_BYTES
//     and a server-side `Content-Length` precheck; multipart parser is also
//     bounded by Hono's default body limit.
//   * Path traversal in `filename` → sanitized to a basename; storage_key
//     is generated server-side so the caller never controls it.
// Mitigations:
//   * Per-attachment DEK wrapped by LOCAL_KEK (envelope encryption).
//   * Filename sanitization + MIME allow-list.
//   * Aggregate per-item cap (ATTACHMENT_ITEM_MAX_BYTES) to bound storage.
//   * 404 vs 403 boundary mirrors the item route's pattern.
//   * Audit events `attachment.uploaded|downloaded|deleted` capture metadata
//     only — never the file content or full filename body when secret.
// Residual risk:
//   * Plaintext attachment lives in memory while encrypting / streaming back
//     to the client. Best-effort zeroize after; Buffer copies in V8 may
//     linger until GC. Acceptable in Phase A; Phase B will stream chunked
//     AES-GCM directly to/from R2.
// ---------------------------------------------------------------------------

const uuidParam = z.object({ id: z.string().uuid() });

// MIME allow-list. Round 2 covers what the secure-note "attach" flow needs.
// Anything outside this list is rejected by the upload route — keeps users
// from accidentally exfiltrating exec binaries through the vault.
const ALLOWED_MIME = new Set<string>([
  // Documents
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/xml",
  "text/xml",
  // Images
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Archives
  "application/zip",
  "application/x-7z-compressed",
  // Keys / certs (text-based; binary keys can be uploaded as application/octet-stream
  // through a future allow-listed extension upgrade — TODO PHASE_B).
  "application/x-pem-file",
  "application/pkcs8",
  "application/pkix-cert",
  // Office (best-effort; we don't run AV here — Phase B integrates ClamAV).
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Catch-all binary (used for key files etc.). Must be rare; UI should
  // prompt before falling back to this.
  "application/octet-stream",
]);

function sanitizeFilename(input: string): string {
  // Strip path separators / control chars, keep unicode letters + common punctuation.
  // Collapse whitespace, trim, enforce 1..200 chars.
  // eslint-disable-next-line no-control-regex
  const cleaned = input
    .replace(/[\\/\x00-\x1f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return "attachment";
  return cleaned.slice(0, 200);
}

interface AttachmentDTO {
  id: string;
  itemId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string | null;
}

function toDTO(a: Attachment): AttachmentDTO {
  return {
    id: a.id,
    itemId: a.itemId,
    filename: a.filename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt.toISOString(),
    createdBy: a.createdBy,
  };
}

// Load an attachment AND verify the caller has access to its parent item +
// vault. Same null-on-missing pattern as `loadItemForUser`.
async function loadAttachmentForUser(
  attachmentId: string,
  userId: string,
): Promise<
  | {
      attachment: Attachment;
      item: Item;
      vault: Vault;
      role: Role;
    }
  | null
> {
  const row = await db.query.attachments.findFirst({
    where: and(eq(attachments.id, attachmentId), isNull(attachments.deletedAt)),
  });
  if (!row) return null;
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, row.itemId), isNull(items.deletedAt)),
  });
  if (!item) return null;
  // EFFECTIVE role for the parent item (item override → folder grant → vault).
  const role = await resolveItemRole(userId, {
    id: item.id,
    vaultId: item.vaultId,
    folderId: item.folderId,
  });
  if (!role) return null;
  const viewer = await loadVaultForViewer(item.vaultId, userId);
  if (!viewer) return null;
  return { attachment: row, item, vault: viewer.vault, role };
}

// ---------------------------------------------------------------------------
// /items/:id/attachments  — list + upload (mounted under /items in app.ts)
// ---------------------------------------------------------------------------

export const itemAttachmentRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  .get("/:id/attachments", paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    // Resolve parent item → vault membership before exposing the attachment
    // list. A 404 here covers both "no such item" and "you can't see it".
    const item = await db.query.items.findFirst({
      where: and(eq(items.id, id), isNull(items.deletedAt)),
    });
    if (!item) throw errors.notFound("Item not found");
    // Listing attachment metadata only needs effective access to the item (any
    // level, including viewer — the file BODY is gated separately at download).
    const role = await resolveItemRole(user.id, {
      id: item.id,
      vaultId: item.vaultId,
      folderId: item.folderId,
    });
    if (!role) throw errors.notFound("Item not found");

    const rows = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.itemId, id), isNull(attachments.deletedAt)))
      .orderBy(desc(attachments.createdAt));

    return c.json({ attachments: rows.map(toDTO) });
  })

  .post("/:id/attachments", paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const item = await db.query.items.findFirst({
      where: and(eq(items.id, id), isNull(items.deletedAt)),
    });
    if (!item) throw errors.notFound("Item not found");
    // Upload mutates the item → require manage on the EFFECTIVE role.
    const role = await resolveItemRole(user.id, {
      id: item.id,
      vaultId: item.vaultId,
      folderId: item.folderId,
    });
    if (!role) throw errors.notFound("Item not found");
    if (!canManageItem(role)) {
      throw errors.forbidden("Read-only access to this vault");
    }
    const viewer = await loadVaultForViewer(item.vaultId, user.id);
    if (!viewer) throw errors.notFound("Item not found");
    const access = { vault: viewer.vault, role };

    // Cheap Content-Length precheck before reading the body. Multipart adds
    // ~hundreds of bytes of envelope overhead — allow a comfortable margin.
    const lenHeader = c.req.header("content-length");
    if (lenHeader) {
      const reported = Number(lenHeader);
      if (Number.isFinite(reported) && reported > env.ATTACHMENT_MAX_BYTES + 65_536) {
        return c.json(
          {
            error: {
              code: "attachment_too_large",
              message: `File exceeds ${env.ATTACHMENT_MAX_BYTES} bytes`,
              details: { maxBytes: env.ATTACHMENT_MAX_BYTES },
            },
          },
          413,
        );
      }
    }

    // Hono's `parseBody` returns a `File` (web File) for multipart inputs.
    // We pull the first `file` field — single-file upload per request.
    let body: Record<string, unknown>;
    try {
      body = await c.req.parseBody({ all: false });
    } catch {
      throw errors.validation("Invalid multipart body");
    }
    const file = body.file;
    if (!(file instanceof File)) {
      throw errors.validation("Missing 'file' field in multipart upload");
    }

    if (file.size === 0) throw errors.validation("Empty file");
    if (file.size > env.ATTACHMENT_MAX_BYTES) {
      return c.json(
        {
          error: {
            code: "attachment_too_large",
            message: `File exceeds ${env.ATTACHMENT_MAX_BYTES} bytes`,
            details: { maxBytes: env.ATTACHMENT_MAX_BYTES, actual: file.size },
          },
        },
        413,
      );
    }

    const mime = (file.type || "application/octet-stream").toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return c.json(
        {
          error: {
            code: "attachment_mime_not_allowed",
            message: `MIME type ${mime} not allowed`,
            details: { mimeType: mime },
          },
        },
        415,
      );
    }

    // Aggregate-per-item cap: sum existing rows then refuse if this upload
    // would push us over. Cheap because attachments are typically few per
    // item; if it becomes a hotspot we can materialize the total on `items`.
    const totalRow = await db
      .select({ total: sum(attachments.sizeBytes) })
      .from(attachments)
      .where(and(eq(attachments.itemId, id), isNull(attachments.deletedAt)));
    const currentTotal = Number(totalRow[0]?.total ?? 0);
    if (currentTotal + file.size > env.ATTACHMENT_ITEM_MAX_BYTES) {
      return c.json(
        {
          error: {
            code: "attachment_item_quota_exceeded",
            message: "Item attachment quota exceeded",
            details: {
              maxBytes: env.ATTACHMENT_ITEM_MAX_BYTES,
              currentBytes: currentTotal,
              attemptedBytes: file.size,
            },
          },
        },
        413,
      );
    }

    const filename = sanitizeFilename(file.name || "attachment");
    const plaintext = Buffer.from(await file.arrayBuffer());

    // Envelope-encrypt the body, persist storage object, then row. If the
    // DB insert fails after the storage write we leave an orphan blob;
    // accepted in Phase A (audit + a future GC sweep will reconcile).
    const { dek, wrapped } = generateWrappedDek();
    try {
      const enc = encryptBytes(dek, plaintext);
      // Generate id up-front so we know the storage key before the insert.
      const attachmentId = crypto.randomUUID();
      const storageKey = buildAttachmentKey(item.id, attachmentId);

      await getStorage().put(storageKey, enc.ciphertext);

      const [created] = await db
        .insert(attachments)
        .values({
          id: attachmentId,
          itemId: item.id,
          filename,
          mimeType: mime,
          sizeBytes: file.size,
          storageKey,
          dekCiphertext: wrapped.dekCiphertext,
          dekIv: wrapped.dekIv,
          contentIv: enc.iv,
          createdBy: user.id,
        })
        .returning();

      if (!created) {
        await getStorage().delete(storageKey);
        throw errors.internal("Attachment insert failed");
      }

      await db.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "attachment.uploaded",
        targetType: "attachment",
        targetId: created.id,
        // Filename can leak secrets — log a stable length + mime instead.
        targetName: null,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: {
          itemId: item.id,
          sizeBytes: created.sizeBytes,
          mimeType: created.mimeType,
        },
      });

      return c.json({ attachment: toDTO(created) }, 201);
    } finally {
      zeroize(dek);
      // Best-effort wipe of plaintext buffer.
      plaintext.fill(0);
    }
  });

export type ItemAttachmentRoutes = typeof itemAttachmentRoutes;

// ---------------------------------------------------------------------------
// /attachments/:id  — download + delete
// ---------------------------------------------------------------------------

export const attachmentRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  // Stream the decrypted file back to the caller. We DO NOT include the
  // attachment row in this response — the caller already has metadata from
  // the list endpoint.
  //
  // WARN-I: download is a plaintext-emitting endpoint, so gate it with
  // `requireVaultUnlocked`. The DELETE handler stays open (no plaintext
  // returned), and the per-item upload/list routes live in
  // `itemAttachmentRoutes` above — uploads do not return plaintext either.
  .get("/:id/download", requireVaultUnlocked, paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const access = await loadAttachmentForUser(id, user.id);
    if (!access) throw errors.notFound("Attachment not found");
    // REVEAL gate: downloading the decrypted file body is a reveal — viewer
    // (effective) is metadata-only and may NOT download.
    if (!canRevealItem(access.role)) throw errors.forbidden("Read-only access");

    let dek: Buffer | null = null;
    try {
      dek = unwrapDek({
        dekCiphertext: access.attachment.dekCiphertext,
        dekIv: access.attachment.dekIv,
      });
      const ciphertext = await getStorage().get(access.attachment.storageKey);
      const plaintext = decryptBytes(dek, ciphertext, access.attachment.contentIv);

      await db.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "attachment.downloaded",
        targetType: "attachment",
        targetId: access.attachment.id,
        targetName: null,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: {
          itemId: access.item.id,
          sizeBytes: access.attachment.sizeBytes,
          mimeType: access.attachment.mimeType,
        },
      });

      // RFC 5987 encoding for the filename (UTF-8). Quote-fallback for legacy
      // clients. Filename contains no path separators after sanitize().
      const safeForLegacy = access.attachment.filename
        .replace(/"/g, "")
        .replace(/[^\x20-\x7e]/g, "_");
      const encoded = encodeURIComponent(access.attachment.filename);

      c.header("Content-Type", access.attachment.mimeType);
      c.header(
        "Content-Disposition",
        `attachment; filename="${safeForLegacy}"; filename*=UTF-8''${encoded}`,
      );
      c.header("Content-Length", String(plaintext.length));
      // Prevent caches/CDNs from holding a decrypted copy.
      c.header("Cache-Control", "private, no-store, max-age=0");
      // Hono's `c.body` expects an ArrayBuffer / Uint8Array — copy the
      // Buffer's view into a fresh ArrayBuffer to satisfy the typed slot
      // and detach from Buffer's pool for cleaner GC.
      const ab = plaintext.buffer.slice(
        plaintext.byteOffset,
        plaintext.byteOffset + plaintext.byteLength,
      ) as ArrayBuffer;
      return c.body(ab);
    } finally {
      zeroize(dek);
    }
  })

  .delete("/:id", paramValidator(uuidParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const access = await loadAttachmentForUser(id, user.id);
    if (!access) throw errors.notFound("Attachment not found");
    if (!canManageItem(access.role)) {
      throw errors.forbidden("Read-only access to this vault");
    }

    // Hard delete: drop the row + delete the object. We keep the audit
    // event so the trail survives. If storage delete fails we still proceed
    // — the row will be gone and a sweep job can reconcile orphan blobs.
    await db.transaction(async (tx) => {
      await tx.delete(attachments).where(eq(attachments.id, id));
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "attachment.deleted",
        targetType: "attachment",
        targetId: access.attachment.id,
        targetName: null,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: {
          itemId: access.item.id,
          sizeBytes: access.attachment.sizeBytes,
          mimeType: access.attachment.mimeType,
        },
      });
    });

    try {
      await getStorage().delete(access.attachment.storageKey);
    } catch {
      // Swallow — audit row already records the delete and the row is gone.
    }

    return c.body(null, 204);
  });

export type AttachmentRoutes = typeof attachmentRoutes;
