import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, orgMembers } from "@/db/schema";
import type { SQL } from "drizzle-orm";
import { errors } from "@/lib/errors";
import { canViewAllOrgAudit } from "@/lib/orgAccess";
import { queryValidator } from "@/lib/validator";
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
  // Masked display string (first two octets/hextets; full IP never stored).
  // The frontend renders this in the IP column; `ipHash` stays for correlation.
  ipMasked: string | null;
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
    ipMasked: r.ipMasked ?? null,
    userAgent: r.userAgent,
    success: r.success,
    metadata: r.metadata,
    occurredAt: r.occurredAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /audit — PAGE-based audit log viewer (REQUIREMENTS §4.7).
//
// Pagination strategy (owner directive 2026-06-05): true page-based pagination
// with a total count so the UI can render "Showing X–Y of Z" + a page-size
// selector. All filters moved server-side so the total/page math is accurate.
//   * order by (occurred_at DESC, id DESC)
//   * LIMIT <limit> OFFSET (page-1)*<limit>
//   * a SEPARATE COUNT(*) over the SAME scope+filters yields `total`
//
// RBAC (owner directive 2026-05-21):
//   * org `owner` / `admin` / `auditor` → all events in their org
//   * everyone else (member / guest) → 403 forbidden. The audit log is an
//     admin-only surface; roles below admin must not see it at all.
// ---------------------------------------------------------------------------

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  action: z.string().min(1).max(120).optional(),
  q: z.string().min(1).max(120).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  // `actor` is REPEATABLE — read raw via c.req.queries('actor') and uuid-checked
  // per value in the handler. Declared permissively here (string OR string[]) so
  // the query validator doesn't reject a repeated key before we get to validate.
  actor: z.union([z.string(), z.array(z.string())]).optional(),
});

const DEFAULT_LIMIT = 25;

// Escape LIKE wildcards so user-supplied `q` is matched LITERALLY. Postgres
// ILIKE treats `%` and `_` as wildcards; without escaping, a query like `%`
// would match every row. We escape the escape char first, then the wildcards,
// and pair it with an explicit ESCAPE clause via Drizzle's `ilike`.
function escapeLike(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
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

    const page = q.page ?? 1;
    const limit = q.limit ?? DEFAULT_LIMIT;
    const offset = (page - 1) * limit;

    // REPEATABLE actor filter. queries() returns ALL values for the key (and an
    // array of one for a single `?actor=...`). Validate each as a uuid; a bad
    // value is a 400 (matches the single-value contract). De-dupe defensively.
    const rawActors = c.req.queries("actor") ?? [];
    const actorIds = [...new Set(rawActors)];
    for (const a of actorIds) {
      if (!z.string().uuid().safeParse(a).success) {
        throw errors.validation("Invalid actor filter (must be a uuid)");
      }
    }

    // Scope = this org's events PLUS account-level events that are written
    // without an orgId (sign-in/out, 2FA, vault-unlock, recovery, etc.) whose
    // actor is a member of this org — so admins actually see authentication +
    // unlock activity in the workspace audit log.
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

    if (actorIds.length > 0) conds.push(inArray(auditEvents.actorUserId, actorIds));
    if (q.action) conds.push(eq(auditEvents.action, q.action));
    if (q.from) conds.push(gte(auditEvents.occurredAt, new Date(q.from)));
    if (q.to) conds.push(lt(auditEvents.occurredAt, new Date(q.to)));

    if (q.q) {
      // Case-insensitive partial match across actorEmail / action / targetName.
      // Wildcards in user input are escaped (literal `%`/`_`) with an explicit
      // ESCAPE clause so the filter can't be turned into a match-all.
      const pattern = `%${escapeLike(q.q)}%`;
      const escape = sql`'\\'`;
      const search = or(
        sql`${auditEvents.actorEmail} ILIKE ${pattern} ESCAPE ${escape}`,
        sql`${auditEvents.action} ILIKE ${pattern} ESCAPE ${escape}`,
        sql`${auditEvents.targetName} ILIKE ${pattern} ESCAPE ${escape}`,
      );
      if (search) conds.push(search);
    }

    const where = and(...conds);

    // Total over the SAME scope+filters (NOT just the page).
    const countRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditEvents)
      .where(where);
    const total = countRows[0]?.total ?? 0;

    const rows = await db
      .select()
      .from(auditEvents)
      .where(where)
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(limit)
      .offset(offset);

    return c.json({ events: rows.map(toAuditDto), total, page, limit });
  })

  // -------------------------------------------------------------------------
  // GET /audit/actors — distinct actors in this org's audit scope, for the
  // filter dropdown (so it's not limited to the currently-loaded page). Same
  // RBAC + same scope as GET /audit.
  // -------------------------------------------------------------------------
  .get("/actors", async (c) => {
    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace");

    if (!canViewAllOrgAudit(current.role)) {
      throw errors.forbidden("Audit log access is restricted to workspace admins");
    }

    const orgMemberIds = db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, current.orgId));
    const scope = or(
      eq(auditEvents.orgId, current.orgId),
      and(isNull(auditEvents.orgId), inArray(auditEvents.actorUserId, orgMemberIds)),
    );

    const rows = await db
      .selectDistinct({
        userId: auditEvents.actorUserId,
        email: auditEvents.actorEmail,
      })
      .from(auditEvents)
      .where(
        and(
          scope,
          sql`${auditEvents.actorUserId} IS NOT NULL`,
          sql`${auditEvents.actorEmail} IS NOT NULL`,
        ),
      )
      .orderBy(asc(auditEvents.actorEmail))
      .limit(500);

    const actors = rows
      .filter((r): r is { userId: string; email: string } => r.userId !== null && r.email !== null)
      .map((r) => ({ userId: r.userId, email: r.email }));

    return c.json({ actors });
  });

export type AuditRoutes = typeof auditRoutes;
