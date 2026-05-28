"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Filter,
  Search,
  X,
  Check,
  Calendar,
  User as UserIcon,
  Zap,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ApiErrorState, ApiLoadingState } from "@/components/shared/api-states";
import { listAudit, type AuditEvent } from "@/lib/api/audit";
import { ApiError, VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import {
  actionLabelKey,
  baseActionLabel,
  formatAuditLabel,
} from "@/lib/audit-format";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { canViewAuditLog } from "@/lib/auth/permissions";

type DateRange = "all" | "today" | "7d" | "30d" | "90d";

const PAGE_SIZE = 50;

/**
 * Ordered list of action-filter groups. Each group's `match` maps a raw action
 * code to that section; the first matching group wins, so order matters (e.g.
 * "account." is tested before generic prefixes). Anything unmatched lands in
 * the trailing "other" bucket so the filter always covers every real code.
 */
const ACTION_GROUPS: { key: string; match: (action: string) => boolean }[] = [
  { key: "item", match: (a) => a.startsWith("item.") },
  { key: "folder", match: (a) => a.startsWith("folder.") },
  { key: "vault", match: (a) => a.startsWith("vault.") },
  { key: "team", match: (a) => a.startsWith("team.") },
  { key: "member", match: (a) => a.startsWith("member.") },
  { key: "auth", match: (a) => a.startsWith("auth.") },
  { key: "2fa", match: (a) => a.startsWith("2fa.") },
  { key: "account", match: (a) => a.startsWith("account.") },
  { key: "attachment", match: (a) => a.startsWith("attachment.") },
  { key: "send", match: (a) => a.startsWith("send.") },
  { key: "workspace", match: (a) => a.startsWith("workspace.") },
  { key: "trash", match: (a) => a.startsWith("trash.") },
];

/**
 * The complete, real backend action set (derived from `actionLabelKey`),
 * partitioned into the filter's grouped sections. Each section keeps its actions
 * alphabetised; empty sections are dropped so the dropdown only shows live
 * groups. A selected action sets the `action=` query param (exact backend match).
 */
const groupedActions: { key: string; actions: string[] }[] = (() => {
  const all = Object.keys(actionLabelKey);
  const buckets = new Map<string, string[]>();
  for (const group of ACTION_GROUPS) buckets.set(group.key, []);
  const other: string[] = [];

  for (const action of all) {
    const group = ACTION_GROUPS.find((g) => g.match(action));
    if (group) buckets.get(group.key)!.push(action);
    else other.push(action);
  }

  const sections = ACTION_GROUPS.map((group) => ({
    key: group.key,
    actions: buckets.get(group.key)!.sort(),
  })).filter((section) => section.actions.length > 0);

  if (other.length > 0) sections.push({ key: "other", actions: other.sort() });
  return sections;
})();

export default function AuditPage() {
  const t = useT();
  const router = useRouter();
  const { status, me } = useAuth();

  // Audit log is admin-only (GET /audit returns 403 for member/guest). Redirect
  // direct-URL access to /app once the role is known; render a quiet splash
  // until then so audit rows never flash for a non-admin.
  const allowed = canViewAuditLog(me?.role ?? null);
  useEffect(() => {
    if (status === "authenticated" && me && !allowed) {
      router.replace("/app");
    }
  }, [status, me, allowed, router]);

  // ---- Filters (drive server-side refetch where the backend supports them) --
  const [query, setQuery] = useState("");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<DateRange>("all");

  // ---- Data ---------------------------------------------------------------
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Bump to force a refetch-from-top whenever a server-side filter changes.
  const [reloadKey, setReloadKey] = useState(0);

  // `from` is derived from the date-range pill; `to` is always "now" (open end).
  const fromIso = useMemo(() => {
    if (dateRange === "all") return null;
    const days = { today: 1, "7d": 7, "30d": 30, "90d": 90 }[dateRange];
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }, [dateRange]);

  // Initial / filter-change fetch (resets the cursor and replaces all rows).
  useEffect(() => {
    if (status !== "authenticated" || !me || !allowed) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    listAudit(
      {
        limit: PAGE_SIZE,
        action: selectedAction,
        from: fromIso,
      },
      controller.signal,
    )
      .then((page) => {
        setEvents(page.events);
        setNextCursor(page.nextCursor);
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
  }, [status, me, allowed, selectedAction, fromIso, reloadKey]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    listAudit({
      limit: PAGE_SIZE,
      action: selectedAction,
      from: fromIso,
      cursor: nextCursor,
    })
      .then((page) => {
        setEvents((prev) => [...prev, ...page.events]);
        setNextCursor(page.nextCursor);
      })
      .catch((err) => {
        toast.error(
          err instanceof ApiError ? err.message : t("api.error.generic"),
        );
      })
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore, selectedAction, fromIso, t]);

  // Actor choices are derived from whatever rows are currently loaded.
  const allActors = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      if (ev.actorEmail) set.add(ev.actorEmail);
    }
    return Array.from(set).sort();
  }, [events]);

  // Client-side narrowing over loaded rows: free-text search + actor filter.
  const filtered = useMemo(() => {
    return events.filter((ev) => {
      if (selectedActors.size > 0) {
        if (!ev.actorEmail || !selectedActors.has(ev.actorEmail)) return false;
      }
      if (query) {
        const q = query.toLowerCase();
        const hay = [
          ev.actorEmail ?? "",
          ev.action,
          ev.targetName ?? "",
          ev.targetType ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, selectedActors, query]);

  const activeFilterCount =
    (selectedAction ? 1 : 0) +
    selectedActors.size +
    (dateRange !== "all" ? 1 : 0);

  const clearAll = () => {
    setSelectedAction(null);
    setSelectedActors(new Set());
    setDateRange("all");
  };

  const toggleActor = (value: string) => {
    setSelectedActors((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  // Filter UI labels operate on a raw action CODE (base label only).
  const actionLabel = useCallback(
    (action: string) => baseActionLabel(action, t),
    [t],
  );

  // Table rows operate on the full EVENT so share/role-change/revoke render the
  // grantee email + role transition from `metadata`.
  const rowLabel = useCallback((ev: AuditEvent) => formatAuditLabel(ev, t), [t]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  // Recover on unlock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => retry();
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [retry]);

  const exportCsv = () => {
    const header = [
      "occurredAt",
      "actorEmail",
      "action",
      "targetType",
      "targetName",
      "success",
      "ipHash",
    ];
    const rows = [
      header,
      ...filtered.map((ev) => [
        ev.occurredAt,
        ev.actorEmail ?? "",
        ev.action,
        ev.targetType ?? "",
        ev.targetName ?? "",
        ev.success ? "true" : "false",
        ev.ipHash ?? "",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            let s = String(cell ?? "");
            // CSV formula-injection guard (CWE-1236): a cell starting with
            // = + - @ (or tab/CR) is executed as a formula by Excel/Sheets.
            // actorEmail/targetName can be attacker-controlled, so neutralize
            // by prefixing a single quote before the standard CSV quoting.
            if (/^[=+\-@\t\r]/.test(s)) {
              s = `'${s}`;
            }
            if (s.includes(",") || s.includes('"') || s.includes("\n")) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = format(new Date(), "yyyy-MM-dd-HHmm");
    a.href = url;
    a.download = `woxa-audit-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(t("audit.exported", { n: filtered.length }), {
      description: t("audit.exported_desc", {
        file: `woxa-audit-${stamp}.csv`,
      }),
    });
  };

  if (status !== "authenticated" || !me || !allowed) {
    return <BootSplash label={t("auth.checking_session")} />;
  }

  const dateRangeLabel =
    dateRange === "today"
      ? t("audit.filter.24h")
      : dateRange === "7d"
        ? t("audit.filter.7d")
        : dateRange === "30d"
          ? t("audit.filter.30d")
          : t("audit.filter.90d");

  return (
    <>
      <Topbar
        title={t("audit.title")}
        subtitle={t("audit.subtitle")}
        actions={
          <>
            <Popover>
              <PopoverTrigger
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border transition-colors",
                  activeFilterCount > 0
                    ? "border-brand/30 bg-brand/10 text-foreground"
                    : "border-line-2 bg-background hover:bg-surface-1",
                )}
              >
                <Filter className="size-3.5" />
                {t("common.filters")}
                {activeFilterCount > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 px-1 ml-0.5 font-medium border-brand/30 bg-brand/15 text-brand"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 p-0 max-h-[70vh] overflow-hidden flex flex-col"
              >
                <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-border">
                  <h3 className="text-sm font-semibold">{t("common.filters")}</h3>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearAll}
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <X className="size-3" /> {t("common.clear_all")}
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto p-4 space-y-5">
                  {/* Date range (server-side from/to) */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                      <Calendar className="size-3" /> {t("audit.filter.time_range")}
                    </label>
                    <Select
                      value={dateRange}
                      onValueChange={(v) => v && setDateRange(v as DateRange)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("audit.filter.all_time")}</SelectItem>
                        <SelectItem value="today">{t("audit.filter.24h")}</SelectItem>
                        <SelectItem value="7d">{t("audit.filter.7d")}</SelectItem>
                        <SelectItem value="30d">{t("audit.filter.30d")}</SelectItem>
                        <SelectItem value="90d">{t("audit.filter.90d")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator className="bg-line-1" />

                  {/* Action (server-side exact match — single select) */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                      <Zap className="size-3" /> {t("audit.filter.action")}
                    </label>
                    <Select
                      value={selectedAction ?? "__all__"}
                      onValueChange={(v) =>
                        setSelectedAction(v && v !== "__all__" ? v : null)
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="__all__">
                          {t("audit.filter.all_actions")}
                        </SelectItem>
                        {groupedActions.map((section) => (
                          <SelectGroup key={section.key}>
                            <SelectLabel>
                              {t(`audit.group.${section.key}`)}
                            </SelectLabel>
                            {section.actions.map((action) => (
                              <SelectItem key={action} value={action}>
                                {actionLabel(action)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator className="bg-line-1" />

                  {/* Actors (client-side over loaded rows) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                        <UserIcon className="size-3" /> {t("audit.filter.actor")}
                      </label>
                      {selectedActors.size > 0 && (
                        <button
                          onClick={() => setSelectedActors(new Set())}
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          {t("common.clear")}
                        </button>
                      )}
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto -mx-1 px-1">
                      {allActors.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 py-1.5">
                          {t("audit.empty_title")}
                        </p>
                      ) : (
                        allActors.map((actor) => (
                          <label
                            key={actor}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-1 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="size-3.5 accent-brand"
                              checked={selectedActors.has(actor)}
                              onChange={() => toggleActor(actor)}
                            />
                            <span className="text-xs font-mono-secret flex-1 truncate">
                              {actor}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border px-4 py-2.5 flex items-center justify-between bg-surface-1 text-[11px] text-muted-foreground">
                  <span>{t("audit.loaded_count", { n: events.length })}</span>
                  {activeFilterCount === 0 && <Check className="size-3" />}
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              <Download className="size-3.5" /> {t("audit.export_csv")}
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8">
          {/* Search + active filter chips */}
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("audit.search")}
                className="pl-9 h-9"
              />
            </div>

            {dateRange !== "all" && (
              <ActiveChip
                onClear={() => setDateRange("all")}
                icon={<Calendar className="size-3" />}
                label={dateRangeLabel}
              />
            )}
            {selectedAction && (
              <ActiveChip
                icon={<Zap className="size-3" />}
                label={actionLabel(selectedAction)}
                onClear={() => setSelectedAction(null)}
              />
            )}
            {Array.from(selectedActors).map((actor) => (
              <ActiveChip
                key={actor}
                icon={<UserIcon className="size-3" />}
                label={actor}
                onClear={() => toggleActor(actor)}
              />
            ))}

            <div className="ml-auto text-xs text-muted-foreground tabular-nums">
              {t("audit.loaded_count", { n: filtered.length })}
            </div>
          </div>

          <Card className="overflow-hidden p-0">
            {loading ? (
              <ApiLoadingState variant="inline" label={t("audit.loading")} />
            ) : error ? (
              <ApiErrorState error={error} onRetry={retry} variant="inline" />
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <Filter className="size-6 mb-2 opacity-50 text-muted-foreground" />
                <h3 className="font-medium mb-1">{t("audit.empty_title")}</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {t("audit.empty_desc")}
                </p>
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-1">
                    <tr>
                      <th className="text-left font-semibold px-6 py-3 w-44">
                        {t("audit.col.timestamp")}
                      </th>
                      <th className="text-left font-semibold px-2 py-3">
                        {t("audit.col.actor")}
                      </th>
                      <th className="text-left font-semibold px-2 py-3">
                        {t("audit.col.action")}
                      </th>
                      <th className="text-left font-semibold px-2 py-3">
                        {t("audit.col.target")}
                      </th>
                      <th className="text-left font-semibold px-2 py-3 w-24">
                        {t("audit.col.ip")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-16 text-center text-sm text-muted-foreground"
                        >
                          <Filter className="size-6 mx-auto mb-2 opacity-50" />
                          {t("audit.no_match")}
                        </td>
                      </tr>
                    ) : (
                      filtered.map((ev) => (
                        <tr
                          key={ev.id}
                          className="border-b border-border/60 last:border-b-0 hover:bg-surface-1"
                        >
                          <td className="px-6 py-3 text-muted-foreground text-xs tabular-nums">
                            {formatDateTime(ev.occurredAt)}
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-2">
                              <div className="size-6 rounded-full bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-line-1 flex items-center justify-center text-[10px] font-semibold uppercase">
                                {(ev.actorEmail ?? "?").slice(0, 1)}
                              </div>
                              <span className="text-xs">
                                {ev.actorEmail ?? t("audit.unknown_actor")}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-2">
                              {ev.success ? (
                                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              ) : (
                                <XCircle className="size-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                              )}
                              <span className="font-medium">
                                {rowLabel(ev)}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-3">
                            {ev.targetName ? (
                              <span className="font-medium">
                                {ev.targetName}
                              </span>
                            ) : ev.targetType ? (
                              <Badge
                                variant="outline"
                                className="font-mono-secret text-[10px]"
                              >
                                {ev.targetType}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">
                                {t("audit.no_target")}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-3 text-muted-foreground text-xs font-mono-secret truncate max-w-24">
                            {ev.ipHash
                              ? ev.ipHash.slice(0, 8)
                              : t("audit.no_target")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {nextCursor && (
                  <div className="border-t border-border px-6 py-3 flex justify-center bg-surface-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {t("audit.load_more")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function ActiveChip({
  icon,
  label,
  onClear,
}: {
  icon: React.ReactNode;
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      onClick={onClear}
      className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium border border-brand/30 bg-brand/10 text-foreground hover:bg-brand/15 transition-colors"
    >
      {icon}
      <span className="max-w-32 truncate">{label}</span>
      <X className="size-3 opacity-60" />
    </button>
  );
}

/* Quiet splash shown while AuthProvider boots OR while a non-admin user is
   being redirected away — keeps audit rows from flashing for member/guest. */
function BootSplash({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="size-9 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
          <ShieldCheck className="size-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="size-3 border-2 border-current border-r-transparent rounded-full animate-spin" />
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}
