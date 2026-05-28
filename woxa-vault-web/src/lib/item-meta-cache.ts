/**
 * Item summary metadata cache (localStorage).
 *
 * The list endpoint returns ItemSummary with `type: "login" | "note"` only.
 * To render display kind / folder / tags / favorite in the items list before
 * we have a privileged reveal of the full notes, we cache that subset of
 * meta locally — keyed by item id — and write through on every create /
 * update / delete the user performs from this browser.
 *
 * Trade-off: another browser won't have the cache and falls back to wire
 * type (`login`/`note`). The reveal page calls `getItem` and recovers the
 * full meta from notes ciphertext, which then re-seeds the cache, so the
 * gap self-heals after the first detail visit.
 *
 * SECURITY: only NON-secret summary fields are stored here. The TOTP secret,
 * custom-field secret values, card numbers and CVV, etc. stay inside the
 * encrypted notes blob — they never touch localStorage.
 */

import type { DisplayKind } from "./item-meta";

const KEY = "woxa-item-meta-v1";

export interface CachedSummaryMeta {
  displayKind: DisplayKind;
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  hasTotp: boolean;
  hasCustomFields: boolean;
}

type Store = Record<string, CachedSummaryMeta>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // quota / private mode — silently degrade
  }
}

export function getSummaryMeta(id: string): CachedSummaryMeta | null {
  return read()[id] ?? null;
}

export function setSummaryMeta(id: string, meta: CachedSummaryMeta) {
  const store = read();
  store[id] = meta;
  write(store);
}

export function deleteSummaryMeta(id: string) {
  const store = read();
  if (id in store) {
    delete store[id];
    write(store);
  }
}

export function getAllSummaryMeta(): Store {
  return read();
}
