/**
 * Audit log endpoint — admin-only. See /API_CONTRACT.md ("Endpoints — Audit").
 *
 *   GET /audit?cursor&limit&actor&action&from&to → { events: AuditEvent[]; nextCursor }
 *
 * Pagination is keyset (opaque cursor), ordered by `occurredAt` DESC. To load
 * the next page, pass the previous response's `nextCursor` back as `?cursor=`.
 * A `null` nextCursor means there are no more rows.
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
  userAgent: string | null;
  success: boolean;
  metadata: Record<string, unknown> | null;
  /** ISO datetime with offset. */
  occurredAt: string;
}

export interface AuditPage {
  events: AuditEvent[];
  /** Opaque keyset cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
}

export interface ListAuditParams {
  /** Opaque cursor from a previous response's `nextCursor`. */
  cursor?: string | null;
  /** 1–200, backend default 50. */
  limit?: number;
  /** Filter to a single actor user id (uuid). */
  actor?: string | null;
  /** Exact action code, e.g. "item.reveal". */
  action?: string | null;
  /** ISO datetime with offset (inclusive lower bound on occurredAt). */
  from?: string | null;
  /** ISO datetime with offset (inclusive upper bound on occurredAt). */
  to?: string | null;
}

/**
 * GET /audit — admin-only. Builds the query string, omitting empty params, and
 * normalizes the response so callers always get an array + a cursor.
 */
export async function listAudit(
  params: ListAuditParams = {},
  signal?: AbortSignal,
): Promise<AuditPage> {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.actor) qs.set("actor", params.actor);
  if (params.action) qs.set("action", params.action);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);

  const query = qs.toString();
  const res = await apiFetch<AuditPage>(`/audit${query ? `?${query}` : ""}`, {
    signal,
  });

  return {
    events: Array.isArray(res?.events) ? res.events : [],
    nextCursor: res?.nextCursor ?? null,
  };
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
