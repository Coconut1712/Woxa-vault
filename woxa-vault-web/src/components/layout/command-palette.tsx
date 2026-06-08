"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  History,
  Plus,
  Settings,
  Star,
  Loader2,
} from "lucide-react";
import { VaultIcon, ItemTypeIcon, colorFor } from "@/components/icon";
import { itemTypeColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import {
  canEditItemRole,
  canViewAuditLog,
  canViewWorkspaceSettings,
  canWriteVaultData,
} from "@/lib/auth/permissions";
import type { SearchResult } from "@/lib/api/search";
import { searchAllItems } from "@/lib/items-overlay";
import { useVaultLock } from "@/components/vault-lock/lock-provider";
import { Lock } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

import { useVaults } from "@/lib/vaults/provider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Min query length before we hit the server; below this we show no items. */
const MIN_QUERY = 1;
/** Debounce window for the per-keystroke search request. */
const DEBOUNCE_MS = 250;

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter();
  const t = useT();
  const { vaults } = useVaults();
  const { getVaultKey } = useVaultLock();
  const { me } = useAuth();
  // The active workspace search results are scoped to. When it changes (the
  // user switches workspace while the palette is open) we must re-run the
  // search so stale results from the previous workspace can't be selected.
  const activeOrgId = me?.activeOrgId ?? null;

  // Org-role gating mirrors the sidebar: guests can't create items/sends, and
  // audit/settings are admin-only.
  const role = me?.role ?? null;
  const canWrite = canWriteVaultData(role);
  // "New item" needs a vault where the caller is manager|editor (user is use-only).
  const canCreateItem = canWrite && vaults.some((v) => canEditItemRole(v.role));
  const showAudit = canViewAuditLog(role);
  const showSettings = canViewWorkspaceSettings(role);
  const showGoTo = showAudit || showSettings;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // True when a v2 (ZK) vault was skipped during the search because it's locked
  // — drives an "unlock to search encrypted vaults" hint so results aren't
  // silently incomplete.
  const [lockedHint, setLockedHint] = useState(false);
  // Tracks the in-flight request so a newer keystroke cancels the older one.
  const abortRef = useRef<AbortController | null>(null);

  // Snapshot of {id} for the search orchestrator, plus a stable string key so
  // the search effect re-runs only when the vault set actually changes (not on
  // every render).
  const searchVaults = vaults.map((v) => ({ id: v.id }));
  const vaultsKey = searchVaults.map((v) => v.id).join(",");

  // Reset transient search state when the palette closes so the next open
  // starts clean (cmdk keeps the input value otherwise). Routed through the
  // open-change handler rather than an effect to avoid a synchronous
  // setState-in-effect cascade.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      abortRef.current?.abort();
      abortRef.current = null;
      setQuery("");
      setResults([]);
      setSearching(false);
      setLockedHint(false);
    }
    onOpenChange(next);
  };

  // Debounced server search. We disable cmdk's own filtering (shouldFilter
  // below) so server results always render — the server already matched on
  // fields the display row doesn't show (username/url/type) and sorted them.
  // All setState happens inside the async timer callback (never synchronously
  // in the effect body) to keep render scheduling clean.
  useEffect(() => {
    const q = query.trim();
    abortRef.current?.abort();

    if (q.length < MIN_QUERY) {
      abortRef.current = null;
      const clear = setTimeout(() => {
        setResults([]);
        setSearching(false);
        setLockedHint(false);
      }, 0);
      return () => clearTimeout(clear);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        // Runs the ZK blind-index search across every unlocked vault. Locked
        // vaults are skipped and reported via hadLockedZkVault.
        const { results: found, hadLockedZkVault } = await searchAllItems(
          q,
          searchVaults,
          getVaultKey,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResults(found);
        setLockedHint(hadLockedZkVault);
      } catch {
        if (controller.signal.aborted) return;
        // A 400 (q too long / malformed) or any other failure is swallowed
        // silently — degrade to "no results" rather than surfacing a crash or
        // error toast on a keystroke.
        setResults([]);
        setLockedHint(false);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `activeOrgId` is a dependency so switching workspace while the palette is
    // open re-runs the search (and the abort above clears the prior workspace's
    // in-flight request), preventing a stale cross-workspace result. The vaults
    // key re-runs the search if the set of v2 vaults (and their lock state via a
    // fresh getVaultKey) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeOrgId, vaultsKey, getVaultKey]);

  const go = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const q = query.trim().toLowerCase();
  const filteredVaults = q
    ? vaults.filter((v) => v.name.toLowerCase().includes(q))
    : vaults;

  const hasItemQuery = query.trim().length >= MIN_QUERY;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      shouldFilter={false}
    >
      <CommandInput
        placeholder={t("cmd.search_placeholder")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{searching ? t("cmd.searching") : t("cmd.no_results")}</CommandEmpty>

        {!q && (
          <CommandGroup heading={t("cmd.quick_actions")}>
            {canCreateItem && (
              <CommandItem onSelect={() => go("/app/new")}>
                <Plus /> {t("vault.new_item")}
                <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
            )}
            {canWrite && (
              <CommandItem onSelect={() => go("/app/sends/new")}>
                <Send /> {t("cmd.send_copy")}
                <CommandShortcut>⌘S</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem onSelect={() => go("/app/favorites")}>
              <Star /> {t("nav.favorites")}
            </CommandItem>
          </CommandGroup>
        )}

        {hasItemQuery && (
          <>
            {!q && <CommandSeparator />}
            <CommandGroup heading={t("cmd.items")}>
              {searching && results.length === 0 && (
                <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("cmd.searching")}
                </div>
              )}
              {!searching && results.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  {t("cmd.no_items")}
                </div>
              )}
              {!searching && lockedHint && (
                <div className="flex items-center gap-1.5 px-2 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                  <Lock className="size-3 shrink-0" />
                  {t("cmd.locked_zk_hint")}
                </div>
              )}
              {results.map((item) => {
                const c = colorFor(itemTypeColor[item.type] ?? "blue");
                return (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => go(`/app/item/${item.id}`)}
                  >
                    <div
                      className={cn(
                        "size-5 rounded-md flex items-center justify-center ring-1",
                        c.bg,
                        c.ring,
                      )}
                    >
                      <ItemTypeIcon
                        type={item.type}
                        className={cn("size-3", c.text)}
                      />
                    </div>
                    <span className="truncate">{item.name}</span>
                    {item.username && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.username}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {item.vaultName}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {filteredVaults.length > 0 && (
          <>
            {(hasItemQuery || !q) && <CommandSeparator />}
            <CommandGroup heading={t("cmd.vaults")}>
              {filteredVaults.map((v) => {
                const c = colorFor(v.color ?? "violet");
                return (
                  <CommandItem
                    key={v.id}
                    value={`vault:${v.id}`}
                    onSelect={() => go(`/app/vault/${v.id}`)}
                  >
                    <div
                      className={cn(
                        "size-5 rounded-md flex items-center justify-center ring-1",
                        c.bg,
                        c.ring,
                      )}
                    >
                      <VaultIcon
                        name={v.iconKey ?? "folder"}
                        className={cn("size-3", c.text)}
                      />
                    </div>
                    <span>{v.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t("cmd.n_items", { n: v.itemCount })}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {showGoTo && !q && (
          <>
            <CommandSeparator />

            <CommandGroup heading={t("cmd.go_to")}>
              {showAudit && (
                <CommandItem onSelect={() => go("/app/audit")}>
                  <History /> {t("nav.audit_log")}
                </CommandItem>
              )}
              {showSettings && (
                <CommandItem onSelect={() => go("/app/settings")}>
                  <Settings /> {t("nav.settings")}
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
