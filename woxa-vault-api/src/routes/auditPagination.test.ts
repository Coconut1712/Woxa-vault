import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for the PAGE-based GET /audit + GET /audit/actors. Drives the
// REAL app + REAL Postgres (project memory: integration tests hit a real
// database, never mocks).
//
// What this pins:
//   * total = COUNT over scope+filters (not just the page); page/limit slicing.
//   * `q` matches actorEmail / action / targetName case-insensitively and
//     treats LIKE wildcards as literals (no match-all).
//   * REPEATABLE `actor` unions multiple user ids; single `actor` still works.
//   * /audit/actors returns the org's distinct actors, ordered by email.
//   * RBAC: non-admin org member → 403 on both endpoints.

beforeAll(() => {
  if (
    !process.env.MFA_TOKEN_SECRET ||
    process.env.MFA_TOKEN_SECRET === "REPLACE_ME_WITH_HEX_64_CHARS"
  ) {
    process.env.MFA_TOKEN_SECRET = "a".repeat(64);
  }
  if (
    !process.env.LOCAL_KEK_BASE64 ||
    process.env.LOCAL_KEK_BASE64 === "REPLACE_ME_WITH_BASE64_32_BYTES"
  ) {
    process.env.LOCAL_KEK_BASE64 = Buffer.alloc(32).toString("base64");
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgres://woxa:woxa_local_dev@localhost:5433/woxa_vault";
  }
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
});

async function loadDeps() {
  const { createApp } = await import("@/app");
  const { db, sql } = await import("@/db/client");
  const { organizations, orgMembers, users, auditEvents } = await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/session");
  return {
    app: createApp(),
    db,
    sql,
    organizations,
    orgMembers,
    users,
    auditEvents,
    eq,
    inArray,
    createSession,
    SESSION_COOKIE_NAME,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

interface AuditEventDto {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetName: string | null;
  occurredAt: string;
}
interface PageResponse {
  events: AuditEventDto[];
  total: number;
  page: number;
  limit: number;
}

describe("GET /audit (page-based) + GET /audit/actors integration", () => {
  let deps: Deps;
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
  });

  afterAll(async () => {
    if (!deps) return;
    if (createdUserIds.length > 0) {
      await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, createdUserIds));
    }
    if (createdOrgIds.length > 0) {
      await deps.db
        .delete(deps.organizations)
        .where(deps.inArray(deps.organizations.id, createdOrgIds));
    }
    await deps.sql.end({ timeout: 5 });
  });

  // ---- helpers -------------------------------------------------------------

  async function makeOrg(): Promise<string> {
    const orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "Audit Page Test Org",
      slug: `aud-${orgId.slice(0, 8)}`,
    });
    createdOrgIds.push(orgId);
    return orgId;
  }

  async function makeUser(
    orgId: string,
    orgRole = "member",
  ): Promise<{ userId: string; email: string; cookie: string }> {
    const userId = randomUUID();
    const email = `aud-${userId}@test.local`;
    await deps.db.insert(deps.users).values({
      id: userId,
      email,
      passwordHash: null,
      totpEnabledAt: new Date(),
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    createdUserIds.push(userId);
    const { token } = await deps.createSession(userId);
    return { userId, email, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
  }

  // Insert a single audit row at a deterministic timestamp (ms offset from a
  // fixed base so ordering is stable across the test run).
  let tick = 0;
  async function seed(opts: {
    orgId: string | null;
    actorUserId: string;
    actorEmail: string;
    action: string;
    targetName?: string | null;
  }): Promise<void> {
    tick += 1;
    await deps.db.insert(deps.auditEvents).values({
      orgId: opts.orgId,
      actorUserId: opts.actorUserId,
      actorEmail: opts.actorEmail,
      action: opts.action,
      targetType: "item",
      targetName: opts.targetName ?? null,
      success: true,
      occurredAt: new Date(Date.UTC(2030, 0, 1) + tick * 60_000),
    });
  }

  function req(path: string, cookie: string) {
    return deps.app.request(path, {
      headers: { "Content-Type": "application/json", Cookie: cookie },
    });
  }

  async function audit(query: string, cookie: string) {
    return req(`/audit${query}`, cookie);
  }

  // ---- total + page/limit slicing -----------------------------------------

  it("total counts all matching rows; page/limit slices correctly", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");

    // 7 rows for this org by the admin.
    for (let i = 0; i < 7; i++) {
      await seed({
        orgId,
        actorUserId: admin.userId,
        actorEmail: admin.email,
        action: "item.update",
        targetName: `target-${i}`,
      });
    }

    const p1 = await audit("?page=1&limit=3", admin.cookie);
    expect(p1.status).toBe(200);
    const b1 = (await p1.json()) as PageResponse;
    expect(b1.total).toBe(7);
    expect(b1.page).toBe(1);
    expect(b1.limit).toBe(3);
    expect(b1.events.length).toBe(3);

    const p2 = await audit("?page=2&limit=3", admin.cookie);
    const b2 = (await p2.json()) as PageResponse;
    expect(b2.total).toBe(7);
    expect(b2.events.length).toBe(3);

    const p3 = await audit("?page=3&limit=3", admin.cookie);
    const b3 = (await p3.json()) as PageResponse;
    expect(b3.events.length).toBe(1); // 7 = 3 + 3 + 1

    // No overlap between pages; ordering occurred_at DESC across the full set.
    const ids = [...b1.events, ...b2.events, ...b3.events].map((e) => e.id);
    expect(new Set(ids).size).toBe(7);
    const times = [...b1.events, ...b2.events, ...b3.events].map((e) =>
      new Date(e.occurredAt).getTime(),
    );
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]! >= times[i]!).toBe(true);
    }

    // default limit = 25 when omitted
    const def = await audit("", admin.cookie);
    const bd = (await def.json()) as PageResponse;
    expect(bd.limit).toBe(25);
    expect(bd.page).toBe(1);
    expect(bd.total).toBe(7);
  });

  // ---- q search: case-insensitive, multi-column, literal wildcards --------

  it("q matches actorEmail / action / targetName case-insensitively and treats wildcards literally", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");

    await seed({
      orgId,
      actorUserId: admin.userId,
      actorEmail: admin.email,
      action: "vault.create",
      targetName: "Production DB",
    });
    await seed({
      orgId,
      actorUserId: admin.userId,
      actorEmail: admin.email,
      action: "item.reveal",
      targetName: "Staging key",
    });
    // a target that literally contains a percent sign
    await seed({
      orgId,
      actorUserId: admin.userId,
      actorEmail: admin.email,
      action: "note.update",
      targetName: "100% coverage",
    });

    // matches targetName, case-insensitive
    const t = (await (await audit("?q=production", admin.cookie)).json()) as PageResponse;
    expect(t.total).toBe(1);
    expect(t.events[0]!.targetName).toBe("Production DB");

    // matches action
    const a = (await (await audit("?q=REVEAL", admin.cookie)).json()) as PageResponse;
    expect(a.total).toBe(1);
    expect(a.events[0]!.action).toBe("item.reveal");

    // matches actorEmail (the admin's email contains "aud-")
    const e = (await (await audit("?q=aud-", admin.cookie)).json()) as PageResponse;
    expect(e.total).toBe(3); // all three rows share the admin actor email

    // wildcard `%` is literal: matches ONLY the "100% coverage" row, not all rows
    const pct = (await (await audit(`?q=${encodeURIComponent("100%")}`, admin.cookie)).json()) as PageResponse;
    expect(pct.total).toBe(1);
    expect(pct.events[0]!.targetName).toBe("100% coverage");

    // a bare `%` must NOT behave as match-all
    const bare = (await (await audit(`?q=${encodeURIComponent("%")}`, admin.cookie)).json()) as PageResponse;
    expect(bare.total).toBe(1); // only the literal-% row
  });

  // ---- repeatable actor filter --------------------------------------------

  it("repeatable `actor` unions the given users; single actor narrows", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const alice = await makeUser(orgId, "member");
    const bob = await makeUser(orgId, "member");
    const carol = await makeUser(orgId, "member");

    await seed({ orgId, actorUserId: alice.userId, actorEmail: alice.email, action: "item.create" });
    await seed({ orgId, actorUserId: bob.userId, actorEmail: bob.email, action: "item.create" });
    await seed({ orgId, actorUserId: carol.userId, actorEmail: carol.email, action: "item.create" });

    // single actor
    const one = (await (await audit(`?actor=${alice.userId}`, admin.cookie)).json()) as PageResponse;
    expect(one.total).toBe(1);
    expect(one.events[0]!.actorUserId).toBe(alice.userId);

    // two actors → union
    const two = (await (
      await audit(`?actor=${alice.userId}&actor=${bob.userId}`, admin.cookie)
    ).json()) as PageResponse;
    expect(two.total).toBe(2);
    const set = new Set(two.events.map((e) => e.actorUserId));
    expect(set.has(alice.userId)).toBe(true);
    expect(set.has(bob.userId)).toBe(true);
    expect(set.has(carol.userId)).toBe(false);

    // malformed actor → 400
    expect((await audit("?actor=not-a-uuid", admin.cookie)).status).toBe(400);
  });

  // ---- GET /audit/actors ---------------------------------------------------

  it("GET /audit/actors returns the org's distinct actors ordered by email", async () => {
    const orgId = await makeOrg();
    const admin = await makeUser(orgId, "admin");
    const alice = await makeUser(orgId, "member");

    // alice appears twice → must still be distinct
    await seed({ orgId, actorUserId: alice.userId, actorEmail: alice.email, action: "item.create" });
    await seed({ orgId, actorUserId: alice.userId, actorEmail: alice.email, action: "item.update" });
    await seed({ orgId, actorUserId: admin.userId, actorEmail: admin.email, action: "vault.create" });

    const res = await req("/audit/actors", admin.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { actors: { userId: string; email: string }[] };

    const ids = body.actors.map((a) => a.userId);
    // distinct: alice present once
    expect(ids.filter((id) => id === alice.userId).length).toBe(1);
    expect(ids).toContain(admin.userId);

    // ordered by email ASC
    const emails = body.actors.map((a) => a.email);
    const sorted = [...emails].sort();
    expect(emails).toEqual(sorted);
  });

  // ---- RBAC ---------------------------------------------------------------

  it("non-admin org member → 403 on /audit and /audit/actors", async () => {
    const orgId = await makeOrg();
    const member = await makeUser(orgId, "member");

    expect((await audit("", member.cookie)).status).toBe(403);
    expect((await req("/audit/actors", member.cookie)).status).toBe(403);
  });

  it("auditor role → 200 on both", async () => {
    const orgId = await makeOrg();
    const auditor = await makeUser(orgId, "auditor");
    await seed({
      orgId,
      actorUserId: auditor.userId,
      actorEmail: auditor.email,
      action: "item.create",
    });

    expect((await audit("", auditor.cookie)).status).toBe(200);
    expect((await req("/audit/actors", auditor.cookie)).status).toBe(200);
  });
});
