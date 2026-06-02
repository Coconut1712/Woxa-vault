/**
 * Clipboard helpers with a real, best-effort auto-clear.
 *
 * US-014 / AC-014.2, AC-014.3: when we copy a secret we promise the user
 * ("clears in 30 seconds") that the clipboard is wiped afterwards. This module
 * keeps that promise instead of leaving the toast lying.
 *
 * Behaviour:
 *  - Writes the value via `navigator.clipboard.writeText` (only in a secure
 *    context where the API exists — callers should still guard their UI).
 *  - Schedules a clear `CLIPBOARD_CLEAR_MS` later. Before clearing we make a
 *    best-effort read of the current clipboard and only wipe it if it STILL
 *    holds the value we wrote — so we never stomp on something the user copied
 *    in the meantime. If `readText` is unavailable or rejected (permission),
 *    we fall back to clearing unconditionally (accepted best-effort).
 *  - Returns a `cancel()` so callers can abort a pending clear (component
 *    unmount, or a fresh copy superseding the old timer).
 */

/** AC-014.3 dwell time. The AC allows "30s (or 60s configurable)"; 30s fixed. */
export const CLIPBOARD_CLEAR_MS = 30_000;

function clipboardAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  );
}

/** Best-effort wipe: only clears if the clipboard still holds `expected`. */
async function safeClear(expected: string): Promise<void> {
  if (!clipboardAvailable()) return;
  try {
    if (typeof navigator.clipboard.readText === "function") {
      const current = await navigator.clipboard.readText();
      // The user copied something else after us — leave it alone.
      if (current !== expected) return;
    }
  } catch {
    // readText blocked/unsupported — fall through to an unconditional clear.
  }
  try {
    await navigator.clipboard.writeText("");
  } catch {
    // Nothing more we can do; clipboard write was rejected.
  }
}

/**
 * Copy `value`, then schedule a best-effort clear after `CLIPBOARD_CLEAR_MS`.
 * Resolves `true` once the write succeeds, `false` if the write failed (callers
 * should toast a copy-failed error in that case). Returns the resolved result
 * plus a `cancel()` to drop the pending clear.
 */
export async function copyWithAutoClear(
  value: string,
): Promise<{ ok: boolean; cancel: () => void }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  if (!clipboardAvailable()) {
    return { ok: false, cancel };
  }

  try {
    await navigator.clipboard.writeText(value);
  } catch {
    return { ok: false, cancel };
  }

  timer = setTimeout(() => {
    void safeClear(value);
  }, CLIPBOARD_CLEAR_MS);

  return { ok: true, cancel };
}
