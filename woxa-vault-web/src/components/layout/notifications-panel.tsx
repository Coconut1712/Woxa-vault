"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Share2,
  Eye,
  ShieldCheck,
  UserCog,
  Ban,
  CheckCheck,
  Settings as SettingsIcon,
  Loader2,
  Inbox,
  CheckCircle2,
  XCircle,
  RotateCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api/notifications";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";

type IconCmp = React.ComponentType<{ className?: string }>;

// Visual style per notification type (with a neutral fallback for unknown ones).
const typeStyles: Record<string, { icon: IconCmp; color: string }> = {
  "share.received": {
    icon: Share2,
    color: "bg-violet-500/10 ring-violet-500/20 text-violet-600 dark:text-violet-400",
  },
  "role.changed": {
    icon: UserCog,
    color: "bg-blue-500/10 ring-blue-500/20 text-blue-600 dark:text-blue-400",
  },
  "access.revoked": {
    icon: Ban,
    color: "bg-rose-500/10 ring-rose-500/20 text-rose-600 dark:text-rose-400",
  },
  "member.role_changed": {
    icon: ShieldCheck,
    color: "bg-amber-500/10 ring-amber-500/20 text-amber-600 dark:text-amber-400",
  },
  "send.viewed": {
    icon: Eye,
    color: "bg-emerald-500/10 ring-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  },
  "access_request.created": {
    icon: Inbox,
    color: "bg-amber-500/10 ring-amber-500/20 text-amber-600 dark:text-amber-400",
  },
  "access_request.approved": {
    icon: CheckCircle2,
    color: "bg-emerald-500/10 ring-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  },
  "access_request.denied": {
    icon: XCircle,
    color: "bg-rose-500/10 ring-rose-500/20 text-rose-600 dark:text-rose-400",
  },
  "vault.rekey_pending": {
    icon: RotateCw,
    color: "bg-amber-500/10 ring-amber-500/20 text-amber-600 dark:text-amber-400",
  },
};
const fallbackStyle = {
  icon: Bell,
  color: "bg-surface-2 ring-line-1 text-muted-foreground",
};

type Filter = "all" | "unread";
const UNREAD_POLL_MS = 60_000;

function metaStr(
  meta: Record<string, unknown> | null,
  key: string,
): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
}

export function NotificationsPanel() {
  const t = useT();
  const { me } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  // Translate a vault/org role name (try grant roles, then workspace roles).
  const roleLabel = useCallback(
    (role: string | undefined): string => {
      if (!role) return "";
      const grant = t(`role.${role}`);
      if (grant !== `role.${role}`) return grant;
      const member = t(`members.role.${role}`);
      if (member !== `members.role.${role}`) return member;
      return role;
    },
    [t],
  );

  const actorLabel = useCallback(
    (n: NotificationItem) => n.actorEmail ?? t("common.system"),
    [t],
  );

  const titleFor = useCallback(
    (n: NotificationItem): string => {
      switch (n.type) {
        case "share.received":
          return t("notif.share_received.title");
        case "role.changed":
          return t("notif.role_changed.title");
        case "access.revoked":
          return t("notif.access_revoked.title");
        case "member.role_changed":
          return t("notif.member_role_changed.title");
        case "send.viewed":
          return t("notif.send_viewed.title");
        case "access_request.created":
          return t("notif.access_request_created.title");
        case "access_request.approved":
          return t("notif.access_request_approved.title");
        case "access_request.denied":
          return t("notif.access_request_denied.title");
        case "vault.rekey_pending":
          return t("notif.vault_rekey_pending.title");
        default:
          return n.type.replace(/[._]/g, " ");
      }
    },
    [t],
  );

  const bodyFor = useCallback(
    (n: NotificationItem): string => {
      const actor = actorLabel(n);
      const isSystem = !n.actorEmail;
      const target = n.targetName ?? "";
      const role = roleLabel(metaStr(n.metadata, "role"));
      const from = roleLabel(metaStr(n.metadata, "from"));
      const to = roleLabel(metaStr(n.metadata, "to"));

      switch (n.type) {
        case "share.received":
          return t("notif.share_received.body", { actor, role, target });
        case "role.changed":
          if (isSystem) {
            return t("notif.role_changed.system_body", { target, from, to });
          }
          return t("notif.role_changed.body", { actor, target, from, to });
        case "access.revoked":
          if (isSystem) {
            return t("notif.access_revoked.system_body", { target });
          }
          return t("notif.access_revoked.body", { actor, target });
        case "member.role_changed":
          return t("notif.member_role_changed.body", { actor, from, to });
        case "access_request.created":
          return t("notif.access_request_created.body", { actor, role, target });
        case "access_request.approved":
          return t("notif.access_request_approved.body", { target, role });
        case "access_request.denied":
          return t("notif.access_request_denied.body", { target, reason: metaStr(n.metadata, "decisionReason") ?? "" });
        case "vault.rekey_pending":
          return t("notif.vault_rekey_pending.body", { target, actor });
        case "send.viewed": {
          const burned = metaStr(n.metadata, "burned");
          if (burned === "true" || burned === "1")
            return t("notif.send_viewed.body_burned");
          return t("notif.send_viewed.body_views", {
            n: metaStr(n.metadata, "viewsRemaining") ?? "0",
          });
        }
        default:
          return "";
      }
    },
    [t, actorLabel, roleLabel],
  );

  // Where a row navigates, or null when there's nothing to open (e.g. revoked
  // access, a folder we have no vault id for, or a workspace-role change).
  const linkFor = useCallback((n: NotificationItem): string | null => {
    const kind = metaStr(n.metadata, "resourceKind");
    if (n.type === "send.viewed") return "/app/sends";
    if (n.type.startsWith("access_request.")) return "/app/requests";
    if (n.type === "vault.rekey_pending" && n.targetId) return `/app/vault/${n.targetId}`;
    if (n.type === "share.received" || n.type === "role.changed") {
      if (kind === "vault" && n.targetId) return `/app/vault/${n.targetId}`;
      if (kind === "item" && n.targetId) return `/app/item/${n.targetId}`;
    }
    return null; // access.revoked / folder / member.role_changed → no deep link
  }, []);

  // Badge: load the unread count on mount and poll, so it stays fresh without
  // opening the panel. (No vault-unlock gate on this endpoint.)
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const tick = () => {
      getUnreadCount(ctrl.signal)
        .then((n) => {
          if (!cancelled) setUnreadCount(n);
        })
        .catch(() => {
          /* ignore — badge is best-effort */
        });
    };
    tick();
    const id = window.setInterval(tick, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [me?.activeOrgId]);

  // Load the full list whenever the panel opens or the workspace switches.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    listNotifications(30, ctrl.signal)
      .then((res) => {
        if (cancelled) return;
        setItems(res.notifications);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [open, me?.activeOrgId]);

  const handleRead = useCallback(async (id: string, wasRead: boolean) => {
    if (wasRead) return;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await markNotificationRead(id);
    } catch {
      /* optimistic — leave as read; next fetch reconciles */
    }
  }, []);

  const handleRowClick = useCallback(
    (n: NotificationItem) => {
      void handleRead(n.id, n.read);
      const link = linkFor(n);
      if (link) {
        setOpen(false);
        router.push(link);
      }
    },
    [handleRead, linkFor, router],
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
      toast.success(t("toast.all_read"));
    } catch {
      /* optimistic */
    }
  }, [t]);

  const filtered = filter === "unread" ? items.filter((n) => !n.read) : items;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={
          unreadCount > 0
            ? t("topbar.notifications_n_new", { n: unreadCount })
            : t("topbar.notifications")
        }
        title={
          unreadCount > 0
            ? t("topbar.notifications_n_new", { n: unreadCount })
            : t("topbar.notifications")
        }
        className="size-8 rounded-md hover:bg-accent flex items-center justify-center text-foreground transition-colors relative"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums ring-2 ring-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-96 p-0 max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t("notif.title")}</h3>
            {unreadCount > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1.5 border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium"
              >
                {t("notif.n_new", { n: unreadCount })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-2 transition-colors"
              >
                <CheckCheck className="size-3" /> {t("notif.mark_all_read")}
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                router.push("/app/account?tab=notifications");
              }}
              className="size-7 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
              aria-label={t("settings.notifications")}
            >
              <SettingsIcon className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border shrink-0">
          <FilterTab
            label={t("notif.tab.all")}
            count={items.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterTab
            label={t("notif.tab.unread")}
            count={unreadCount}
            active={filter === "unread"}
            onClick={() => setFilter("unread")}
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("notif.loading")}
            </div>
          ) : error ? (
            <div className="py-12 px-6 text-center text-sm text-muted-foreground">
              {t("notif.error")}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            filtered.map((n) => {
              const style = typeStyles[n.type] ?? fallbackStyle;
              const Icon = style.icon;
              return (
                <div
                  key={n.id}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => handleRowClick(n)}
                    className="block w-full text-left px-4 py-3 hover:bg-surface-1 transition-colors"
                  >
                    <div className="flex gap-3">
                      <div className="relative shrink-0">
                        <div
                          className={cn(
                            "size-9 rounded-lg ring-1 flex items-center justify-center",
                            style.color,
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                        {!n.read && (
                          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-brand ring-2 ring-background" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug">
                          {titleFor(n)}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">
                          {bodyFor(n)}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1.5">
                          {n.actorEmail && (
                            <>
                              <span className="font-medium truncate max-w-[180px]">
                                {n.actorEmail}
                              </span>
                              <span className="text-border">·</span>
                            </>
                          )}
                          <span className="tabular-nums">
                            {timeAgo(n.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5",
        active
          ? "bg-surface-2 text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "text-[10px] tabular-nums",
          active ? "text-muted-foreground" : "text-muted-foreground/60",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="size-12 rounded-2xl bg-surface-1 border border-line-1 flex items-center justify-center mb-3">
        <Bell className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium mb-0.5">
        {filter === "unread" ? t("notif.empty.unread") : t("notif.empty.all")}
      </p>
      <p className="text-[11px] text-muted-foreground max-w-[200px]">
        {filter === "unread"
          ? t("notif.empty.unread_desc")
          : t("notif.empty.all_desc")}
      </p>
    </div>
  );
}
