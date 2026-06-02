"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Filter,
  Mail,
  ShieldCheck,
  Crown,
  Users as UsersIcon,
  UserCog,
  FileSearch,
  Download,
  Clock,
  Trash2,
  Send,
  MoreHorizontal,
  Copy,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ApiErrorState,
  ApiLoadingState,
} from "@/components/shared/api-states";
import {
  inviteMember,
  listMembers,
  removeMember,
  resendInvite,
  revokeInvite,
  updateMemberRole,
  type Invitation,
  type InviteRole,
  type OrgMember,
  type OrgRole,
} from "@/lib/api/members";
import { ApiError, VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/provider";
import { colorFor } from "@/components/icon";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ColorKey } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";

/**
 * RBAC role hierarchy. Mirrors the backend's rank ordering so the client only
 * surfaces actions the actor is actually permitted to take. This is a UX gate
 * ONLY — the backend enforces the same rule and returns 403 for any request
 * that slips through (e.g. role unknown while /auth/me races).
 */
const ROLE_RANK: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  auditor: 2,
  member: 1,
  guest: 0,
};

/** True when `actor` is strictly above `target` in the role hierarchy. */
function outranks(actor: OrgRole, target: OrgRole): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

/**
 * Roles an actor may assign — every role strictly below their own, excluding
 * `owner` (never granted via PATCH/invite; ownership moves via transfer only).
 *   owner → [admin, auditor, member, guest]
 *   admin → [auditor, member, guest]
 *   member/guest → [] (can't manage anyone)
 */
function assignableRoles(actor: OrgRole | null): InviteRole[] {
  if (!actor) return [];
  return (["admin", "auditor", "member", "guest"] as InviteRole[]).filter(
    (role) => outranks(actor, role),
  );
}

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
  auditor: {
    icon: FileSearch,
    color:
      "bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/20",
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

const AVATAR_COLORS: ColorKey[] = [
  "violet",
  "blue",
  "emerald",
  "amber",
  "rose",
  "fuchsia",
  "cyan",
  "indigo",
];

function pickAvatarColor(seed: string): ColorKey {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

/**
 * Drives the success modal. Email was confirmed delivered → we don't show any
 * acceptUrl even if the backend returns one in dev. When delivery fell back to
 * "share the link manually" we display the acceptUrl in the dialog. When the
 * transport itself errored without a fallback URL we offer a "retry send"
 * action instead of a copy-able link.
 */
interface InviteSuccessState {
  invitation: Invitation;
  emailSent: boolean;
  emailError?: string;
  acceptUrl?: string;
}

export default function MembersPage() {
  const t = useT();
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [activeRole, setActiveRole] = useState<OrgRole | "all">("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSuccess, setInviteSuccess] =
    useState<InviteSuccessState | null>(null);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<ApiError | null>(null);

  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const [pendingRemoval, setPendingRemoval] = useState<OrgMember | null>(null);
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    member: OrgMember;
    nextRole: InviteRole;
  } | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setStatus((prev) => (prev === "ready" ? "ready" : "loading"));
    setError(null);
    try {
      const res = await listMembers(signal);
      if (signal?.aborted) return;
      setMembers(res.members);
      setInvitations(res.invitations);
      setStatus("ready");
    } catch (err) {
      if (signal?.aborted) return;
      const apiErr =
        err instanceof ApiError
          ? err
          : new ApiError(0, "network_error", "Network error");
      setError(apiErr);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void refresh(ctrl.signal);
    return () => ctrl.abort();
  }, [refresh]);

  // Recover on unlock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => void refresh();
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [refresh]);

  // Derive the current user's role to drive RBAC affordances.
  const currentRole: OrgRole | null = useMemo(() => {
    if (!user) return null;
    return members.find((m) => m.userId === user.id)?.role ?? null;
  }, [user, members]);

  const canManage = currentRole === "owner" || currentRole === "admin";
  // Roles the current actor is allowed to assign — owner gets admin/member/guest,
  // admin gets member/guest. Drives both the row menu and the invite dialog so
  // we never show an option the backend would reject with 403.
  const assignable = useMemo(
    () => assignableRoles(currentRole),
    [currentRole],
  );
  // Invite button visibility is fail-open: we always render it so users can
  // find the action. When the current role is `member` or `guest` we disable
  // the button with a tooltip; when the role is unknown (null — race with
  // /auth/me or org_members row not yet provisioned) we keep it enabled and
  // let the backend enforce 403 if the caller actually lacks permission.
  const inviteDisabledReason =
    currentRole === "auditor" || currentRole === "member" || currentRole === "guest"
      ? t("members.invite.only_admin_tooltip")
      : undefined;
  const inviteDisabled = inviteDisabledReason !== undefined;

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (activeRole !== "all" && m.role !== activeRole) return false;
      if (query) {
        const q = query.toLowerCase();
        const name = (m.displayName || m.name || "").toLowerCase();
        if (!name.includes(q) && !m.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [members, activeRole, query]);

  const pending = useMemo(
    () => invitations.filter((i) => i.status === "pending"),
    [invitations],
  );

  const activeCount = members.filter((m) => m.status === "active").length;

  const handleRoleChange = async (member: OrgMember, nextRole: InviteRole) => {
    if (nextRole === member.role) return;
    setBusyMemberId(member.userId);
    try {
      await updateMemberRole(member.userId, nextRole);
      toast.success(t("members.toast.role_updated"), {
        description: member.email,
      });
      await refresh();
    } catch (err) {
      toast.error(t("members.error.role_update_failed"), {
        description: mapMemberError(err, t),
      });
    } finally {
      setBusyMemberId(null);
      setPendingRoleChange(null);
    }
  };

  const handleRemove = async (member: OrgMember) => {
    setBusyMemberId(member.userId);
    try {
      await removeMember(member.userId);
      toast.success(t("members.toast.removed"), { description: member.email });
      await refresh();
    } catch (err) {
      toast.error(t("members.error.remove_failed"), {
        description: mapMemberError(err, t),
      });
    } finally {
      setBusyMemberId(null);
      setPendingRemoval(null);
    }
  };

  const handleResend = async (inv: Invitation) => {
    setBusyInviteId(inv.id);
    try {
      const res = await resendInvite(inv.id);
      if (res.emailSent) {
        // Happy path: email is on its way. No need to surface acceptUrl —
        // showing it would just nudge the admin to share the link manually
        // even when the user is going to get a perfectly good email.
        toast.success(t("members.invite.emailSent"), { description: inv.email });
      } else if (res.acceptUrl) {
        // Dev/transport fell back to manual sharing. Show the success modal so
        // the admin can copy the link explicitly.
        toast.warning(t("members.invite.emailFailedFallback"), {
          description: res.emailError,
        });
        setInviteSuccess({
          invitation: res.invitation,
          emailSent: false,
          emailError: res.emailError,
          acceptUrl: res.acceptUrl,
        });
      } else {
        // Hard failure with no fallback link — admin can only retry.
        toast.error(t("members.invite.emailFailedNoFallback"), {
          description: res.emailError,
        });
        setInviteSuccess({
          invitation: res.invitation,
          emailSent: false,
          emailError: res.emailError,
        });
      }
      await refresh();
    } catch (err) {
      toast.error(t("members.error.resend_failed"), {
        description: mapMemberError(err, t),
      });
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleRevoke = async (inv: Invitation) => {
    setBusyInviteId(inv.id);
    try {
      await revokeInvite(inv.id);
      toast.success(t("members.toast.revoked"), { description: inv.email });
      await refresh();
    } catch (err) {
      toast.error(t("members.error.revoke_failed"), {
        description: mapMemberError(err, t),
      });
    } finally {
      setBusyInviteId(null);
    }
  };

  if (status === "loading") {
    return (
      <>
        <Topbar title={t("members.title")} />
        <div className="flex-1 overflow-y-auto">
          <ApiLoadingState />
        </div>
      </>
    );
  }

  if (status === "error" && error) {
    return (
      <>
        <Topbar title={t("members.title")} />
        <div className="flex-1 overflow-y-auto">
          <ApiErrorState error={error} onRetry={() => void refresh()} />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={t("members.title")}
        subtitle={t("members.subtitle", {
          active: activeCount,
          pending: pending.length,
        })}
        actions={
          <>
            <Button variant="outline" size="sm" disabled>
              <Download className="size-3.5" /> {t("members.export")}
            </Button>
            <Button
              size="sm"
              onClick={() => setInviteOpen(true)}
              disabled={inviteDisabled}
              title={inviteDisabledReason}
              aria-disabled={inviteDisabled || undefined}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Plus className="size-3.5" /> {t("members.invite")}
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatPill label={t("members.stat.total")} value={activeCount} />
            <StatPill
              label={t("members.stat.admins")}
              value={
                members.filter(
                  (m) => m.role === "admin" || m.role === "owner",
                ).length
              }
            />
            <StatPill
              label={t("members.stat.pending")}
              value={pending.length}
              tone="amber"
            />
            <StatPill
              label={t("common.role")}
              value={
                currentRole ? t(`members.role.${currentRole}`) : "—"
              }
            />
          </div>

          {/* Pending invitations */}
          {pending.length > 0 && (
            <section>
              <div className="rounded-2xl border border-amber-500/40 dark:border-amber-500/20 bg-amber-500/[0.08] dark:bg-amber-500/[0.03] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="size-4 text-amber-600 dark:text-amber-400" />
                  <h3 className="text-sm font-semibold">
                    {t("members.pending")}
                  </h3>
                </div>
                <div className="space-y-2">
                  {pending.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-4 p-3 rounded-lg bg-card/70 dark:bg-surface-1 border border-line-1"
                    >
                      <EmailAvatar email={inv.email} />
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="text-sm font-medium truncate">
                          {inv.email}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {t("members.invitation.sent", {
                            when: timeAgo(inv.lastSentAt),
                          })}
                          {" · "}
                          {t("members.invitation.expires", {
                            when: timeAgo(inv.expiresAt),
                          })}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] h-5 px-2 shrink-0",
                          roleIconColor[inv.role].color,
                        )}
                      >
                        {t(`members.role.${inv.role}`)}
                      </Badge>
                      {canManage ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={t("common.more")}
                            title={t("common.more")}
                            disabled={busyInviteId === inv.id}
                            className="size-8 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0"
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onClick={() => void handleResend(inv)}
                              >
                                <RefreshCw className="size-3.5" />
                                {t("members.actions.resend")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => void handleRevoke(inv)}
                                className="text-rose-700 dark:text-rose-300 focus:text-rose-800 dark:focus:text-rose-200"
                              >
                                <Trash2 className="size-3.5" />
                                {t("members.actions.revoke")}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-64 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("members.search")}
                className="pl-9 h-9 bg-card/40 border-line-1"
              />
            </div>

            <div className="flex gap-1 p-1 bg-card/40 border border-line-1 rounded-lg">
              <FilterPill
                label={t("members.role.all")}
                active={activeRole === "all"}
                onClick={() => setActiveRole("all")}
              />
              {(Object.keys(roleIconColor) as OrgRole[]).map((role) => (
                <FilterPill
                  key={role}
                  label={t(`members.role.${role}`)}
                  active={activeRole === role}
                  onClick={() => setActiveRole(role)}
                />
              ))}
            </div>

            <Button variant="outline" size="sm" className="ml-auto" disabled>
              <Filter className="size-3.5" /> {t("common.more_filters")}
            </Button>
          </div>

          {/* Members table */}
          <div className="rounded-2xl border border-border bg-card card-elevated shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border bg-surface-1">
                <tr>
                  <th className="text-left font-semibold px-5 py-3">
                    {t("members.col.member")}
                  </th>
                  <th className="text-left font-semibold px-2 py-3">
                    {t("members.col.role")}
                  </th>
                  <th className="text-left font-semibold px-2 py-3">
                    {t("common.status")}
                  </th>
                  <th className="text-left font-semibold px-2 py-3">
                    {t("members.col.last_active")}
                  </th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const role = roleIconColor[m.role];
                  const isSelf = user?.id === m.userId;
                  return (
                    <tr
                      key={m.userId}
                      className="border-b border-border/40 hover:bg-surface-1 last:border-b-0"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <MemberAvatar member={m} />
                          <div className="min-w-0">
                            <div className="font-medium truncate flex items-center gap-1.5">
                              {m.displayName || m.name || m.email}
                              {isSelf && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] h-4 px-1.5 border-line-2 bg-surface-2 text-muted-foreground"
                                >
                                  {t("common.you")}
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {m.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] gap-1", role.color)}
                        >
                          <role.icon className="size-2.5" />
                          {t(`members.role.${m.role}`)}
                        </Badge>
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px]",
                            m.status === "active"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {m.status === "active"
                            ? t("common.active")
                            : t("common.status")}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-muted-foreground text-[11px]">
                        {m.lastActiveAt ? timeAgo(m.lastActiveAt) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {/* Row actions appear only when the actor strictly
                            outranks this member: owner→admin/member/guest,
                            admin→member/guest. This hides the menu on owner rows
                            (nobody outranks owner) and on admin rows for an
                            admin actor (admin doesn't outrank admin) — both of
                            which the backend would 403. Self is always excluded
                            (can't demote/remove yourself). */}
                        {canManage &&
                        !isSelf &&
                        currentRole &&
                        outranks(currentRole, m.role) ? (
                          <MemberRowMenu
                            disabled={busyMemberId === m.userId}
                            currentRole={m.role}
                            assignable={assignable}
                            onChangeRole={(nextRole) =>
                              setPendingRoleChange({ member: m, nextRole })
                            }
                            onRemove={() => setPendingRemoval(m)}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="p-12 text-center text-sm text-muted-foreground">
                {members.length === 0
                  ? t("members.empty.desc")
                  : t("members.no_match")}
              </div>
            )}
          </div>

          {canManage && (
            <div className="rounded-xl border border-line-1 bg-surface-1 p-4 flex items-center gap-3">
              <div className="size-9 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center">
                <Mail className="size-4 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {t("members.bulk_title")}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("members.invite.email_warning")}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInviteOpen(true)}
              >
                {t("members.open_inviter")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Invite dialog */}
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        assignable={assignable}
        onInvited={async (res) => {
          // Only open the fallback modal when delivery failed; on the happy
          // path the toast inside the inviter is enough.
          if (!res.emailSent) {
            setInviteSuccess(res);
          }
          await refresh();
        }}
      />

      {/* Invite fallback modal — only opened when delivery failed. */}
      <InviteSuccessDialog
        state={inviteSuccess}
        onClose={() => setInviteSuccess(null)}
        onResend={handleResend}
        resendingId={busyInviteId}
      />

      {/* Remove confirmation */}
      <Dialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("members.actions.remove")}</DialogTitle>
            <DialogDescription>
              {pendingRemoval?.email}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingRemoval(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              disabled={
                pendingRemoval ? busyMemberId === pendingRemoval.userId : false
              }
              onClick={() => {
                if (pendingRemoval) void handleRemove(pendingRemoval);
              }}
            >
              <Trash2 className="size-3.5" /> {t("members.actions.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role change confirmation */}
      <Dialog
        open={pendingRoleChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRoleChange(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("members.actions.change_role")}</DialogTitle>
            <DialogDescription>
              {pendingRoleChange
                ? `${pendingRoleChange.member.email} → ${t(`members.role.${pendingRoleChange.nextRole}`)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingRoleChange(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={
                pendingRoleChange
                  ? busyMemberId === pendingRoleChange.member.userId
                  : false
              }
              onClick={() => {
                if (pendingRoleChange) {
                  void handleRoleChange(
                    pendingRoleChange.member,
                    pendingRoleChange.nextRole,
                  );
                }
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ============================================================
   Member row 3-dot menu
   ============================================================ */
function MemberRowMenu({
  currentRole,
  assignable,
  disabled,
  onChangeRole,
  onRemove,
}: {
  currentRole: OrgRole;
  /**
   * Roles the actor may assign — computed from the actor's own role so an admin
   * never sees "Admin" (only owner can grant it). `owner` is never included:
   * the backend rejects it via PATCH (ownership moves via transfer only).
   */
  assignable: InviteRole[];
  disabled?: boolean;
  onChangeRole: (next: InviteRole) => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("common.more")}
        title={t("common.more")}
        disabled={disabled}
        className="size-8 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t("members.actions.change_role")}
          </div>
          {assignable.map((role) => (
            <DropdownMenuItem
              key={role}
              disabled={role === currentRole}
              onClick={() => onChangeRole(role)}
            >
              {t(`members.role.${role}`)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onRemove}
            className="text-rose-700 dark:text-rose-300 focus:text-rose-800 dark:focus:text-rose-200"
          >
            <Trash2 className="size-3.5" />
            {t("members.actions.remove")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ============================================================
   Invite dialog
   ============================================================ */
function InviteMemberDialog({
  open,
  onOpenChange,
  assignable,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Roles the actor may invite at — same hierarchy as role changes. An admin
   * can only invite member/guest; only an owner can invite an admin.
   */
  assignable: InviteRole[];
  onInvited: (res: InviteSuccessState) => void | Promise<void>;
}) {
  const t = useT();
  // Default to `member` when the actor can assign it, otherwise fall back to the
  // lowest role they're allowed to grant. Guards against an admin opening the
  // dialog pre-set to a role they can't actually invite.
  const defaultRole: InviteRole = assignable.includes("member")
    ? "member"
    : (assignable[assignable.length - 1] ?? "member");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>(defaultRole);
  const [submitting, setSubmitting] = useState(false);

  // Keep the selected role within what the actor may assign — e.g. if the
  // current value is `admin` but the actor can only invite member/guest.
  useEffect(() => {
    if (open && !assignable.includes(role)) {
      setRole(defaultRole);
    }
  }, [open, assignable, role, defaultRole]);

  useEffect(() => {
    if (!open) {
      const id = setTimeout(() => {
        setEmail("");
        setRole(defaultRole);
      }, 200);
      return () => clearTimeout(id);
    }
  }, [open, defaultRole]);

  const submit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await inviteMember({ email: trimmed, role });
      if (res.emailSent) {
        // Email reached the transport — quiet success. Do NOT surface the
        // acceptUrl even if backend returned one (dev mode); we want admins
        // to trust the email path and not double-send.
        toast.success(t("members.invite.emailSent"), { description: trimmed });
        await onInvited({
          invitation: res.invitation,
          emailSent: true,
        });
      } else if (res.acceptUrl) {
        // Transport failed but we still have a fallback link → success modal
        // with the link.
        toast.warning(t("members.invite.emailFailedFallback"), {
          description: res.emailError,
        });
        await onInvited({
          invitation: res.invitation,
          emailSent: false,
          emailError: res.emailError,
          acceptUrl: res.acceptUrl,
        });
      } else {
        // No email, no link → admin can retry.
        toast.error(t("members.invite.emailFailedNoFallback"), {
          description: res.emailError,
        });
        await onInvited({
          invitation: res.invitation,
          emailSent: false,
          emailError: res.emailError,
        });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(t("members.error.invite_failed"), {
        description: mapMemberError(err, t),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("members.invite.title")}</DialogTitle>
          <DialogDescription>{t("members.invite.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t("members.invite.email_label")}
            </Label>
            <Input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t("members.invite.role_label")}
            </Label>
            <Select
              value={role}
              onValueChange={(v) => v && setRole(v as InviteRole)}
            >
              <SelectTrigger>
                <SelectValue>
                  {(value: string | null) => {
                    const r = (value as InviteRole) ?? role;
                    return t(`members.role.${r}`);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {assignable.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(`members.role.${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/[0.08] dark:bg-amber-500/[0.04] border border-amber-500/30 dark:border-amber-500/15 text-[11px]">
            <Mail className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-amber-800 dark:text-amber-200/90">
              {t("members.invite.email_warning")}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={!email.trim() || submitting}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Send className="size-3.5" /> {t("members.invite.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Invite success modal — fallback UI when the email transport failed
   (or for the explicit retry flow). When `emailSent === true` we never
   open this dialog; the toast is enough.
   ============================================================ */
function InviteSuccessDialog({
  state,
  onClose,
  onResend,
  resendingId,
}: {
  state: InviteSuccessState | null;
  onClose: () => void;
  onResend: (inv: Invitation) => Promise<void>;
  resendingId: string | null;
}) {
  const t = useT();
  const open = state !== null;
  const acceptUrl = state?.acceptUrl ?? "";
  const hasLink = acceptUrl.length > 0;

  const copyLink = async () => {
    if (!hasLink) return;
    try {
      await navigator.clipboard.writeText(acceptUrl);
      toast.success(t("members.toast.link_copied"));
    } catch {
      toast.error(t("members.error.copy_failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {hasLink
              ? t("members.invite.emailFailedFallbackTitle")
              : t("members.invite.emailFailedNoFallbackTitle")}
          </DialogTitle>
          <DialogDescription>
            {hasLink
              ? t("members.invite.emailFailedFallbackDesc")
              : t("members.invite.emailFailedNoFallbackDesc")}
          </DialogDescription>
        </DialogHeader>

        {state && (
          <div className="space-y-4">
            <div className="rounded-lg border border-line-1 bg-surface-1 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t("members.invite.created_for", { email: state.invitation.email })}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("members.invitation.expires", {
                  when: formatDateTime(state.invitation.expiresAt),
                })}
              </div>
              {state.emailError && (
                <div className="text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                  <Mail className="size-3 mt-0.5 shrink-0" />
                  <span>
                    {t("members.invite.emailErrorLabel", {
                      message: state.emailError,
                    })}
                  </span>
                </div>
              )}
            </div>

            {hasLink ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {t("members.invite.accept_url_label")}
                  </Label>
                  <div className="flex items-stretch gap-2">
                    <Input
                      readOnly
                      value={acceptUrl}
                      className="font-mono-secret text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button variant="outline" onClick={copyLink}>
                      <Copy className="size-3.5" /> {t("common.copy")}
                    </Button>
                  </div>
                </div>

                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/[0.08] dark:bg-amber-500/[0.04] border border-amber-500/30 dark:border-amber-500/15 text-[11px]">
                  <Mail className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-amber-800 dark:text-amber-200/90">
                    {t("members.invite.email_warning")}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/[0.08] dark:bg-rose-500/[0.04] border border-rose-500/30 dark:border-rose-500/15 text-[11px]">
                <Mail className="size-3.5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                <div className="text-rose-800 dark:text-rose-200/90">
                  {t("members.invite.emailFailedHelp")}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {state && !hasLink && (
            <Button
              variant="outline"
              onClick={() => void onResend(state.invitation)}
              disabled={resendingId === state.invitation.id}
            >
              <RefreshCw className="size-3.5" />
              {resendingId === state.invitation.id
                ? t("members.invite.retrying")
                : t("members.invite.retrySend")}
            </Button>
          )}
          <Button onClick={onClose}>{t("members.invite.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Atoms
   ============================================================ */
function EmailAvatar({ email }: { email: string }) {
  const c = colorFor(pickAvatarColor(email));
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        "size-8 rounded-full ring-1 flex items-center justify-center text-[11px] font-semibold shrink-0",
        c.bg,
        c.ring,
        c.text,
      )}
    >
      {initials}
    </div>
  );
}

function MemberAvatar({ member }: { member: OrgMember }) {
  const seed = member.displayName || member.name || member.email;
  const c = colorFor(pickAvatarColor(seed));
  const initials = seed
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={cn(
        "size-8 rounded-full ring-1 flex items-center justify-center text-[11px] font-semibold shrink-0",
        c.bg,
        c.ring,
        c.text,
      )}
    >
      {initials || member.email.slice(0, 2).toUpperCase()}
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "amber";
}) {
  return (
    <div className="rounded-xl border border-border bg-card card-elevated shadow-card p-4">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
        {label}
      </div>
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums tracking-tight",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 h-7 rounded-md text-xs font-medium transition-colors",
        active
          ? "bg-surface-3 text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/* ============================================================
   Error → toast description mapping
   ============================================================ */
function mapMemberError(
  err: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "already_member":
        return t("members.error.already_member");
      case "invitation_already_accepted":
        return t("members.error.invitation_already_accepted");
      case "invitation_revoked":
        return t("members.error.invitation_revoked");
      case "forbidden":
        // Owner ops on a member the caller can't touch — most commonly an
        // attempt to demote/remove the Owner. Backend now returns 403
        // (replacing the old 409 last_owner). Steer the admin toward transfer.
        return t("members.error.owner_forbidden");
      default:
        return err.message;
    }
  }
  return t("api.error.generic");
}
