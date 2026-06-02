"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  KeyRound,
  Send,
  TrendingUp,
  ArrowUpRight,
  ShieldCheck,
  Activity,
  Sparkles,
  MoreHorizontal,
  Pencil,
  Lock,
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/icon";
import { NewItemDialog } from "@/components/vault/new-item-dialog";
import { NewVaultDialog } from "@/components/vault/new-vault-dialog";
import { EditVaultDialog } from "@/components/vault/edit-vault-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ApiErrorState,
  VaultGridSkeleton,
} from "@/components/shared/api-states";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import {
  canEditItemRole,
  canViewAuditLog,
  canWriteVaultData,
} from "@/lib/auth/permissions";
import { useVaults } from "@/lib/vaults/provider";
import type { VaultSummary } from "@/lib/api/types";
import { VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import { listSends } from "@/lib/api/sends";
import { listMembers } from "@/lib/api/members";
import { listAudit, type AuditEvent } from "@/lib/api/audit";
import {
  listWorkspaceVaults,
  type WorkspaceVault,
} from "@/lib/api/workspaces";
import { formatAuditLabel } from "@/lib/audit-format";
import { timeAgo } from "@/lib/format";

export default function DashboardPage() {
  const t = useT();
  const { user, me } = useAuth();
  const { vaults, status, error, refresh } = useVaults();
  // Guests are read-only: hide every create/edit affordance on the dashboard.
  const canWrite = canWriteVaultData(me?.role ?? null);
  // Creating an item needs a vault where the caller is manager|editor (the
  // `user` vault role is use-only). Hide "New item" when no such vault exists.
  const canCreateItem = canWrite && vaults.some((v) => canEditItemRole(v.role));
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newVaultOpen, setNewVaultOpen] = useState(false);
  const [editVault, setEditVault] = useState<VaultSummary | null>(null);

  const totalItems = vaults.reduce((sum, v) => sum + v.itemCount, 0);
  const firstName =
    user?.displayName?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "";

  // Real dashboard data (replaces the old mock sends/audit + hardcoded stats).
  // The audit log is admin-only, so the recent-activity card + audit stat only
  // load for owner/admin/auditor; sends + member counts load for everyone.
  const canViewAudit = canViewAuditLog(me?.role ?? null);
  const [activeSendCount, setActiveSendCount] = useState<number | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<AuditEvent[] | null>(null);
  const [auditHasMore, setAuditHasMore] = useState(false);
  // Vaults that exist in the workspace but the caller isn't a member of —
  // owner/admin only (the "Workspace's vaults" inventory; not openable).
  const [workspaceVaults, setWorkspaceVaults] = useState<WorkspaceVault[] | null>(
    null,
  );

  const loadData = useCallback(async (signal?: AbortSignal) => {
    const [sendsRes, membersRes, auditRes, wsVaultsRes] =
      await Promise.allSettled([
        listSends(signal),
        listMembers(signal),
        canViewAudit ? listAudit({ limit: 50 }, signal) : Promise.resolve(null),
        canViewAudit ? listWorkspaceVaults(signal) : Promise.resolve(null),
      ]);
    if (signal?.aborted) return;
    if (sendsRes.status === "fulfilled") {
      setActiveSendCount(
        sendsRes.value.filter((s) => s.status === "active").length,
      );
    }
    if (membersRes.status === "fulfilled") {
      setMemberCount(membersRes.value.members.length);
    }
    if (auditRes.status === "fulfilled" && auditRes.value) {
      setRecentActivity(auditRes.value.events);
      setAuditHasMore(auditRes.value.nextCursor !== null);
    }
    if (wsVaultsRes.status === "fulfilled" && wsVaultsRes.value) {
      setWorkspaceVaults(wsVaultsRes.value);
    }
  }, [canViewAudit]);

  useEffect(() => {
    const ctrl = new AbortController();
    void loadData(ctrl.signal);
    return () => ctrl.abort();
  }, [loadData]);

  // Recover on unlock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => void loadData();
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [loadData]);

  const sendsStat = activeSendCount === null ? "—" : activeSendCount;
  const membersStat = memberCount === null ? "—" : memberCount;
  const auditStat =
    !canViewAudit || recentActivity === null
      ? "—"
      : auditHasMore
        ? `${recentActivity.length}+`
        : `${recentActivity.length}`;
  const latestActivityWhen = recentActivity?.[0]?.occurredAt ?? null;

  return (
    <>
      <Topbar
        title={t("dash.title")}
        subtitle={t("dash.subtitle")}
        actions={
          canCreateItem ? (
            <Button
              size="sm"
              onClick={() => setNewItemOpen(true)}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Plus className="size-3.5" /> {t("dash.new_item")}
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-10 space-y-10">
          {/* Hero greeting */}
          <section className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border border-line-2 bg-surface-1 uppercase tracking-wider text-muted-foreground mb-3">
              <Sparkles className="size-2.5 text-brand" />
              <span>{t("welcome.pre_release")}</span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-gradient">
              {t("dash.greeting", { name: firstName })}
            </h2>
            {latestActivityWhen && (
              <p className="text-muted-foreground text-sm">
                {memberCount !== null
                  ? t("dash.activity_caption", {
                      when: timeAgo(latestActivityWhen),
                      n: memberCount,
                    })
                  : t("dash.activity_caption_simple", {
                      when: timeAgo(latestActivityWhen),
                    })}
              </p>
            )}
          </section>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label={t("dash.stat.total")}
              value={status === "ready" ? totalItems : "—"}
              hint={t("dash.stat.total_hint")}
              icon={KeyRound}
            />
            <StatCard
              label={t("dash.stat.sends")}
              value={sendsStat}
              hint={t("dash.stat.sends_hint")}
              icon={Send}
              accent
            />
            <StatCard
              label={t("dash.stat.members")}
              value={membersStat}
              hint={t("dash.stat.members_hint")}
              icon={TrendingUp}
            />
            <StatCard
              label={t("dash.stat.audit")}
              value={auditStat}
              hint={t("dash.stat.audit_hint")}
              icon={Activity}
            />
          </div>

          {/* Vaults grid */}
          <section>
            <SectionHeader title={t("dash.your_vaults")} />

            {status === "loading" && <VaultGridSkeleton cards={6} />}

            {status === "error" && error && (
              <ApiErrorState error={error} onRetry={() => void refresh()} />
            )}

            {status === "ready" && vaults.length === 0 && (
              <VaultsEmptyState
                canCreate={canWrite}
                onCreate={() => setNewVaultOpen(true)}
              />
            )}

            {status === "ready" && vaults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {vaults.map((v) => {
                  const canManage = v.role === "manager" && canWrite;
                  return (
                    <div
                      key={v.id}
                      className="group relative rounded-2xl border border-border bg-card card-elevated shadow-card hover:border-line-3 hover:bg-surface-1 transition-all h-full"
                    >
                      <Link
                        href={`/app/vault/${v.id}`}
                        className="block p-5"
                      >
                        <div className="flex items-start gap-3 mb-4">
                          <IconTile
                            name={v.iconKey ?? "folder"}
                            color={v.color ?? "violet"}
                            size="lg"
                            withGlow
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 pr-12">
                              <h3 className="font-semibold truncate tracking-tight text-[15px]">
                                {v.name}
                              </h3>
                              {v.encryptionVersion >= 2 && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] h-4 px-1.5 font-medium border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                >
                                  <ShieldCheck className="size-2.5" /> ZK
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {v.description ?? ""}
                            </p>
                          </div>
                          <ArrowUpRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-line-1">
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="tabular-nums font-medium">
                              {t("vault.items_count", { n: v.itemCount })}
                            </span>
                            <span className="text-border">·</span>
                            <span className="tabular-nums">
                              {t("vault.grants_count", { n: v.memberCount })}
                            </span>
                          </div>
                          <MemberStack count={v.memberCount} />
                        </div>
                      </Link>
                      {canManage && (
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label={t("common.more")}
                                  title={t("common.more")}
                                  className="size-7 rounded-md bg-surface-1/80 hover:bg-surface-3 border border-line-1 text-muted-foreground hover:text-foreground flex items-center justify-center backdrop-blur"
                                />
                              }
                            >
                              <MoreHorizontal className="size-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuGroup>
                                <DropdownMenuItem
                                  onClick={() => setEditVault(v)}
                                >
                                  <Pencil className="size-3.5" />
                                  {t("vault.edit.button")}
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  );
                })}

                {canWrite && (
                  <button
                    onClick={() => setNewVaultOpen(true)}
                    className="group rounded-2xl border border-dashed border-border bg-transparent hover:bg-surface-1 hover:border-line-3 p-5 text-muted-foreground hover:text-foreground transition-all flex flex-col items-center justify-center gap-2 min-h-[140px]"
                  >
                    <div className="size-10 rounded-xl border border-dashed border-line-3 flex items-center justify-center group-hover:border-brand/40 group-hover:bg-brand/5 transition-colors">
                      <Plus className="size-4" />
                    </div>
                    <span className="text-sm font-medium">
                      {t("nav.new_vault")}
                    </span>
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Workspace's vaults — owner/admin/auditor only: vaults that exist in the
              workspace the caller is NOT a member of. Inventory visibility only;
              these are NOT openable (the backend keeps items membership-gated). */}
          {canViewAudit && workspaceVaults && workspaceVaults.length > 0 && (
            <section>
              <SectionHeader title={t("dash.workspace_vaults")} />
              <p className="text-xs text-muted-foreground -mt-2 mb-3">
                {t("dash.workspace_vaults_hint")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {workspaceVaults.map((v) => (
                  <div
                    key={v.id}
                    className="relative rounded-2xl border border-border bg-surface-1/50 p-5 h-full"
                    title={t("dash.workspace_vaults_locked")}
                  >
                    <div className="flex items-start gap-3 mb-4">
                      <IconTile
                        name={v.iconKey ?? "folder"}
                        color={v.color ?? "violet"}
                        size="lg"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 pr-6">
                          <h3 className="font-semibold truncate tracking-tight text-[15px] text-foreground/80">
                            {v.name}
                          </h3>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {v.description ?? ""}
                        </p>
                      </div>
                      <Lock className="size-3.5 text-muted-foreground shrink-0" />
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-line-1">
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="tabular-nums font-medium">
                          {t("vault.items_count", { n: v.itemCount })}
                        </span>
                        <span className="text-border">·</span>
                        <span className="tabular-nums">
                          {t("dash.member_count", { n: v.memberCount })}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[9px] h-4 px-1.5 font-medium border-line-2 bg-surface-1 text-muted-foreground"
                      >
                        {t("dash.not_a_member")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent activity — admin/auditor only (the audit log is restricted; the
              backend 403s others, so members/guests never see this card). */}
          {canViewAudit && (
            <section>
              <SectionHeader
                title={t("dash.recent_activity")}
                href="/app/audit"
              />
              <div className="rounded-2xl border border-border bg-card card-elevated shadow-card divide-y divide-border overflow-hidden">
                {recentActivity === null ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t("audit.loading")}
                  </div>
                ) : recentActivity.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t("audit.empty_title")}
                  </div>
                ) : (
                  recentActivity.slice(0, 5).map((ev) => {
                    const who = ev.actorEmail ?? t("audit.unknown_actor");
                    const initials =
                      who
                        .split(/[\s@.]+/)
                        .map((p) => p[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "?";
                    return (
                      <div
                        key={ev.id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div className="size-7 rounded-full bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-line-1 flex items-center justify-center text-[10px] font-semibold shrink-0">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0 text-sm">
                          <span className="font-medium">{who}</span>{" "}
                          <span className="text-muted-foreground">
                            {formatAuditLabel(ev, t)}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {timeAgo(ev.occurredAt)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <NewItemDialog open={newItemOpen} onOpenChange={setNewItemOpen} />
      <NewVaultDialog open={newVaultOpen} onOpenChange={setNewVaultOpen} />
      {editVault && (
        <EditVaultDialog
          vault={editVault}
          open={!!editVault}
          onOpenChange={(o) => !o && setEditVault(null)}
        />
      )}
    </>
  );
}

function VaultsEmptyState({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6 rounded-2xl border border-dashed border-line-2 bg-surface-1/40">
      <div className="size-14 rounded-2xl bg-brand/10 ring-1 ring-brand/20 flex items-center justify-center mb-4">
        <ShieldCheck className="size-6 text-brand" />
      </div>
      <h3 className="font-medium mb-1">{t("vaults.empty.title")}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        {t("vaults.empty.desc")}
      </p>
      {canCreate && (
        <Button
          size="sm"
          onClick={onCreate}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-3.5" /> {t("vaults.empty.cta")}
        </Button>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-card card-elevated shadow-card p-4 overflow-hidden">
      {accent && (
        <>
          <div className="absolute -top-8 -right-8 size-24 bg-brand opacity-20 blur-3xl rounded-full" />
          <div className="absolute inset-0 bg-gradient-to-br from-brand/[0.05] to-transparent" />
        </>
      )}
      <div className="flex items-start justify-between mb-3 relative">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
          {label}
        </span>
        <div
          className={`size-7 rounded-lg flex items-center justify-center ${accent ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted-foreground"}`}
        >
          <Icon className="size-3.5" />
        </div>
      </div>
      <div
        className={`text-2xl font-semibold tabular-nums tracking-tight relative ${accent ? "text-brand" : ""}`}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-muted-foreground mt-1 relative">
          {hint}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("dash.view_all")}
        </Link>
      )}
    </div>
  );
}

function MemberStack({ count }: { count: number }) {
  const colors = [
    "from-violet-500 to-fuchsia-500",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-amber-500 to-orange-500",
  ];
  const shown = Math.min(count, 3);
  return (
    <div className="flex -space-x-1.5">
      {Array.from({ length: shown }).map((_, i) => (
        <div
          key={i}
          className={`size-5 rounded-full bg-gradient-to-br ${colors[i % colors.length]} border border-card`}
        />
      ))}
      {count > shown && (
        <div className="size-5 rounded-full bg-surface-2 border border-card flex items-center justify-center text-[8px] text-muted-foreground font-medium">
          +{count - shown}
        </div>
      )}
    </div>
  );
}

