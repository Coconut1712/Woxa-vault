import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, orgMembers } from "@/db/schema";
import type { SQL } from "drizzle-orm";
import { errors } from "@/lib/errors";
import { canViewAllOrgAudit } from "@/lib/orgAccess";
import { queryValidator } from "@/lib/validator";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { activeOrgForContext, requireAuth, type AuthVariables } from "@/middleware/auth";

// (drizzle infers AuditEvent select shape via the table import.)
export type AuditEventRow = typeof auditEvents.$inferSelect;

// The wire shape every audit surface serializes (full org log + per-item
// activity widget). Exported so consumers can reuse the type rather than
// re-deriving it.
export interface AuditEventDTO {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  ipHash: string | null;
  userAgent: string | null;
  success: boolean;
  metadata: unknown;
  occurredAt: string;
}

// Single source of truth for the audit-event wire shape. The per-item activity
// endpoint (`GET /items/:id/activity`) reuses this so both surfaces stay byte-
// identical for the frontend.
export function toAuditDto(r: AuditEventRow): AuditEventDTO {
  return {
    id: r.id,
    orgId: r.orgId,
    actorUserId: r.actorUserId,
    actorEmail: r.actorEmail,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    targetName: r.targetName,
    ipHash: r.ipHash,
    userAgent: r.userAgent,
    success: r.success,
    metadata: r.metadata,
    occurredAt: r.occurredAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /audit — keyset-paginated audit log viewer (REQUIREMENTS §4.7).
//
// Pagination strategy: order by (occurred_at DESC, id DESC). Cursor encodes
// `<iso>|<id>`, base64url-encoded, so the client cannot easily forge cursors
// pointing at out-of-page rows.
//
// RBAC (owner directive 2026-05-21):
//   * org `owner` / `admin` → all events in their org
//   * everyone else (member / guest) → 403 forbidden. The audit log is an
//     admin-only surface; roles below admin must not see it at all (this is a
//     deliberate tightening of the previous "self-scoped" view, which let
//     members read their own rows).
// ---------------------------------------------------------------------------

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  actor: z.string().uuid().optional(),
  action: z.string().min(1).max(120).optional(),
  from: z
    .string()
    .datetime({ offset: true })
    .optional(),
  to: z
    .string()
    .datetime({ offset: true })
    .optional(),
});

interface Cursor {
  occurredAt: string;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.occurredAt}|${c.id}`, "utf8").toString("base64url");
}

function decodeCursor(s: string): Cursor | null {
  try {
    const raw = Buffer.from(s, "base64url").toString("utf8");
    const [occurredAt, id] = raw.split("|");
    if (!occurredAt || !id) return null;
    // Sanity-check the embedded date so a bogus cursor surfaces as 400.
    if (Number.isNaN(Date.parse(occurredAt))) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

export const auditRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)

  .get("/", queryValidator(querySchema), async (c) => {
    const q = c.req.valid("query");

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace");

    // Admin-only surface. Members/guests are blocked outright (no self-scoped
    // fallback) so they can neither read the org log nor probe their own rows.
    if (!canViewAllOrgAudit(current.role)) {
      throw errors.forbidden("Audit log access is restricted to workspace admins");
    }

    const limit = q.limit ?? 50;

    // Scope = this org's events PLUS account-level events that are written
    // without an orgId (sign-in/out, 2FA, vault-unlock, recovery, etc.) whose
    // actor is a member of this org — so admins actually see authentication +
    // unlock activity in the workspace audit log. Account events carry no
    // org-specific data, so surfacing a member's own auth action to their org's
    // admins is appropriate (a member in multiple orgs has it shown in each).
    const orgMemberIds = db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, current.orgId));
    const conds: SQL[] = [];
    const scope = or(
      eq(auditEvents.orgId, current.orgId),
      and(isNull(auditEvents.orgId), inArray(auditEvents.actorUserId, orgMemberIds)),
    );
    if (scope) conds.push(scope);

    if (q.actor) conds.push(eq(auditEvents.actorUserId, q.actor));
    if (q.action) conds.push(eq(auditEvents.action, q.action));
    if (q.from) conds.push(gte(auditEvents.occurredAt, new Date(q.from)));
    if (q.to) conds.push(lt(auditEvents.occurredAt, new Date(q.to)));

    if (q.cursor) {
      const cursor = decodeCursor(q.cursor);
      if (!cursor) throw errors.validation("Invalid cursor");
      // Keyset on (occurred_at DESC, id DESC):
      //   WHERE occurred_at < cursor.occurredAt
      //      OR (occurred_at = cursor.occurredAt AND id < cursor.id)
      const cursorDate = new Date(cursor.occurredAt);
      const keyset = or(
        lt(auditEvents.occurredAt, cursorDate),
        and(eq(auditEvents.occurredAt, cursorDate), sql`${auditEvents.id} < ${cursor.id}`),
      );
      if (keyset) conds.push(keyset);
    }

    const user = c.get("user")!;
    const rows = await db
      .select()
      .from(auditEvents)
      .where(and(...conds))
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(limit + 1);

    let nextCursor: string | null = null;
    let page = rows;
    if (rows.length > limit) {
      page = rows.slice(0, limit);
      const last = page[page.length - 1]!;
      nextCursor = encodeCursor({
        occurredAt: last.occurredAt.toISOString(),
        id: last.id,
      });
    }

    await db.insert(auditEvents).values({
      orgId: current.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "audit.log_viewed",
      targetType: "organization",
      targetId: current.orgId,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { filter: q },
    });

    return c.json({ events: page.map(toAuditDto), nextCursor });
  });

export type AuditRoutes = typeof auditRoutes;
