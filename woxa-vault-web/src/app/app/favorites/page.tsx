"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Star,
  Search,
  MoreHorizontal,
  Send,
  Plus,
  StarOff,
} from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { IconTile } from "@/components/icon";
import { NewItemDialog } from "@/components/vault/new-item-dialog";
import {
  ApiErrorState,
  ApiLoadingState,
} from "@/components/shared/api-states";
import {
  listDisplayItems,
  toggleFavorite,
  type DisplayItemSummary,
} from "@/lib/items-overlay";
import { ApiError } from "@/lib/api/client";
import { useVaults } from "@/lib/vaults/provider";
import { timeAgo, itemTypeColor } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { canEditItemRole, canWriteVaultData } from "@/lib/auth/permissions";

export default function FavoritesPage() {
  const tr = useT();
  const { vaults } = useVaults();
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Round 2 has no /favorites endpoint — gather from every vault list.
      const lists = await Promise.all(
        vaults.map((v) => listDisplayItems(v.id)),
      );
      setItems(lists.flat().filter((i) => i.displayFavorite));
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      else setError(new ApiError(0, "network_error", "Network error"));
    } finally {
      setLoading(false);
    }
  }, [vaults]);

  useEffect(() => {
    if (vaults.length > 0) {
      void load();
    } else {
      setLoading(false);
    }
  }, [vaults, load]);

  const handleUnfavorite = async (id: string) => {
    try {
      // Guests may (un)favorite, but read-only: persist client-side only.
      await toggleFavorite(id, { persist: canWrite });
      setItems((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.save_failed"), { description });
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
                        {/* Send is a share action — hidden for guests. */}
                        {canWrite && (
                          <Link
                            href={`/app/sends/new?item=${item.id}`}
                            aria-label={tr("vault.send_one_time")}
                            className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground"
                          >
                            <Send className="size-3.5" />
                          </Link>
                        )}
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
                        {canWrite && (
                          <button
                            aria-label={tr("common.more")}
                            title={tr("common.more")}
                            className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground"
                          >
                            <MoreHorizontal className="size-3.5" />
                          </button>
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
