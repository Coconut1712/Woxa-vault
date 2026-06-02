"use client";

/**
 * /spaces — post-auth workspace hub. Lands here after a freshly-provisioned
 * user sets their Master Password (/setup-password) OR whenever SessionGuard
 * detects an authenticated user with no workspace. Two jobs:
 *
 *   1. List the workspaces the user belongs to (GET /me/workspaces) — pick one
 *      to enter /app.
 *   2. Create a brand-new workspace (POST /workspace) — the creator becomes its
 *      sole Owner. On success, enter /app.
 *
 * Like /setup-password, this page lives OUTSIDE /app and runs its own auth
 * check, so it is NOT wrapped by SessionGuard. That separation is what keeps
 * the no-workspace → /spaces redirect from looping.
 *
 * Security notes:
 *   - Requires an authenticated session; anonymous users bounce to /.
 *   - Users still owing a Master Password setup are sent to /setup-password
 *     first (the setup wall outranks workspace selection).
 *   - `role` shown per workspace comes straight from the API — it is display
 *     only and never used client-side to gate any sensitive action.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Crown,
  FileSearch,
  Loader2,
  Plus,
  ShieldCheck,
  Users as UsersIcon,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ApiError, NetworkError } from "@/lib/api/client";
import type { OrgRole } from "@/lib/api/members";
import {
  createWorkspace,
  listMyWorkspaces,
  switchWorkspace,
  WORKSPACE_NAME_MAX,
  type MyWorkspace,
} from "@/lib/api/workspaces";
import { useAuth } from "@/lib/auth/provider";
import { useT } from "@/lib/i18n/provider";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Role badge styling — mirrors the members page so badges read consistently. */
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
  auditor: {
    icon: FileSearch,
    color:
      "bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/20",
  },
  guest: {
    icon: UserCog,
    color: "bg-muted text-muted-foreground border-line-1",
  },
};

type ListState =
  | { status: "loading" }
  | { status: "ready"; workspaces: MyWorkspace[] }
  | { status: "error"; error: ApiError };

export default function SpacesPage() {
  const t = useT();
  const router = useRouter();
  const { status, me, refresh } = useAuth();

  const [list, setList] = useState<ListState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [entering, setEntering] = useState<string | null>(null);
  const mounted = useRef(true);

  // Auth-state guards — effect-driven, no router calls in render.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
      return;
    }
    // Master Password setup wall outranks workspace selection.
    if (status === "authenticated" && me?.requiresPasswordSetup) {
      router.replace("/setup-password");
    }
  }, [status, me, router]);

  const loadWorkspaces = useCallback(async () => {
    setList({ status: "loading" });
    try {
      const workspaces = await listMyWorkspaces();
      if (!mounted.current) return;
      setList({ status: "ready", workspaces });
    } catch (err) {
      if (!mounted.current) return;
      const apiErr =
        err instanceof ApiError
          ? err
          : new NetworkError(
              err instanceof Error ? err.message : "Failed to load",
            );
      setList({ status: "error", error: apiErr });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (status === "authenticated" && me && !me.requiresPasswordSetup) {
      void loadWorkspaces();
    }
    return () => {
      mounted.current = false;
    };
  }, [status, me, loadWorkspaces]);

  const trimmed = name.trim();
  const nameTooLong = trimmed.length > WORKSPACE_NAME_MAX;
  const nameEmpty = trimmed.length === 0;
  const nameInvalid = nameEmpty || nameTooLong;

  const enterWorkspace = async (ws: MyWorkspace) => {
    if (entering) return;
    setEntering(ws.id);
    try {
      // Set the ACTIVE workspace server-side BEFORE navigating so /app loads
      // org-scoped data (vaults/members/settings) for the chosen workspace.
      // The client only sends the id — the backend re-validates membership.
      await switchWorkspace(ws.id);
      // Pull a fresh /me so guards + chrome see the new activeOrgId/role.
      await refresh();
      if (!mounted.current) return;
      router.replace("/app");
    } catch (err) {
      if (!mounted.current) return;
      setEntering(null);
      if (err instanceof ApiError) {
        if (err.code === "not_found" || err.status === 404) {
          toast.error(t("workspace_switcher.error.no_access"));
          // Membership likely changed under us — re-pull the list so the stale
          // row disappears rather than letting the user retry a dead workspace.
          void loadWorkspaces();
          return;
        }
        if (err.code === "rate_limited" || err.status === 429) {
          toast.error(t("workspace_switcher.error.rate_limited"));
          return;
        }
      }
      toast.error(t("workspace_switcher.error.generic"));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setTouched(true);
    setCreateError(null);
    if (nameInvalid) return;
    setSubmitting(true);
    try {
      await createWorkspace({ name: trimmed });
      // Refresh the cached /me profile BEFORE navigating: the new membership
      // flips `hasWorkspace` to true, so SessionGuard won't bounce us straight
      // back to /spaces (stale `hasWorkspace: false` was the cause of the
      // "can't enter the workspace after creating it" loop).
      await refresh();
      if (!mounted.current) return;
      toast.success(t("spaces.create.success_toast"));
      router.replace("/app");
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError) {
        if (err.code === "workspace_name_taken" || err.status === 409) {
          setCreateError(t("spaces.create.error.name_taken"));
          setSubmitting(false);
          return;
        }
        if (err.code === "validation_error" || err.status === 400) {
          setCreateError(
            t("spaces.create.error.invalid_name", { max: WORKSPACE_NAME_MAX }),
          );
          setSubmitting(false);
          return;
        }
        if (err.code === "rate_limited" || err.status === 429) {
          setCreateError(t("spaces.create.error.rate_limited"));
          setSubmitting(false);
          return;
        }
      }
      setCreateError(t("spaces.create.error.generic"));
      setSubmitting(false);
    }
  };

  // Quiet splash while AuthProvider boots OR while we're about to redirect.
  if (status !== "authenticated" || !me || me.requiresPasswordSetup) {
    return <BootSplash label={t("auth.checking_session")} />;
  }

  const hasWorkspaces =
    list.status === "ready" && list.workspaces.length > 0;

  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-[480px] rounded-full bg-[#6366f1] opacity-[0.10] blur-[120px]" />
        <div className="absolute bottom-0 -right-32 size-[480px] rounded-full bg-[#a855f7] opacity-[0.06] blur-[120px]" />
      </div>

      <div className="w-full max-w-lg relative py-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="size-8 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
            <ShieldCheck className="size-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">Woxa Vault</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight mb-1.5">
          {t("spaces.title")}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {t("spaces.subtitle")}
        </p>

        {/* Joined workspaces */}
        <section aria-labelledby="spaces-joined-heading">
          <h2
            id="spaces-joined-heading"
            className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3"
          >
            {t("spaces.joined_heading")}
          </h2>

          {list.status === "loading" && <WorkspaceListSkeleton />}

          {list.status === "error" && (
            <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-6 flex flex-col items-center text-center gap-3">
              <div className="size-12 rounded-2xl bg-rose-500/[0.06] dark:bg-rose-500/[0.02] ring-1 ring-rose-500/30 dark:ring-rose-500/10 flex items-center justify-center">
                <AlertCircle className="size-5 text-rose-700 dark:text-rose-300" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("spaces.load_error")}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadWorkspaces()}
              >
                {t("api.retry")}
              </Button>
            </div>
          )}

          {list.status === "ready" && !hasWorkspaces && !creating && (
            <EmptyState onCreate={() => setCreating(true)} />
          )}

          {hasWorkspaces && list.status === "ready" && (
            <ul className="space-y-2.5">
              {list.workspaces.map((ws) => (
                <li key={ws.id}>
                  <WorkspaceRow
                    workspace={ws}
                    busy={entering === ws.id}
                    disabled={entering !== null && entering !== ws.id}
                    onEnter={() => void enterWorkspace(ws)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Create new workspace */}
        {(hasWorkspaces || creating || list.status === "error") && (
          <section aria-labelledby="spaces-create-heading" className="mt-8">
            <h2
              id="spaces-create-heading"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3"
            >
              {t("spaces.create_heading")}
            </h2>

            <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-5">
              <form onSubmit={handleCreate} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="workspace-name">
                    {t("spaces.create.name_label")}
                  </Label>
                  <Input
                    id="workspace-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setTouched(true)}
                    placeholder={t("spaces.create.name_placeholder")}
                    maxLength={WORKSPACE_NAME_MAX}
                    autoComplete="off"
                    aria-invalid={
                      touched && nameInvalid ? true : undefined
                    }
                    className="h-11"
                  />
                  {touched && nameEmpty && (
                    <p
                      role="alert"
                      className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300"
                    >
                      <AlertCircle className="size-3.5 shrink-0" />
                      {t("spaces.create.error.required")}
                    </p>
                  )}
                </div>

                {/* Owner notice */}
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/[0.06] dark:bg-amber-500/[0.03] px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                  <Crown className="size-3.5 mt-0.5 shrink-0" />
                  <span>{t("spaces.create.owner_notice")}</span>
                </div>

                {createError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
                  >
                    <AlertCircle className="size-4 mt-0.5 shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={submitting || nameInvalid}
                  className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("spaces.create.submitting")}
                    </>
                  ) : (
                    <>
                      <Plus className="size-4" />
                      {t("spaces.create.submit")}
                    </>
                  )}
                </Button>
              </form>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function WorkspaceRow({
  workspace,
  busy,
  disabled,
  onEnter,
}: {
  workspace: MyWorkspace;
  busy: boolean;
  disabled: boolean;
  onEnter: () => void;
}) {
  const t = useT();
  const role = roleIconColor[workspace.role] ?? roleIconColor.member;
  const initial = (workspace.name || workspace.slug || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={onEnter}
      disabled={busy || disabled}
      className={cn(
        "group w-full flex items-center gap-3 rounded-2xl border border-border bg-card card-elevated shadow-card px-4 py-3.5 text-left transition-colors",
        "hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
        (busy || disabled) && "opacity-60 pointer-events-none",
      )}
      aria-label={t("spaces.enter_aria", { name: workspace.name })}
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 dark:bg-violet-500/10 ring-1 ring-violet-500/30 dark:ring-violet-500/20 text-base font-semibold uppercase text-violet-600 dark:text-violet-400">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">
            {workspace.name}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[10px] gap-1 shrink-0", role.color)}
          >
            <role.icon className="size-2.5" />
            {t(`members.role.${workspace.role}`)}
          </Badge>
        </div>
        <div className="truncate text-xs text-muted-foreground mt-0.5">
          {t("spaces.workspace_meta", {
            slug: workspace.slug,
            count: workspace.memberCount,
          })}
          {workspace.joinedAt && (
            <>
              {" · "}
              {t("spaces.joined_on", {
                date: formatDate(workspace.joinedAt),
              })}
            </>
          )}
        </div>
      </div>
      {busy ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-dashed border-line-2 bg-surface-1/50 px-6 py-10 flex flex-col items-center text-center gap-3">
      <div className="size-14 rounded-2xl bg-violet-500/15 dark:bg-violet-500/10 ring-1 ring-violet-500/30 dark:ring-violet-500/20 flex items-center justify-center">
        <Building2 className="size-6 text-violet-600 dark:text-violet-400" />
      </div>
      <div>
        <h3 className="font-medium text-sm mb-1">{t("spaces.empty.title")}</h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          {t("spaces.empty.desc")}
        </p>
      </div>
      <Button
        onClick={onCreate}
        className="h-10 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
      >
        <Plus className="size-4" /> {t("spaces.empty.cta")}
      </Button>
    </div>
  );
}

function WorkspaceListSkeleton() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card card-elevated shadow-card px-4 py-3.5 animate-pulse"
        >
          <div className="size-11 rounded-xl bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-36 rounded bg-surface-2" />
            <div className="h-2.5 w-48 rounded bg-surface-2/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BootSplash({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
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
