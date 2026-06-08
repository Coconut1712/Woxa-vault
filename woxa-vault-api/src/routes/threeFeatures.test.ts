import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration tests for three features (drives the REAL app + REAL Postgres;
// project memory: integration tests hit a real database, never mocks):
//   * Feature 1 — GET /me/activity (AC-041.1–3): self-scoped activity feed.
//   * Feature 2 — sweepStaleAccessRequests() (AC-061.5): 7-day auto-deny.
//   * Feature 3 — PATCH /vaults/:id/folders/reorder (US-011.4): bulk reorder.

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
  const {
    organizations,
    orgMembers,
    users,
    vaults,
    vaultMembers,
    folders,
    auditEvents,
    accessRequests,
    notifications,
  } = await import("@/db/schema");
  const { eq, inArray, and, asc } = await import("drizzle-orm");
  const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/session");
  const { sweepStaleAccessRequests } = await import("@/lib/expirationSweeper");
  return {
    app: createApp(),
    db,
    sql,
    organizations,
    orgMembers,
    users,
    vaults,
    vaultMembers,
    folders,
    auditEvents,
    accessRequests,
    notifications,
    eq,
    inArray,
    and,
    asc,
    createSession,
    SESSION_COOKIE_NAME,
    sweepStaleAccessRequests,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

describe("three features integration", () => {
  let deps: Deps;
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdVaultIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
  });

  afterAll(async () => {
    if (!deps) return;
    if (createdVaultIds.length > 0) {
      await deps.db.delete(deps.vaults).where(deps.inArray(deps.vaults.id, createdVaultIds));
    }
    if (createdUserIds.length > 0) {
      // Clean rows that FK to users but aren't cascaded via org delete order.
      await deps.db
        .delete(deps.auditEvents)
        .where(deps.inArray(deps.auditEvents.actorUserId, createdUserIds));
      await deps.db
        .delete(deps.notifications)
        .where(deps.inArray(deps.notifications.userId, createdUserIds));
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
      name: "3feat Test Org",
      slug: `3f-${orgId.slice(0, 8)}`,
    });
    createdOrgIds.push(orgId);
    return orgId;
  }

  async function makeUser(
    orgId: string,
    orgRole = "member",
  ): Promise<{ userId: string; email: string; cookie: string }> {
    const userId = randomUUID();
    const email = `3f-${userId}@test.local`;
    await deps.db.insert(deps.users).values({
      id: userId,
      email,
      passwordHash: null,
      totpEnabledAt: new Date(), // satisfy requireTwoFactorEnrolled
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    createdUserIds.push(userId);
    const { token } = await deps.createSession(userId);
    return { userId, email, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
  }

  async function makeVault(orgId: string, createdBy: string): Promise<string> {
    const [v] = await deps.db
      .insert(deps.vaults)
      .values({ orgId, name: `vault-${randomUUID().slice(0, 8)}`, createdBy })
      .returning();
    createdVaultIds.push(v!.id);
    return v!.id;
  }

  async function addVaultMember(vaultId: string, userId: string, role: string) {
    await deps.db.insert(deps.vaultMembers).values({ vaultId, userId, role });
  }

  function req(path: string, cookie: string, init: RequestInit = {}) {
    return deps.app.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
    });
  }

  // ===========================================================================
  // Feature 1 — GET /me/activity
  // ===========================================================================

  async function seedSelfEvents(
    userId: string,
    email: string,
    action: string,
    n: number,
    when: Date,
  ): Promise<void> {
    for (let i = 0; i < n; i++) {
      await deps.db.insert(deps.auditEvents).values({
        actorUserId: userId,
        actorEmail: email,
        action,
        targetType: "user",
        targetId: userId,
        targetName: "self",
        success: true,
        occurredAt: new Date(when.getTime() + i * 1000),
      });
    }
  }

  it("GET /me/activity returns only the caller's own events, paginated, with the spec shape", async () => {
    const orgId = await makeOrg();
    const me = await makeUser(orgId, "member");
    const other = await makeUser(orgId, "member");

    const now = new Date();
    await seedSelfEvents(me.userId, me.email, "account.login", 30, now);
    // events belonging to another user must never appear
    await seedSelfEvents(other.userId, other.email, "account.login", 5, now);

    const res = await req("/me/activity", me.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      events: Record<string, unknown>[];
      total: number;
      page: number;
    };
    expect(body.total).toBe(30);
    expect(body.page).toBe(1);
    expect(body.events.length).toBe(25); // default limit

    // exact wire shape per the spec
    expect(Object.keys(body.events[0]!).sort()).toEqual(
      [
        "id",
        "action",
        "targetType",
        "targetName",
        "ipHash",
        "userAgent",
        "createdAt",
        "success",
        "metadata",
      ].sort(),
    );
  });

  it("GET /me/activity honors page + limit and includes vault_unlock events", async () => {
    const orgId = await makeOrg();
    const me = await makeUser(orgId, "member");
    const now = new Date();
    await seedSelfEvents(me.userId, me.email, "account.profile_updated", 10, now);
    await seedSelfEvents(me.userId, me.email, "account.vault_unlock_success", 3, now);
    await seedSelfEvents(me.userId, me.email, "account.vault_unlock_failed", 2, now);

    const p1 = await req("/me/activity?limit=10&page=1", me.cookie);
    const p1Body = (await p1.json()) as { events: unknown[]; total: number; page: number };
    expect(p1Body.total).toBe(15);
    expect(p1Body.events.length).toBe(10);
    expect(p1Body.page).toBe(1);

    const p2 = await req("/me/activity?limit=10&page=2", me.cookie);
    const p2Body = (await p2.json()) as { events: unknown[]; page: number };
    expect(p2Body.events.length).toBe(5);
    expect(p2Body.page).toBe(2);

    // action filter narrows to vault_unlock_failed
    const filtered = await req(
      "/me/activity?action=account.vault_unlock_failed",
      me.cookie,
    );
    const fBody = (await filtered.json()) as {
      events: { action: string }[];
      total: number;
    };
    expect(fBody.total).toBe(2);
    expect(fBody.events.every((e) => e.action === "account.vault_unlock_failed")).toBe(true);
  });

  it("GET /me/activity rejects limit > 50 and requires auth", async () => {
    const orgId = await makeOrg();
    const me = await makeUser(orgId, "member");
    expect((await req("/me/activity?limit=51", me.cookie)).status).toBe(400);
    expect((await deps.app.request("/me/activity")).status).toBe(401);
  });

  // ===========================================================================
  // Feature 2 — sweepStaleAccessRequests (AC-061.5)
  // ===========================================================================

  it("auto-denies pending access requests older than 7 days; leaves fresh ones", async () => {
    const orgId = await makeOrg();
    const requester = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, requester.userId);

    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

    const [staleReq] = await deps.db
      .insert(deps.accessRequests)
      .values({
        orgId,
        requesterId: requester.userId,
        targetType: "vault",
        targetId: vaultId,
        targetName: "Vault X",
        requestedRole: "editor",
        reason: "need access",
        status: "pending",
        createdAt: eightDaysAgo,
      })
      .returning();

    const [freshReq] = await deps.db
      .insert(deps.accessRequests)
      .values({
        orgId,
        requesterId: requester.userId,
        targetType: "vault",
        targetId: vaultId,
        targetName: "Vault X",
        requestedRole: "editor",
        reason: "need access",
        status: "pending",
        createdAt: oneDayAgo,
      })
      .returning();

    await deps.sweepStaleAccessRequests();

    const staleAfter = await deps.db.query.accessRequests.findFirst({
      where: deps.eq(deps.accessRequests.id, staleReq!.id),
    });
    expect(staleAfter!.status).toBe("denied");
    expect(staleAfter!.decisionReason).toBe("auto_denied_after_7_days");
    expect(staleAfter!.decidedAt).not.toBeNull();

    const freshAfter = await deps.db.query.accessRequests.findFirst({
      where: deps.eq(deps.accessRequests.id, freshReq!.id),
    });
    expect(freshAfter!.status).toBe("pending");

    // requester got a notification
    const notes = await deps.db
      .select()
      .from(deps.notifications)
      .where(
        deps.and(
          deps.eq(deps.notifications.userId, requester.userId),
          deps.eq(deps.notifications.type, "access_request.denied"),
        ),
      );
    expect(notes.length).toBe(1);
    expect(notes[0]!.actorUserId).toBeNull();

    // audit row written with null actor
    const audits = await deps.db
      .select()
      .from(deps.auditEvents)
      .where(
        deps.and(
          deps.eq(deps.auditEvents.action, "access_request.auto_denied"),
          deps.eq(deps.auditEvents.targetId, vaultId),
        ),
      );
    expect(audits.length).toBe(1);
    expect(audits[0]!.actorUserId).toBeNull();

    // idempotent: a second sweep does not re-deny / double-notify
    await deps.sweepStaleAccessRequests();
    const notes2 = await deps.db
      .select()
      .from(deps.notifications)
      .where(
        deps.and(
          deps.eq(deps.notifications.userId, requester.userId),
          deps.eq(deps.notifications.type, "access_request.denied"),
        ),
      );
    expect(notes2.length).toBe(1);
  });

  // ===========================================================================
  // Feature 3 — PATCH /vaults/:id/folders/reorder (US-011.4)
  // ===========================================================================

  async function makeFolder(vaultId: string, name: string, position: number): Promise<string> {
    const [f] = await deps.db
      .insert(deps.folders)
      .values({ vaultId, name, position })
      .returning();
    return f!.id;
  }

  it("editor reorders folders; positions become array index", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "owner");
    const editor = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, editor.userId, "editor");

    const a = await makeFolder(vaultId, "A", 0);
    const b = await makeFolder(vaultId, "B", 1);
    const cc = await makeFolder(vaultId, "C", 2);

    const order = [cc, a, b]; // reverse-ish
    const res = await req(`/vaults/${vaultId}/folders/reorder`, editor.cookie, {
      method: "PATCH",
      body: JSON.stringify({ order }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });

    const rows = await deps.db
      .select()
      .from(deps.folders)
      .where(deps.eq(deps.folders.vaultId, vaultId))
      .orderBy(deps.asc(deps.folders.position));
    expect(rows.map((r) => r.id)).toEqual([cc, a, b]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it("viewer cannot reorder (403); foreign/unknown id rejected (400)", async () => {
    const orgId = await makeOrg();
    const owner = await makeUser(orgId, "owner");
    const viewer = await makeUser(orgId, "member");
    const vaultId = await makeVault(orgId, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, viewer.userId, "viewer");
    const a = await makeFolder(vaultId, "A", 0);

    // viewer → 403
    const forbidden = await req(`/vaults/${vaultId}/folders/reorder`, viewer.cookie, {
      method: "PATCH",
      body: JSON.stringify({ order: [a] }),
    });
    expect(forbidden.status).toBe(403);

    // owner with a folder id from ANOTHER vault → 400
    const otherVault = await makeVault(orgId, owner.userId);
    const foreign = await makeFolder(otherVault, "Z", 0);
    const bad = await req(`/vaults/${vaultId}/folders/reorder`, owner.cookie, {
      method: "PATCH",
      body: JSON.stringify({ order: [a, foreign] }),
    });
    expect(bad.status).toBe(400);

    // unknown random id → 400
    const unknown = await req(`/vaults/${vaultId}/folders/reorder`, owner.cookie, {
      method: "PATCH",
      body: JSON.stringify({ order: [randomUUID()] }),
    });
    expect(unknown.status).toBe(400);

    // duplicate ids → 400
    const dup = await req(`/vaults/${vaultId}/folders/reorder`, owner.cookie, {
      method: "PATCH",
      body: JSON.stringify({ order: [a, a] }),
    });
    expect(dup.status).toBe(400);
  });
});
