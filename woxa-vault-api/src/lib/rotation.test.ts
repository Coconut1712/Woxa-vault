import { describe, expect, it } from "vitest";
import { computeRotationStatus, effectiveRotationDays, DUE_SOON_DAYS } from "@/lib/rotation";

// US-060 / AC-060.3 / FR-039 — pure rotation-status compute. No DB.
describe("computeRotationStatus", () => {
  const now = new Date("2026-06-02T00:00:00.000Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it("none: no password (passwordChangedAt null) even when a policy applies", () => {
    const r = computeRotationStatus(null, 30, 90, now);
    expect(r.status).toBe("none");
    expect(r.dueAt).toBeNull();
    expect(r.effectiveDays).toBeNull();
  });

  it("none: password present but no effective policy (item null + org null)", () => {
    const r = computeRotationStatus(daysAgo(1000), null, null, now);
    expect(r.status).toBe("none");
    expect(r.dueAt).toBeNull();
  });

  it("fresh: changed recently, well within the window", () => {
    // 90-day policy, changed 10 days ago → due in 80 days → fresh.
    const r = computeRotationStatus(daysAgo(10), null, 90, now);
    expect(r.status).toBe("fresh");
    expect(r.effectiveDays).toBe(90);
    expect(r.dueAt).toBe(daysAgo(10 - 90).toISOString()); // changed + 90d
  });

  it("due: within DUE_SOON_DAYS of the deadline but not past", () => {
    // 90-day policy, changed (90 - 7) days ago → 7 days until due → due (<=14).
    const r = computeRotationStatus(daysAgo(90 - 7), null, 90, now);
    expect(r.status).toBe("due");
  });

  it("due: exactly at the DUE_SOON_DAYS boundary is still due (inclusive)", () => {
    const r = computeRotationStatus(daysAgo(90 - DUE_SOON_DAYS), null, 90, now);
    expect(r.status).toBe("due");
  });

  it("overdue: deadline has passed", () => {
    // 30-day policy, changed 40 days ago → 10 days overdue.
    const r = computeRotationStatus(daysAgo(40), null, 30, now);
    expect(r.status).toBe("overdue");
  });

  it("item policy overrides org default", () => {
    // org default 365 (would be fresh) but item says 7 → changed 10 days ago = overdue.
    const r = computeRotationStatus(daysAgo(10), 7, 365, now);
    expect(r.status).toBe("overdue");
    expect(r.effectiveDays).toBe(7);
  });

  it("falls back to org default when item policy is null/0", () => {
    expect(effectiveRotationDays(null, 90)).toBe(90);
    expect(effectiveRotationDays(0, 90)).toBe(90);
    expect(effectiveRotationDays(undefined, 90)).toBe(90);
    // item positive wins
    expect(effectiveRotationDays(30, 90)).toBe(30);
    // neither → null
    expect(effectiveRotationDays(0, 0)).toBeNull();
    expect(effectiveRotationDays(null, null)).toBeNull();
  });
});
