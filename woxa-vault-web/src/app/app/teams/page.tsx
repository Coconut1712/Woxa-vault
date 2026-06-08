"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users as UsersIcon,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  UserPlus,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteWithPasswordDialog } from "@/components/shared/delete-with-password-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ApiErrorState,
  ApiLoadingState,
} from "@/components/shared/api-states";
import { listMembers, type OrgMember } from "@/lib/api/members";
import {
  listTeams,
  createTeam,
  deleteTeam,
  updateTeam,
  getTeam,
  addTeamMember,
  removeTeamMember,
  type Team,
  type TeamMember,
} from "@/lib/api/teams";
import { ApiError } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { isWorkspaceAdmin, canWriteVaultData } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export default function TeamsPage() {
  const t = useT();
  const { me } = useAuth();
  const isAdmin = isWorkspaceAdmin(me?.role ?? null);
  const canWrite = canWriteVaultData(me?.role ?? null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [manageMembersId, setManageMembersId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTeams();
      setTeams(res.teams);
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

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTeam(deleteId);
      toast.success(t("teams.toast.deleted"));
      setDeleteId(null);
      void load();
    } catch (err) {
      const description = err instanceof ApiError ? err.message : t("api.error.generic");
      toast.error(t("api.error.delete_failed"), { description });
    }
  };

  const filtered = teams.filter((team) =>
    team.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <Topbar
        title={t("teams.title")}
        subtitle={t("teams.subtitle")}
        actions={
          isAdmin && canWrite && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Plus className="size-3.5" /> {t("teams.new")}
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8">
          {loading ? (
            <ApiLoadingState />
          ) : error ? (
            <ApiErrorState error={error} onRetry={load} />
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder={t("common.search")}
                    className="pl-9"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center px-6">
                  <div className="size-16 rounded-3xl bg-surface-1 border border-line-1 flex items-center justify-center mb-6">
                    <UsersIcon className="size-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {t("teams.empty.title")}
                  </h3>
                  <p className="text-muted-foreground max-w-sm">
                    {t("teams.empty.desc")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filtered.map((team) => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      canEdit={isAdmin && canWrite}
                      onEdit={() => setEditTeam(team)}
                      onManageMembers={() => setManageMembersId(team.id)}
                      onDelete={() => setDeleteId(team.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <NewTeamDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={load}
      />

      {manageMembersId && (
        <ManageMembersDialog
          open={!!manageMembersId}
          onOpenChange={(open) => !open && setManageMembersId(null)}
          teamId={manageMembersId}
          onSuccess={load}
        />
      )}

      {editTeam && (
        <EditTeamDialog
          open={!!editTeam}
          onOpenChange={(open) => !open && setEditTeam(null)}
          team={editTeam}
          onSuccess={load}
        />
      )}

      <DeleteWithPasswordDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={t("teams.delete.title", {
          name: teams.find((team) => team.id === deleteId)?.name ?? "",
        })}
        description={t("teams.delete.desc")}
        onConfirmed={handleDelete}
      />
    </>
  );
}

// Derive a stable accent color from the team name so each team has a unique
// visual identity instead of every card being the same brand blue.
const TEAM_PALETTE = [
  { bg: "bg-violet-500/15 dark:bg-violet-500/10", ring: "ring-violet-500/30 dark:ring-violet-500/20", text: "text-violet-600 dark:text-violet-400" },
  { bg: "bg-blue-500/15 dark:bg-blue-500/10",    ring: "ring-blue-500/30 dark:ring-blue-500/20",    text: "text-blue-600 dark:text-blue-400" },
  { bg: "bg-emerald-500/15 dark:bg-emerald-500/10", ring: "ring-emerald-500/30 dark:ring-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400" },
  { bg: "bg-amber-500/15 dark:bg-amber-500/10",  ring: "ring-amber-500/30 dark:ring-amber-500/20",  text: "text-amber-600 dark:text-amber-400" },
  { bg: "bg-rose-500/15 dark:bg-rose-500/10",    ring: "ring-rose-500/30 dark:ring-rose-500/20",    text: "text-rose-600 dark:text-rose-400" },
  { bg: "bg-cyan-500/15 dark:bg-cyan-500/10",    ring: "ring-cyan-500/30 dark:ring-cyan-500/20",    text: "text-cyan-600 dark:text-cyan-400" },
] as const;

function teamPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TEAM_PALETTE[hash % TEAM_PALETTE.length]!;
}

function TeamCard({
  team,
  canEdit,
  onEdit,
  onManageMembers,
  onDelete,
}: {
  team: Team;
  canEdit: boolean;
  onEdit: () => void;
  onManageMembers: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const accent = teamPalette(team.name);
  const initial = (team.name || "?").trim().charAt(0).toUpperCase();

  return (
    <Card className="hover:border-brand/40 transition-colors group relative">
      <div className="flex items-start justify-between gap-3 px-4">
        {/* Avatar — unique color per team, initial letter */}
        <div className={cn(
          "size-10 rounded-xl ring-1 flex items-center justify-center shrink-0 text-sm font-bold select-none",
          accent.bg, accent.ring, accent.text,
        )}>
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground truncate group-hover:text-brand transition-colors leading-snug">
            {team.name}
          </h3>
          {team.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {team.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2.5">
            <button
              type="button"
              onClick={onManageMembers}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-brand transition-colors"
            >
              <UsersIcon className="size-3" />
              {team.memberCount} {t("teams.col.members").toLowerCase()}
            </button>
            <span className="text-border text-xs">·</span>
            <span className="text-[11px] text-muted-foreground/70">
              {formatDate(team.createdAt)}
            </span>
          </div>
        </div>

        {/* 3-dot — hidden until hover so the card stays clean */}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  aria-label={t("common.more")}
                />
              }
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onManageMembers}>
                <UsersIcon className="size-4" /> {t("teams.members.manage")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-4" /> {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-4" /> {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Card>
  );
}

function NewTeamDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await createTeam({ name, description });
      toast.success(t("teams.toast.created"));
      onOpenChange(false);
      setName("");
      setDescription("");
      onSuccess();
    } catch (err) {
      const description = err instanceof ApiError ? err.message : t("api.error.generic");
      toast.error(t("api.error.create_failed"), { description });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("teams.new")}</DialogTitle>
            <DialogDescription>
              Create a new group to manage shared access for specific members.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t("teams.create.name_label")}</Label>
              <Input
                id="name"
                required
                maxLength={100}
                placeholder={t("teams.create.name_placeholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">{t("teams.create.desc_label")}</Label>
              <Textarea
                id="description"
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("teams.create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTeamDialog({
  open,
  onOpenChange,
  team,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team;
  onSuccess: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || "");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await updateTeam(team.id, { name, description });
      toast.success(t("teams.toast.updated"));
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const description = err instanceof ApiError ? err.message : t("api.error.generic");
      toast.error(t("api.error.save_failed"), { description });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("common.edit")} {team.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">{t("teams.create.name_label")}</Label>
              <Input
                id="edit-name"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">{t("teams.create.desc_label")}</Label>
              <Textarea
                id="edit-description"
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save_changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageMembersDialog({
  open,
  onOpenChange,
  teamId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  onSuccess: () => void;
}) {
  const t = useT();
  const [teamDetail, setTeamDetail] = useState<{ team: Team; members: TeamMember[] } | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, mRes] = await Promise.all([getTeam(teamId), listMembers()]);
      setTeamDetail(detail);
      setOrgMembers(mRes.members);
    } catch (err) {
      toast.error(t("api.error.generic"));
    } finally {
      setLoading(false);
    }
  }, [teamId, t]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const memberIds = useMemo(() => new Set(teamDetail?.members.map(m => m.userId)), [teamDetail]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orgMembers
      .filter((m) => m.status === "active" && !memberIds.has(m.userId))
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [orgMembers, memberIds, query]);

  const handleAdd = async (userId: string, name: string) => {
    setBusyId(userId);
    try {
      await addTeamMember(teamId, { userId, role: "member" });
      toast.success(t("toast.added_grant", { name }));
      void load();
      onSuccess();
    } catch (err) {
      toast.error(t("api.error.generic"));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    setBusyId(userId);
    try {
      await removeTeamMember(teamId, userId);
      toast.success(t("toast.removed", { name }));
      void load();
      onSuccess();
    } catch (err) {
      toast.error(t("api.error.generic"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{t("teams.members.manage")}</DialogTitle>
          <DialogDescription>
            {teamDetail?.team.name} &mdash; {teamDetail?.team.description || "No description"}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
          <div className="relative">
            <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
              <DropdownMenuTrigger
                render={
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-line-2 bg-card/40 cursor-text">
                    <Search className="size-3.5 text-muted-foreground shrink-0" />
                    <input
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setPickerOpen(true); }}
                      onFocus={() => setPickerOpen(true)}
                      placeholder={t("teams.members.search")}
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    {query && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setQuery(""); }} className="p-0.5 rounded hover:bg-surface-2">
                        <X className="size-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                }
              />
              <DropdownMenuContent className="w-[var(--anchor-width)] max-w-[32rem] p-1" align="start" sideOffset={6}>
                {candidates.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {query ? t("share.no_people_match") : t("share.no_members_to_add")}
                  </div>
                ) : (
                  <DropdownMenuGroup>
                    {candidates.map((m) => (
                      <DropdownMenuItem key={m.userId} onClick={() => handleAdd(m.userId, m.displayName)} className="gap-2.5 py-2">
                        <div className="size-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                          {m.displayName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{m.displayName}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{m.email}</div>
                        </div>
                        <Plus className="size-3.5 text-muted-foreground" />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Separator className="bg-surface-3" />

        <div className="px-6 py-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {t("teams.col.members")} ({teamDetail?.members.length ?? 0})
          </h3>

          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : teamDetail?.members.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground italic">
              {t("teams.members.no_members")}
            </div>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
              {teamDetail?.members.map((m) => (
                <div key={m.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-1 group">
                  <div className="size-8 rounded-full bg-surface-3 flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                    {m.displayName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.displayName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.email}</div>
                  </div>
                  {busyId === m.userId ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemove(m.userId, m.displayName)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-6 py-3 flex items-center justify-end bg-surface-1">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {t("common.done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
