"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users as UsersIcon,
  Search,
  Check,
  X,
  Loader2,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { listMembers, type OrgMember } from "@/lib/api/members";
import { listTeams, type Team } from "@/lib/api/teams";
import type { VaultRole } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

const ROLE_ORDER: VaultRole[] = ["manager", "editor", "user", "viewer"];

const ROLE_COLOR: Record<VaultRole, string> = {
  manager: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  editor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  user: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  viewer: "bg-muted text-muted-foreground border-line-1",
};

export type BulkSharePrincipal =
  | { type: "user"; id: string; name: string }
  | { type: "team"; id: string; name: string };

interface BulkShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  busy: boolean;
  onConfirm: (principal: BulkSharePrincipal, role: VaultRole) => void;
}

export function BulkShareDialog({
  open,
  onOpenChange,
  count,
  busy,
  onConfirm,
}: BulkShareDialogProps) {
  const t = useT();

  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<BulkSharePrincipal | null>(null);
  const [pickedRole, setPickedRole] = useState<VaultRole>("editor");

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery("");
        setPickerOpen(false);
        setPicked(null);
        setPickedRole("editor");
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const load = async () => {
      setLoadingSearch(true);
      try {
        const [mRes, tRes] = await Promise.all([listMembers(ctrl.signal), listTeams()]);
        if (!cancelled) {
          setOrgMembers(mRes.members);
          setTeams(tRes.teams);
        }
      } catch {
        if (!cancelled) {
          setOrgMembers([]);
          setTeams([]);
        }
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [open]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const userCandidates = orgMembers
      .filter((m) => m.status === "active")
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .map((m) => ({ type: "user" as const, id: m.userId, name: m.displayName, detail: m.email }));
    const teamCandidates = teams
      .filter((team) => !q || team.name.toLowerCase().includes(q))
      .map((team) => ({ type: "team" as const, id: team.id, name: team.name, detail: t("teams.member_count", { n: team.memberCount }) }));
    return [...userCandidates, ...teamCandidates].slice(0, 8);
  }, [orgMembers, teams, query, t]);

  const handlePick = useCallback((cand: BulkSharePrincipal) => {
    setPicked(cand);
    setQuery("");
    setPickerOpen(false);
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("bulk.share.title", { n: count })}</DialogTitle>
          <DialogDescription>{t("bulk.share.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("bulk.share.recipient")}
            </span>
            {picked ? (
              <div className="flex items-center gap-2.5 h-12 px-3 rounded-lg border border-line-2 bg-card/40">
                <MemberAvatar name={picked.name} isTeam={picked.type === "team"} />
                <span className="flex-1 text-sm font-medium truncate">{picked.name}</span>
                <button
                  type="button"
                  aria-label={t("common.cancel")}
                  onClick={() => setPicked(null)}
                  className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
                <DropdownMenuTrigger render={<div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-line-2 bg-card/40 cursor-text" />}>
                  <Search className="size-3.5 text-muted-foreground shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPickerOpen(true);
                    }}
                    onFocus={() => setPickerOpen(true)}
                    placeholder={t("share.search_people")}
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuery("");
                      }}
                      className="p-0.5 rounded hover:bg-surface-2"
                    >
                      <X className="size-3.5 text-muted-foreground" />
                    </button>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[var(--anchor-width)] max-w-[32rem] p-1" align="start" sideOffset={6}>
                  {loadingSearch ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
                      <Loader2 className="size-3.5 animate-spin" /> {t("share.loading_members")}
                    </div>
                  ) : candidates.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      {query ? t("share.no_people_match") : t("share.no_members_to_add")}
                    </div>
                  ) : (
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {query ? t("share.matches_for", { query }) : t("share.recent_active")}
                      </DropdownMenuLabel>
                      {candidates.map((c) => (
                        <DropdownMenuItem
                          key={`${c.type}:${c.id}`}
                          onClick={() => handlePick({ type: c.type, id: c.id, name: c.name })}
                          className="gap-2.5 py-2"
                        >
                          <MemberAvatar name={c.name} isTeam={c.type === "team"} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{c.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{c.detail}</div>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{t("share.add_as")}</span>
            <RolePicker value={pickedRole} onChange={setPickedRole} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => picked && onConfirm(picked, pickedRole)}
            disabled={busy || !picked}
          >
            {t("bulk.share.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolePicker({ value, onChange }: { value: VaultRole; onChange: (role: VaultRole) => void }) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className={cn("inline-flex items-center gap-1.5 rounded-md border text-xs font-medium transition-colors hover:brightness-110 h-9 px-3", ROLE_COLOR[value])}>{t(`role.${value}`)}<svg viewBox="0 0 12 12" className="opacity-60 size-3"><path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>} />
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          {ROLE_ORDER.map((r) => (
            <DropdownMenuItem key={r} onClick={() => onChange(r)} className="items-start py-2">
              <div className="size-4 mt-0.5 flex items-center justify-center">{value === r && <Check className="size-3.5 text-brand" />}</div>
              <div className="flex-1">
                <div className="text-sm font-medium">{t(`role.${r}`)}</div>
                <div className="text-[11px] text-muted-foreground">{t(`role.${r}_desc`)}</div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MemberAvatar({ name, isTeam }: { name: string; isTeam?: boolean }) {
  if (isTeam) {
    return (
      <span className="size-8 rounded-full bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0 border border-violet-500/20">
        <UsersIcon className="size-4" />
      </span>
    );
  }
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <span className="size-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[11px] font-semibold shrink-0">
      {initials}
    </span>
  );
}
