"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Send,
  History,
  Users,
  Star,
  Trash2,
  Lock,
  Home,
  LogOut,
  User,
  KeyRound,
  ShieldCheck,
  MoreHorizontal,
  Pencil,
  Loader2,
  UserPlus,
  Inbox,
  FileUp,
} from "lucide-react";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useVaults } from "@/lib/vaults/provider";
import { useFolders, type Folder } from "@/lib/folders/provider";
import { ApiError } from "@/lib/api/client";
import type { VaultSummary } from "@/lib/api/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconTile, VaultIcon, colorFor } from "@/components/icon";
import { NewVaultDialog } from "@/components/vault/new-vault-dialog";
import { EditFolderDialog } from "@/components/vault/edit-folder-dialog";
import { ShareDialog } from "@/components/vault/share-dialog";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useVaultLock } from "@/components/vault-lock/lock-provider";
import { useAuth } from "@/lib/auth/provider";
import {
  canViewAuditLog,
  canWriteVaultData,
  isGuest,
  isWorkspaceAdmin,
} from "@/lib/auth/permissions";
import { useT } from "@/lib/i18n/provider";
import { toast } from "sonner";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

const topNav: NavItem[] = [
  { href: "/app", labelKey: "nav.home", icon: Home },
  { href: "/app/favorites", labelKey: "nav.favorites", icon: Star },
  { href: "/app/sends", labelKey: "nav.one_time_sends", icon: Send },
  { href: "/app/requests", labelKey: "nav.requests", icon: Inbox },
  { href: "/app/import", labelKey: "nav.import", icon: FileUp },
];

const bottomNav: NavItem[] = [
  { href: "/app/audit", labelKey: "nav.audit_log", icon: History },
  { href: "/app/members", labelKey: "nav.members", icon: Users },
  { href: "/app/teams", labelKey: "nav.teams", icon: Users },
  { href: "/app/trash", labelKey: "nav.trash", icon: Trash2 },
];


export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { markLocked } = useVaultLock();
  const { logout, user, me } = useAuth();
  const { vaults } = useVaults();
  const { byVault, remove: removeFolder } = useFolders();
  const t = useT();

  // Org-role gating (layers on top of per-vault roles handled elsewhere).
  const role = me?.role ?? null;
  const showAuditLink = canViewAuditLog(role);
  const showImportLink = isWorkspaceAdmin(role);
  const showMembersLink = !isGuest(role);
  // Trash holds permanent-delete — restricted to admin+ (owner directive). Both
  // member and guest lose the nav entry.
  const showTrashLink = isWorkspaceAdmin(role);
  const canWrite = canWriteVaultData(role);

  // Profile chrome — same source as Account settings (GET /me via AuthProvider).
  const profileEmail = me?.email ?? user?.email ?? "";
  const profileName =
    me?.displayName?.trim() || profileEmail || t("nav.account_settings");
  const profileInitials = me?.displayName?.trim()
    ? me.displayName
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : profileEmail[0]?.toUpperCase() ?? "?";

  // Top nav: hide One-time Sends from guests (read-only — they cannot create
  // sends; the backend blocks POST /sends for them).
  const topNavForRole = topNav.filter((item) => {
    if (item.href === "/app/sends") return !isGuest(role);
    if (item.href === "/app/import") return showImportLink;
    return true;
  });

  // Bottom nav by role: audit/trash are admin-only; members is hidden from guests
  // (backend blocks GET /members for them). Workspace settings live only in the
  // workspace switcher dropdown.
  const bottomNavForRole = bottomNav.filter((item) => {
    if (item.href === "/app/audit") return showAuditLink;
    if (item.href === "/app/members") return showMembersLink;
    if (item.href === "/app/trash") return showTrashLink;
    return true;
  });

  const [newVaultOpen, setNewVaultOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [shareFolderId, setShareFolderId] = useState<string | null>(null);
  const [deletingFolderBusy, setDeletingFolderBusy] = useState(false);

  // Search across all vaults the user is currently expanding/viewing.
  // `byVault` is per-vault, so flatten the vaults the user has loaded.
  const findFolder = (folderId: string) => {
    for (const v of vaults) {
      const list = byVault(v.id);
      const match = list.find((f) => f.id === folderId);
      if (match) return match;
    }
    return null;
  };

  const editingFolder = editFolderId ? findFolder(editFolderId) : null;
  const deletingFolder = deleteFolderId ? findFolder(deleteFolderId) : null;
  const sharingFolder = shareFolderId ? findFolder(shareFolderId) : null;
  // Folder grants may be created by a vault manager|editor. Resolve the parent
  // vault's role for the folder being shared.
  const sharingFolderVault = sharingFolder
    ? vaults.find((v) => v.id === sharingFolder.vaultId)
    : null;
  const canShareSharingFolder =
    canWrite &&
    (sharingFolderVault?.role === "manager" ||
      sharingFolderVault?.role === "editor");

  const handleConfirmDeleteFolder = async () => {
    if (!deletingFolder || deletingFolderBusy) return;
    setDeletingFolderBusy(true);
    try {
      await removeFolder(deletingFolder.vaultId, deletingFolder.id);
      toast.success(t("folder.deleted_toast"), {
        description: deletingFolder.name,
      });
      setDeleteFolderId(null);
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : t("api.error.generic");
      toast.error(t("api.error.delete_failed"), { description });
    } finally {
      setDeletingFolderBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      toast.success(t("auth.signed_out"), {
        description: t("auth.signed_out_desc"),
      });
    } finally {
      router.push("/");
    }
  };

  // Auto-expand the active vault
  const activeVaultMatch = pathname.match(/^\/app\/vault\/([^/]+)/);
  const activeVaultId = activeVaultMatch?.[1];
  const activeFolderId = searchParams.get("folder");

  useEffect(() => {
    if (activeVaultId) {
      setExpanded((prev) => {
        if (prev.has(activeVaultId)) return prev;
        const next = new Set(prev);
        next.add(activeVaultId);
        return next;
      });
    }
  }, [activeVaultId]);

  const toggle = (vaultId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(vaultId)) next.delete(vaultId);
      else next.add(vaultId);
      return next;
    });
  };

  return (
    <aside className="w-64 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      {/* Workspace switcher — live (lists memberships, switches active org) */}
      <WorkspaceSwitcher />

      {/* Search shortcut */}
      <div className="px-2 mt-3">
        <button className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md border border-line-1 bg-surface-1 hover:bg-surface-2 text-muted-foreground text-sm transition-colors">
          <Search className="size-3.5" />
          <span className="flex-1 text-left text-xs">{t("common.search")}</span>
          <kbd className="text-[9px] bg-surface-3 border border-line-2 rounded px-1 py-0.5">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Top navigation */}
      <nav className="px-2 py-3 space-y-px">
        {topNavForRole.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={t(item.labelKey)}
            icon={item.icon}
            active={pathname === item.href}
          />
        ))}
      </nav>

      {/* Vaults — expandable tree */}
      <div className="px-3 mt-1 mb-1.5 flex items-center justify-between group">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t("nav.vaults")}
        </span>
        {canWrite && (
          <button
            onClick={() => setNewVaultOpen(true)}
            aria-label={t("nav.new_vault")}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Plus className="size-3" />
          </button>
        )}
      </div>
      <nav className="px-2 flex-1 overflow-y-auto">
        {vaults.map((vault) => {
          const isActive = activeVaultId === vault.id;
          const isExpanded = expanded.has(vault.id);
          const vaultFolders = byVault(vault.id);
          return (
            <VaultBranch
              key={vault.id}
              vault={vault}
              expanded={isExpanded}
              active={isActive}
              activeFolderId={activeFolderId}
              folders={vaultFolders}
              canWrite={canWrite}
              onToggle={() => toggle(vault.id)}
              onEditFolder={(id) => setEditFolderId(id)}
              onDeleteFolder={(id) => setDeleteFolderId(id)}
              onShareFolder={(id) => setShareFolderId(id)}
            />
          );
        })}
      </nav>

      {/* Bottom navigation */}
      <div className="border-t border-sidebar-border px-2 py-3 space-y-px">
        {bottomNavForRole.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={t(item.labelKey)}
            icon={item.icon}
            active={
              item.href === "/app"
                ? pathname === item.href
                : pathname.startsWith(item.href)
            }
          />
        ))}
      </div>

      {/* User card */}
      <div className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent w-full text-left transition-colors"
              />
            }
          >
            <Avatar className="size-7">
              <AvatarFallback className="text-[10px] bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white font-semibold">
                {profileInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate leading-tight">
                {profileName}
              </div>
              <div className="text-[11px] text-muted-foreground truncate leading-tight flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153/0.8)]" />{" "}
                {t("status.unlocked")}
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {profileEmail}
              </DropdownMenuLabel>
              <DropdownMenuItem render={<Link href="/app/account" />}>
                <User className="size-4" /> {t("nav.account_settings")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  markLocked("manual");
                  toast.info(t("vault_lock.topbar.locked_toast"), {
                    description: t("vault_lock.topbar.locked_toast_desc"),
                  });
                }}
              >
                <Lock className="size-4" /> {t("nav.lock_vault")}
                <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                  ⌘⌥L
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                <LogOut className="size-4" /> {t("common.signout")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NewVaultDialog open={newVaultOpen} onOpenChange={setNewVaultOpen} />

      {editingFolder && (
        <EditFolderDialog
          folder={editingFolder}
          open={!!editingFolder}
          onOpenChange={(o) => !o && setEditFolderId(null)}
        />
      )}

      {sharingFolder && (
        <ShareDialog
          open={!!sharingFolder}
          onOpenChange={(o) => !o && setShareFolderId(null)}
          resourceKind="folder"
          resourceId={sharingFolder.id}
          resourceName={sharingFolder.name}
          canManage={canShareSharingFolder}
          currentUserId={me?.id}
        />
      )}

      <Dialog
        open={!!deletingFolder}
        onOpenChange={(o) => !o && setDeleteFolderId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("folder.delete.title")}</DialogTitle>
            <DialogDescription>
              {t("folder.delete.desc", { name: deletingFolder?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteFolderId(null)}
              disabled={deletingFolderBusy}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              onClick={handleConfirmDeleteFolder}
              disabled={deletingFolderBusy}
            >
              {deletingFolderBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}{" "}
              {t("folder.delete.button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

/* =====================================================================
   VAULT BRANCH — clickable vault with collapsible folder children
   ===================================================================== */
function VaultBranch({
  vault,
  expanded,
  active,
  activeFolderId,
  folders: vaultFolders,
  canWrite,
  onToggle,
  onEditFolder,
  onDeleteFolder,
  onShareFolder,
}: {
  vault: VaultSummary;
  expanded: boolean;
  active: boolean;
  activeFolderId: string | null;
  folders: Folder[];
  canWrite: boolean;
  onToggle: () => void;
  onEditFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onShareFolder: (id: string) => void;
}) {
  const t = useT();
  const c = colorFor(vault.color ?? "violet");
  // Folder edit / delete / share all require a manager|editor vault role — the
  // `user` role is use-only. ANDed with the org-level write gate (hides it from
  // guests entirely). Mirrors the backend canManageItem on folders.
  const canManageFolder =
    canWrite && (vault.role === "manager" || vault.role === "editor");

  return (
    <div className="mb-px">
      <div
        className={cn(
          "group flex items-center gap-1 px-1 py-1 rounded-md transition-colors relative",
          active && !activeFolderId
            ? "bg-sidebar-accent text-foreground font-medium"
            : "hover:bg-sidebar-accent",
        )}
      >
        {active && !activeFolderId && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-brand" />
        )}
        <button
          onClick={onToggle}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="size-5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 flex items-center justify-center shrink-0 transition-transform"
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <Link
          href={`/app/vault/${vault.id}`}
          className="flex-1 flex items-center gap-2 min-w-0 py-0.5"
        >
          <IconTile
            name={vault.iconKey ?? "folder"}
            color={vault.color ?? "violet"}
            size="sm"
          />
          <span className="flex-1 truncate text-sm">{vault.name}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 pr-1">
            {vault.itemCount}
          </span>
        </Link>
      </div>

      {/* Folders (only when expanded) */}
      {expanded && (
        <div className="ml-3 pl-2 border-l border-line-1 mt-0.5 space-y-px">
          {vaultFolders.map((folder) => {
            const folderActive = active && activeFolderId === folder.id;
            return (
              <div
                key={folder.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md text-sm transition-colors relative",
                  folderActive
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-foreground/70 hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                {folderActive && (
                  <span className="absolute -left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-0.5 rounded-full bg-brand" />
                )}
                <Link
                  href={`/app/vault/${vault.id}?folder=${folder.id}`}
                  className="flex-1 flex items-center gap-2 min-w-0 px-2 py-1"
                >
                  <VaultIcon
                    name={folder.iconKey ?? "folder"}
                    className={cn(
                      "size-3.5 shrink-0",
                      folderActive ? c.text : "text-muted-foreground",
                    )}
                  />
                  <span className="flex-1 truncate">{folder.name}</span>
                </Link>
                {canManageFolder && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          aria-label={t("common.more")}
                          title={t("common.more")}
                          className="size-5 mr-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-3 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      }
                    >
                      <MoreHorizontal className="size-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => onShareFolder(folder.id)}
                        >
                          <UserPlus className="size-3.5" />
                          {t("share.share_folder")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditFolder(folder.id)}>
                          <Pencil className="size-3.5" />
                          {t("folder.edit.button")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDeleteFolder(folder.id)}
                        >
                          <Trash2 className="size-3.5" />
                          {t("folder.delete.button")}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
          {vaultFolders.length === 0 && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground/70 italic">
              {t("nav.no_folders_yet")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors relative",
        active
          ? "bg-sidebar-accent text-foreground font-medium"
          : "text-foreground/80 hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-brand" />
      )}
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
    </Link>
  );
}
