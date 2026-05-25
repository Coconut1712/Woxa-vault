import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/lib/pgError";

// `isUniqueViolation` lets the transfer-ownership handler turn a concurrent
// single-owner race (Postgres 23505 on `org_members_single_owner_idx`) into a
// retryable 409 instead of a generic 500. These tests pin the structural
// detection so a driver/wrapper change can't silently break that mapping.

describe("isUniqueViolation", () => {
  it("returns true for a bare 23505 error when no constraint is required", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("matches when the constraint name also matches", () => {
    const err = { code: "23505", constraint_name: "org_members_single_owner_idx" };
    expect(isUniqueViolation(err, "org_members_single_owner_idx")).toBe(true);
  });

  it("returns false when the constraint name differs", () => {
    const err = { code: "23505", constraint_name: "organizations_slug_unique" };
    expect(isUniqueViolation(err, "org_members_single_owner_idx")).toBe(false);
  });

  it("returns false for a non-unique SQLSTATE", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // FK violation
  });

  it("returns false for non-Postgres errors", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
