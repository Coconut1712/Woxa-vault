"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Star,
  Search,
  MoreHorizontal,
  Send,
  Plus,
  StarOff,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconTile } from "@/components/icon";
import { NewItemDialog } from "@/components/vault/new-item-dialog";
import { EditItemDialog } from "@/components/vault/edit-item-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApiErrorState,
  ApiLoadingState,
} from "@/components/shared/api-states";
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
import { ApiError } from "@/lib/api/client";
import type { VaultRole } from "@/lib/api/types";
import { useVaults } from "@/lib/vaults/provider";
import { useVaultLock } from "@/components/vault-lock/lock-provider";
import { timeAgo, itemTypeColor } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import {
  canEditItemRole,
  canRevealItem,
  canWriteVaultData,
} from "@/lib/auth/permissions";

export default function FavoritesPage() {
  const tr = useT();
  const router = useRouter();
  const { vaults } = useVaults();
  const { getVaultKey } = useVaultLock();
  const { me } = useAuth();
  // Guests are read-only: hide new-item, one-time-send, and unfavorite (these
  // are all writes that the backend 403s for guests).
  const canWrite = canWriteVaultData(me?.role ?? null);
  // "New item" needs a vault where the caller is manager|editor (the `user`
  // vault role is use-only).
  const canCreateItem = canWrite && vaults.some((v) => canEditItemRole(v.role));
  const [query, setQuery] = useState("");
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [items, setItems] = useState<DisplayItemSummary[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<DisplayItemFull | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Round 2 has no /favorites endpoint — gather from every vault list.
      // For v2 (ZK) vaults fetch the key so names decrypt; a locked vault
      // yields null and those rows show the 🔒 placeholder.
      const lists = await Promise.all(
        vaults.map(async (v) => {
          const vaultKey =
            v.encryptionVersion === 2 ? await getVaultKey(v.id) : undefined;
          return listDisplayItems(v.id, undefined, vaultKey ?? undefined);
        }),
      );
      setItems(lists.flat().filter((i) => i.displayFavorite));
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      else setError(new ApiError(0, "network_error", "Network error"));
    } finally {
      setLoading(false);
    }
  }, [vaults, getVaultKey]);

  useEffect(() => {
    if (vaults.length > 0) {
      void load();
    } else {
      setLoading(false);
    }
  }, [vaults, load]);

  const handleUnfavorite = async (id: string) => {
    try {
      // v2 (ZK) vault: persisting re-encrypts the notes meta blob, so fetch the
      // item's vault key. A locked vault → VaultLockedError → "unlock first".
      const target = items.find((p) => p.id === id);
      const targetVault = target
        ? vaults.find((v) => v.id === target.vaultId)
        : undefined;
      const vaultKey =
        targetVault?.encryptionVersion === 2
          ? await getVaultKey(targetVault.id)
          : null;
      // Guests may (un)favorite, but read-only: persist client-side only.
      await toggleFavorite(id, { persist: canWrite, vaultKey });
      setItems((prev) => prev.filter((p) => p.id !== id));
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

  const handleEditItem = async (itemId: string) => {
    try {
      const full = await getDisplayItem(itemId);
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

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deleteDisplayItem(deleteTarget.id);
      toast.success(tr("item.deleted_toast"), {
        description: deleteTarget.name,
      });
      setItems((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.delete_failed"), { description });
    } finally {
      setDeleteBusy(false);
    }
  };

  const filtered = items.filter(
    (i) =>
      !query ||
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      i.username?.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <Topbar
        title={tr("fav.title")}
        subtitle={tr("fav.subtitle", { n: items.length })}
        actions={
          canCreateItem ? (
            <Button
              size="sm"
              onClick={() => setNewItemOpen(true)}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Plus className="size-3.5" /> {tr("vault.new_item")}
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {loading ? (
            <ApiLoadingState />
          ) : error ? (
            <ApiErrorState error={error} onRetry={load} />
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="relative max-w-sm mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tr("fav.filter")}
                  className="pl-9 h-9 bg-card/40 border-line-1"
                />
              </div>

              <div className="rounded-2xl border border-border bg-card card-elevated shadow-card divide-y divide-border overflow-hidden">
                {filtered.map((item) => {
                  const vault = vaults.find((v) => v.id === item.vaultId);
                  const itemRole: VaultRole =
                    item.effectiveRole ??
                    vault?.role ??
                    item.displayEffectiveRole;
                  const canSendThisItem = canRevealItem(itemRole) && canWrite;
                  const canEditThisItem = canEditItemRole(itemRole) && canWrite;
                  const hasRowMenu = canSendThisItem || canEditThisItem;
                  return (
                    <div
                      key={item.id}
                      className="group flex items-center gap-3 px-5 py-3 hover:bg-surface-1 transition-colors"
                    >
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
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {item.name}
                            </span>
                            <Star className="size-3 text-amber-400 fill-amber-400" />
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate font-mono-secret">
                            {item.username ?? tr(`item.types.${item.displayKind}`)}
                          </div>
                        </div>

                        <Badge
                          variant="outline"
                          className="text-[10px] h-5 px-1.5 font-normal border-line-1 bg-surface-1 text-muted-foreground"
                        >
                          {vault?.name}
                        </Badge>

                        <div className="hidden md:block text-[11px] text-muted-foreground tabular-nums w-24 text-right">
                          {timeAgo(item.lastUsedAt ?? item.updatedAt)}
                        </div>
                      </Link>

                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Unfavorite available to ALL roles incl. guest
                            (read-only users persist it client-side only). */}
                        <button
                          aria-label={tr("fav.remove_from_favorites")}
                          title={tr("fav.remove_from_favorites")}
                          className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-amber-400"
                          onClick={() => void handleUnfavorite(item.id)}
                        >
                          <StarOff className="size-3.5" />
                        </button>
                        {hasRowMenu && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label={tr("common.more")}
                                  title={tr("common.more")}
                                  className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground"
                                />
                              }
                            >
                              <MoreHorizontal className="size-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuGroup>
                                {canSendThisItem && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(
                                        `/app/sends/new?item=${item.id}`,
                                      )
                                    }
                                  >
                                    <Send className="size-3.5" />
                                    {tr("vault.send_one_time")}
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
                                      setDeleteTarget({
                                        id: item.id,
                                        name: item.name,
                                      })
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
                    </div>
                  );
                })}

                {filtered.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {tr("fav.no_match_query", { query })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {editItem && (
        <EditItemDialog
          open={!!editItem}
          onOpenChange={(o) => !o && setEditItem(null)}
          item={editItem}
          onSaved={async () => {
            setEditItem(null);
            await load();
          }}
        />
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("item.delete.title")}</DialogTitle>
            <DialogDescription>
              {tr("item.delete.desc", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              {tr("common.cancel")}
            </Button>
            <Button
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              onClick={() => void handleConfirmDelete()}
              disabled={deleteBusy}
            >
              <Trash2 className="size-3.5" /> {tr("item.delete.button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewItemDialog open={newItemOpen} onOpenChange={setNewItemOpen} />
    </>
  );
}

function EmptyState() {
  const tr = useT();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="size-14 rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center mb-4">
        <Star className="size-6 text-amber-400" />
      </div>
      <h3 className="font-medium mb-1">{tr("fav.empty.title")}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        {tr("fav.empty.desc")}
      </p>
      <Button variant="outline" size="sm" render={<Link href="/app" />}>
        {tr("fav.browse")}
      </Button>
    </div>
  );
}
