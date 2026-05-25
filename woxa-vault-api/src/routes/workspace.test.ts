import { describe, expect, it, vi } from "vitest";
import { allocateSlug, slugifyBase, switchSchema, transferSchema } from "@/routes/workspace";

// A minimal fake of the slice of `tx` that allocateSlug touches:
// `tx.query.organizations.findFirst({ where })`. The test programs each call's
// return (a row = clash, undefined = free) so we can assert the loop's
// suffix-on-collision behavior + the exclude-self outcome WITHOUT a database.
// The SQL `where` clause itself (the `ne(organizations.id, excludeOrgId)`
// branch) is opaque drizzle SQL and is verified at the integration layer; here
// we pin the observable contract: how many lookups happen and what slug wins.
type FindFirst = (args: { where: unknown }) => Promise<unknown>;
function fakeTx(findFirst: FindFirst) {
  return {
    query: { organizations: { findFirst } },
  } as unknown as Parameters<typeof allocateSlug>[0];
}

// slugifyBase feeds the workspace `slug` (URL-visible, unique). These tests
// pin the normalization so a name like "  Acme Corp!! " can't yield an empty
// or path-breaking slug. Collision handling (random suffix) is exercised at
// the integration layer; here we only assert the deterministic base.

describe("slugifyBase", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugifyBase("Acme Corp")).toBe("acme-corp");
  });

  it("strips punctuation and collapses hyphen runs", () => {
    expect(slugifyBase("Acme  Corp!!  Inc.")).toBe("acme-corp-inc");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugifyBase("  -Acme-  ")).toBe("acme");
  });

  it("falls back to 'workspace' when nothing usable remains", () => {
    expect(slugifyBase("！！！")).toBe("workspace");
    expect(slugifyBase("   ")).toBe("workspace");
  });

  it("caps length at 40 chars", () => {
    const long = "a".repeat(100);
    expect(slugifyBase(long).length).toBe(40);
  });

  it("never produces a slug that starts or ends with a hyphen", () => {
    const s = slugifyBase("--multi---word--name--");
    expect(s.startsWith("-")).toBe(false);
    expect(s.endsWith("-")).toBe(false);
    expect(s).toBe("multi-word-name");
  });
});

// allocateSlug derives the workspace slug at create time and (since the slug
// auto-follows the name on rename) again on PATCH /workspace. The rename path
// passes `excludeOrgId` so the org's OWN row is excluded from the uniqueness
// check — a name re-resolving to the org's CURRENT slug stays suffix-free, and
// only a DIFFERENT org holding that slug forces a suffix.
describe("allocateSlug", () => {
  it("returns the base unchanged when no other row holds it (exclude-self: own slug kept)", async () => {
    // findFirst returns undefined → no clash. This models BOTH the create-time
    // "slug is free" case AND the rename "base equals the org's own slug but it
    // is excluded, so it reads as free" case.
    const findFirst = vi.fn<FindFirst>().mockResolvedValue(undefined);
    const slug = await allocateSlug(
      fakeTx(findFirst),
      "acme",
      "11111111-1111-1111-1111-111111111111",
    );
    expect(slug).toBe("acme");
    expect(findFirst).toHaveBeenCalledTimes(1); // no suffix loop needed
  });

  it("appends a random suffix when a DIFFERENT org already holds the base", async () => {
    // First lookup → a clashing row (a different org owns "acme"); second
    // lookup → free. The winner is `acme-<hex>`, never the bare base.
    const findFirst = vi
      .fn<FindFirst>()
      .mockResolvedValueOnce({ id: "other-org", slug: "acme" })
      .mockResolvedValueOnce(undefined);
    const slug = await allocateSlug(
      fakeTx(findFirst),
      "acme",
      "11111111-1111-1111-1111-111111111111",
    );
    expect(slug).not.toBe("acme");
    expect(slug).toMatch(/^acme-[0-9a-f]{6}$/);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("works without excludeOrgId (create-time call site unchanged)", async () => {
    const findFirst = vi.fn<FindFirst>().mockResolvedValue(undefined);
    const slug = await allocateSlug(fakeTx(findFirst), "acme");
    expect(slug).toBe("acme");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("falls back to a fully-random slug after exhausting the bounded loop", async () => {
    // Every one of the 8 bounded attempts clashes → the fallback path returns
    // `base-<12 hex>` (6 random bytes) instead of spinning forever.
    const findFirst = vi
      .fn<FindFirst>()
      .mockResolvedValue({ id: "x", slug: "acme" });
    const slug = await allocateSlug(fakeTx(findFirst), "acme");
    expect(slug).toMatch(/^acme-[0-9a-f]{12}$/);
    expect(findFirst).toHaveBeenCalledTimes(8);
  });
});

// HIGH#1: transfer-ownership now requires the caller's master password as
// proof-of-possession. Pin the schema so a future refactor can't silently make
// `password` optional and re-open the stolen-cookie path.
describe("transferSchema", () => {
  it("requires a password alongside targetUserId", () => {
    const noPassword = transferSchema.safeParse({
      targetUserId: "11111111-1111-1111-1111-111111111111",
    });
    expect(noPassword.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const empty = transferSchema.safeParse({
      targetUserId: "11111111-1111-1111-1111-111111111111",
      password: "",
    });
    expect(empty.success).toBe(false);
  });

  it("accepts a valid uuid + non-empty password", () => {
    const ok = transferSchema.safeParse({
      targetUserId: "11111111-1111-1111-1111-111111111111",
      password: "correct horse battery staple",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a non-uuid targetUserId", () => {
    const bad = transferSchema.safeParse({
      targetUserId: "not-a-uuid",
      password: "x",
    });
    expect(bad.success).toBe(false);
  });
});

// M-1: POST /workspace/switch takes a uuid `orgId`. Pin the schema so the
// switch surface always validates the id shape before the membership lookup.
describe("switchSchema", () => {
  it("accepts a valid uuid orgId", () => {
    const ok = switchSchema.safeParse({
      orgId: "22222222-2222-2222-2222-222222222222",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a missing orgId", () => {
    expect(switchSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a non-uuid orgId", () => {
    expect(switchSchema.safeParse({ orgId: "nope" }).success).toBe(false);
  });
});
