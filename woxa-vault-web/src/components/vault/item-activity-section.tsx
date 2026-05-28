"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Loader2, AlertCircle } from "lucide-react";

import { getItemActivity, type AuditEvent } from "@/lib/api/audit";
import { ApiError } from "@/lib/api/client";
import { formatAuditLabel } from "@/lib/audit-format";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";

/** Tailwind dot colors keyed by action family, light/dark paired. */
function dotColor(action: string): string {
  if (action.startsWith("item.reveal") || action.startsWith("item.copy"))
    return "bg-amber-500/80 dark:bg-amber-400/80";
  if (action.startsWith("item.share") || action.includes("role_change"))
    return "bg-violet-500/80 dark:bg-violet-400/80";
  if (action.startsWith("item.delete") || action.startsWith("item.purge"))
    return "bg-rose-500/80 dark:bg-rose-400/80";
  if (action.startsWith("item.restore"))
    return "bg-emerald-500/80 dark:bg-emerald-400/80";
  return "bg-sky-500/80 dark:bg-sky-400/80";
}

const ACTIVITY_LIMIT = 10;

export function ItemActivitySection({
  itemId,
  showFullLogLink,
}: {
  /** The item whose audit feed to load. */
  itemId: string;
  /** Whether to show the "View full audit log →" link (admins only). */
  showFullLogLink: boolean;
}) {
  const t = useT();

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getItemActivity(itemId, ACTIVITY_LIMIT, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setEvents(rows);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, "network_error", String(err)),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [itemId, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const actionLabel = useCallback(
    (ev: AuditEvent) => formatAuditLabel(ev, t),
    [t],
  );

  return (
    <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
        <Activity className="size-3.5 text-sky-600 dark:text-sky-400" />
        {t("item.activity.title")}
      </h2>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("item.activity.loading")}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="size-3.5 text-rose-600 dark:text-rose-400" />
            {t("item.activity.error")}
          </span>
          <button
            onClick={retry}
            className="text-xs font-medium text-brand hover:underline"
          >
            {t("item.activity.retry")}
          </button>
        </div>
      ) : events.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {t("item.activity.empty")}
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {events.map((ev) => (
              <li key={ev.id} className="flex items-start gap-3">
                <span
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dotColor(ev.action)}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground/90 leading-snug">
                    <span className="font-medium font-mono-secret">
                      {ev.actorEmail ?? t("audit.unknown_actor")}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {actionLabel(ev)}
                    </span>
                  </p>
                </div>
                <span
                  className="shrink-0 text-xs text-muted-foreground tabular-nums whitespace-nowrap"
                  title={ev.occurredAt}
                >
                  {timeAgo(ev.occurredAt)}
                </span>
              </li>
            ))}
          </ul>

          {showFullLogLink && (
            <div className="mt-4 pt-3 border-t border-border/60">
              <Link
                href="/app/audit"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                {t("item.activity.view_full_log")}
                <ArrowRight className="size-3" />
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
