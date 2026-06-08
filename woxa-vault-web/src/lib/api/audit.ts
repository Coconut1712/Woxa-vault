/**
 * Audit log endpoint — admin-only. See /API_CONTRACT.md ("Endpoints — Audit").
 *
 *   GET /audit?page&limit&action&from&to&q&actor → { events, total, page, limit }
 *   GET /audit/actors → { actors: { userId, email }[] }
 *
 * Pagination is page-based (1-based `page`, `limit` ∈ {25,50,75,100}), ordered by
 * `occurredAt` DESC. `total` is the count of ALL rows matching the active filters
 * (not just the returned page), so the UI can render "Showing X–Y of Z" and a
 * Prev/Next pager. All filters (`action`, `from`, `to`, `q`, `actor`) are applied
 * server-side; `actor` is repeatable (one `actor=` param per selected userId).
 *
 * Errors (ApiError carries status + code):
 *   403 `forbidden` — caller is not an org admin/owner. The audit page mirrors
 *                     this with an admin-only redirect guard, so a 403 here is a
 *                     race (policy flipped mid-session), not the common path.
 */

import { apiFetch } from "./client";

/** A single immutable audit event row, matching the backend DTO. */
export interface AuditEvent {
  id: string;
  orgId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  /** Dotted action code, e.g. "item.reveal", "vault.share", "auth.login.success". */
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  ipHash: string | null;
  /**
   * Ready-to-display masked client IP, e.g. "10.0.•.•" or "2001:db8:•" (first two
   * octets/hextets kept, the rest replaced by the bullet glyph). `null` for events
   * created before masking shipped — those can't be backfilled. Prefer this over
   * `ipHash` for display.
   */
  ipMasked: string | null;
  userAgent: string | null;
  success: boolean;
  metadata: Record<string, unknown> | null;
  /** ISO datetime with offset. */
  occurredAt: string;
}

export interface AuditPage {
  events: AuditEvent[];
  /** Count of all rows matching the active filters (across every page). */
  total: number;
  /** 1-based page index this response represents. */
  page: number;
  /** Page size this response was served with. */
  limit: number;
}

/** A distinct org actor, for the actor filter dropdown. */
export interface AuditActor {
  userId: string;
  email: string;
}

export interface ListAuditParams {
  /** 1-based page index. Backend default 1. */
  page?: number;
  /** Page size ∈ {25, 50, 75, 100}. Backend default 25. */
  limit?: number;
  /** Exact action code, e.g. "item.reveal". */
  action?: string | null;
  /** ISO datetime with offset (inclusive lower bound on occurredAt). */
  from?: string | null;
  /** ISO datetime with offset (inclusive upper bound on occurredAt). */
  to?: string | null;
  /** Free-text search (server-side over actor/action/target). */
  q?: string | null;
  /** Filter to one or more actors by userId; sent as repeated `actor=` params. */
  actor?: string[] | null;
}

/**
 * GET /audit — admin-only. Builds the query string, omitting empty params, and
 * normalizes the response so callers always get an array + paging metadata.
 */
export async function listAudit(
  params: ListAuditParams = {},
  signal?: AbortSignal,
): Promise<AuditPage> {
  const qs = new URLSearchParams();
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.action) qs.set("action", params.action);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.q) qs.set("q", params.q);
  if (params.actor) {
    for (const id of params.actor) {
      if (id) qs.append("actor", id);
    }
  }

  const query = qs.toString();
  const res = await apiFetch<AuditPage>(`/audit${query ? `?${query}` : ""}`, {
    signal,
  });

  return {
    events: Array.isArray(res?.events) ? res.events : [],
    total: typeof res?.total === "number" ? res.total : 0,
    page: typeof res?.page === "number" ? res.page : (params.page ?? 1),
    limit: typeof res?.limit === "number" ? res.limit : (params.limit ?? 25),
  };
}

/**
 * GET /audit/actors — admin-only. Returns the org's distinct audit actors so the
 * actor filter can list every actor (not just those on the loaded page).
 */
export async function listAuditActors(
  signal?: AbortSignal,
): Promise<AuditActor[]> {
  const res = await apiFetch<{ actors: AuditActor[] }>(`/audit/actors`, {
    signal,
  });
  return Array.isArray(res?.actors) ? res.actors : [];
}

/**
 * GET /items/:id/activity — per-item audit feed. Returns AuditEvents scoped to a
 * single item, newest first. Access mirrors the backend:
 *   - 200 for a vault MANAGER of the item OR an org admin/owner.
 *   - 403 `forbidden` for editor/user/viewer who can see the item but aren't
 *     manager/admin. Callers gate the UI so this should not happen.
 *   - 404 `not_found` if there is no access or the item is deleted.
 *
 * `limit` is clamped 1–50 by the backend (default 20).
 */
export async function getItemActivity(
  itemId: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<AuditEvent[]> {
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(limit));
  const query = qs.toString();
  const res = await apiFetch<{ events: AuditEvent[] }>(
    `/items/${itemId}/activity${query ? `?${query}` : ""}`,
    { signal },
  );
  return Array.isArray(res?.events) ? res.events : [];
}
