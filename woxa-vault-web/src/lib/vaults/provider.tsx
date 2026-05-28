"use client";

/**
 * VaultsProvider — single source of truth for the caller's vault list.
 *
 * Why a provider? Sidebar, dashboard, dialogs, and command-palette all need
 * the same `VaultSummary[]`. Letting each page call `listVaults()` separately
 * would fire N parallel requests and let them drift after a mutation. The
 * provider holds the list, exposes a `refresh()` callers can call after
 * create/update/delete, and surfaces a uniform loading/error shape.
 *
 *  - Mounted under `/app/layout.tsx` (inside SessionGuard) so it only fetches
 *    once we know the user is signed in.
 *  - On 401 → AuthProvider already drove the user to /login; we just stop.
 *  - Sidebar/command palette stay snappy because we cache `data` in state
 *    rather than refetching on every navigation.
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

import { listVaults } from "@/lib/api/vaults";
import type { VaultSummary } from "@/lib/api/types";
import { ApiError, VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/provider";

export type VaultsStatus = "loading" | "ready" | "error";

interface VaultsContextValue {
  vaults: VaultSummary[];
  status: VaultsStatus;
  error: ApiError | null;
  refresh: () => Promise<void>;
}

const VaultsContext = createContext<VaultsContextValue | null>(null);

export function VaultsProvider({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  // The active workspace. Vaults are org-scoped, so this drives a refetch.
  const activeOrgId = me?.activeOrgId ?? null;

  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [status, setStatus] = useState<VaultsStatus>("loading");
  const [error, setError] = useState<ApiError | null>(null);
  // Monotonic request token: a newer refresh (e.g. right after a workspace
  // switch) supersedes any in-flight one, so a slow response carrying the
  // PREVIOUS workspace's vaults can't clobber the current list.
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++reqIdRef.current;
    try {
      const next = await listVaults();
      if (id !== reqIdRef.current) return;
      setVaults(next);
      setStatus("ready");
      setError(null);
    } catch (err) {
      if (id !== reqIdRef.current) return;
      // 401 is handled upstream by SessionGuard; surface anything else.
      if (err instanceof ApiError && err.code === "unauthorized") {
        setVaults([]);
        setStatus("ready");
        setError(null);
        return;
      }
      setError(err instanceof ApiError ? err : new ApiError(0, "network_error", "Network error"));
      setStatus("error");
    }
  }, []);

  // Fetch on mount AND whenever the active workspace changes. Without the
  // `activeOrgId` dependency the sidebar kept showing the previous workspace's
  // vaults after switching — the list is cached in state and the switcher's
  // `router.refresh()` only re-runs server components, not this client provider.
  useEffect(() => {
    void refresh();
    return () => {
      // Invalidate any in-flight request on switch/unmount.
      reqIdRef.current++;
    };
  }, [refresh, activeOrgId]);

  // Refetch when the vault is unlocked — recovers any list that errored while
  // the vault was locked (the lock overlay sits above us, so we can't read its
  // state directly; we listen for the window event it dispatches on unlock).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => void refresh();
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [refresh]);

  const value = useMemo<VaultsContextValue>(
    () => ({ vaults, status, error, refresh }),
    [vaults, status, error, refresh],
  );

  return <VaultsContext.Provider value={value}>{children}</VaultsContext.Provider>;
}

export function useVaults(): VaultsContextValue {
  const ctx = useContext(VaultsContext);
  if (!ctx) throw new Error("useVaults must be used inside <VaultsProvider>");
  return ctx;
}
