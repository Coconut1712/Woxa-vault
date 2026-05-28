"use client";

/**
 * VaultLockProvider — the in-app vault-lock state machine (see
 * REQUIREMENTS.md AC-055.8 + DESIGN.md §15).
 *
 *  - `vaultLocked` is the source of truth for the lock overlay. We persist a
 *    single `unlockedAt` timestamp in **sessionStorage** (NOT localStorage,
 *    which would survive an XSS exfil). On mount we treat the user as
 *    unlocked iff that timestamp is fresh (< IDLE_LIMIT_MS). Anything else
 *    (browser restart, expired timestamp, missing entry) → locked.
 *  - `markUnlocked()` is called when the user proves possession of the master
 *    password in the lock overlay (POST /me/verify-password succeeds). A plain
 *    login / 2FA / SSO bootstrap does NOT unlock the vault — authenticating the
 *    session and unlocking the vault are deliberately separate gates, so a new
 *    session always lands on the lock screen until the master password is
 *    entered. (`/setup-password` is the one place that stamps an unlock without
 *    going through the overlay, because the user just set the master password.)
 *  - `markLocked(reason)` is called by the manual Lock button, by the
 *    idle detector, by visibility-hidden-too-long, and by logout.
 *  - `recordActivity()` updates the IN-MEMORY `lastActivityRef` only. We do
 *    NOT slide the sessionStorage timestamp on every activity tick — that
 *    write loop is observable from an XSS context and would also let a
 *    malicious script ping itself to extend the unlock window indefinitely.
 *    sessionStorage is touched only at lock/unlock boundary events.
 *
 * Cross-tab sync (WARN-D):
 *   BroadcastChannel("woxa-vault-lock") broadcasts `locked` / `unlocked`
 *   events between tabs in the same origin. Each tab's sessionStorage is
 *   scoped to that tab, so a manual Lock in tab A wouldn't otherwise reach
 *   tab B. The channel is the cross-tab transport; `localStorage` storage
 *   events are the documented fallback for browsers without
 *   BroadcastChannel support (rare today, but cheap to keep).
 *
 * Phase A deviation (DESIGN.md §15 says "tab close = don't lock"):
 *   We deliberately use **sessionStorage**, so closing the last tab in the
 *   window clears the unlock state and the next session must re-enter the
 *   master password. This is a "more secure for now" trade-off — Phase B can
 *   shift to encrypted IndexedDB caching once we accept the threat-model
 *   implications. Documented in AGENT_ROUND_NOTES_VAULT_LOCK_AC-055-8.
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
import { 
  unwrapVaultKey, 
  fromBase64 
} from "@/lib/crypto-client";
import { getVault } from "@/lib/api/vaults";
import { useAuth } from "@/lib/auth/provider";

import { useIdleDetector } from "@/lib/vault-lock/use-idle-detector";
import { VAULT_LOCKED_EVENT, VAULT_UNLOCKED_EVENT } from "@/lib/api/client";

/** 15 minutes — exported so tests / settings can reference the same constant. */
export const IDLE_LIMIT_MS = 15 * 60 * 1000;

/** sessionStorage key. Holds the most-recent unlock timestamp (ms since epoch). */
const UNLOCKED_AT_KEY = "woxa-vault-unlocked-at";
const PRIVATE_KEY_KEY = "woxa-vault-pk";

/** Cross-tab channel + fallback storage key for browsers without BroadcastChannel. */
const BROADCAST_CHANNEL_NAME = "woxa-vault-lock";
const BROADCAST_FALLBACK_KEY = "woxa-vault-lock-broadcast";

/** Reason the vault was last locked. Used to pick the right subtitle copy
 * and forwarded to the backend audit log via /me/verify-password. */
export type LockReason = "idle" | "manual" | "sleep" | "restart";

interface LockState {
  /** True when the lock overlay should be rendered over the app shell. */
  vaultLocked: boolean;
  /** ms-since-epoch of the most-recent user activity (in-memory mirror). */
  lastActivityAt: number;
  /** Reason for the current lock — used by the LockScreen subtitle and by
   * the verify-password call as an audit hint. */
  lockReason: LockReason;
  /** Mark the vault as locked. */
  markLocked: (reason: LockReason) => void;
  /** Mark the vault as unlocked and refresh the persisted timestamp. */
  markUnlocked: () => void;
  /** Refresh the in-memory `lastActivityAt`. Throttled by the idle hook. */
  recordActivity: () => void;
  /** Manual sessionStorage clear — called from `logout()` to prevent ghosts. */
  clearPersistedUnlock: () => void;
  
  /** Phase C: Fetch and decrypt a vault key */
  getVaultKey: (vaultId: string) => Promise<Uint8Array | null>;
}

const VaultLockContext = createContext<LockState | null>(null);

function readPersistedUnlockedAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(UNLOCKED_AT_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return ts;
  } catch {
    return null;
  }
}

function writePersistedUnlockedAt(ts: number) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(UNLOCKED_AT_KEY, String(ts));
  } catch {
    // sessionStorage may be unavailable (private mode quota, etc.). The lock
    // overlay just degrades to "lock on every navigation" — acceptable.
  }
}

function clearPersistedUnlockedAt() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(UNLOCKED_AT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Stamp the sessionStorage unlock key from outside the React tree.
 *
 * Used ONLY by /setup-password, right after the user sets their master
 * password for the first time: they just proved possession, so the vault is
 * implicitly unlocked when they land on /app and we shouldn't make them
 * immediately re-enter it on the lock screen. We touch sessionStorage directly
 * because /setup-password lives above (outside) VaultLockProvider in the tree.
 *
 * NOTE: ordinary login / 2FA / SSO bootstrap must NOT call this — those
 * authenticate the session but leave the vault locked. See AuthProvider.
 */
export function persistUnlockTimestamp() {
  writePersistedUnlockedAt(Date.now());
}

/**
 * Stores the decrypted private key in sessionStorage.
 */
export function persistPrivateKey(key: Uint8Array) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PRIVATE_KEY_KEY, btoa(String.fromCharCode(...key)));
  } catch {
    // ignore
  }
}

/**
 * Retrieves the decrypted private key from sessionStorage.
 */
export function readPersistedPrivateKey(): Uint8Array | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PRIVATE_KEY_KEY);
    if (!raw) return null;
    return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Wipe the sessionStorage unlock key — called from `logout()` so a logged-out
 * user can't refresh-and-skip the next login's password gate just because the
 * timestamp was still fresh.
 */
export function clearUnlockTimestamp() {
  clearPersistedUnlockedAt();
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(PRIVATE_KEY_KEY);
    } catch {
      // ignore
    }
  }
}

/**
 * Synchronous read of the initial lock state during useState initialization.
 *
 * We can't simply default to `vaultLocked: true` and reconcile in useEffect:
 * that produces a single-frame flash of the LockScreen on every navigation
 * for an already-unlocked user. Reading sessionStorage in the lazy initializer
 * keeps the very first render correct.
 *
 * SSR safety: `typeof window` guards return the safe-locked default. The
 * client-side hydration pass repeats this exact computation so the
 * server/client trees match (we're inside a /app route which is dynamic, so
 * there's no static prerender to disagree with).
 */
function readInitialLockState(): { locked: boolean; reason: LockReason } {
  if (typeof window === "undefined") {
    return { locked: true, reason: "restart" };
  }
  const ts = readPersistedUnlockedAt();
  if (ts !== null && Date.now() - ts < IDLE_LIMIT_MS) {
    return { locked: false, reason: "idle" };
  }
  return { locked: true, reason: ts === null ? "restart" : "idle" };
}

interface BroadcastMessage {
  type: "locked" | "unlocked";
  reason?: LockReason;
  /** monotonic-ish discriminator so storage-event fallback rebroadcasts trigger. */
  ts: number;
}

export function VaultLockProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializers read sessionStorage exactly once on first render so an
  // already-unlocked tab doesn't flash the lock overlay during the hydration
  // pass. The /app routes are dynamic (ƒ in the build output) and the
  // overlay only renders client-side after hydration anyway, so there's no
  // SSR mismatch risk.
  const [vaultLocked, setVaultLocked] = useState<boolean>(
    () => readInitialLockState().locked,
  );
  const [lockReason, setLockReason] = useState<LockReason>(
    () => readInitialLockState().reason,
  );
  const lastActivityRef = useRef<number>(Date.now());
  const [lastActivityAt, setLastActivityAt] = useState<number>(Date.now());
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  // Phase C: Cache for decrypted vault keys
  const vaultKeyCacheRef = useRef<Map<string, Uint8Array>>(new Map());

  // Mount-time housekeeping (WARN-M): if the persisted timestamp is stale
  // (expired), wipe it and force-lock so a buggy initial-state read or a
  // sessionStorage tampering attempt can't leave us unlocked with a stale
  // entry. The initial state already correctly picks `locked: true` for the
  // expired case, so this is belt-and-braces.
  useEffect(() => {
    const ts = readPersistedUnlockedAt();
    if (ts !== null && Date.now() - ts >= IDLE_LIMIT_MS) {
      clearPersistedUnlockedAt();
      setVaultLocked(true);
      setLockReason("idle");
    }
  }, []);

  // markLocked is intentionally storage-clear-FIRST, setState-AFTER (WARN-G):
  // any other listener that reads sessionStorage in response to the same JS
  // event must see the cleared entry, not the stale one. React state updates
  // within the same event are flushed atomically, so consumers see both.
  const markLocked = useCallback((reason: LockReason) => {
    clearPersistedUnlockedAt();
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(PRIVATE_KEY_KEY);
      } catch {
        // ignore
      }
    }
    // Clear key cache
    vaultKeyCacheRef.current.clear();

    setLockReason(reason);
    setVaultLocked(true);
    // Broadcast to other tabs so they lock too.
    const ch = broadcastRef.current;
    if (ch) {
      try {
        const msg: BroadcastMessage = { type: "locked", reason, ts: Date.now() };
        ch.postMessage(msg);
      } catch {
        // ignore — fallback below
      }
    }
    // Storage-event fallback for browsers without BroadcastChannel: write,
    // then immediately remove so the other tab's `storage` listener fires.
    if (typeof window !== "undefined" && !ch) {
      try {
        const payload: BroadcastMessage = {
          type: "locked",
          reason,
          ts: Date.now(),
        };
        localStorage.setItem(BROADCAST_FALLBACK_KEY, JSON.stringify(payload));
        localStorage.removeItem(BROADCAST_FALLBACK_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  const markUnlocked = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    setLastActivityAt(now);
    writePersistedUnlockedAt(now);
    setVaultLocked(false);
    const ch = broadcastRef.current;
    if (ch) {
      try {
        const msg: BroadcastMessage = { type: "unlocked", ts: now };
        ch.postMessage(msg);
      } catch {
        // ignore
      }
    }
    if (typeof window !== "undefined" && !ch) {
      try {
        const payload: BroadcastMessage = { type: "unlocked", ts: now };
        localStorage.setItem(BROADCAST_FALLBACK_KEY, JSON.stringify(payload));
        localStorage.removeItem(BROADCAST_FALLBACK_KEY);
      } catch {
        // ignore
      }
    }
    // Tell providers above us in the tree (VaultsProvider etc.) to refetch, so
    // any data that errored while the vault was locked recovers on unlock.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(VAULT_UNLOCKED_EVENT));
    }
  }, []);

  const recordActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    setLastActivityAt(now);
    // WARN-C: do NOT slide the sessionStorage timestamp on every activity
    // tick. An XSS-injected script could (a) observe presence via the write
    // cadence and (b) overwrite the value to extend the unlock window.
    // sessionStorage is touched only at lock/unlock boundary events.
  }, []);

  const clearPersistedUnlock = useCallback(() => {
    clearPersistedUnlockedAt();
  }, []);

  const getVaultKey = useCallback(
    async (vaultId: string): Promise<Uint8Array | null> => {
      // 1. Check cache
      const cached = vaultKeyCacheRef.current.get(vaultId);
      if (cached) return cached;

      // 2. Fetch and unwrap
      try {
        const detail = await getVault(vaultId);
        if (detail.vault.encryptionVersion !== 2 || !detail.wrappedKey)
          return null;

        const userPk = readPersistedPrivateKey();
        if (!userPk) return null;

        const rawWrapped = fromBase64(detail.wrappedKey);
        const vaultKey = await unwrapVaultKey(
          {
            ephemeralPublicKey: rawWrapped.slice(0, 32),
            iv: rawWrapped.slice(32, 44),
            authTag: rawWrapped.slice(44, 60),
            ciphertext: rawWrapped.slice(60),
          },
          userPk,
        );

        vaultKeyCacheRef.current.set(vaultId, vaultKey);
        return vaultKey;
      } catch (err) {
        console.error("Failed to unwrap vault key", err);
        return null;
      }
    },
    [],
  );

  // Idle detector — only runs when vault is unlocked. The hook installs DOM
  // listeners + a 30s tick to compare now vs lastActivityRef.
  useIdleDetector({
    enabled: !vaultLocked,
    idleLimitMs: IDLE_LIMIT_MS,
    onActivity: recordActivity,
    onIdle: () => markLocked("idle"),
    lastActivityRef,
  });

  // Server-driven lock: any API call that returns 401 `vault_locked` (the
  // per-session unlock window expired) dispatches VAULT_LOCKED_EVENT from the
  // fetch layer. React to it by raising the lock overlay, so an auto-lock shows
  // the Master-password screen instead of letting pages render a generic
  // "couldn't load this data" error. The server is the source of truth, so this
  // also covers the case where our client idle timer hasn't ticked yet.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onServerLocked = () => markLocked("idle");
    window.addEventListener(VAULT_LOCKED_EVENT, onServerLocked);
    return () => window.removeEventListener(VAULT_LOCKED_EVENT, onServerLocked);
  }, [markLocked]);

  // BroadcastChannel + storage-event fallback for cross-tab lock/unlock sync
  // (WARN-D). sessionStorage is per-tab, so the manual Lock in tab A would
  // otherwise leave tab B unlocked.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        broadcastRef.current = channel;
        channel.onmessage = (e: MessageEvent<BroadcastMessage>) => {
          const msg = e.data;
          if (!msg || typeof msg !== "object") return;
          if (msg.type === "locked") {
            clearPersistedUnlockedAt();
            setLockReason(msg.reason ?? "manual");
            setVaultLocked(true);
          } else if (msg.type === "unlocked") {
            const now = Date.now();
            lastActivityRef.current = now;
            setLastActivityAt(now);
            writePersistedUnlockedAt(now);
            setVaultLocked(false);
          }
        };
      } catch {
        channel = null;
        broadcastRef.current = null;
      }
    }

    // Fallback transport: a brief write/delete to a localStorage key triggers
    // a `storage` event in other tabs without leaving any persistent value.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== BROADCAST_FALLBACK_KEY) return;
      if (!e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as BroadcastMessage;
        if (msg.type === "locked") {
          clearPersistedUnlockedAt();
          setLockReason(msg.reason ?? "manual");
          setVaultLocked(true);
        } else if (msg.type === "unlocked") {
          const now = Date.now();
          lastActivityRef.current = now;
          setLastActivityAt(now);
          writePersistedUnlockedAt(now);
          setVaultLocked(false);
        }
      } catch {
        // ignore malformed payloads
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
      if (channel) {
        try {
          channel.close();
        } catch {
          // ignore
        }
      }
      broadcastRef.current = null;
    };
  }, []);

  // Global "Lock now" keyboard shortcut (WARN-H): Cmd/Ctrl+Alt+L.
  // We moved off Cmd/Ctrl+Shift+L because (a) Firefox uses Cmd+Shift+L for
  // bookmark search and (b) our own cheatsheet already assigned Cmd+Shift+L
  // to theme-toggle. Cmd/Ctrl+Alt+L has no first-party browser binding on
  // Chrome/Firefox/Safari/Edge today and remains semantic ("L" = Lock).
  useEffect(() => {
    if (vaultLocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "l"
      ) {
        e.preventDefault();
        markLocked("manual");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vaultLocked, markLocked]);

  // Page Visibility — proxy for OS sleep / long backgrounding. If the tab was
  // hidden for >= IDLE_LIMIT_MS, lock on return. We also run an IMMEDIATE
  // idle check on resume (WARN-F): the 30s polling cadence in useIdleDetector
  // would otherwise leave a window where a tab hidden for 14m59s + resumed
  // doesn't lock until the next tick. Visibility-resume is the perfect moment
  // to re-evaluate without waiting for the interval.
  useEffect(() => {
    if (vaultLocked) return;
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      // Returning to visible.
      const now = Date.now();
      if (hiddenAt !== null && now - hiddenAt >= IDLE_LIMIT_MS) {
        markLocked("sleep");
        hiddenAt = null;
        return;
      }
      // Immediate idle re-check: if user has been inactive long enough we
      // shouldn't wait for the next 30s poll to lock.
      if (now - lastActivityRef.current >= IDLE_LIMIT_MS) {
        markLocked("idle");
      }
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [vaultLocked, markLocked]);

  const value = useMemo<LockState>(
    () => ({
      vaultLocked,
      lastActivityAt,
      lockReason,
      markLocked,
      markUnlocked,
      recordActivity,
      clearPersistedUnlock,
      getVaultKey,
    }),
    [
      vaultLocked,
      lastActivityAt,
      lockReason,
      markLocked,
      markUnlocked,
      recordActivity,
      clearPersistedUnlock,
      getVaultKey,
    ],
  );

  return (
    <VaultLockContext.Provider value={value}>
      {children}
    </VaultLockContext.Provider>
  );
}

export function useVaultLock() {
  const ctx = useContext(VaultLockContext);
  if (!ctx) {
    throw new Error("useVaultLock must be used inside <VaultLockProvider>");
  }
  return ctx;
}
