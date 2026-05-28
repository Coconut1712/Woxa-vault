"use client";

/**
 * Idle detection used by VaultLockProvider.
 *
 *  - DOM listeners are attached to `document` with `capture: true` so a child
 *    that calls `stopPropagation()` can't hide the user's input from the
 *    idle tracker (WARN-B).
 *  - Event coverage: pointer + mouse + touch + keyboard + scroll/wheel.
 *    Both `keydown` and `keyup` are tracked because a long-held key (e.g.
 *    typing into a textarea or holding arrows in a scroll view) only fires
 *    `keydown` once but should still count as "the user is here".
 *  - Listeners are THROTTLED to one `onActivity` call per second. The default
 *    browser event rate is roughly "every animation frame for mouse moves",
 *    which would melt React if it forwarded straight through.
 *  - A 30s setInterval compares `Date.now() - lastActivityRef.current` to
 *    `idleLimitMs`. Once we cross the threshold we fire `onIdle` exactly once
 *    per active session (the caller's `enabled` flag flips when the vault
 *    locks, which removes the interval).
 *  - The hook reads `lastActivityRef` (a ref, not state) so the interval
 *    callback always sees the latest value without re-subscribing every tick.
 *
 * The hook is a no-op when `enabled` is false — important because the lock
 * overlay shouldn't try to record activity while the user is presumably away
 * from their desk.
 */

import { useEffect, useRef } from "react";

interface IdleDetectorOptions {
  /** Only listen while the vault is unlocked. */
  enabled: boolean;
  /** Lock threshold (ms). */
  idleLimitMs: number;
  /** Caller's "user did something" sink — usually `recordActivity` on the provider. */
  onActivity: () => void;
  /** Caller's "we crossed the idle threshold" sink — usually `markLocked("idle")`. */
  onIdle: () => void;
  /**
   * Live ref to the most-recent activity timestamp. The interval callback
   * reads from this so it doesn't need to re-subscribe whenever activity
   * happens. The provider owns the ref; we only read it.
   */
  lastActivityRef: React.RefObject<number>;
}

/** Throttle window for activity event coalescing. 1s is plenty granular for a
 * 15-minute idle window and keeps React/sessionStorage writes cheap. */
const ACTIVITY_THROTTLE_MS = 1000;

/** How often the interval checks "are we past the idle limit?". 30s gives a
 * worst-case lock latency of (idleLimit + 30s) — acceptable for a 15-minute
 * window. Tighter would burn CPU on idle tabs. */
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Events we treat as "user is here":
 *   - pointermove / pointerdown — modern unified pointer events (mouse + pen + touch).
 *   - mousemove / mousedown / click / wheel — legacy mouse path; some libs only emit these.
 *   - touchstart — mobile / hybrid devices.
 *   - keydown / keyup — keyboard. keyup catches sustained-key release.
 *   - scroll — passive scroll on any container.
 *
 * NOTE: `passive: true` is a perf hint — we never call preventDefault on any
 * of these. `capture: true` is the important one (WARN-B): it ensures we hear
 * events even when a deeply nested child stops propagation.
 */
const ACTIVITY_EVENTS = [
  "pointermove",
  "pointerdown",
  "mousemove",
  "mousedown",
  "click",
  "wheel",
  "touchstart",
  "keydown",
  "keyup",
  "scroll",
] as const;

const LISTENER_OPTIONS: AddEventListenerOptions = {
  passive: true,
  capture: true,
};

export function useIdleDetector(opts: IdleDetectorOptions) {
  const { enabled, idleLimitMs, onActivity, onIdle, lastActivityRef } = opts;

  // Latest callback refs — the hook reads through these so a re-rendered
  // provider that hands in a new closure doesn't force the listeners to
  // re-subscribe (which would also wipe the throttle baseline).
  const onActivityRef = useRef(onActivity);
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  // DOM listeners (throttled).
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    let lastFiredAt = 0;
    const handle = () => {
      const now = Date.now();
      if (now - lastFiredAt < ACTIVITY_THROTTLE_MS) return;
      lastFiredAt = now;
      onActivityRef.current();
    };

    for (const ev of ACTIVITY_EVENTS) {
      document.addEventListener(ev, handle, LISTENER_OPTIONS);
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        document.removeEventListener(ev, handle, LISTENER_OPTIONS);
      }
    };
  }, [enabled]);

  // Periodic check — fire `onIdle` once when we cross the threshold. The
  // caller flips `enabled` to false inside `onIdle` (via setting locked=true),
  // which tears down this effect and prevents a re-fire on the next tick.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const id = window.setInterval(() => {
      const last = lastActivityRef.current ?? 0;
      if (Date.now() - last >= idleLimitMs) {
        onIdleRef.current();
      }
    }, IDLE_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(id);
    };
  }, [enabled, idleLimitMs, lastActivityRef]);
}
