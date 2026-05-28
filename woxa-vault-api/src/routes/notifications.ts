import { Hono } from "hono";
import { z } from "zod";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications, type Notification } from "@/db/schema";
import { errors } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";
import { paramValidator, queryValidator } from "@/lib/validator";
import { activeOrgForContext, requireAuth, type AuthVariables } from "@/middleware/auth";

// ---------------------------------------------------------------------------
// Notifications inbox — the caller's OWN event-driven notifications.
//
// Threat model:
//   Asset: a user's notification inbox (who shared/changed/revoked their access,
//     when their send was opened). Read access to another user's inbox is a
//     privacy + reconnaissance leak (who has access to what).
//   Adversaries:
//     * A user enumerating / reading another user's notifications by id —
//       blocked: every query is pinned to `userId = caller.id`, and a
//       mark-read against an id the caller doesn't own returns 404 (identical to
//       a missing id, so existence cannot be enumerated).
//     * A user trying to mark someone else's notification read (griefing) — same
//       owner pin → 404.
//   Mitigations:
//     * NO requireVaultUnlocked — notifications carry no secret plaintext, so
//       the master-password lock does not gate them (mirrors itemActivity).
//     * NO requireTwoFactorEnrolled — the inbox is not a secret-bearing surface;
//       gating it would just hide "you were shared X" behind the 2FA wall with
//       no security benefit.
//     * Recipients were computed server-side at write time (lib/notifications),
//       never from client input, so the inbox only ever contains rows the caller
//       is the legitimate subject of.
//     * Rate limiting applied to prevent DB-burn / enumeration spam.
//   Residual risk:
//     * No pagination cursor yet (limit-only). Acceptable — the inbox is a
//       recent-activity widget, not an archive. A future cursor is additive.
// ---------------------------------------------------------------------------

const idParam = z.object({ id: z.string().uuid() });

// list limit: 1..50, default 30 (per spec).
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

interface NotificationDTO {
  id: string;
  type: string;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  metadata: unknown;
  read: boolean;
  createdAt: string;
}

function toDto(n: Notification): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    actorEmail: n.actorEmail,
    targetType: n.targetType,
    targetId: n.targetId,
    targetName: n.targetName,
    metadata: n.metadata,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}

async function unreadCountFor(userId: string, orgId: string | null): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        orgId ? eq(notifications.orgId, orgId) : isNull(notifications.orgId),
        isNull(notifications.readAt),
      ),
    );
  return row?.value ?? 0;
}

export const notificationRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)

  // ------------------------------------------------------------------
  // GET /notifications?limit= — the caller's own notifications for the
  // ACTIVE workspace, newest first, plus their unread badge count.
  // ------------------------------------------------------------------
  .get("/", queryValidator(listQuery), async (c) => {
    const user = c.get("user")!;
    const limit = c.req.valid("query").limit ?? 30;

    const limitRes = rateLimit(`notifications:list:${user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limitRes.allowed) {
      const retry = Math.ceil(limitRes.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many requests", retry);
    }

    const current = await activeOrgForContext(c);
    const orgId = current?.orgId ?? null;

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, user.id),
          orgId ? eq(notifications.orgId, orgId) : isNull(notifications.orgId),
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit);

    const unreadCount = await unreadCountFor(user.id, orgId);
    return c.json({ notifications: rows.map(toDto), unreadCount });
  })

  // ------------------------------------------------------------------
  // GET /notifications/unread-count — cheap badge poll for the ACTIVE org.
  // MUST be registered BEFORE POST /:id/read so the static path is not
  // shadowed by the :id route (Hono matches in registration order).
  // ------------------------------------------------------------------
  .get("/unread-count", async (c) => {
    const user = c.get("user")!;

    const limitRes = rateLimit(`notifications:unread-count:${user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limitRes.allowed) {
      const retry = Math.ceil(limitRes.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many requests", retry);
    }

    const current = await activeOrgForContext(c);
    return c.json({ unreadCount: await unreadCountFor(user.id, current?.orgId ?? null) });
  })

  // ------------------------------------------------------------------
  // POST /notifications/read-all — mark all the caller's unread as read
  // in the ACTIVE workspace. Registered BEFORE /:id/read (static-before-param).
  // ------------------------------------------------------------------
  .post("/read-all", async (c) => {
    const user = c.get("user")!;

    const limitRes = rateLimit(`notifications:read-all:${user.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
    });
    if (!limitRes.allowed) {
      const retry = Math.ceil(limitRes.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many requests", retry);
    }

    const current = await activeOrgForContext(c);
    const orgId = current?.orgId ?? null;

    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, user.id),
          orgId ? eq(notifications.orgId, orgId) : isNull(notifications.orgId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    return c.json({ updated: updated.length });
  })

  // ------------------------------------------------------------------
  // POST /notifications/:id/read — mark ONE notification read.
  // Only if it belongs to the caller; otherwise 404 (anti-enumeration —
  // a user can neither read nor mark someone else's notification).
  // Idempotent: re-marking an already-read row is a no-op 204.
  // ------------------------------------------------------------------
  .post("/:id/read", paramValidator(idParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const limitRes = rateLimit(`notifications:read-one:${user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!limitRes.allowed) {
      const retry = Math.ceil(limitRes.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many requests", retry);
    }

    const current = await activeOrgForContext(c);
    const orgId = current?.orgId ?? null;

    // The owner + workspace pin is BOTH the authorization check and the existence check:
    // a row that exists but belongs to another user/org returns 0 updated rows,
    // indistinguishable from a non-existent id → 404.
    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, user.id),
          orgId ? eq(notifications.orgId, orgId) : isNull(notifications.orgId),
        ),
      )
      .returning({ id: notifications.id });

    if (updated.length === 0) {
      // Could be: id doesn't exist, OR it's someone else's, OR it's in a
      // different workspace. Either way 404 so context can't be probed.
      // (Idempotency for an already-read OWN row is preserved because the
      // UPDATE still matches it — it returns 1 row even when read_at was
      // already set.)
      throw errors.notFound("Notification not found");
    }

    return c.body(null, 204);
  });

export type NotificationRoutes = typeof notificationRoutes;
