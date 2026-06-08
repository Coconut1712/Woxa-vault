// ---------------------------------------------------------------------------
// Password rotation status (US-060 / AC-060.1-5 / FR-039).
//
// A pure, allocation-free compute used by the item serializer (no N+1 — every
// input is already on the loaded items row) AND by the rotation-due dashboard
// endpoint + the weekly email digest. The EFFECTIVE policy for an item is:
//
//     item.rotationPolicyDays ?? orgDefaultDays
//
// where a per-item value of `0`/`null` means "no item-level override" (use the
// org default) — see clampRotationDays in orgPolicy.ts which already maps 0 →
// null at the persistence boundary, so by the time a value reaches here it is
// either a positive day count or null. An org default of null means "no policy".
//
// Status vocabulary (drives the frontend badge 🟢🟡🔴 — AC-060.3):
//   * none     — no effective policy OR the item has never had a password
//                (passwordChangedAt is null). No badge.
//   * fresh    — a password exists, a policy applies, and the due date is more
//                than DUE_SOON_DAYS in the future. 🟢
//   * due      — within DUE_SOON_DAYS of the due date (inclusive), not yet past. 🟡
//   * overdue  — the due date has passed. 🔴
// ---------------------------------------------------------------------------

export type RotationStatus = "none" | "fresh" | "due" | "overdue";

// "Due soon" lead window — an item flips from fresh → due this many days before
// its rotation deadline. 14 days is a sensible default ops-warning lead time
// (matches the AC-060.2 "needs rotation" dashboard intent: surface items the
// team should act on this sprint, not only ones already past due).
export const DUE_SOON_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RotationResult {
  status: RotationStatus;
  // ISO-8601 instant the password is considered due for rotation, or null when
  // status is `none`. = passwordChangedAt + effectivePolicyDays.
  dueAt: string | null;
  // The effective policy that produced this result (item override ?? org
  // default), or null when no policy applies. Surfaced so the frontend can show
  // "every N days" without re-deriving it.
  effectiveDays: number | null;
}

// Resolve the effective rotation window for one item. `itemDays` is the item's
// own rotationPolicyDays (already clamped to a positive number or null at write
// time); `orgDefaultDays` is the org policy default (positive or null).
export function effectiveRotationDays(
  itemDays: number | null | undefined,
  orgDefaultDays: number | null | undefined,
): number | null {
  if (typeof itemDays === "number" && itemDays > 0) return itemDays;
  if (typeof orgDefaultDays === "number" && orgDefaultDays > 0) return orgDefaultDays;
  return null;
}

// Compute rotation status for a single item. Pure; `now` is injectable for
// deterministic tests. `passwordChangedAt` is the items.password_changed_at
// column (null = the item never had a password → `none`).
export function computeRotationStatus(
  passwordChangedAt: Date | null,
  itemDays: number | null | undefined,
  orgDefaultDays: number | null | undefined,
  now: Date = new Date(),
): RotationResult {
  const effectiveDays = effectiveRotationDays(itemDays, orgDefaultDays);
  if (effectiveDays === null || passwordChangedAt === null) {
    return { status: "none", dueAt: null, effectiveDays: null };
  }

  const dueMs = passwordChangedAt.getTime() + effectiveDays * MS_PER_DAY;
  const dueAt = new Date(dueMs);
  const msUntilDue = dueMs - now.getTime();

  let status: RotationStatus;
  if (msUntilDue < 0) {
    status = "overdue";
  } else if (msUntilDue <= DUE_SOON_DAYS * MS_PER_DAY) {
    status = "due";
  } else {
    status = "fresh";
  }

  return { status, dueAt: dueAt.toISOString(), effectiveDays };
}
