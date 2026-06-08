"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  MoreHorizontal,
  ShieldCheck,
  Folder as FolderIcon,
  X,
  UserPlus,
  AtSign,
  Trash2,
  Star,
  Pencil,
  ChevronDown,
  Check,
  Send,
  RotateCw,
  Loader2,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconTile, VaultIcon, colorFor } from "@/components/icon";
import { timeAgo, itemTypeColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ShareDialog } from "@/components/vault/share-dialog";
import { NewItemDialog } from "@/components/vault/new-item-dialog";
import { NewFolderDialog } from "@/components/vault/new-folder-dialog";
import { EditVaultDialog } from "@/components/vault/edit-vault-dialog";
import { EditFolderDialog } from "@/components/vault/edit-folder-dialog";
import { MemberAvatars } from "@/components/vault/member-avatars";
import { EditItemDialog } from "@/components/vault/edit-item-dialog";
import { RotationBadge } from "@/components/vault/rotation-badge";
import { MigrateRekeyDialog } from "@/components/vault/migrate-rekey-dialog";
import { DeleteWithPasswordDialog } from "@/components/shared/delete-with-password-dialog";
import {
  ApiErrorState,
  ApiLoadingState,
  ListSkeleton,
} from "@/components/shared/api-states";
import { getVault, deleteVault } from "@/lib/api/vaults";
import {
  deleteDisplayItem,
  getDisplayItem,
  getItemPassword,
  listDisplayItems,
  toggleFavorite,
  VaultLockedError,
  type DisplayItemFull,
  type DisplayItemSummary,
} from "@/lib/items-overlay";
import { ApiError, VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import type { Vault, VaultMember, VaultRole } from "@/lib/api/types";
import { useVaults } from "@/lib/vaults/provider";
import { useFolders, type Folder } from "@/lib/folders/provider";
import { useVaultLock } from "@/components/vault-lock/lock-provider";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import {
  canWriteVaultData,
  canEditItemRole,
  canRevealItem,
  canShareResourceRole,
} from "@/lib/auth/permissions";

import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionsBar } from "@/components/vault/bulk-actions";

export default function VaultPageWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <VaultPage params={params} />
    </Suspense>
  );
}

function VaultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tr = useT();
  const { me } = useAuth();
  const { vaults, refresh: refreshVaults } = useVaults();
  const { getVaultKey } = useVaultLock();
  const { byVault, remove: removeFolder, isLoading: isFoldersLoading } = useFolders();

  const [vault, setVault] = useState<Vault | null>(null);
  const [members, setMembers] = useState<VaultMember[]>([]);
  const [items, setItems] = useState<DisplayItemSummary[]>([]);
  const [vaultError, setVaultError] = useState<ApiError | null>(null);
  const [itemsError, setItemsError] = useState<ApiError | null>(null);
  const [loadingVault, setLoadingVault] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);

  const showFavoritesOnly = searchParams.get("favorites") === "1";
  const activeFolderId = searchParams.get("folder");
  const showUncategorized = activeFolderId === "__none__";
  const [query, setQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFolderId, setShareFolderId] = useState<string | null>(null);
  const [shareItemId, setShareItemId] = useState<string | null>(null);
  const [shareItemName, setShareItemName] = useState("");
  // Editing an item needs the FULL item (secrets) — we fetch it on demand from
  // a row's 3-dot "Edit" before opening the dialog (list rows hold metadata only).
  const [editItem, setEditItem] = useState<DisplayItemFull | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [editVaultOpen, setEditVaultOpen] = useState(false);
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [deletingFolderBusy, setDeletingFolderBusy] = useState(false);

  // Phase C — crypto rotation. `rekeyOpen` opens the rekey dialog; `rekeyVaultKey`
  // is the current vault key passed to it (null while loading or locked).
  const [rekeyOpen, setRekeyOpen] = useState(false);
  const [rekeyVaultKey, setRekeyVaultKey] = useState<Uint8Array | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quickDeleteItem, setQuickDeleteItem] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [quickDeleteBusy, setQuickDeleteBusy] = useState(false);

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const selectAllVisible = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((it) => it.id));
    }
  };

  const folders = byVault(id);
  const foldersLoading = isFoldersLoading(id);
  const activeFolder = activeFolderId && activeFolderId !== "__none__"
    ? folders.find((f) => f.id === activeFolderId)
    : null;

  const loadVault = useCallback(async () => {
    setLoadingVault(true);
    setVaultError(null);
    try {
      const detail = await getVault(id);
      setVault(detail.vault);
      setMembers(detail.members);
    } catch (err) {
      if (err instanceof ApiError) {
        setVaultError(err);
        // Vault deleted or access revoked: self-heal the sidebar by refetching
        // the vault list so the now-inaccessible vault disappears without a
        // manual page reload.
        if (err.status === 404 || err.code === "not_found") {
          void refreshVaults();
        }
      } else {
        setVaultError(new ApiError(0, "network_error", "Network error"));
      }
    } finally {
      setLoadingVault(false);
    }
  }, [id, refreshVaults]);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    setItemsError(null);
    try {
      // v2 (ZK) vault: fetch the vault key so list rows can decrypt their
      // name/username/url ciphertext. A locked vault yields null → rows render
      // the 🔒 placeholder and refresh on unlock (VAULT_UNLOCKED_EVENT below).
      const targetVault = vaults.find((v) => v.id === id);
      const vaultKey =
        targetVault?.encryptionVersion === 2
          ? await getVaultKey(id)
          : undefined;
      const next = await listDisplayItems(id, undefined, vaultKey ?? undefined);
      setItems(next);
    } catch (err) {
      if (err instanceof ApiError) setItemsError(err);
      else setItemsError(new ApiError(0, "network_error", "Network error"));
    } finally {
      setLoadingItems(false);
    }
  }, [id, vaults, getVaultKey]);

  useEffect(() => {
    void loadVault();
    void loadItems();
  }, [loadVault, loadItems]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => {
      void loadVault();
      void loadItems();
    };
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [loadVault, loadItems]);

  const handleItemCreated = useCallback(() => {
    void loadItems();
    void refreshVaults();
  }, [loadItems, refreshVaults]);

  const handleDelete = useCallback(async () => {
    if (!vault) return;
    try {
      await deleteVault(vault.id);
      toast.success(tr("vault.deleted_toast"), { description: vault.name });
      setDeleteOpen(false);
      await refreshVaults();
      router.push("/app");
    } catch (err) {
      const description =
        err instanceof ApiError && err.code === "vault_not_empty"
          ? tr("api.error.vault_not_empty")
          : err instanceof ApiError
            ? err.message
            : tr("api.error.generic");
      toast.error(tr("api.error.delete_failed"), { description });
    }
  }, [vault, refreshVaults, router, tr]);

  const handleToggleFavorite = async (itemId: string) => {
    try {
      // v2 (ZK) vault: persisting a favorite re-encrypts the notes meta blob, so
      // fetch the vault key. A locked vault yields null → toggleFavorite throws
      // VaultLockedError and we prompt the user to unlock.
      const targetVault = vaults.find((v) => v.id === id);
      const vaultKey =
        targetVault?.encryptionVersion === 2 ? await getVaultKey(id) : null;
      // Guests may favorite, but read-only: persist client-side only (no
      // PATCH /items, which the backend blocks for them).
      const next = await toggleFavorite(itemId, {
        persist: canWriteVaultData(me?.role ?? null),
        vaultKey,
      });
      setItems((prev) =>
        prev.map((p) =>
          p.id === itemId
            ? { ...p, displayFavorite: next.displayFavorite }
            : p,
        ),
      );
    } catch (err) {
      if (err instanceof VaultLockedError) {
        toast.error(tr("item.favorite_locked"), {
          description: tr("item.favorite_locked_desc"),
        });
        return;
      }
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.save_failed"), { description });
    }
  };

  const handleQuickDelete = (itemId: string, name: string) => {
    setQuickDeleteItem({ id: itemId, name });
  };

  const handleConfirmQuickDelete = async () => {
    if (!quickDeleteItem || quickDeleteBusy) return;
    setQuickDeleteBusy(true);
    try {
      await deleteDisplayItem(quickDeleteItem.id);
      toast.success(tr("item.deleted_toast"), {
        description: quickDeleteItem.name,
      });
      setQuickDeleteItem(null);
      await loadItems();
      await refreshVaults();
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.delete_failed"), { description });
    } finally {
      setQuickDeleteBusy(false);
    }
  };

  const handleEditItem = async (itemId: string) => {
    try {
      const full = await getDisplayItem(itemId);
      // `getDisplayItem` no longer returns the password; editing needs it to
      // prefill the form, so fetch it via the reveal endpoint (logs an
      // `item.reveal` — correct, since editing accesses the secret). If the
      // fetch fails, open edit with a blank password so the dialog still works.
      let password = "";
      if (full.hasPassword) {
        try {
          password = (await getItemPassword(itemId)) ?? "";
        } catch {
          password = "";
        }
      }
      setEditItem({ ...full, password });
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.generic"), { description });
    }
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deleteFolderId || deletingFolderBusy) return;
    const folder = folders.find((f) => f.id === deleteFolderId);
    setDeletingFolderBusy(true);
    try {
      await removeFolder(id, deleteFolderId);
      toast.success(tr("folder.deleted_toast"), { description: folder?.name });
      setDeleteFolderId(null);
      // Backend SET NULLs item.folder_id; refresh items so the list no longer
      // shows the deleted folder badge.
      void loadItems();
      if (activeFolderId === deleteFolderId) {
        router.push(`/app/vault/${id}`);
      }
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.delete_failed"), { description });
    } finally {
      setDeletingFolderBusy(false);
    }
  };

  // Open the rekey dialog (vault key rotation). Needs the CURRENT vault key to
  // decrypt items; fetch it first. A locked vault yields null → the dialog
  // blocks with an "unlock first" hint rather than crashing.
  const openRekey = async () => {
    const key = await getVaultKey(id);
    setRekeyVaultKey(key);
    setRekeyOpen(true);
  };

  if (loadingVault) {
    return (
      <>
        <Topbar title="" />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-8 py-10">
            <ApiLoadingState />
          </div>
        </div>
      </>
    );
  }

  if (vaultError) {
    return (
      <>
        <Topbar title={tr("api.error.title")} />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-8 py-10">
            <ApiErrorState error={vaultError} onRetry={loadVault} />
            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/app")}
                className="mt-3"
              >
                {tr("dash.your_vaults")}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!vault) return null;

  // Org-role gate: guests are read-only ANYWHERE regardless of their vault
  // role, so AND it into every write affordance. For non-guests this is true
  // and the existing per-vault role checks are unchanged.
  const role = me?.role ?? null;
  const canWrite = canWriteVaultData(role);
  const isAuditor = role === "auditor";
  const canManage = vault.role === "manager" && canWrite;
  // Auditor can see who has access for compliance, but cannot manage.
  const canViewMembers = canWrite || isAuditor;
  
  // Create/edit content (new item, new/edit/delete folder). `user` is use-only,
  // so this is manager|editor only (mirrors backend canManageItem).
  const canEdit = canEditItemRole(vault.role) && canWrite;
  // Folder grants may be created by someone whose vault role is manager|editor.
  const canShareFolder =
    (vault.role === "manager" || vault.role === "editor") && canWrite;
  const vaultColor = vault.color ?? "violet";
  const c = colorFor(vaultColor);

  // Phase C crypto-rotation gate. Re-key rotates the vault key after a member is
  // revoked → owner/admin OR vault manager.
  const isOrgAdmin = role === "owner" || role === "admin";
  const canRekey = canWrite && (isOrgAdmin || vault.role === "manager");
  const rekeyPending = vault.rekeyPending === true;

  const filtered = items.filter((item) => {
    if (showFavoritesOnly && !item.displayFavorite) return false;
    if (showUncategorized && item.folderId) return false;
    if (activeFolder && item.folderId !== activeFolder.id) return false;
    if (
      query &&
      !item.name.toLowerCase().includes(query.toLowerCase()) &&
      !item.username?.toLowerCase().includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  const updateFilter = (key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (value === null) sp.delete(key);
    else sp.set(key, value);
    router.push(
      `/app/vault/${vault.id}${sp.toString() ? "?" + sp.toString() : ""}`,
    );
  };

  const folderItemCount = (folderId: string) =>
    items.filter((i) => i.folderId === folderId).length;
  const uncategorizedCount = items.filter((i) => !i.folderId).length;

  return (
    <>
      <Topbar
        title={vault.name}
        subtitle={vault.description ?? undefined}
        actions={
          <>
            {canViewMembers && (
              <MemberAvatars
                members={members}
                onClick={() => setShareOpen(true)}
              />
            )}
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShareOpen(true)}
              >
                <UserPlus className="size-3.5" /> {tr("vault.share")}
              </Button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Vault hero */}
        <div className="border-b border-border px-8 py-5">
          <div className="max-w-6xl mx-auto flex items-start gap-4">
            <IconTile
              name={vault.iconKey ?? "folder"}
              color={vaultColor}
              size="xl"
              withGlow
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-semibold tracking-tight">
                  {vault.name}
                </h1>
                <Badge
                  variant="outline"
                  className="text-[10px] border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1"
                >
                  <ShieldCheck className="size-2.5" /> {tr("vault.zk_badge")}
                </Badge>
                <Badge
                  variant="outline"
                  className="text-[10px] border-line-2 bg-surface-1 text-foreground/70 gap-1"
                >
                  {tr(`role.${vault.role}`)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {vault.description}
              </p>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                <span>{tr("vault.items_count", { n: items.length })}</span>
                <span className="text-border">·</span>
                <span>
                  {tr("vault.grants_count", { n: vault.memberCount })}
                </span>
              </div>
            </div>
          </div>

          {/* Phase C — re-key needed notice (a member was revoked). */}
          {rekeyPending && canRekey ? (
            <div className="max-w-6xl mx-auto mt-4">
              <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 px-4 py-3">
                <div className="flex items-start gap-3 min-w-0">
                  <RotateCw className="size-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      {tr("rekey.banner_title")}
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                      {tr("rekey.banner_desc")}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => void openRekey()}
                  className="shrink-0 bg-amber-600 text-white hover:bg-amber-600/90"
                >
                  <RotateCw className="size-3.5" /> {tr("rekey.banner_cta")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Action bar — single row: search, folder filter, active pills, new item, vault menu */}
        <div className="sticky top-0 glass-strong border-b border-border z-10">
          <div className="max-w-6xl mx-auto px-8 py-3 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("vault.filter_in_vault")}
                className="pl-9 h-8 bg-card/40 border-line-1"
              />
            </div>

            <div className="flex items-center gap-1">
              <FolderFilterDropdown
                vaultId={id}
                folders={folders}
                activeFolderId={activeFolderId}
                showUncategorized={showUncategorized}
                uncategorizedCount={uncategorizedCount}
                totalCount={items.length}
                folderItemCount={folderItemCount}
                canEdit={canEdit}
                onSelect={(value) => updateFilter("folder", value)}
                onCreate={() => setNewFolderOpen(true)}
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setNewFolderOpen(true)}
                  aria-label={tr("nf.title")}
                  title={tr("nf.title")}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-line-1 bg-surface-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors whitespace-nowrap"
                >
                  <Plus className="size-3.5 shrink-0" />
                  {tr("nf.title")}
                </button>
              )}
            </div>

            {/* Folder actions — shown when a real folder is active. Edit/Delete
                require write; Share requires vault role manager|editor (folder
                grants are gated by the parent vault role server-side). */}
            {activeFolder && canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={tr("folder.actions_aria")}
                      title={tr("folder.actions_aria")}
                    />
                  }
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuGroup>
                    {canShareFolder && (
                      <DropdownMenuItem
                        onClick={() => setShareFolderId(activeFolder.id)}
                      >
                        <UserPlus className="size-3.5" />
                        {tr("share.share_folder")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => setEditFolderId(activeFolder.id)}
                    >
                      <Pencil className="size-3.5" />
                      {tr("folder.edit.button")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleteFolderId(activeFolder.id)}
                    >
                      <Trash2 className="size-3.5" />
                      {tr("folder.delete.button")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {showFavoritesOnly && (
              <FilterPill
                active
                onClear={() => updateFilter("favorites", null)}
                label={tr("vault.favorites")}
                iconNode={
                  <Star className={cn("size-3 fill-current", c.text)} />
                }
              />
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground tabular-nums">
                {filtered.length} / {items.length}
              </span>
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => setNewItemOpen(true)}
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  <Plus className="size-3.5" /> {tr("vault.new_item")}
                </Button>
              )}
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={tr("vault.actions_aria")}
                        title={tr("vault.actions_aria")}
                      />
                    }
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => setEditVaultOpen(true)}>
                        <Pencil className="size-3.5" />
                        {tr("vault.edit.button")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="size-3.5" />
                        {tr("vault.delete.button")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        {/* Items list */}
        <div className="max-w-6xl mx-auto">
          {loadingItems ? (
            <ListSkeleton rows={6} />
          ) : itemsError ? (
            <ApiErrorState error={itemsError} onRetry={loadItems} />
          ) : items.length === 0 ? (
            <ItemsEmptyState
              canCreate={canEdit}
              onNewItem={() => setNewItemOpen(true)}
            />
          ) : filtered.length === 0 ? (
            <NoMatchState
              canCreate={canEdit}
              onNewItem={() => setNewItemOpen(true)}
            />
          ) : (
            <div className="divide-y divide-border">
              <div className="flex items-center gap-3 px-8 py-2 bg-muted/20 border-b border-border/50">
                {canEdit && (
                  <div className="flex items-center gap-3 w-10 shrink-0">
                    <Checkbox
                      checked={filtered.length > 0 && selectedIds.length === filtered.length}
                      onCheckedChange={selectAllVisible}
                    />
                  </div>
                )}
                <div className="flex-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {tr("vault.items_count", { n: filtered.length })}
                </div>
              </div>
              {filtered.map((item) => {
                const folderForItem = folders.find(
                  (f) => f.id === item.folderId,
                );
                // Per-item "most specific wins" role. Prefer the wire value;
                // fall back to the vault role when the wire omitted it. Edit/
                // delete affordances follow the ITEM's role (ANDed with the org
                // write gate), so an item-level Viewer override hides them even
                // on a vault Editor.
                const itemRole: VaultRole =
                  item.effectiveRole ?? vault.role ?? item.displayEffectiveRole;
                const canEditThisItem = canEditItemRole(itemRole) && canWrite;
                // Send needs reveal access (viewer can't); share needs effective
                // editor|manager OR being the item's creator. Both AND the org
                // write gate (guests are read-only).
                const canSendThisItem = canRevealItem(itemRole) && canWrite;
                const canShareThisItem =
                  canWrite &&
                  (canShareResourceRole(itemRole) ||
                    item.createdBy.id === me?.id);
                const hasRowMenu =
                  canSendThisItem || canShareThisItem || canEditThisItem;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "group flex items-center gap-3 px-8 py-3 hover:bg-surface-1 transition-colors",
                      selectedIds.includes(item.id) && "bg-brand/5"
                    )}
                  >
                    {canEdit && (
                      <div className="flex items-center gap-3 w-10 shrink-0">
                        <Checkbox
                          checked={selectedIds.includes(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </div>
                    )}
                    <Link
                      href={`/app/item/${item.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <IconTile
                        type={item.displayKind}
                        color={itemTypeColor[item.displayKind]}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">
                            {item.name}
                          </span>
                          {item.displayFavorite && (
                            <Star className="size-3 fill-amber-500 text-amber-500" />
                          )}
                          <RotationBadge
                            status={item.rotationStatus}
                            dueAt={item.rotationDueAt}
                          />
                          {folderForItem && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 h-4 border-line-2 bg-surface-1 text-foreground/60 gap-0.5"
                            >
                              <FolderIcon className="size-2" />
                              {folderForItem.name}
                            </Badge>
                          )}
                          {item.displayTags.slice(0, 2).map((tagText) => (
                            <Badge
                              key={tagText}
                              variant="outline"
                              className="text-[9px] py-0 h-4 border-line-2 bg-surface-1 text-foreground/60"
                            >
                              {tagText}
                            </Badge>
                          ))}
                        </div>
                        {item.username && (
                          <div className="text-[11px] text-muted-foreground truncate font-mono-secret">
                            {item.username}
                          </div>
                        )}
                      </div>

                      <div className="hidden lg:block text-[11px] text-muted-foreground tabular-nums w-24 text-right">
                        {item.updatedAt ? timeAgo(item.updatedAt) : "—"}
                      </div>
                    </Link>

                    {/* Favorite is available to ALL roles incl. guest (read-only
                        users persist it client-side only). */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        void handleToggleFavorite(item.id);
                      }}
                      aria-label={
                        item.displayFavorite
                          ? tr("item.unfavorite")
                          : tr("item.favorite")
                      }
                      title={
                        item.displayFavorite
                          ? tr("item.unfavorite")
                          : tr("item.favorite")
                      }
                      className={cn(
                        // Always hover-only — the persistent favorite indicator
                        // is the star next to the name; the right-side toggle
                        // only appears on row hover (to favorite / unfavorite).
                        "p-1 rounded transition-colors opacity-0 group-hover:opacity-100",
                        item.displayFavorite
                          ? "text-amber-500 hover:text-amber-600"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Star
                        className={cn(
                          "size-3.5",
                          item.displayFavorite && "fill-current",
                        )}
                      />
                    </button>

                    {/* Single 3-dot menu: Send / Share / Edit / Delete. Each
                        entry follows the ITEM's effective role (an item Viewer
                        override hides writes even on a vault Editor); the menu
                        hides entirely when none apply. */}
                    {hasRowMenu && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                              aria-label={tr("common.more")}
                              title={tr("common.more")}
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuGroup>
                            {canSendThisItem && (
                              <DropdownMenuItem
                                onClick={() =>
                                  router.push(`/app/sends/new?item=${item.id}`)
                                }
                              >
                                <Send className="size-3.5" />
                                {tr("vault.send_one_time")}
                              </DropdownMenuItem>
                            )}
                            {canShareThisItem && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setShareItemName(item.name);
                                  setShareItemId(item.id);
                                }}
                              >
                                <UserPlus className="size-3.5" />
                                {tr("share.share_item")}
                              </DropdownMenuItem>
                            )}
                            {canEditThisItem && (
                              <DropdownMenuItem
                                onClick={() => void handleEditItem(item.id)}
                              >
                                <Pencil className="size-3.5" />
                                {tr("item.edit")}
                              </DropdownMenuItem>
                            )}
                            {canEditThisItem && (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() =>
                                  handleQuickDelete(item.id, item.name)
                                }
                              >
                                <Trash2 className="size-3.5" />
                                {tr("item.delete.button")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        resourceKind="vault"
        resourceId={vault.id}
        resourceName={vault.name}
        canManage={canManage}
        currentUserId={me?.id}
        initialMembers={members}
        onMembersChange={setMembers}
      />

      {shareFolderId &&
        (() => {
          const folder = folders.find((f) => f.id === shareFolderId);
          if (!folder) return null;
          return (
            <ShareDialog
              open={!!shareFolderId}
              onOpenChange={(o) => !o && setShareFolderId(null)}
              resourceKind="folder"
              resourceId={folder.id}
              resourceName={folder.name}
              canManage={canShareFolder}
              currentUserId={me?.id}
            />
          );
        })()}

      {shareItemId &&
        (() => {
          const it = items.find((i) => i.id === shareItemId);
          const itRole: VaultRole = it
            ? (it.effectiveRole ?? vault.role ?? it.displayEffectiveRole)
            : "viewer";
          const itCanManage =
            canWrite &&
            (canShareResourceRole(itRole) || it?.createdBy.id === me?.id);
          return (
            <ShareDialog
              open={!!shareItemId}
              onOpenChange={(o) => !o && setShareItemId(null)}
              resourceKind="item"
              resourceId={shareItemId}
              resourceName={shareItemName}
              canManage={itCanManage}
              currentUserId={me?.id}
            />
          );
        })()}

      {editItem && (
        <EditItemDialog
          open={!!editItem}
          onOpenChange={(o) => !o && setEditItem(null)}
          item={editItem}
          onSaved={async () => {
            setEditItem(null);
            await loadItems();
            await refreshVaults();
          }}
        />
      )}

      {canEdit && selectedIds.length > 0 && (
        <BulkActionsBar
          selectedIds={selectedIds}
          vaultId={id}
          onClear={() => setSelectedIds([])}
          onComplete={() => {
            setSelectedIds([]);
            void loadItems();
          }}
        />
      )}

      <NewItemDialog
        open={newItemOpen}
        onOpenChange={setNewItemOpen}
        defaultVaultId={vault.id}
        defaultFolderId={activeFolder?.id}
        onCreated={handleItemCreated}
      />
      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        defaultVaultId={vault.id}
      />

      <EditVaultDialog
        vault={vault}
        open={editVaultOpen}
        onOpenChange={setEditVaultOpen}
        onUpdated={(next) => {
          setVault(next);
        }}
      />

      {editFolderId &&
        (() => {
          const folder = folders.find((f) => f.id === editFolderId);
          if (!folder) return null;
          return (
            <EditFolderDialog
              folder={folder}
              open={!!editFolderId}
              onOpenChange={(o) => !o && setEditFolderId(null)}
            />
          );
        })()}

      {rekeyOpen && (
        <MigrateRekeyDialog
          open={rekeyOpen}
          onOpenChange={setRekeyOpen}
          vaultId={vault.id}
          vaultName={vault.name}
          keyVersion={vault.keyVersion ?? 1}
          oldVaultKey={rekeyVaultKey}
          onDone={async () => {
            setRekeyOpen(false);
            await loadVault();
            await loadItems();
            await refreshVaults();
          }}
        />
      )}

      <DeleteWithPasswordDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={tr("vault.delete.title")}
        description={tr("vault.delete.desc", { name: vault.name })}
        confirmLabel={tr("vault.delete.button")}
        onConfirmed={handleDelete}
      />

      <Dialog
        open={quickDeleteItem !== null}
        onOpenChange={(o) => !o && setQuickDeleteItem(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("item.delete.title")}</DialogTitle>
            <DialogDescription>
              {tr("item.delete.desc", { name: quickDeleteItem?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickDeleteItem(null)} disabled={quickDeleteBusy}>
              {tr("common.cancel")}
            </Button>
            <Button
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              onClick={() => void handleConfirmQuickDelete()}
              disabled={quickDeleteBusy}
            >
              <Trash2 className="size-3.5" /> {tr("item.delete.button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteWithPasswordDialog
        open={!!deleteFolderId}
        onOpenChange={(o) => !o && setDeleteFolderId(null)}
        title={tr("folder.delete.title")}
        description={tr("folder.delete.desc", {
          name: folders.find((f) => f.id === deleteFolderId)?.name ?? "",
        })}
        confirmLabel={tr("folder.delete.button")}
        busy={deletingFolderBusy}
        onConfirmed={handleConfirmDeleteFolder}
      />
    </>
  );
}

/* =====================================================================
   FOLDER FILTER DROPDOWN — single-button folder picker in the action bar
   ===================================================================== */
type FolderFilterProps = {
  vaultId: string;
  folders: Folder[];
  activeFolderId: string | null;
  showUncategorized: boolean;
  uncategorizedCount: number;
  totalCount: number;
  folderItemCount: (folderId: string) => number;
  canEdit: boolean;
  onSelect: (value: string | null) => void;
  onCreate: () => void;
};

function FolderFilterDropdown({
  vaultId,
  folders,
  activeFolderId,
  showUncategorized,
  uncategorizedCount,
  totalCount,
  folderItemCount,
  canEdit,
  onSelect,
  onCreate,
}: FolderFilterProps) {
  const tr = useT();
  const { reorder } = useFolders();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = folders.map((folder) => folder.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    void reorder(vaultId, next).catch(() => {
      toast.error(tr("api.error.save_failed"));
    });
  };

  const isFiltered = Boolean(activeFolderId);
  const activeFolder = activeFolderId && activeFolderId !== "__none__"
    ? folders.find((f) => f.id === activeFolderId)
    : null;

  const triggerIcon = activeFolder ? (
    <VaultIcon
      name={activeFolder.iconKey ?? "folder"}
      className={cn("size-3", colorFor(activeFolder.color ?? "violet").text)}
    />
  ) : (
    <FolderIcon className="size-3" />
  );

  const triggerLabel = activeFolder
    ? tr("folder.filter_active", { name: activeFolder.name })
    : showUncategorized
      ? tr("folder.uncategorized")
      : `${tr("folder.filter_label")}: ${tr("folder.filter_all")}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={tr("folder.filter_aria")}
            className={cn(
              "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border transition-colors",
              isFiltered
                ? "border-brand/30 bg-brand/10 text-foreground"
                : "border-line-1 bg-surface-1 text-foreground/70 hover:text-foreground hover:bg-surface-2",
            )}
          />
        }
      >
        {triggerIcon}
        <span className="max-w-[200px] truncate">{triggerLabel}</span>
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => onSelect(null)}
            className={cn(!activeFolderId && "bg-brand/8 dark:bg-brand/10")}
          >
            <Check
              className={cn(
                "size-3.5 shrink-0",
                !activeFolderId ? "opacity-100 text-brand" : "opacity-0",
              )}
            />
            <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1">{tr("folder.all_items")}</span>
            {totalCount > 0 && (
              <span className="text-[10px] tabular-nums bg-surface-2 text-muted-foreground px-1.5 py-0.5 rounded-full">
                {totalCount}
              </span>
            )}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {folders.length > 0 && (
          <DropdownMenuGroup>
            {canEdit ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={folders.map((folder) => folder.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {folders.map((f) => (
                    <SortableFolderFilterRow
                      key={f.id}
                      active={activeFolderId === f.id}
                      folder={f}
                      count={folderItemCount(f.id)}
                      onSelect={() => onSelect(f.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              folders.map((f) => (
                <FolderFilterRow
                  key={f.id}
                  active={activeFolderId === f.id}
                  folder={f}
                  count={folderItemCount(f.id)}
                  onSelect={() => onSelect(f.id)}
                />
              ))
            )}
          </DropdownMenuGroup>
        )}

        {uncategorizedCount > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => onSelect("__none__")}
              className={cn(showUncategorized && "bg-brand/8 dark:bg-brand/10")}
            >
              <Check
                className={cn(
                  "size-3.5 shrink-0",
                  showUncategorized ? "opacity-100 text-brand" : "opacity-0",
                )}
              />
              <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1">{tr("folder.uncategorized")}</span>
              <span className="text-[10px] tabular-nums bg-surface-2 text-muted-foreground px-1.5 py-0.5 rounded-full">
                {uncategorizedCount}
              </span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}

        {canEdit && (
          <>
            <div className="mx-2 my-1 border-t border-line-1" />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onCreate} className="text-muted-foreground hover:text-foreground">
                <Plus className="size-3.5 shrink-0" />
                <span>{tr("nf.title")}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderFilterRow({
  active,
  folder,
  count,
  onSelect,
}: {
  active: boolean;
  folder: Folder;
  count: number;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      onClick={onSelect}
      className={cn(active && "bg-brand/8 dark:bg-brand/10")}
    >
      <Check
        className={cn("size-3.5 shrink-0", active ? "opacity-100 text-brand" : "opacity-0")}
      />
      <VaultIcon
        name={folder.iconKey ?? "folder"}
        className={cn("size-3.5 shrink-0", colorFor(folder.color ?? "violet").text)}
      />
      <span className="flex-1 truncate">{folder.name}</span>
      {count > 0 && (
        <span className="text-[10px] tabular-nums bg-surface-2 text-muted-foreground px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </DropdownMenuItem>
  );
}

/**
 * Sortable variant of FolderFilterRow (US-011.4). The whole row keeps its
 * click-to-filter behavior; dragging is initiated only from the GripVertical
 * handle (revealed on hover) so click and drag coexist. The handle carries the
 * dnd-kit listeners + keyboard attributes for accessible reordering.
 */
function SortableFolderFilterRow({
  active,
  folder,
  count,
  onSelect,
}: {
  active: boolean;
  folder: Folder;
  count: number;
  onSelect: () => void;
}) {
  const tr = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group/folder flex items-stretch", isDragging && "z-10 opacity-80")}
    >
      <DropdownMenuItem
        onClick={onSelect}
        className={cn("flex-1 min-w-0", active && "bg-brand/8 dark:bg-brand/10")}
      >
        <Check
          className={cn("size-3.5 shrink-0", active ? "opacity-100 text-brand" : "opacity-0")}
        />
        <VaultIcon
          name={folder.iconKey ?? "folder"}
          className={cn("size-3.5 shrink-0", colorFor(folder.color ?? "violet").text)}
        />
        <span className="flex-1 truncate">{folder.name}</span>
        {count > 0 && (
          <span className="text-[10px] tabular-nums bg-surface-2 text-muted-foreground px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </DropdownMenuItem>
      {/* Grip handle: always reserves space so the count is never overlapped.
          Visible only on hover/focus — opacity-0 keeps it out of sight without
          collapsing the column that protects the count. */}
      <button
        type="button"
        aria-label={tr("folder.reorder_aria", { name: folder.name })}
        className="px-1.5 flex items-center text-muted-foreground/50 opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100 hover:text-foreground touch-none cursor-grab active:cursor-grabbing transition-opacity outline-none shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
    </div>
  );
}

/* =====================================================================
   FILTER PILL — used for active filters (clearable)
   ===================================================================== */
function FilterPill({
  active,
  onClear,
  label,
  iconNode,
}: {
  active?: boolean;
  onClear: () => void;
  label: string;
  iconNode?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClear}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium border transition-colors",
        active
          ? "border-brand/30 bg-brand/10 text-foreground"
          : "border-line-1 bg-surface-1 text-foreground/70 hover:text-foreground hover:bg-surface-2",
      )}
    >
      {iconNode}
      <span>{label}</span>
      {active && <X className="size-3 opacity-60" />}
    </button>
  );
}

/* =====================================================================
   EMPTY / NO-MATCH STATES
   ===================================================================== */
function ItemsEmptyState({
  canCreate,
  onNewItem,
}: {
  canCreate: boolean;
  onNewItem: () => void;
}) {
  const tr = useT();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
      <div className="size-14 rounded-2xl bg-brand/10 ring-1 ring-brand/20 flex items-center justify-center mb-4">
        <FolderIcon className="size-6 text-brand" />
      </div>
      <h3 className="font-medium mb-1">{tr("vault.items.empty.title")}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        {tr("vault.items.empty.desc")}
      </p>
      {canCreate && (
        <Button
          size="sm"
          onClick={onNewItem}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-3.5" /> {tr("vault.items.empty.cta")}
        </Button>
      )}
    </div>
  );
}

function NoMatchState({
  canCreate,
  onNewItem,
}: {
  canCreate: boolean;
  onNewItem: () => void;
}) {
  const tr = useT();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
      <div className="size-14 rounded-2xl bg-surface-1 ring-1 ring-line-1 flex items-center justify-center mb-4">
        <FolderIcon className="size-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium mb-1">{tr("vault.no_match.title")}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        {tr("vault.no_match.desc")}
      </p>
      {canCreate && (
        <Button
          size="sm"
          onClick={onNewItem}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-3.5" /> {tr("vault.new_item")}
        </Button>
      )}
    </div>
  );
}
