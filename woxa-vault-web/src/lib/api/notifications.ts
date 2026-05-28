/**
 * Notifications — the caller's own event-driven inbox.
 *
 * Backend: woxa-vault-api/src/routes/notifications.ts. Every endpoint is scoped
 * to the caller (`userId = me`); the server computes recipients at write time,
 * so the inbox only ever holds rows the caller is the legitimate subject of.
 * Carries NO secret material — not vault-unlock gated.
 */

import { apiFetch } from "./client";

/** Event-driven notification kinds the backend generates (others are deferred). */
export type NotificationType =
  | "share.received"
  | "role.changed"
  | "access.revoked"
  | "member.role_changed"
  | "send.viewed";

export interface NotificationItem {
  id: string;
  /** One of NotificationType, but treat as string — unknown types degrade gracefully. */
  type: string;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  /** Structured per type, e.g. { resourceKind, role, from, to, viewsRemaining, burned }. */
  metadata: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  notifications: NotificationItem[];
  unreadCount: number;
}

/** GET /notifications — the caller's notifications (newest first) + unread count. */
export async function listNotifications(
  limit?: number,
  signal?: AbortSignal,
): Promise<NotificationList> {
  const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
  const res = await apiFetch<NotificationList>(`/notifications${qs}`, { signal });
  return {
    notifications: Array.isArray(res?.notifications) ? res.notifications : [],
    unreadCount: typeof res?.unreadCount === "number" ? res.unreadCount : 0,
  };
}

/** GET /notifications/unread-count — cheap badge poll. */
export async function getUnreadCount(signal?: AbortSignal): Promise<number> {
  const res = await apiFetch<{ unreadCount: number }>(
    "/notifications/unread-count",
    { signal },
  );
  return typeof res?.unreadCount === "number" ? res.unreadCount : 0;
}

/** POST /notifications/:id/read — mark one read (caller's own only; 204). */
export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch<void>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
  });
}

/** POST /notifications/read-all — mark all the caller's unread as read. */
export async function markAllNotificationsRead(): Promise<number> {
  const res = await apiFetch<{ updated: number }>("/notifications/read-all", {
    method: "POST",
  });
  return typeof res?.updated === "number" ? res.updated : 0;
}
