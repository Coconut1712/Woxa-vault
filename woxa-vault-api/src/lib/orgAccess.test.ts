import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ORG_ROLES,
  ORG_ROLES,
  canManageOrgMembers,
  canManageWorkspace,
  isOwner,
  outranks,
  type OrgRole,
} from "@/lib/orgAccess";

// These tests pin the single-Owner RBAC hierarchy (DESIGN.md §3) so a future
// refactor can't silently let an admin act on the owner or grant `owner` via
// the member-management surface. No DB needed — pure decision logic.

describe("outranks (Owner > Admin > Member > Guest)", () => {
  it("owner strictly outranks every lower role", () => {
    expect(outranks("owner", "admin")).toBe(true);
    expect(outranks("owner", "member")).toBe(true);
    expect(outranks("owner", "guest")).toBe(true);
  });

  it("admin outranks member and guest but NOT owner or another admin", () => {
    expect(outranks("admin", "member")).toBe(true);
    expect(outranks("admin", "guest")).toBe(true);
    expect(outranks("admin", "owner")).toBe(false);
    expect(outranks("admin", "admin")).toBe(false);
  });

  it("member outranks only guest", () => {
    expect(outranks("member", "guest")).toBe(true);
    expect(outranks("member", "member")).toBe(false);
    expect(outranks("member", "admin")).toBe(false);
    expect(outranks("member", "owner")).toBe(false);
  });

  it("guest outranks nobody", () => {
    for (const target of ORG_ROLES) {
      expect(outranks("guest", target)).toBe(false);
    }
  });

  it("equal ranks never outrank (peers cannot manage each other)", () => {
    for (const role of ORG_ROLES) {
      expect(outranks(role, role)).toBe(false);
    }
  });
});

describe("workspace + member management capabilities", () => {
  it("only owner can manage the workspace (delete / transfer / billing)", () => {
    expect(canManageWorkspace("owner")).toBe(true);
    expect(canManageWorkspace("admin")).toBe(false);
    expect(canManageWorkspace("member")).toBe(false);
    expect(canManageWorkspace("guest")).toBe(false);
  });

  it("owner and admin can manage members; member and guest cannot", () => {
    expect(canManageOrgMembers("owner")).toBe(true);
    expect(canManageOrgMembers("admin")).toBe(true);
    expect(canManageOrgMembers("member")).toBe(false);
    expect(canManageOrgMembers("guest")).toBe(false);
  });

  it("isOwner is true only for owner", () => {
    expect(isOwner("owner")).toBe(true);
    for (const role of ["admin", "member", "guest"] as OrgRole[]) {
      expect(isOwner(role)).toBe(false);
    }
  });
});

describe("assignable roles (PATCH role / invite surface)", () => {
  it("never includes owner — ownership only moves via transfer endpoint", () => {
    expect(ASSIGNABLE_ORG_ROLES).not.toContain("owner");
  });

  it("covers exactly admin/member/guest", () => {
    expect([...ASSIGNABLE_ORG_ROLES].sort()).toEqual(["admin", "guest", "member"]);
  });
});
