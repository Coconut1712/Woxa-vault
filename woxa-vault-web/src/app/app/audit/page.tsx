"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Filter,
  Search,
  X,
  Calendar,
  User as UserIcon,
  Zap,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
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
import { Checkbox } from "@/components/ui/checkbox";
import { ApiErrorState, ApiLoadingState } from "@/components/shared/api-states";
import {
  listAudit,
  listAuditActors,
  type AuditEvent,
  type AuditActor,
} from "@/lib/api/audit";
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

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

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

  // ---- Filters (all drive server-side refetch) ----------------------------
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  // Stores actor USER IDs (sent as the repeatable `actor=` param).
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<DateRange>("all");

  // ---- Pagination ---------------------------------------------------------
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  // ---- Data ---------------------------------------------------------------
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  // ---- Actor directory (org-wide, not just the loaded page) ---------------
  const [actors, setActors] = useState<AuditActor[]>([]);

  // Bump to force a refetch whenever an external event (unlock) demands it.
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce the free-text search (~300ms) before it drives a refetch; a changed
  // search term resets to page 1.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery((prev) => {
        const next = query.trim();
        if (next !== prev) setPage(1);
        return next;
      });
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  // `from` is derived from the date-range pill; `to` is always "now" (open end).
  const fromIso = useMemo(() => {
    if (dateRange === "all") return null;
    const days = { today: 1, "7d": 7, "30d": 30, "90d": 90 }[dateRange];
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }, [dateRange]);

  // Load the org's distinct actors once the admin role is confirmed.
  useEffect(() => {
    if (status !== "authenticated" || !me || !allowed) return;
    const controller = new AbortController();
    listAuditActors(controller.signal)
      .then((list) => setActors(list))
      .catch(() => {
        /* actor dropdown is best-effort; ignore failures */
      });
    return () => controller.abort();
  }, [status, me, allowed, reloadKey]);

  // Page/filter-change fetch — the list REPLACES on every fetch (no append).
  useEffect(() => {
    if (status !== "authenticated" || !me || !allowed) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    listAudit(
      {
        page,
        limit: pageSize,
        action: selectedAction,
        from: fromIso,
        q: debouncedQuery || null,
        actor: selectedActors.size > 0 ? Array.from(selectedActors) : null,
      },
      controller.signal,
    )
      .then((res) => {
        setEvents(res.events);
        setTotal(res.total);
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
  }, [
    status,
    me,
    allowed,
    page,
    pageSize,
    selectedAction,
    fromIso,
    debouncedQuery,
    selectedActors,
    reloadKey,
  ]);

  // Map userId → email for chip labels.
  const actorEmailById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of actors) map.set(a.userId, a.email);
    return map;
  }, [actors]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const activeFilterCount =
    (selectedAction ? 1 : 0) +
    selectedActors.size +
    (dateRange !== "all" ? 1 : 0);

  // Filter mutators reset to page 1 (changing the result set invalidates the
  // current page index). These run from user events, never during render.
  const changeAction = (value: string | null) => {
    setSelectedAction(value);
    setPage(1);
  };

  const changeDateRange = (value: DateRange) => {
    setDateRange(value);
    setPage(1);
  };

  const changePageSize = (value: number) => {
    setPageSize(value);
    setPage(1);
  };

  const clearActors = () => {
    setSelectedActors(new Set());
    setPage(1);
  };

  const clearAll = () => {
    setSelectedAction(null);
    setSelectedActors(new Set());
    setDateRange("all");
    setPage(1);
  };

  const toggleActor = (userId: string) => {
    setSelectedActors((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    setPage(1);
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
      "ipMasked",
    ];
    const rows = [
      header,
      ...events.map((ev) => [
        ev.occurredAt,
        ev.actorEmail ?? "",
        ev.action,
        ev.targetType ?? "",
        ev.targetName ?? "",
        ev.success ? "true" : "false",
        ev.ipMasked ?? "",
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

    // Prepend a UTF-8 BOM (AC-040.5) so Excel decodes Thai text correctly
    // instead of mojibake when opening the exported CSV.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = format(new Date(), "yyyy-MM-dd-HHmm");
    a.href = url;
    a.download = `woxa-audit-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(t("audit.exported", { n: events.length }), {
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
      <Topbar title={t("audit.title")} subtitle={t("audit.subtitle")} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8">
          <Card className="overflow-hidden p-0">
          {/* Toolbar: header strip of the results card. Left = Filters ▾ + search;
              right = result count + Export. Active-filter chips sit in a second
              row below a divider. */}
          <div className="border-b border-line-1 bg-surface-1/60">
          <div className="flex items-center gap-2 flex-wrap px-4 py-3">
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 bg-card/60",
                      activeFilterCount > 0 &&
                        "border-brand/30 bg-brand/10 text-foreground hover:bg-brand/15",
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
                  </Button>
                }
              />
              <PopoverContent
                align="start"
                className="w-80 p-0 max-h-[70vh] overflow-hidden flex flex-col"
              >
                <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-line-1">
                  <h3 className="text-sm font-semibold">{t("common.filters")}</h3>
                  {activeFilterCount > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={clearAll}
                      className="text-muted-foreground"
                    >
                      <X className="size-3" /> {t("common.clear_all")}
                    </Button>
                  )}
                </div>

                <div className="overflow-y-auto p-4 space-y-4">
                  {/* Date range (server-side from/to) */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                      <Calendar className="size-3" /> {t("audit.filter.time_range")}
                    </label>
                    <Select
                      value={dateRange}
                      onValueChange={(v) => v && changeDateRange(v as DateRange)}
                    >
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue>
                          {(value: string | null) => {
                            const v = (value as DateRange) ?? dateRange;
                            return v === "all"
                              ? t("audit.filter.all_time")
                              : v === "today"
                                ? t("audit.filter.24h")
                                : v === "7d"
                                  ? t("audit.filter.7d")
                                  : v === "30d"
                                    ? t("audit.filter.30d")
                                    : t("audit.filter.90d");
                          }}
                        </SelectValue>
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
                        changeAction(v && v !== "__all__" ? v : null)
                      }
                    >
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue>
                          {(value: string | null) => {
                            const v = (value as string) ?? selectedAction;
                            return !v || v === "__all__"
                              ? t("audit.filter.all_actions")
                              : actionLabel(v);
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent
                        alignItemWithTrigger={false}
                        className="max-h-72 w-auto min-w-(--anchor-width) max-w-[min(22rem,calc(100vw-2rem))]"
                      >
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
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={clearActors}
                          className="text-muted-foreground"
                        >
                          {t("common.clear")}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto -mx-1 px-1">
                      {actors.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 py-1.5">
                          {t("audit.filter.no_actors")}
                        </p>
                      ) : (
                        actors.map((actor) => (
                          <label
                            key={actor.userId}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-1 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedActors.has(actor.userId)}
                              onCheckedChange={() => toggleActor(actor.userId)}
                              aria-label={actor.email}
                            />
                            <span className="text-xs font-mono-secret flex-1 truncate">
                              {actor.email}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-line-1 px-4 py-2.5 bg-surface-1 text-[11px] text-muted-foreground">
                  {t("audit.total_events", { total })}
                </div>
              </PopoverContent>
            </Popover>

            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("audit.search")}
                className="pl-9 h-9 bg-card/60 border-line-1"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="inline-flex items-center h-9 px-2.5 rounded-md border border-line-1 bg-card/60 text-xs text-muted-foreground tabular-nums">
                {t("audit.showing_range", {
                  start: rangeStart,
                  end: rangeEnd,
                  total,
                })}
              </span>

              <Button
                variant="outline"
                size="sm"
                className="h-9 bg-card/60"
                onClick={exportCsv}
                disabled={events.length === 0}
              >
                <Download className="size-3.5" /> {t("audit.export_csv")}
              </Button>
            </div>
          </div>

          {/* Active filter chips — second toolbar row under a divider */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap border-t border-line-1/70 px-4 py-2.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-0.5">
                {t("audit.applied_filters")}
              </span>
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
              {Array.from(selectedActors).map((userId) => (
                <ActiveChip
                  key={userId}
                  icon={<UserIcon className="size-3" />}
                  label={actorEmailById.get(userId) ?? userId}
                  onClear={() => toggleActor(userId)}
                />
              ))}
              <Button
                variant="ghost"
                size="xs"
                onClick={clearAll}
                className="text-muted-foreground h-7 ml-auto"
              >
                <X className="size-3" /> {t("common.clear_all")}
              </Button>
            </div>
          )}
          </div>

            {loading ? (
              <ApiLoadingState variant="inline" label={t("audit.loading")} />
            ) : error ? (
              <ApiErrorState error={error} onRetry={retry} variant="inline" />
            ) : total === 0 ? (
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
                  <thead className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-line-1 bg-card/40">
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
                    {events.length === 0 ? (
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
                      events.map((ev) => (
                        <tr
                          key={ev.id}
                          className="border-b border-line-1/60 last:border-b-0 hover:bg-surface-1"
                        >
                          <td className="px-6 py-3 text-muted-foreground text-xs tabular-nums">
                            {formatDateTime(ev.occurredAt)}
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-2">
                              <div className="size-6 rounded-full bg-surface-2 border border-line-1 flex items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground">
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
                            {ev.ipMasked ?? "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                <div className="border-t border-line-1 px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap bg-surface-1">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="audit-page-size"
                      className="text-xs text-muted-foreground whitespace-nowrap"
                    >
                      {t("audit.per_page")}
                    </label>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => v && changePageSize(Number(v))}
                    >
                      <SelectTrigger
                        id="audit-page-size"
                        className="h-8 w-[4.5rem] bg-card/60"
                      >
                        <SelectValue>
                          {(value: string | null) =>
                            (value as string) ?? String(pageSize)
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t("audit.page_of", { page, total: totalPages })}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card/60"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={loading || page <= 1}
                      >
                        <ChevronLeft className="size-3.5" />
                        <span className="hidden sm:inline">
                          {t("audit.prev")}
                        </span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card/60"
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={loading || page >= totalPages}
                      >
                        <span className="hidden sm:inline">
                          {t("audit.next")}
                        </span>
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
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
      <span className="max-w-32 truncate" title={label}>
        {label}
      </span>
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
