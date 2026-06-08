"use client";

/**
 * FoldersProvider — wraps the `/vaults/:id/folders` + `/folders/:id` endpoints
 * as a React context so sidebar, vault page, dialogs, and item-detail all
 * share the same in-memory cache.
 *
 * Caching strategy
 * ----------------
 * Folders are per-vault. We lazy-load each vault on first `byVault(vaultId)`
 * call and cache the result in a `Record<vaultId, Folder[]>`. After every
 * successful mutation (`create`, `update`, `remove`) we refresh that vault's
 * list so consumers re-render with fresh data.
 *
 * Why not load everything up-front?
 *   - There can be many vaults; doing a flat list of "all folders for this
 *     user" would require a backend join that the contract doesn't ship.
 *   - Lazy-loading keeps the dashboard fast and only fetches what the user
 *     opens.
 *
 * Errors bubble up to callers (dialogs / pages) so they can toast the message
 * — the provider stays state-shaped, not toast-shaped.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/lib/auth/provider";
import {
  createFolder as apiCreate,
  deleteFolder as apiDelete,
  listFolders as apiList,
  updateFolder as apiUpdate,
} from "@/lib/api/folders";
import { reorderFolders as apiReorder } from "@/lib/api/vaults";
import type {
  Folder,
  FolderCreateInput,
  FolderUpdateInput,
} from "@/lib/api/types";

interface FoldersContextValue {
  /** Synchronous lookup. Returns `[]` until the vault's folders have been
   *  fetched at least once. Triggers a fetch on first call. */
  byVault: (vaultId: string) => Folder[];
  /** True when the most recent `byVault(vaultId)` is still pending. */
  isLoading: (vaultId: string) => boolean;
  /** Force-refresh a single vault's folder list. */
  refresh: (vaultId: string) => Promise<void>;
  /** Create folder + refresh that vault's list. Throws on API error. */
  create: (vaultId: string, input: FolderCreateInput) => Promise<Folder>;
  /** Patch folder + refresh that vault's list. Throws on API error. */
  update: (
    vaultId: string,
    id: string,
    patch: FolderUpdateInput,
  ) => Promise<Folder>;
  /** Delete folder + refresh that vault's list. Throws on API error. */
  remove: (vaultId: string, id: string) => Promise<void>;
  /**
   * Persist a new folder display order (US-011.4). Reorders the local list
   * optimistically, calls the API, and reverts on error. `order` is the full
   * list of folder ids in their desired order.
   */
  reorder: (vaultId: string, order: string[]) => Promise<void>;
}

const FoldersContext = createContext<FoldersContextValue | null>(null);

/**
 * Backend `/vaults/:id/folders` validates `:id` as a UUID. If a caller hands us
 * anything else — undefined leaking through as the string "undefined", a stale
 * mock id from a bookmarked URL, an empty string before context is hydrated —
 * the request would 400 with `validation_error` / "Invalid path parameter" and
 * surface as an unhandled ApiError. Guard at the provider boundary so callers
 * stay simple and we only hit the network with shapes the backend can answer.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function FoldersProvider({ children }: { children: React.ReactNode }) {
  const { user, me } = useAuth();
  const userId = user?.id ?? null;
  // Folders live under org-scoped vaults, so a workspace switch must drop the
  // cache too (otherwise the previous workspace's folders linger).
  const activeOrgId = me?.activeOrgId ?? null;

  const [byVaultMap, setByVaultMap] = useState<Record<string, Folder[]>>({});
  const [loadingVaults, setLoadingVaults] = useState<Record<string, boolean>>(
    {},
  );

  /**
   * Tracks which vaults have a fetch in-flight (or already completed) for the
   * current user, so that synchronous `byVault` calls during render don't
   * fire infinite re-renders. Reset when the user changes.
   */
  const requestedRef = useRef<Set<string>>(new Set());

  // Clear cache + request tracker when the signed-in user OR the active
  // workspace changes.
  useEffect(() => {
    requestedRef.current = new Set();
    setByVaultMap({});
    setLoadingVaults({});
  }, [userId, activeOrgId]);

  const refresh = useCallback(
    async (vaultId: string) => {
      if (!userId) return;
      if (!isUuid(vaultId)) return;
      setLoadingVaults((prev) =>
        prev[vaultId] ? prev : { ...prev, [vaultId]: true },
      );
      try {
        const next = await apiList(vaultId);
        setByVaultMap((prev) => ({ ...prev, [vaultId]: next }));
      } catch {
        // The vault may have been deleted or the caller's access revoked
        // (404/403), or a transient network error occurred. Folders are a
        // best-effort cache, so drop this vault's entry and stay SILENT —
        // re-throwing surfaces as an unhandled rejection / dev error overlay
        // ("Vault not found"). The vault-list refetch removes the vault from the
        // sidebar; the vault page shows its own not-found state.
        setByVaultMap((prev) => {
          if (!(vaultId in prev)) return prev;
          const copy = { ...prev };
          delete copy[vaultId];
          return copy;
        });
      } finally {
        setLoadingVaults((prev) => {
          if (!prev[vaultId]) return prev;
          const copy = { ...prev };
          delete copy[vaultId];
          return copy;
        });
      }
    },
    [userId],
  );

  const byVault = useCallback(
    (vaultId: string) => {
      if (!userId) return [];
      // Skip non-UUID ids (e.g. a stale URL param) — the backend would reject
      // them with `validation_error`. Don't mark as requested either, so a
      // later valid id with the same React identity still triggers a fetch.
      if (!isUuid(vaultId)) return [];
      // First time we see this vault — kick off a load. Subsequent renders
      // return the cached list (or [] until the fetch resolves).
      if (!requestedRef.current.has(vaultId)) {
        requestedRef.current.add(vaultId);
        queueMicrotask(() => {
          void refresh(vaultId);
        });
      }
      return byVaultMap[vaultId] ?? [];
    },
    [byVaultMap, refresh, userId],
  );

  const isLoading = useCallback(
    (vaultId: string) => Boolean(loadingVaults[vaultId]),
    [loadingVaults],
  );

  const create = useCallback(
    async (vaultId: string, input: FolderCreateInput) => {
      const folder = await apiCreate(vaultId, input);
      await refresh(vaultId);
      return folder;
    },
    [refresh],
  );

  const update = useCallback(
    async (vaultId: string, id: string, patch: FolderUpdateInput) => {
      const folder = await apiUpdate(id, patch);
      await refresh(vaultId);
      return folder;
    },
    [refresh],
  );

  const remove = useCallback(
    async (vaultId: string, id: string) => {
      await apiDelete(id);
      await refresh(vaultId);
    },
    [refresh],
  );

  const reorder = useCallback(
    async (vaultId: string, order: string[]) => {
      if (!isUuid(vaultId)) return;
      let previous: Folder[] | undefined;
      setByVaultMap((prev) => {
        const current = prev[vaultId];
        if (!current) return prev;
        previous = current;
        const byId = new Map(current.map((folder) => [folder.id, folder]));
        const next: Folder[] = [];
        for (const id of order) {
          const folder = byId.get(id);
          if (folder) {
            next.push(folder);
            byId.delete(id);
          }
        }
        // Keep any folders not named in `order` (defensive) appended in their
        // original relative order so nothing silently disappears.
        for (const folder of current) {
          if (byId.has(folder.id)) next.push(folder);
        }
        return { ...prev, [vaultId]: next };
      });
      try {
        await apiReorder(vaultId, order);
      } catch (err) {
        if (previous) {
          const reverted = previous;
          setByVaultMap((prev) => ({ ...prev, [vaultId]: reverted }));
        }
        throw err;
      }
    },
    [],
  );

  const value = useMemo<FoldersContextValue>(
    () => ({ byVault, isLoading, refresh, create, update, remove, reorder }),
    [byVault, isLoading, refresh, create, update, remove, reorder],
  );

  return (
    <FoldersContext.Provider value={value}>{children}</FoldersContext.Provider>
  );
}

export function useFolders(): FoldersContextValue {
  const ctx = useContext(FoldersContext);
  if (!ctx) throw new Error("useFolders must be used inside <FoldersProvider>");
  return ctx;
}

export type { Folder };
