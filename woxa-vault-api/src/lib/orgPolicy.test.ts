import { describe, expect, it } from "vitest";
import {
  AUTO_LOCK_DEFAULT,
  clampAutoLockMinutes,
  clampRotationDays,
  ROTATION_DAYS_MAX,
  mergeOrgSettings,
  normalizeAllowedDomains,
  orgSettingsSchema,
  readOrgPolicy,
} from "@/lib/orgPolicy";

// Pure decision/parse logic for the workspace security policy stored in
// `organizations.settings`. No DB needed. These pin the FAIL-SAFE contract:
// a malformed/legacy/partial blob must never read as require2fa:true and must
// never throw (which would take down /me and the enforcement guard).

const DEFAULT_SSO = { allowedDomains: [], jitEnabled: true, requireSso: false };

describe("readOrgPolicy — fail-safe default", () => {
  it("yields full safe defaults for an empty object", () => {
    expect(readOrgPolicy({})).toEqual({
      require2fa: false,
      autoLockMinutes: AUTO_LOCK_DEFAULT,
      rotationDefaultDays: null,
      sso: DEFAULT_SSO,
    });
  });

  it("rotationDefaultDays: positive passes; 0/negative/garbage → null; clamped to max (US-060)", () => {
    expect(readOrgPolicy({ rotationDefaultDays: 90 }).rotationDefaultDays).toBe(90);
    expect(readOrgPolicy({ rotationDefaultDays: 0 }).rotationDefaultDays).toBeNull();
    expect(readOrgPolicy({ rotationDefaultDays: -5 }).rotationDefaultDays).toBeNull();
    expect(readOrgPolicy({ rotationDefaultDays: null }).rotationDefaultDays).toBeNull();
    expect(readOrgPolicy({}).rotationDefaultDays).toBeNull();
    expect(readOrgPolicy({ rotationDefaultDays: ROTATION_DAYS_MAX + 1000 }).rotationDefaultDays).toBe(ROTATION_DAYS_MAX);
    // Direct clamp helper.
    expect(clampRotationDays(30)).toBe(30);
    expect(clampRotationDays(0)).toBeNull();
    expect(clampRotationDays("90")).toBeNull();
    expect(clampRotationDays(30.6)).toBe(31); // rounds
  });

  it("defaults to false for null / undefined", () => {
    expect(readOrgPolicy(null).require2fa).toBe(false);
    expect(readOrgPolicy(undefined).require2fa).toBe(false);
    expect(readOrgPolicy(null).sso).toEqual(DEFAULT_SSO);
  });

  it("reads an explicit true", () => {
    expect(readOrgPolicy({ require2fa: true }).require2fa).toBe(true);
  });

  it("reads an explicit false", () => {
    expect(readOrgPolicy({ require2fa: false }).require2fa).toBe(false);
  });

  it("coerces a non-boolean require2fa (legacy drift) to false, never true", () => {
    // A truthy-but-not-boolean value must NOT enable the policy by accident.
    expect(readOrgPolicy({ require2fa: "true" }).require2fa).toBe(false);
    expect(readOrgPolicy({ require2fa: 1 }).require2fa).toBe(false);
  });

  it("never throws on a non-object blob — degrades to the safe default", () => {
    expect(readOrgPolicy("garbage").require2fa).toBe(false);
    expect(readOrgPolicy(42).autoLockMinutes).toBe(AUTO_LOCK_DEFAULT);
    expect(readOrgPolicy([]).sso).toEqual(DEFAULT_SSO);
  });

  it("ignores unrelated keys but still reads require2fa", () => {
    const policy = readOrgPolicy({
      require2fa: true,
      rotation_defaults: { default: 90 },
    });
    expect(policy.require2fa).toBe(true);
  });

  it("clamps autoLockMinutes and normalizes sso on read", () => {
    const p = readOrgPolicy({
      autoLockMinutes: 999,
      sso: { allowedDomains: ["A.com", "a.com"], jitEnabled: false, requireSso: true },
    });
    expect(p.autoLockMinutes).toBe(120);
    expect(p.sso.allowedDomains).toEqual(["a.com"]);
    expect(p.sso.jitEnabled).toBe(false);
    expect(p.sso.requireSso).toBe(true);
  });

  it("jitEnabled defaults TRUE unless explicitly false", () => {
    expect(readOrgPolicy({ sso: {} }).sso.jitEnabled).toBe(true);
    expect(readOrgPolicy({ sso: { jitEnabled: "nope" } }).sso.jitEnabled).toBe(true);
    expect(readOrgPolicy({ sso: { jitEnabled: false } }).sso.jitEnabled).toBe(false);
  });
});

describe("clampAutoLockMinutes", () => {
  it("clamps to [1, 120] and rounds", () => {
    expect(clampAutoLockMinutes(0)).toBe(1);
    expect(clampAutoLockMinutes(-5)).toBe(1);
    expect(clampAutoLockMinutes(121)).toBe(120);
    expect(clampAutoLockMinutes(15.6)).toBe(16);
  });
  it("non-number / NaN / Infinity -> default", () => {
    expect(clampAutoLockMinutes("x")).toBe(AUTO_LOCK_DEFAULT);
    expect(clampAutoLockMinutes(NaN)).toBe(AUTO_LOCK_DEFAULT);
    expect(clampAutoLockMinutes(Infinity)).toBe(AUTO_LOCK_DEFAULT);
  });
});

describe("normalizeAllowedDomains", () => {
  it("lowercases, trims, dedupes, validates shape, preserves order", () => {
    expect(
      normalizeAllowedDomains([" Example.COM ", "example.com", "acme.io", "@bad", "x", ""]),
    ).toEqual(["example.com", "acme.io"]);
  });
  it("non-array -> []", () => {
    expect(normalizeAllowedDomains("example.com")).toEqual([]);
    expect(normalizeAllowedDomains(null)).toEqual([]);
  });
});

describe("mergeOrgSettings — preserve unrelated keys + deep-merge sso", () => {
  it("merges require2fa without dropping other policy keys", () => {
    const existing = { rotation_defaults: { default: 90 }, require2fa: false };
    const merged = mergeOrgSettings(existing, { require2fa: true });
    expect(merged).toEqual({
      rotation_defaults: { default: 90 },
      require2fa: true,
    });
  });

  it("handles a missing/non-object base by starting fresh", () => {
    expect(mergeOrgSettings(null, { require2fa: true })).toEqual({ require2fa: true });
    expect(mergeOrgSettings("garbage", { require2fa: true })).toEqual({
      require2fa: true,
    });
    // An array base is NOT spread as a settings object.
    expect(mergeOrgSettings([], { require2fa: true })).toEqual({ require2fa: true });
  });

  it("deep-merges the sso block (does not stomp sibling sso keys)", () => {
    const merged = mergeOrgSettings(
      { sso: { allowedDomains: ["keep.com"], jitEnabled: false, requireSso: true } },
      { sso: { requireSso: false } },
    );
    expect(merged.sso).toEqual({
      allowedDomains: ["keep.com"],
      jitEnabled: false,
      requireSso: false,
    });
  });

  it("creates the sso block when none existed", () => {
    const merged = mergeOrgSettings({ require2fa: false }, { sso: { jitEnabled: false } });
    expect(merged.sso).toEqual({ jitEnabled: false });
    expect(merged.require2fa).toBe(false);
  });
});

describe("orgSettingsSchema — validates owned keys, allows passthrough", () => {
  it("accepts a boolean require2fa", () => {
    expect(orgSettingsSchema.safeParse({ require2fa: true }).success).toBe(true);
  });

  it("rejects a non-boolean require2fa", () => {
    expect(orgSettingsSchema.safeParse({ require2fa: "yes" }).success).toBe(false);
  });

  it("accepts autoLockMinutes + a partial sso block", () => {
    expect(
      orgSettingsSchema.safeParse({ autoLockMinutes: 30, sso: { jitEnabled: false } }).success,
    ).toBe(true);
  });

  it("allows unknown keys (future policy fields)", () => {
    expect(
      orgSettingsSchema.safeParse({ require2fa: false, ip_allowlist: ["1.2.3.4"] })
        .success,
    ).toBe(true);
  });
});
