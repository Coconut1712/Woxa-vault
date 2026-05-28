"use client";

/**
 * WorkspaceSwitcher — the active-workspace control in the /app sidebar.
 *
 * Responsibilities:
 *   - Show the CURRENT (active) workspace: avatar initial + name + the signed-in
 *     workspace slug as a subtitle. The active workspace is resolved from
 *     `me.activeOrgId`
 *     (preferred) and falls back to the single membership / name match when an
 *     older backend omits the field.
 *   - Open a dropdown listing EVERY workspace the user belongs to
 *     (GET /me/workspaces). The active row is marked with a check + "Current"
 *     pill; each row carries a small role badge. Workspaces that share a name
 *     ("Woxa Corp" appears twice in the data) are disambiguated by a secondary
 *     line showing `{slug} · {count} members`.
 *   - Switching: POST /workspace/switch (client sends only the id — the backend
 *     re-validates membership and returns the authoritative role), then
 *     refresh /me and `router.refresh()` so org-scoped surfaces reload for the
 *     new active org and never show the previous workspace's contents.
 *   - Footer link to /spaces ("Manage workspaces") and workspace settings
 *     (owner/admin). Sign out lives on the sidebar user card only.
 *
 * SECURITY: the client never trusts its own role/selection for gating — it only
 * names the org to switch to; the server is the source of truth.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronDown,
  Crown,
  Loader2,
  Settings,
  ShieldCheck,
  UserCog,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import type { OrgRole } from "@/lib/api/members";
import {
  listMyWorkspaces,
  switchWorkspace,
  type MyWorkspace,
} from "@/lib/api/workspaces";
import { useAuth } from "@/lib/auth/provider";
import { canViewWorkspaceSettings } from "@/lib/auth/permissions";
import { useT } from "@/lib/i18n/provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

/** Role badge styling — mirrors the /spaces + members pages for consistency. */
const roleIconColor: Record<
  OrgRole,
  { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  owner: {
    icon: Crown,
    color:
      "bg-amber-500/15 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/20",
  },
  admin: {
    icon: ShieldCheck,
    color:
      "bg-violet-500/15 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30 dark:border-violet-500/20",
  },
  member: {
    icon: UsersIcon,
    color:
      "bg-blue-500/15 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30 dark:border-blue-500/20",
  },
  guest: {
    icon: UserCog,
    color: "bg-muted text-muted-foreground border-line-1",
  },
};

function initialOf(s: string): string {
  return (s || "?").trim().charAt(0).toUpperCase() || "?";
}

type ListState =
  | { status: "loading" }
  | { status: "ready"; workspaces: MyWorkspace[] }
  | { status: "error" };

export function WorkspaceSwitcher() {
  const t = useT();
  const router = useRouter();
  const { me, refresh } = useAuth();

  const [list, setList] = useState<ListState>({ status: "loading" });
  const [switching, setSwitching] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setList({ status: "loading" });
    try {
      const workspaces = await listMyWorkspaces();
      if (!mounted.current) return;
      setList({ status: "ready", workspaces });
    } catch {
      if (!mounted.current) return;
      setList({ status: "error" });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const workspaces = list.status === "ready" ? list.workspaces : [];

  // Resolve the active workspace. Prefer the explicit activeOrgId; fall back to
  // the single membership when an older backend omits the field, then to the
  // name match so the chrome never renders blank.
  const activeOrgId = me?.activeOrgId ?? undefined;
  const active =
    (activeOrgId
      ? workspaces.find((ws) => ws.id === activeOrgId)
      : undefined) ??
    (workspaces.length === 1 ? workspaces[0] : undefined);

  // Detect duplicate names so we can always show a disambiguating sub-line for
  // those rows even when space is tight.
  const nameCounts = new Map<string, number>();
  for (const ws of workspaces) {
    const key = ws.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const triggerName = active?.name ?? t("workspace_switcher.no_workspace");
  const triggerInitial = initialOf(triggerName);
  const showWorkspaceSettings = canViewWorkspaceSettings(me?.role ?? null);

  const handleSwitch = async (ws: MyWorkspace) => {
    if (switching) return;
    // No-op when selecting the already-active workspace.
    if (active && ws.id === active.id) return;
    setSwitching(ws.id);
    try {
      await switchWorkspace(ws.id);
      // Refresh /me so chrome (this switcher, role badges) reflects the new
      // active org, then router.refresh() to re-run server data fetches for
      // the org-scoped /app surfaces (vaults/members/settings) — no stale data.
      await refresh();
      if (!mounted.current) return;
      toast.success(t("workspace_switcher.switched_toast", { name: ws.name }));
      router.refresh();
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError) {
        if (err.code === "not_found" || err.status === 404) {
          toast.error(t("workspace_switcher.error.no_access"));
          void load();
          return;
        }
        if (err.code === "rate_limited" || err.status === 429) {
          toast.error(t("workspace_switcher.error.rate_limited"));
          return;
        }
      }
      toast.error(t("workspace_switcher.error.generic"));
    } finally {
      if (mounted.current) setSwitching(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t("workspace_switcher.label")}
            className="flex items-center gap-2.5 px-2.5 py-2 mx-2 mt-3 rounded-lg hover:bg-sidebar-accent text-left w-[calc(100%-1rem)] group transition-colors"
          />
        }
      >
        <div className="size-7 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center font-bold text-[11px] shadow-[0_2px_8px_rgb(139_92_246/0.35)] shrink-0">
          {triggerInitial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate leading-tight">
            {triggerName}
          </div>
          {active && (
            <div className="text-[11px] text-muted-foreground truncate leading-tight">
              {active.slug}
            </div>
          )}
        </div>
        {switching ? (
          <Loader2 className="size-3.5 text-muted-foreground animate-spin shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("workspace_switcher.heading")}
          </DropdownMenuLabel>

          {list.status === "loading" && (
            <div className="px-1.5 py-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t("api.loading")}
            </div>
          )}

          {list.status === "error" && (
            <div className="px-1.5 py-2 text-xs text-muted-foreground">
              {t("workspace_switcher.load_error")}
            </div>
          )}

          {list.status === "ready" &&
            workspaces.map((ws) => {
              const isActive = active?.id === ws.id;
              const isBusy = switching === ws.id;
              const role = roleIconColor[ws.role] ?? roleIconColor.member;
              const isDup =
                (nameCounts.get(ws.name.trim().toLowerCase()) ?? 0) > 1;
              return (
                <DropdownMenuItem
                  key={ws.id}
                  disabled={switching !== null}
                  onClick={() => void handleSwitch(ws)}
                  className="items-start gap-2 py-1.5"
                >
                  <div className="size-6 mt-0.5 rounded-md bg-violet-500/15 dark:bg-violet-500/10 ring-1 ring-violet-500/30 dark:ring-violet-500/20 text-[10px] font-semibold uppercase text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                    {initialOf(ws.name || ws.slug)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {ws.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] gap-0.5 px-1 py-0 shrink-0",
                          role.color,
                        )}
                      >
                        <role.icon className="size-2" />
                        {t(`members.role.${ws.role}`)}
                      </Badge>
                    </div>
                    {isDup && (
                      <div className="truncate text-[10px] text-muted-foreground mt-0.5">
                        {ws.slug}
                        {" · "}
                        {t("workspace_switcher.member_count", {
                          count: ws.memberCount,
                        })}
                      </div>
                    )}
                  </div>
                  {isBusy ? (
                    <Loader2 className="size-3.5 mt-1 shrink-0 animate-spin text-muted-foreground" />
                  ) : isActive ? (
                    <Check className="size-3.5 mt-1 shrink-0 text-brand" />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/spaces" />}>
            <Building2 className="size-4" />
            {t("workspace_switcher.manage")}
          </DropdownMenuItem>
          {showWorkspaceSettings && (
            <DropdownMenuItem render={<Link href="/app/settings" />}>
              <Settings className="size-4" />
              {t("nav.workspace_settings")}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
