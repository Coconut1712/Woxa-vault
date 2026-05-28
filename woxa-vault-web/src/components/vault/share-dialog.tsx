"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users as UsersIcon,
  Search,
  Check,
  X,
  ShieldCheck,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

import { ApiError } from "@/lib/api/client";
import { listMembers, type OrgMember } from "@/lib/api/members";
import { listTeams, type Team } from "@/lib/api/teams";
import {
  addVaultMember,
  addVaultTeamMember,
  listVaultMembers,
  listVaultTeamMembers,
  removeVaultMember,
  removeVaultTeamMember,
  updateVaultMemberRole,
  updateVaultTeamMemberRole,
} from "@/lib/api/vaults";
import {
  addFolderMember,
  addFolderTeamMember,
  addItemMember,
  addItemTeamMember,
  listFolderMembers,
  listFolderTeamMembers,
  listItemMembers,
  listItemTeamMembers,
  removeFolderMember,
  removeFolderTeamMember,
  removeItemMember,
  removeItemTeamMember,
  updateFolderMemberRole,
  updateFolderTeamMemberRole,
  updateItemMemberRole,
  updateItemTeamMemberRole,
} from "@/lib/api/grants";
import type { VaultMember, VaultTeamMember, VaultRole, ResourceGrant } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { CountdownTimer } from "@/components/shared/countdown-timer";
import { 
  unwrapVaultKey, 
  wrapVaultKey, 
  fromBase64, 
  toBase64 
} from "@/lib/crypto-client";
import { readPersistedPrivateKey } from "@/components/vault-lock/lock-provider";
import { getVault } from "@/lib/api/vaults";

export type ShareResourceKind = "vault" | "folder" | "item";

interface ResourceApi {
  listUsers: (id: string, signal?: AbortSignal) => Promise<VaultMember[]>;
  listTeams: (id: string, signal?: AbortSignal) => Promise<VaultTeamMember[]>;
  addUser: (id: string, userId: string, role: VaultRole, wrappedKey?: string) => Promise<VaultMember>;
  addTeam: (id: string, teamId: string, role: VaultRole) => Promise<VaultTeamMember>;
  updateUser: (id: string, userId: string, role: VaultRole) => Promise<VaultMember>;
  updateTeam: (id: string, teamId: string, role: VaultRole) => Promise<VaultTeamMember>;
  removeUser: (id: string, userId: string) => Promise<void>;
  removeTeam: (id: string, teamId: string) => Promise<void>;
}

const RESOURCE_API: Record<ShareResourceKind, ResourceApi> = {
  vault: {
    listUsers: listVaultMembers,
    listTeams: listVaultTeamMembers,
    addUser: addVaultMember,
    addTeam: addVaultTeamMember,
    updateUser: updateVaultMemberRole,
    updateTeam: updateVaultTeamMemberRole,
    removeUser: removeVaultMember,
    removeTeam: removeVaultTeamMember,
  },
  folder: {
    listUsers: listFolderMembers,
    listTeams: listFolderTeamMembers,
    addUser: addFolderMember,
    addTeam: addFolderTeamMember,
    updateUser: updateFolderMemberRole,
    updateTeam: updateFolderTeamMemberRole,
    removeUser: removeFolderMember,
    removeTeam: removeFolderTeamMember,
  },
  item: {
    listUsers: listItemMembers,
    listTeams: listItemTeamMembers,
    addUser: addItemMember,
    addTeam: addItemTeamMember,
    updateUser: updateItemMemberRole,
    updateTeam: updateItemTeamMemberRole,
    removeUser: removeItemMember,
    removeTeam: removeItemTeamMember,
  },
};

const ROLE_ORDER: VaultRole[] = ["manager", "editor", "user", "viewer"];

const ROLE_COLOR: Record<VaultRole, string> = {
  manager: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  editor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  user: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  viewer: "bg-muted text-muted-foreground border-line-1",
};

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceKind: ShareResourceKind;
  resourceId: string;
  resourceName: string;
  canManage: boolean;
  currentUserId?: string;
  initialMembers?: VaultMember[];
  onMembersChange?: (members: VaultMember[]) => void;
}

function describeError(err: unknown, t: (k: string) => string, kind: ShareResourceKind): string {
  if (err instanceof ApiError) {
    if (err.code === "member_conflict") return t("share.error.already_member");
    if (err.status === 409) return kind === "vault" ? t("share.error.last_manager") : t("share.error.already_member");
    if (err.status === 403) return t("share.error.forbidden");
    if (err.status === 404) return t("share.error.not_in_workspace");
    return err.message || t("share.error.generic");
  }
  return t("share.error.generic");
}

export function ShareDialog({
  open,
  onOpenChange,
  resourceKind,
  resourceId,
  resourceName,
  canManage,
  currentUserId,
  onMembersChange,
}: ShareDialogProps) {
  const t = useT();
  const api = RESOURCE_API[resourceKind];
  
  const [grants, setGrants] = useState<ResourceGrant[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedRole, setPickedRole] = useState<VaultRole>("editor");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const commitGrants = useCallback((next: ResourceGrant[]) => {
    setGrants(next);
    const userMembers = next.filter((g): g is { type: "user"; member: VaultMember } => g.type === "user").map(g => g.member);
    onMembersChange?.(userMembers);
  }, [onMembersChange]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const ctrl = new AbortController();
    
    Promise.all([
      api.listUsers(resourceId, ctrl.signal),
      api.listTeams(resourceId, ctrl.signal),
    ]).then(([users, teams]) => {
      if (!cancelled) {
        const next: ResourceGrant[] = [
          ...users.map(member => ({ type: "user" as const, member })),
          ...teams.map(member => ({ type: "team" as const, member })),
        ];
        setGrants(next);
      }
    }).catch(() => {});

    return () => { cancelled = true; ctrl.abort(); };
  }, [open, resourceKind, resourceId, api]);

  useEffect(() => {
    if (!open || !canManage) return;
    let cancelled = false;
    const ctrl = new AbortController();
    setLoadingSearch(true);
    Promise.all([listMembers(ctrl.signal), listTeams()]).then(([mRes, tRes]) => {
      if (!cancelled) {
        setOrgMembers(mRes.members);
        setTeams(tRes.teams);
      }
    }).catch(() => {
      if (!cancelled) { setOrgMembers([]); setTeams([]); }
    }).finally(() => { if (!cancelled) setLoadingSearch(false); });
    return () => { cancelled = true; ctrl.abort(); };
  }, [open, canManage]);

  useEffect(() => {
    if (!open) { setQuery(""); setPickerOpen(false); setPickedRole("editor"); }
  }, [open]);

  const memberIds = useMemo(() => new Set(grants.filter(g => g.type === "user").map(g => (g.member as VaultMember).userId)), [grants]);
  const teamIds = useMemo(() => new Set(grants.filter(g => g.type === "team").map(g => (g.member as VaultTeamMember).teamId)), [grants]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const userCandidates = orgMembers
      .filter((m) => m.status === "active" && !memberIds.has(m.userId))
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .map(m => ({ type: "user" as const, id: m.userId, name: m.displayName, detail: m.email }));
    const teamCandidates = teams
      .filter((t) => !teamIds.has(t.id))
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .map(t => ({ type: "team" as const, id: t.id, name: t.name, detail: `${t.memberCount} members` }));
    return [...userCandidates, ...teamCandidates].slice(0, 8);
  }, [orgMembers, teams, memberIds, teamIds, query]);

  const handleAdd = useCallback(async (cand: { type: "user" | "team"; id: string; name: string }) => {
    setAdding(true);
    try {
      if (cand.type === "user") {
        let wrappedKey: string | undefined = undefined;

        // Phase C: If sharing a vault, check for ZK
        if (resourceKind === "vault") {
          const detail = await getVault(resourceId);
          if (detail.vault.encryptionVersion === 2 && detail.wrappedKey) {
            const userPk = readPersistedPrivateKey();
            const recipient = orgMembers.find(m => m.userId === cand.id);
            
            if (userPk && recipient?.publicKey) {
              // 1. Unwrap current user's vault key
              // format: ephemeralPub(32) + iv(12) + tag(16) + cipher(32)
              const rawWrapped = fromBase64(detail.wrappedKey);
              const vaultKey = await unwrapVaultKey({
                ephemeralPublicKey: rawWrapped.slice(0, 32),
                iv: rawWrapped.slice(32, 44),
                authTag: rawWrapped.slice(44, 60),
                ciphertext: rawWrapped.slice(60),
              }, userPk);

              // 2. Wrap it for recipient
              const wrapped = await wrapVaultKey(
                vaultKey,
                fromBase64(recipient.publicKey)
              );

              const combined = new Uint8Array(
                wrapped.ephemeralPublicKey.length +
                wrapped.iv.length +
                wrapped.authTag.length +
                wrapped.ciphertext.length
              );
              let offset = 0;
              combined.set(wrapped.ephemeralPublicKey, offset); offset += wrapped.ephemeralPublicKey.length;
              combined.set(wrapped.iv, offset); offset += wrapped.iv.length;
              combined.set(wrapped.authTag, offset); offset += wrapped.authTag.length;
              combined.set(wrapped.ciphertext, offset);

              wrappedKey = toBase64(combined);
            }
          }
        }

        const created = await api.addUser(resourceId, cand.id, pickedRole, wrappedKey);
        commitGrants([...grants, { type: "user", member: created }]);
      } else {
        const created = await api.addTeam(resourceId, cand.id, pickedRole);
        commitGrants([...grants, { type: "team", member: created }]);
      }
      toast.success(t("toast.added_grant", { name: cand.name }));
      setQuery(""); setPickerOpen(false);
    } catch (err) { toast.error(describeError(err, t, resourceKind)); } finally { setAdding(false); }
  }, [api, resourceId, resourceKind, pickedRole, grants, commitGrants, t, orgMembers]);

  const handleRoleChange = useCallback(async (grant: ResourceGrant, role: VaultRole) => {
    const id = grant.type === "user" ? grant.member.userId : grant.member.teamId;
    setBusyId(id);
    try {
      if (grant.type === "user") {
        const updated = await api.updateUser(resourceId, id, role);
        commitGrants(grants.map(g => (g.type === "user" && g.member.userId === id ? { ...g, member: updated } : g)));
      } else {
        const updated = await api.updateTeam(resourceId, id, role);
        commitGrants(grants.map(g => (g.type === "team" && g.member.teamId === id ? { ...g, member: updated } : g)));
      }
      toast.success(t("toast.role_updated"));
    } catch (err) { toast.error(describeError(err, t, resourceKind)); } finally { setBusyId(null); }
  }, [api, resourceId, resourceKind, grants, commitGrants, t]);

  const handleRemove = useCallback(async (grant: ResourceGrant) => {
    const id = grant.type === "user" ? grant.member.userId : grant.member.teamId;
    const name = grant.type === "user" ? grant.member.displayName : grant.member.teamName;
    setBusyId(id);
    try {
      if (grant.type === "user") {
        await api.removeUser(resourceId, id);
        commitGrants(grants.filter(g => !(g.type === "user" && g.member.userId === id)));
      } else {
        await api.removeTeam(resourceId, id);
        commitGrants(grants.filter(g => !(g.type === "team" && g.member.teamId === id)));
      }
      toast.success(t("toast.removed", { name }));
    } catch (err) { toast.error(describeError(err, t, resourceKind)); } finally { setBusyId(null); }
  }, [api, resourceId, resourceKind, grants, commitGrants, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg tracking-tight">{t("share.title", { name: resourceName })}</DialogTitle>
          <DialogDescription className="text-xs">
            {canManage ? t(resourceKind === "vault" ? "share.vault_desc" : resourceKind === "folder" ? "share.folder_desc" : "share.item_desc") : t(resourceKind === "vault" ? "share.read_only_note" : "share.read_only_note_resource")}
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <div className="px-6 pb-4 space-y-3">
            <div className="relative">
              <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
                <DropdownMenuTrigger render={<div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-line-2 bg-card/40 cursor-text" />}>
                  <Search className="size-3.5 text-muted-foreground shrink-0" />
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setPickerOpen(true); }} onFocus={() => setPickerOpen(true)} placeholder={t("share.search_people")} className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                  {adding && <Loader2 className="size-3.5 text-muted-foreground animate-spin" />}
                  {query && !adding && <button type="button" onClick={(e) => { e.stopPropagation(); setQuery(""); }} className="p-0.5 rounded hover:bg-surface-2"><X className="size-3.5 text-muted-foreground" /></button>}
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[var(--anchor-width)] max-w-[32rem] p-1" align="start" sideOffset={6}>
                  {loadingSearch ? (<div className="px-3 py-6 text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-2 w-full"><Loader2 className="size-3.5 animate-spin" /> {t("share.loading_members")}</div>) : candidates.length === 0 ? (<div className="px-3 py-6 text-center text-xs text-muted-foreground">{query ? t("share.no_people_match") : t("share.no_members_to_add")}</div>) : (
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">{query ? t("share.matches_for", { query }) : t("share.recent_active")}</DropdownMenuLabel>
                      {candidates.map((c) => (
                        <DropdownMenuItem key={c.id} onClick={() => handleAdd(c)} className="gap-2.5 py-2">
                          <MemberAvatar name={c.name} isTeam={c.type === "team"} />
                          <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{c.name}</div><div className="text-[10px] text-muted-foreground truncate">{c.detail}</div></div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground">{t("share.add_as")}</span><RolePicker value={pickedRole} onChange={setPickedRole} /></div>
          </div>
        )}

        <Separator className="bg-surface-3" />

        <div className="px-6 py-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("share.who_has_access", { n: grants.length })}</h3>
          {grants.length === 0 ? (<div className="text-center py-8 text-sm text-muted-foreground">{canManage ? t("share.no_one_has_access") : t("share.no_members_yet")}</div>) : (
            <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
              {grants.map((g) => (
                <MemberRow key={g.type === "user" ? g.member.userId : g.member.teamId} grant={g} isSelf={g.type === "user" && g.member.userId === currentUserId} canManage={canManage} busy={busyId === (g.type === "user" ? g.member.userId : g.member.teamId)} onChangeRole={(role) => handleRoleChange(g, role)} onRemove={() => handleRemove(g)} />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-6 py-3 flex items-center justify-between bg-surface-1">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck className="size-3.5" /><span>{t("share.audit_note")}</span></div>
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({ grant, isSelf, canManage, busy, onChangeRole, onRemove }: { grant: ResourceGrant; isSelf: boolean; canManage: boolean; busy: boolean; onChangeRole: (role: VaultRole) => void; onRemove: () => void; }) {
  const t = useT();
  const name = grant.type === "user" ? grant.member.displayName : grant.member.teamName;
  const detail = grant.type === "user" ? grant.member.email : t("teams.role.member");
  const role = grant.member.role;
  const expiresAt = grant.member.expiresAt;

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-1 group">
      <MemberAvatar name={name} isTeam={grant.type === "team"} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5"><span className="text-sm font-medium truncate">{name}</span>{isSelf && <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-line-1 bg-surface-1 text-muted-foreground">{t("share.you")}</Badge>}{grant.type === "team" && <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-brand/20 bg-brand/5 text-brand">{t("nav.teams")}</Badge>}</div>
        <div className="text-[11px] text-muted-foreground truncate">{detail}</div>
      </div>
      {busy ? (<Loader2 className="size-4 text-muted-foreground animate-spin" />) : (
        <div className="flex items-center gap-2">
          {expiresAt && <CountdownTimer expiresAt={expiresAt} showLabel={false} className="h-6 py-0 px-1.5" />}
          {canManage ? (
            <>
              <RolePicker compact value={role} onChange={onChangeRole} />
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" aria-label={t("common.more")} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="size-3.5" /></button>} />
                <DropdownMenuContent align="end" className="w-48"><DropdownMenuItem variant="destructive" onClick={onRemove} className="whitespace-nowrap"><X className="size-4" /> {t("share.revoke_access")}</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (<Badge variant="outline" className={cn("text-[10px] h-6 px-2 font-medium", ROLE_COLOR[role])}>{t(`role.${role}`)}</Badge>)}
        </div>
      )}
    </div>
  );
}

function RolePicker({ value, onChange, compact }: { value: VaultRole; onChange: (role: VaultRole) => void; compact?: boolean; }) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className={cn("inline-flex items-center gap-1.5 rounded-md border text-xs font-medium transition-colors hover:brightness-110", compact ? "h-7 px-2" : "h-9 px-3", ROLE_COLOR[value])}>{t(`role.${value}`)}<svg viewBox="0 0 12 12" className={cn("opacity-60", compact ? "size-2.5" : "size-3")}><path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>} />
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          {ROLE_ORDER.map((r) => (
            <DropdownMenuItem key={r} onClick={() => onChange(r)} className="items-start py-2">
              <div className="size-4 mt-0.5 flex items-center justify-center">{value === r && <Check className="size-3.5 text-brand" />}</div>
              <div className="flex-1"><div className="text-sm font-medium">{t(`role.${r}`)}</div><div className="text-[11px] text-muted-foreground">{t(`role.${r}_desc`)}</div></div>
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
