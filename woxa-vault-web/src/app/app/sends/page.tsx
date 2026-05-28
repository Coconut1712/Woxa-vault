"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Send,
  Flame,
  CheckCircle2,
  Clock,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ApiErrorState,
  ApiLoadingState,
} from "@/components/shared/api-states";
import { ApiError, VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import { burnSend, listSends, type SendStatus, type SendSummary } from "@/lib/api/sends";
import { timeAgo, formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { canWriteVaultData } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export default function SendsPage() {
  const t = useT();
  const { me } = useAuth();
  // Guests are read-only: burning a send is a write op (DELETE → 403). Hide it.
  const canWrite = canWriteVaultData(me?.role ?? null);
  const [sends, setSends] = useState<SendSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [burningId, setBurningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSends();
      setSends(list);
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      else setError(new ApiError(0, "network_error", "Network error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Recover on unlock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => void load();
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [load]);

  const handleBurn = async (id: string) => {
    setBurningId(id);
    try {
      await burnSend(id);
      toast.success(t("sends.burned_toast"));
      await load();
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : t("api.error.generic");
      toast.error(t("sends.error.burn_failed"), { description });
    } finally {
      setBurningId(null);
    }
  };

  return (
    <>
      <Topbar
        title={t("sends.title")}
        subtitle={t("sends.subtitle")}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8">
          {loading ? (
            <ApiLoadingState />
          ) : error ? (
            <ApiErrorState error={error} onRetry={load} />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <StatCard
                  label={t("sends.stat.active")}
                  value={sends.filter((s) => s.status === "active").length}
                  color="blue"
                />
                <StatCard
                  label={t("sends.stat.burned")}
                  value={sends.filter((s) => s.status === "burned").length}
                  color="orange"
                />
                <StatCard
                  label={t("sends.stat.expired")}
                  value={sends.filter((s) => s.status === "expired").length}
                  color="muted"
                />
              </div>

              <Card className="overflow-hidden p-0">
                <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{t("sends.all")}</h2>
                  <span className="text-xs text-muted-foreground">
                    {t("sends.total_count", { n: sends.length })}
                  </span>
                </div>

                {sends.length === 0 ? (
                  <div className="py-12 text-center px-6">
                    <h3 className="font-medium mb-1">
                      {t("sends.empty.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("sends.empty.desc")}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead className="text-xs text-muted-foreground border-b border-border bg-muted/20">
                      <tr>
                        <th className="text-left font-medium pl-[72px] pr-6 py-3 min-w-[220px]">
                          {t("sends.col.name")}
                        </th>
                        <th className="text-left font-medium px-4 py-3 min-w-[150px]">
                          {t("sends.col.recipient")}
                        </th>
                        <th className="text-center font-medium px-4 py-3 w-[100px]">
                          {t("sends.col.views")}
                        </th>
                        <th className="text-left font-medium px-4 py-3 w-[120px]">
                          {t("sends.col.status")}
                        </th>
                        <th className="text-center font-medium px-4 py-3 w-[180px]">
                          {t("sends.col.expires")}
                        </th>
                        <th className="text-center font-medium px-6 py-3 w-[120px]">
                          {t("sends.col.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {sends.map((s) => (
                        <tr
                          key={s.id}
                          className="group hover:bg-muted/30 transition-colors h-[72px]"
                        >
                          <td className="px-6 py-4 align-middle">
                            <div className="flex items-center gap-3">
                              <div className="size-9 rounded-xl bg-surface-2 border border-line-1 flex items-center justify-center shrink-0 shadow-sm group-hover:bg-card transition-colors">
                                <Send className="size-4 text-muted-foreground" />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono-secret text-sm font-medium tracking-tight text-foreground/90">
                                  {s.tokenHashPreview}
                                </span>
                                {s.hasPassword && (
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                                    <Lock className="size-2.5" />{" "}
                                    <span className="uppercase tracking-wider opacity-70">
                                      {t("sends.passphrase")}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <span className="text-muted-foreground font-medium">
                              {t("sends.anyone_with_link")}
                            </span>
                          </td>
                          <td className="px-4 py-4 align-middle text-center tabular-nums">
                            <div className="flex items-baseline justify-center gap-0.5">
                              <span className="text-sm font-semibold text-foreground">
                                {s.viewCount}
                              </span>
                              <span className="text-xs text-muted-foreground opacity-40">/</span>
                              <span className="text-xs text-muted-foreground font-medium">
                                {s.maxViews}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-middle">
                            <StatusBadge status={s.status} />
                          </td>
                          <td className="px-4 py-4 align-middle text-center">
                            {s.status === "active" ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-semibold text-foreground/80">
                                  {timeAgo(s.expiresAt)}
                                </span>
                                <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                                  {formatDateTime(s.expiresAt)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-muted-foreground/40 italic">
                                {s.status === "burned"
                                  ? t("sends.status.burned")
                                  : t("sends.status.expired")}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 align-middle text-center">
                            {s.status === "active" && canWrite && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleBurn(s.id)}
                                disabled={burningId === s.id}
                                className="h-8 text-xs font-semibold gap-1.5 text-rose-600 dark:text-rose-400 hover:text-white hover:bg-rose-600 dark:hover:bg-rose-500 transition-all rounded-lg px-3"
                              >
                                {burningId === s.id ? (
                                  <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Flame className="size-3.5" />
                                )}
                                {t("sends.action.burn_now")}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "orange" | "muted";
}) {
  const colors = {
    blue: "text-blue-600",
    orange: "text-orange-600",
    muted: "text-muted-foreground",
  };
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${colors[color]}`}>
        {value}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: SendStatus }) {
  const t = useT();
  if (status === "active") {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
        <Clock className="size-3" /> {t("sends.status.active")}
      </Badge>
    );
  }
  if (status === "burned") {
    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
        <Flame className="size-3" /> {t("sends.status.burned")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <CheckCircle2 className="size-3" /> {t("sends.status.expired")}
    </Badge>
  );
}
