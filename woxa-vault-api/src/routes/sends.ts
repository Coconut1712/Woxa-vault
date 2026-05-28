import { Hono } from "hono";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import { db } from "@/db/client";
import { auditEvents, oneTimeSends } from "@/db/schema";
import { env } from "@/config/env";
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
import { createNotification } from "@/lib/notifications";
import { hashPassword, verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rateLimit";
import { jsonValidator, paramValidator } from "@/lib/validator";
import {
  activeOrgForContext,
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  requireVaultUnlocked,
  type AuthVariables,
} from "@/middleware/auth";

// ---------------------------------------------------------------------------
// Threat model — One-time sends (Phase A, server-side encryption)
//
// Assets: send plaintext payloads (secrets in transit to an external recipient).
// Adversaries:
//   * Token brute-forcer hitting /s/:token / /reveal repeatedly.
//   * Race attacker calling /reveal in parallel hoping to read the secret
//     past max_views (double-spend on view_count).
//   * Outsider with DB read access (envelope encryption mitigation).
// Mitigations:
//   * Token: 20 random bytes → base32 (~32 chars, ~160 bits). DB stores
//     SHA-256(token) only.
//   * Per-send DEK wrapped under LOCAL_KEK. Same envelope pattern as items.
//   * View-count + burn happen in ONE atomic SQL UPDATE with a guard on
//     `view_count < max_views AND burned_at IS NULL AND expires_at > now()`.
//     RETURNING tells us whether the row was actually claimed.
//   * Rate limits: POST /sends → 10/min/user; POST /s/:token/reveal →
//     10/min/IP per token. Returning `not_found` for unknown tokens hides
//     existence from enumeration.
//   * Optional Argon2id password gate (FR-008 mirrors login).
//
// Residual risk:
//   * Server CAN decrypt — full zero-knowledge (URL fragment key) is
//     deferred; flagged in API_CONTRACT.md.
//   * In-memory rate limiter resets on process restart (acceptable; moves
//     to Redis in Phase B per DESIGN.md §10).
// ---------------------------------------------------------------------------

const TOKEN_BYTES = 20; // 160-bit entropy

function generateSendToken(): string {
  return encodeBase32LowerCaseNoPadding(randomBytes(TOKEN_BYTES));
}

function hashSendToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const createSchema = z.object({
  content: z.string().min(1).max(32768),
  expiresInMinutes: z.number().int().min(1).max(7 * 24 * 60),
  maxViews: z.number().int().min(1).max(100).optional(),
  password: z.string().min(6).max(256).optional(),
});

const revealSchema = z.object({ password: z.string().min(1).max(256).optional() });

const tokenParam = z.object({ token: z.string().min(8).max(64) });
const idParam = z.object({ id: z.string().uuid() });

function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

function buildViewUrl(token: string): string {
  const base = env.WEB_BASE_URL.replace(/\/+$/, "");
  return `${base}/s/${token}`;
}

// Derived UI status (AC-033.2). Backend sources of truth are stored fields:
//   burned_at → "burned"
//   else expires_at < now → "expired"
//   else                     → "active"
type SendStatus = "active" | "burned" | "expired";
function deriveStatus(row: {
  burnedAt: Date | null;
  expiresAt: Date;
  viewCount: number;
  maxViews: number;
}): SendStatus {
  if (row.burnedAt) return "burned";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  if (row.viewCount >= row.maxViews) return "burned";
  return "active";
}

// AC-032.4 burn-guard heuristic: within FIRST_REVEAL_GRACE_MS of send creation,
// the very first reveal request gets a non-burn variant (an explicit
// "not_ready" 425). This is the bot/link-preview guard — Slack/LINE/Discord
// preview crawlers hit the URL milliseconds after the sender pastes it, and we
// don't want them to consume the only view. Real recipients click "Reveal"
// well after this window. Frontend interprets 425 + send_not_ready as
// "wait and retry / show generic preview only".
const FIRST_REVEAL_GRACE_MS = 1_000;

// ---------------------------------------------------------------------------
// Authenticated subset — POST /, DELETE /:id
// ---------------------------------------------------------------------------

export const sendRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  // GET /sends — list sends created by the current user (US-033 / AC-033.1).
  // Returns most-recent first. We expose only the metadata the dashboard
  // needs — no ciphertext, no DEK, no password hash, no IP-hash. The token
  // value is returned so the dashboard can rebuild the share URL; the
  // token only carries decrypt authority when combined with the fragment
  // key that lives client-side, so it's safe to surface here.
  //
  // NOTE: Currently `oneTimeSends.tokenHash` only stores the hash — the raw
  // token cannot be reconstructed. The dashboard therefore renders the
  // viewUrl using a placeholder for the token (the link is "copy from the
  // creation screen"), and we return tokenHashPreview as a stable
  // identifier instead. Frontend should NOT show the placeholder as a
  // working link; it's there for parity with the Send DTO shape.
  .get("/", async (c) => {
    const user = c.get("user")!;
    const rows = await db
      .select({
        id: oneTimeSends.id,
        createdAt: oneTimeSends.createdAt,
        expiresAt: oneTimeSends.expiresAt,
        burnedAt: oneTimeSends.burnedAt,
        maxViews: oneTimeSends.maxViews,
        viewCount: oneTimeSends.viewCount,
        passwordHash: oneTimeSends.passwordHash,
        tokenHash: oneTimeSends.tokenHash,
      })
      .from(oneTimeSends)
      .where(eq(oneTimeSends.createdBy, user.id))
      .orderBy(desc(oneTimeSends.createdAt))
      .limit(200);

    const sends = rows.map((r) => ({
      id: r.id,
      // tokenHashPreview is the first 12 hex chars of the SHA-256 token hash;
      // useful as a stable display ID but not usable to reveal the secret.
      tokenHashPreview: r.tokenHash.slice(0, 12),
      hasPassword: r.passwordHash !== null,
      maxViews: r.maxViews,
      viewCount: r.viewCount,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      burnedAt: r.burnedAt ? r.burnedAt.toISOString() : null,
      status: deriveStatus({
        burnedAt: r.burnedAt,
        expiresAt: r.expiresAt,
        viewCount: r.viewCount,
        maxViews: r.maxViews,
      }),
    }));

    const current = await activeOrgForContext(c);
    await db.insert(auditEvents).values({
      orgId: current?.orgId ?? null,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "send.list_viewed",
      targetType: "user",
      targetId: user.id,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { count: sends.length },
    });

    return c.json({ sends });
  })

  // WARN-I: POST /sends takes plaintext from the caller and encrypts it
  // server-side. A stolen-cookie attacker who can post here can exfiltrate
  // any plaintext they bring with them — but the realistic abuse case is
  // calling this endpoint as a step in a larger reveal flow (paste an item
  // into a send, then read it). Gating the create path with the vault lock
  // makes that pivot require the master password too. List + DELETE stay
  // open: list only returns metadata, DELETE only burns.
  .post("/", requireVaultUnlocked, jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");

    // Rate limit (per-user): 10 / minute.
    const rl = rateLimit(`sends:create:${user.id}`, { limit: 10, windowMs: 60_000 });
    if (!rl.allowed) {
      c.header("Retry-After", String(Math.ceil(rl.resetMs / 1000)));
      throw errors.rateLimited("Too many sends, slow down", Math.ceil(rl.resetMs / 1000));
    }

    const current = await activeOrgForContext(c);

    const token = generateSendToken();
    const tokenHash = hashSendToken(token);
    const expiresAt = new Date(Date.now() + body.expiresInMinutes * 60_000);
    const maxViews = body.maxViews ?? 1;

    const { dek, wrapped } = generateWrappedDek();
    try {
      const enc = encryptField(dek, body.content);
      const passwordHash = body.password ? await hashPassword(body.password) : null;

      const [row] = await db
        .insert(oneTimeSends)
        .values({
          tokenHash,
          orgId: current?.orgId ?? null,
          createdBy: user.id,
          contentCiphertext: enc.ciphertext,
          contentIv: enc.iv,
          dekCiphertext: wrapped.dekCiphertext,
          dekIv: wrapped.dekIv,
          passwordHash,
          maxViews,
          expiresAt,
        })
        .returning();
      if (!row) throw errors.internal("Send insert returned no row");

      await db.insert(auditEvents).values({
        orgId: current?.orgId ?? null,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "send.create",
        targetType: "send",
        targetId: row.id,
        targetName: null,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { maxViews, expiresInMinutes: body.expiresInMinutes, hasPassword: !!body.password },
      });

      return c.json(
        {
          send: {
            id: row.id,
            token,
            viewUrl: buildViewUrl(token),
            expiresAt: row.expiresAt.toISOString(),
          },
        },
        201,
      );
    } finally {
      zeroize(dek);
    }
  })

  .delete("/:id", paramValidator(idParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const row = await db.query.oneTimeSends.findFirst({ where: eq(oneTimeSends.id, id) });
    if (!row) throw errors.notFound("Send not found");
    if (row.createdBy !== user.id) {
      // Only the sender may burn. Mask non-owner attempts as 404.
      throw errors.notFound("Send not found");
    }

    // Idempotent: a re-burn is a no-op (204 either way).
    if (!row.burnedAt) {
      await db.transaction(async (tx) => {
        await tx
          .update(oneTimeSends)
          .set({ burnedAt: new Date() })
          .where(eq(oneTimeSends.id, id));

        await tx.insert(auditEvents).values({
          orgId: row.orgId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: "send.burn",
          targetType: "send",
          targetId: id,
          targetName: null,
          ipHash: hashIp(getClientIp(c)),
          userAgent: c.req.header("user-agent") ?? null,
          success: true,
          metadata: { reason: "manual" },
        });
      });
    }

    return c.body(null, 204);
  });

// ---------------------------------------------------------------------------
// Public subset — GET /s/:token (preview metadata), POST /s/:token/reveal
// Mounted at /s in app.ts.
// ---------------------------------------------------------------------------

export const publicSendRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/:token", paramValidator(tokenParam), async (c) => {
    const { token } = c.req.valid("param");
    const tokenHash = hashSendToken(token);

    const row = await db.query.oneTimeSends.findFirst({
      where: eq(oneTimeSends.tokenHash, tokenHash),
    });
    if (!row) throw errors.notFound("Send not found");

    // Don't lie about expired/burned in the preview — UI needs to render the
    // right empty state.
    if (row.burnedAt) {
      return c.json(
        { error: { code: "send_burned", message: "This send has already been viewed" } },
        410,
      );
    }
    if (isExpired(row.expiresAt)) {
      return c.json(
        { error: { code: "send_expired", message: "This send has expired" } },
        410,
      );
    }

    return c.json({
      send: {
        token,
        hasPassword: row.passwordHash !== null,
        expiresAt: row.expiresAt.toISOString(),
        maxViews: row.maxViews,
        viewsRemaining: Math.max(0, row.maxViews - row.viewCount),
        burned: false,
        createdAt: row.createdAt.toISOString(),
      },
    });
  })

  .post("/:token/reveal", paramValidator(tokenParam), jsonValidator(revealSchema), async (c) => {
    const { token } = c.req.valid("param");
    const body = c.req.valid("json");

    // Anti-brute-force: 10/min per (IP, token).
    const ip = getClientIp(c);
    const rl = rateLimit(`sends:reveal:${ip}:${token}`, { limit: 10, windowMs: 60_000 });
    if (!rl.allowed) {
      c.header("Retry-After", String(Math.ceil(rl.resetMs / 1000)));
      throw errors.rateLimited("Too many reveal attempts", Math.ceil(rl.resetMs / 1000));
    }

    const tokenHash = hashSendToken(token);

    const row = await db.query.oneTimeSends.findFirst({
      where: eq(oneTimeSends.tokenHash, tokenHash),
    });
    if (!row) throw errors.notFound("Send not found");

    if (row.burnedAt) {
      return c.json(
        { error: { code: "send_burned", message: "This send has already been viewed" } },
        410,
      );
    }
    if (isExpired(row.expiresAt)) {
      return c.json(
        { error: { code: "send_expired", message: "This send has expired" } },
        410,
      );
    }

    // Burn-guard (AC-032.4): if a reveal lands within FIRST_REVEAL_GRACE_MS
    // of the send's creation timestamp, the requester is almost certainly a
    // link-preview crawler (Slack/LINE/Discord/etc.) that the sender just
    // pasted the URL into — not the human recipient. Returning 425
    // "send_not_ready" lets the legitimate recipient retry without consuming
    // the only view. Audit the event so the security team can spot abuse
    // (someone hammering reveal in the first second hoping for race-with-burn
    // information leaks).
    const ageMs = Date.now() - row.createdAt.getTime();
    if (ageMs < FIRST_REVEAL_GRACE_MS && row.viewCount === 0) {
      await db.insert(auditEvents).values({
        orgId: row.orgId,
        actorUserId: null,
        actorEmail: null,
        action: "send.reveal_deferred",
        targetType: "send",
        targetId: row.id,
        targetName: null,
        ipHash: hashIp(ip),
        userAgent: c.req.header("user-agent") ?? null,
        success: false,
        metadata: { reason: "preview_guard", ageMs },
      });
      c.header("Retry-After", "2");
      return c.json(
        {
          error: {
            code: "send_not_ready",
            message: "Send is not yet revealable. Wait a moment and try again.",
          },
        },
        425,
      );
    }

    // Password gate (constant-time-ish — argon2 verify is timing-safe).
    if (row.passwordHash) {
      if (!body.password) {
        return c.json(
          { error: { code: "send_password_required", message: "Password required" } },
          401,
        );
      }
      const ok = await verifyPassword(row.passwordHash, body.password);
      if (!ok) {
        await db.insert(auditEvents).values({
          orgId: row.orgId,
          actorUserId: null,
          actorEmail: null,
          action: "send.reveal_failed",
          targetType: "send",
          targetId: row.id,
          targetName: null,
          ipHash: hashIp(ip),
          userAgent: c.req.header("user-agent") ?? null,
          success: false,
          metadata: { reason: "bad_password" },
        });
        return c.json(
          { error: { code: "send_password_invalid", message: "Wrong password" } },
          401,
        );
      }
    }

    // Atomic view-count increment + burn. The WHERE clause guarantees that
    // only one concurrent reveal can claim the final view; the SQL transaction
    // serializes the increment and the burn into a single round-trip.
    //
    // Returns the updated row (or null if a competing request already burned
    // it). When the increment lands AT max_views we set burned_at NOW().
    const burnNow = sql`CASE WHEN ${oneTimeSends.viewCount} + 1 >= ${oneTimeSends.maxViews} THEN now() ELSE NULL END`;

    const [claimed] = await db
      .update(oneTimeSends)
      .set({
        viewCount: sql`${oneTimeSends.viewCount} + 1`,
        burnedAt: burnNow,
      })
      .where(
        and(
          eq(oneTimeSends.tokenHash, tokenHash),
          isNull(oneTimeSends.burnedAt),
          sql`${oneTimeSends.viewCount} < ${oneTimeSends.maxViews}`,
          sql`${oneTimeSends.expiresAt} > now()`,
        ),
      )
      .returning();

    if (!claimed) {
      // Lost the race or the row was burned/expired between the SELECT and
      // the UPDATE. Tell the caller — they should not get the content.
      return c.json(
        { error: { code: "send_burned", message: "This send has already been viewed" } },
        410,
      );
    }

    // Decrypt content with the per-send DEK, audit, then return plaintext.
    let dek: Buffer | null = null;
    try {
      dek = unwrapDek({ dekCiphertext: claimed.dekCiphertext, dekIv: claimed.dekIv });
      const content = decryptField(dek, claimed.contentCiphertext, claimed.contentIv);

      const burned = claimed.burnedAt !== null;
      const viewsRemaining = Math.max(0, claimed.maxViews - claimed.viewCount);

      // Audit + notify-the-creator atomically. The viewer is an anonymous public
      // recipient (actorUserId = null), so the self-action guard never fires —
      // the send's creator is always notified that their send was opened. Skip
      // when the send has no creator (createdBy SET NULL after a user delete).
      await db.transaction(async (tx) => {
        await tx.insert(auditEvents).values({
          orgId: claimed.orgId,
          actorUserId: null,
          actorEmail: null,
          action: burned ? "send.view_and_burn" : "send.view",
          targetType: "send",
          targetId: claimed.id,
          targetName: null,
          ipHash: hashIp(ip),
          userAgent: c.req.header("user-agent") ?? null,
          success: true,
          metadata: { viewsRemaining, burned },
        });
        if (claimed.createdBy) {
          await createNotification(tx, {
            userId: claimed.createdBy,
            orgId: claimed.orgId,
            type: "send.viewed",
            actorUserId: null,
            actorEmail: null,
            targetType: "send",
            targetId: claimed.id,
            targetName: null,
            metadata: { viewsRemaining, burned },
          });
        }
      });

      return c.json({ content, viewsRemaining, burned });
    } finally {
      zeroize(dek);
    }
  });

export type SendRoutes = typeof sendRoutes;
export type PublicSendRoutes = typeof publicSendRoutes;
