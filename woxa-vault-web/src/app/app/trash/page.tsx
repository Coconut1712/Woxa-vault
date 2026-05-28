"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  RotateCcw,
  Search,
  AlertTriangle,
  Flame,
  Info,
  ShieldCheck,
} from "lucide-react";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconTile } from "@/components/icon";
import { ApiErrorState, ApiLoadingState } from "@/components/shared/api-states";
import {
  listTrash,
  restoreTrashItem,
  purgeTrashItem,
  emptyTrash,
  type TrashItem,
} from "@/lib/api/trash";
import { ApiError, VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import { itemTypeColor, timeAgo, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { useVaults } from "@/lib/vaults/provider";
import { isWorkspaceAdmin } from "@/lib/auth/permissions";

export default function TrashPage() {
  const t = useT();
  const router = useRouter();
  const { status, me } = useAuth();
  const { refresh: refreshVaults } = useVaults();

  // Trash is where permanent delete happens — admin+ only (owner directive).
  // Member/guest who reach it by direct URL are redirected to /app; render a
  // quiet splash until the role is known so trash rows never flash for them.
  const allowed = isWorkspaceAdmin(me?.role ?? null);
  useEffect(() => {
    if (status === "authenticated" && me && !allowed) {
      router.replace("/app");
    }
  }, [status, me, allowed, router]);

  // ---- Data ---------------------------------------------------------------
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ---- UI state -----------------------------------------------------------
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emptyOpen, setEmptyOpen] = useState(false);
  // Per-row permanent-delete confirm targets a single item.
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);
  // Bulk permanent-delete confirm.
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false);
  // Disable action buttons mid-flight to avoid double-submits.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !me || !allowed) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    listTrash(controller.signal)
      .then((rows) => setItems(rows))
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
  }, [status, me, allowed, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Recover on unlock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => reload();
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [reload]);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          !query || item.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [items, query],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((item) => item.id)));
    }
  };

  // ---- Single-row actions -------------------------------------------------
  const handleRestore = useCallback(
    async (item: TrashItem) => {
      setBusy(true);
      try {
        await restoreTrashItem(item.id);
        setItems((prev) => prev.filter((row) => row.id !== item.id));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        toast.success(t("trash.toast.restored"), {
          description: t("trash.toast.restored_desc", { name: item.name }),
        });
        void refreshVaults();
      } catch (err) {
        toast.error(t("trash.toast.restore_failed"), {
          description:
            err instanceof ApiError ? err.message : t("api.error.generic"),
        });
      } finally {
        setBusy(false);
      }
    },
    [t, refreshVaults],
  );

  const handlePurge = useCallback(
    async (item: TrashItem) => {
      setBusy(true);
      try {
        await purgeTrashItem(item.id);
        setItems((prev) => prev.filter((row) => row.id !== item.id));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        toast.success(t("trash.toast.purged"), {
          description: t("trash.toast.purged_desc", { name: item.name }),
        });
        void refreshVaults();
      } catch (err) {
        toast.error(t("trash.toast.purge_failed"), {
          description:
            err instanceof ApiError ? err.message : t("api.error.generic"),
        });
      } finally {
        setBusy(false);
        setPurgeTarget(null);
      }
    },
    [t, refreshVaults],
  );

  // ---- Bulk actions -------------------------------------------------------
  const handleBulkRestore = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => restoreTrashItem(id)),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - ok;
      if (failed === 0) {
        toast.success(t("trash.toast.bulk_restored", { ok }));
      } else {
        toast.warning(
          t("trash.toast.bulk_restored_partial", {
            ok,
            total: results.length,
            failed,
          }),
        );
      }
    } finally {
      setSelected(new Set());
      setBusy(false);
      reload();
      void refreshVaults();
    }
  }, [selected, t, reload, refreshVaults]);

  const handleBulkPurge = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => purgeTrashItem(id)),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - ok;
      if (failed === 0) {
        toast.success(t("trash.toast.bulk_purged", { ok }));
      } else {
        toast.warning(
          t("trash.toast.bulk_purged_partial", {
            ok,
            total: results.length,
            failed,
          }),
        );
      }
    } finally {
      setSelected(new Set());
      setBusy(false);
      setBulkPurgeOpen(false);
      reload();
      void refreshVaults();
    }
  }, [selected, t, reload, refreshVaults]);

  // ---- Empty trash --------------------------------------------------------
  const handleEmpty = useCallback(async () => {
    setBusy(true);
    try {
      const { purged } = await emptyTrash();
      setItems([]);
      setSelected(new Set());
      toast.success(t("trash.toast.emptied"), {
        description: t("trash.toast.emptied_desc", { n: purged }),
      });
      void refreshVaults();
    } catch (err) {
      toast.error(t("trash.toast.empty_failed"), {
        description:
          err instanceof ApiError ? err.message : t("api.error.generic"),
      });
    } finally {
      setBusy(false);
      setEmptyOpen(false);
    }
  }, [t, refreshVaults]);

  if (status !== "authenticated" || !me || !allowed) {
    return <BootSplash label={t("auth.checking_session")} />;
  }

  return (
    <>
      <Topbar
        title={t("trash.title")}
        subtitle={t("trash.subtitle")}
        actions={
          items.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
              onClick={() => setEmptyOpen(true)}
            >
              <Flame className="size-3.5" /> {t("trash.empty_button")}
            </Button>
          ) : undefined
        }
      />

      {/* Empty-all-trash confirm */}
      <Dialog open={emptyOpen} onOpenChange={setEmptyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("trash.confirm.title")}</DialogTitle>
            <DialogDescription>
              {t("trash.confirm.desc", { n: items.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmptyOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              disabled={busy}
              onClick={handleEmpty}
            >
              <Flame className="size-3.5" /> {t("trash.confirm.button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-row permanent-delete confirm */}
      <Dialog
        open={purgeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPurgeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("trash.row_confirm.title")}</DialogTitle>
            <DialogDescription>
              {t("trash.row_confirm.desc", { name: purgeTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              disabled={busy}
              onClick={() => {
                if (purgeTarget) void handlePurge(purgeTarget);
              }}
            >
              <Trash2 className="size-3.5" /> {t("trash.row_confirm.button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk permanent-delete confirm */}
      <Dialog open={bulkPurgeOpen} onOpenChange={setBulkPurgeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("trash.bulk_confirm.title")}</DialogTitle>
            <DialogDescription>
              {t("trash.bulk_confirm.desc", { n: selected.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPurgeOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              disabled={busy}
              onClick={handleBulkPurge}
            >
              <Trash2 className="size-3.5" /> {t("trash.row_confirm.button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8 space-y-4">
          {loading ? (
            <ApiLoadingState />
          ) : error ? (
            <ApiErrorState error={error} onRetry={reload} />
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/[0.08] dark:bg-amber-500/[0.05] border border-amber-500/30 dark:border-amber-500/20">
                <Info className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-800 dark:text-amber-200/90">
                  <strong className="font-semibold">
                    {t("trash.retention_notice_title")}
                  </strong>{" "}
                  {t("trash.retention_notice")}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("trash.search")}
                    className="pl-9 h-9 bg-card/40 border-line-1"
                  />
                </div>
                {selected.size > 0 && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t("trash.selected", { n: selected.size })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={handleBulkRestore}
                    >
                      <RotateCcw className="size-3.5" /> {t("common.restore")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      disabled={busy}
                      onClick={() => setBulkPurgeOpen(true)}
                    >
                      <Trash2 className="size-3.5" /> {t("common.delete")}
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card card-elevated shadow-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-1">
                    <tr>
                      <th className="w-10 px-5 py-3">
                        <Checkbox
                          checked={
                            selected.size === filtered.length &&
                            filtered.length > 0
                          }
                          onCheckedChange={toggleAll}
                          aria-label={t("common.add")}
                        />
                      </th>
                      <th className="text-left font-semibold py-3">
                        {t("trash.col.item")}
                      </th>
                      <th className="text-left font-semibold px-2 py-3">
                        {t("trash.col.from_vault")}
                      </th>
                      <th className="text-left font-semibold px-2 py-3">
                        {t("trash.col.deleted_by")}
                      </th>
                      <th className="text-left font-semibold px-2 py-3">
                        {t("trash.col.purge_in")}
                      </th>
                      <th className="px-5 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => {
                      const daysLeft = Math.max(
                        0,
                        differenceInDays(new Date(item.purgeAt), new Date()),
                      );
                      const urgent = daysLeft < 7;
                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            "border-b border-border/40 last:border-b-0 hover:bg-surface-1",
                            selected.has(item.id) && "bg-surface-1",
                          )}
                        >
                          <td className="px-5 py-3">
                            <Checkbox
                              checked={selected.has(item.id)}
                              onCheckedChange={() => toggle(item.id)}
                            />
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-3">
                              <IconTile
                                type={item.type}
                                color={itemTypeColor[item.type]}
                                size="md"
                                className="opacity-80 dark:opacity-50"
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate text-foreground">
                                  {item.name}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {t(`item.types.${item.type}`)} ·{" "}
                                  {timeAgo(item.deletedAt)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-3">
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 px-1.5 font-normal border-line-1 bg-surface-1"
                            >
                              {item.vaultName}
                            </Badge>
                          </td>
                          <td className="px-2 py-3 text-muted-foreground">
                            {item.deletedBy?.displayName ?? "—"}
                          </td>
                          <td className="px-2 py-3">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-[11px] tabular-nums",
                                urgent
                                  ? "text-rose-400"
                                  : "text-muted-foreground",
                              )}
                            >
                              {urgent && <AlertTriangle className="size-3" />}
                              {t("trash.days_left", { n: daysLeft })}
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              {formatDate(item.purgeAt)}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                aria-label={t("common.restore")}
                                title={t("common.restore")}
                                disabled={busy}
                                className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-emerald-400 disabled:opacity-50"
                                onClick={() => void handleRestore(item)}
                              >
                                <RotateCcw className="size-3.5" />
                              </button>
                              <button
                                aria-label={t("common.delete")}
                                title={t("common.delete")}
                                disabled={busy}
                                className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-rose-400 disabled:opacity-50"
                                onClick={() => setPurgeTarget(item)}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filtered.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {t("trash.no_match")}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

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

function EmptyState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="size-14 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center mb-4">
        <Trash2 className="size-6 text-emerald-400" />
      </div>
      <h3 className="font-medium mb-1">{t("trash.empty.title")}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        {t("trash.empty.desc")}
      </p>
    </div>
  );
}
