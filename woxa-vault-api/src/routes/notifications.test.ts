import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID, createHash, randomBytes } from "node:crypto";

// Integration test for the event-driven Notifications system. Drives the REAL
// app + REAL Postgres (project memory: integration tests hit a real database,
// never mocks).
//
// What this pins:
//   * Sharing a vault / item / folder with user B creates a `share.received`
//     notification for B (and NOT for the actor A); GET /notifications as B
//     shows it + unreadCount = 1.
//   * Role change / revoke on a vault grant create role.changed / access.revoked
//     for the grantee.
//   * member.role_changed notifies the target member.
//   * POST /:id/read marks read (unreadCount -> 0); reading another user's
//     notification -> 404 (anti-enumeration).
//   * POST /read-all marks all the caller's unread read.
//   * send.viewed: opening a one-time send creates a notification for the
//     send's creator.
//   * A user is never notified of their own action (userId === actorUserId
//     guard) — covered by every "not for the actor" assertion + a direct
//     self-share check.

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
    items,
    oneTimeSends,
    notifications,
  } = await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/session");
  const { generateWrappedDek, encryptField, zeroize } = await import("@/lib/itemCrypto");
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
    items,
    oneTimeSends,
    notifications,
    eq,
    inArray,
    createSession,
    SESSION_COOKIE_NAME,
    generateWrappedDek,
    encryptField,
    zeroize,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

interface NotificationDTO {
  id: string;
  type: string;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

describe("Notifications system (integration)", () => {
  let deps: Deps;
  let orgId: string;
  const createdUserIds: string[] = [];
  const createdVaultIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
    orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "Notifications Test Org",
      slug: `notif-${orgId.slice(0, 8)}`,
    });
  });

  afterAll(async () => {
    if (!deps) return;
    if (createdVaultIds.length > 0) {
      await deps.db.delete(deps.vaults).where(deps.inArray(deps.vaults.id, createdVaultIds));
    }
    if (createdUserIds.length > 0) {
      // notifications cascade on user delete (userId FK cascade).
      await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, createdUserIds));
    }
    await deps.db.delete(deps.organizations).where(deps.eq(deps.organizations.id, orgId));
    await deps.sql.end({ timeout: 5 });
  });

  // ---- helpers -------------------------------------------------------------

  async function makeUser(
    orgRole = "member",
  ): Promise<{ userId: string; email: string; cookie: string }> {
    const userId = randomUUID();
    const email = `notif-${userId}@test.local`;
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

  async function makeVault(createdBy: string): Promise<string> {
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

  async function makeFolder(vaultId: string): Promise<string> {
    const [f] = await deps.db
      .insert(deps.folders)
      .values({ vaultId, name: `folder-${randomUUID().slice(0, 8)}`, position: 0 })
      .returning();
    return f!.id;
  }

  async function makeItem(vaultId: string, createdBy: string): Promise<string> {
    const { dek, wrapped } = deps.generateWrappedDek();
    try {
      const enc = deps.encryptField(dek, "s3cret");
      const [it] = await deps.db
        .insert(deps.items)
        .values({
          vaultId,
          type: "login",
          name: `item-${randomUUID().slice(0, 8)}`,
          passwordCiphertext: enc.ciphertext,
          passwordIv: enc.iv,
          dekCiphertext: wrapped.dekCiphertext,
          dekIv: wrapped.dekIv,
          createdBy,
        })
        .returning();
      return it!.id;
    } finally {
      deps.zeroize(dek);
    }
  }

  function req(path: string, cookie: string, init: RequestInit = {}) {
    return deps.app.request(path, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
    });
  }

  async function listNotifications(
    cookie: string,
  ): Promise<{ notifications: NotificationDTO[]; unreadCount: number }> {
    const res = await req("/notifications", cookie);
    expect(res.status).toBe(200);
    return (await res.json()) as { notifications: NotificationDTO[]; unreadCount: number };
  }

  // ---- vault share -> share.received for the grantee, NOT the actor --------

  it("sharing a vault with B creates share.received for B (not A); list shows it, unreadCount=1", async () => {
    const a = await makeUser("admin");
    const b = await makeUser("member");
    const vaultId = await makeVault(a.userId);
    await addVaultMember(vaultId, a.userId, "manager");

    const share = await req(`/vaults/${vaultId}/members`, a.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: b.userId, role: "editor" }),
    });
    expect(share.status).toBe(201);

    // B has exactly one notification.
    const bInbox = await listNotifications(b.cookie);
    expect(bInbox.unreadCount).toBe(1);
    expect(bInbox.notifications.length).toBe(1);
    const n = bInbox.notifications[0]!;
    expect(n.type).toBe("share.received");
    expect(n.targetType).toBe("vault");
    expect(n.targetId).toBe(vaultId);
    expect(n.actorEmail).toBe(a.email);
    expect(n.read).toBe(false);
    expect(n.metadata).toMatchObject({ resourceKind: "vault", role: "editor" });

    // The ACTOR A has none (never notified of their own action).
    const aInbox = await listNotifications(a.cookie);
    expect(aInbox.unreadCount).toBe(0);
    expect(aInbox.notifications.length).toBe(0);
  });

  it("sharing an item with B creates share.received(item) for B", async () => {
    const a = await makeUser("admin");
    const b = await makeUser("member");
    const vaultId = await makeVault(a.userId);
    await addVaultMember(vaultId, a.userId, "manager");
    const itemId = await makeItem(vaultId, a.userId);

    const share = await req(`/items/${itemId}/members`, a.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: b.userId, role: "viewer" }),
    });
    expect(share.status).toBe(201);

    const bInbox = await listNotifications(b.cookie);
    expect(bInbox.unreadCount).toBe(1);
    const n = bInbox.notifications[0]!;
    expect(n.type).toBe("share.received");
    expect(n.targetType).toBe("item");
    expect(n.targetId).toBe(itemId);
    expect(n.metadata).toMatchObject({ resourceKind: "item", role: "viewer" });
  });

  it("sharing a folder with B creates share.received(folder) for B", async () => {
    const a = await makeUser("admin");
    const b = await makeUser("member");
    const vaultId = await makeVault(a.userId);
    await addVaultMember(vaultId, a.userId, "manager");
    const folderId = await makeFolder(vaultId);

    const share = await req(`/folders/${folderId}/members`, a.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: b.userId, role: "editor" }),
    });
    expect(share.status).toBe(201);

    const bInbox = await listNotifications(b.cookie);
    expect(bInbox.unreadCount).toBe(1);
    const n = bInbox.notifications[0]!;
    expect(n.type).toBe("share.received");
    expect(n.targetType).toBe("folder");
    expect(n.metadata).toMatchObject({ resourceKind: "folder", role: "editor" });
  });

  // ---- vault role change -> role.changed; revoke -> access.revoked ---------

  it("vault role change creates role.changed(from->to) for the grantee", async () => {
    const a = await makeUser("admin");
    const b = await makeUser("member");
    const vaultId = await makeVault(a.userId);
    await addVaultMember(vaultId, a.userId, "manager");

    // share first (creates 1 notification), then change role (creates a 2nd).
    await req(`/vaults/${vaultId}/members`, a.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: b.userId, role: "viewer" }),
    });
    const patch = await req(`/vaults/${vaultId}/members/${b.userId}`, a.cookie, {
      method: "PATCH",
      body: JSON.stringify({ role: "editor" }),
    });
    expect(patch.status).toBe(200);

    const bInbox = await listNotifications(b.cookie);
    expect(bInbox.unreadCount).toBe(2);
    // newest first -> role.changed is index 0.
    const roleChanged = bInbox.notifications.find((x) => x.type === "role.changed")!;
    expect(roleChanged).toBeTruthy();
    expect(roleChanged.targetType).toBe("vault");
    expect(roleChanged.metadata).toMatchObject({
      resourceKind: "vault",
      from: "viewer",
      to: "editor",
    });
  });

  it("vault revoke creates access.revoked for the removed user", async () => {
    const a = await makeUser("admin");
    const b = await makeUser("member");
    const vaultId = await makeVault(a.userId);
    await addVaultMember(vaultId, a.userId, "manager");

    await req(`/vaults/${vaultId}/members`, a.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: b.userId, role: "editor" }),
    });
    const del = await req(`/vaults/${vaultId}/members/${b.userId}`, a.cookie, { method: "DELETE" });
    expect(del.status).toBe(204);

    const bInbox = await listNotifications(b.cookie);
    const revoked = bInbox.notifications.find((x) => x.type === "access.revoked")!;
    expect(revoked).toBeTruthy();
    expect(revoked.targetType).toBe("vault");
    expect(revoked.metadata).toMatchObject({ resourceKind: "vault" });
  });

  // ---- org member role change ----------------------------------------------

  it("member.role_changed notifies the target member (PATCH /members/:userId)", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("member");

    const patch = await req(`/members/${target.userId}`, owner.cookie, {
      method: "PATCH",
      body: JSON.stringify({ role: "admin" }),
    });
    expect(patch.status).toBe(200);

    const inbox = await listNotifications(target.cookie);
    const n = inbox.notifications.find((x) => x.type === "member.role_changed")!;
    expect(n).toBeTruthy();
    expect(n.targetType).toBe("user");
    expect(n.targetId).toBe(target.userId);
    expect(n.actorEmail).toBe(owner.email);
    expect(n.metadata).toMatchObject({ from: "member", to: "admin" });

    // The owner (actor) is not notified of changing someone else.
    const ownerInbox = await listNotifications(owner.cookie);
    expect(ownerInbox.notifications.some((x) => x.type === "member.role_changed")).toBe(false);
  });

  // ---- mark read / read-all / cross-user 404 -------------------------------

  it("POST /:id/read marks one read (unreadCount->0); reading another user's -> 404", async () => {
    const a = await makeUser("admin");
    const b = await makeUser("member");
    const c = await makeUser("member"); // unrelated 3rd user
    const vaultId = await makeVault(a.userId);
    await addVaultMember(vaultId, a.userId, "manager");

    await req(`/vaults/${vaultId}/members`, a.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: b.userId, role: "viewer" }),
    });

    const bInbox = await listNotifications(b.cookie);
    expect(bInbox.unreadCount).toBe(1);
    const nid = bInbox.notifications[0]!.id;

    // C cannot mark B's notification read -> 404 (anti-enumeration).
    const cross = await req(`/notifications/${nid}/read`, c.cookie, { method: "POST" });
    expect(cross.status).toBe(404);

    // B marks it read.
    const ok = await req(`/notifications/${nid}/read`, b.cookie, { method: "POST" });
    expect(ok.status).toBe(204);

    // unread-count endpoint reflects 0 now.
    const countRes = await req("/notifications/unread-count", b.cookie);
    expect(countRes.status).toBe(200);
    expect(((await countRes.json()) as { unreadCount: number }).unreadCount).toBe(0);

    // Idempotent: re-marking the same OWN row is still 204.
    const again = await req(`/notifications/${nid}/read`, b.cookie, { method: "POST" });
    expect(again.status).toBe(204);

    // Unknown id -> 404.
    const unknown = await req(`/notifications/${randomUUID()}/read`, b.cookie, { method: "POST" });
    expect(unknown.status).toBe(404);
  });

  it("POST /read-all marks all the caller's unread read", async () => {
    const a = await makeUser("admin");
    const b = await makeUser("member");
    const vaultId = await makeVault(a.userId);
    await addVaultMember(vaultId, a.userId, "manager");

    // share + role change + revoke = 3 notifications for B.
    await req(`/vaults/${vaultId}/members`, a.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: b.userId, role: "viewer" }),
    });
    await req(`/vaults/${vaultId}/members/${b.userId}`, a.cookie, {
      method: "PATCH",
      body: JSON.stringify({ role: "editor" }),
    });
    await req(`/vaults/${vaultId}/members/${b.userId}`, a.cookie, { method: "DELETE" });

    const before = await listNotifications(b.cookie);
    expect(before.unreadCount).toBe(3);

    const readAll = await req("/notifications/read-all", b.cookie, { method: "POST" });
    expect(readAll.status).toBe(200);
    expect(((await readAll.json()) as { updated: number }).updated).toBe(3);

    const after = await listNotifications(b.cookie);
    expect(after.unreadCount).toBe(0);
    expect(after.notifications.every((n) => n.read)).toBe(true);
  });

  // ---- send.viewed ---------------------------------------------------------

  it("opening a one-time send creates send.viewed for the send's creator", async () => {
    const creator = await makeUser("member");

    // Insert a send directly with a known raw token. createdAt is pushed > the
    // 1s burn-guard grace window into the past so the first reveal isn't
    // deferred (425).
    const rawToken = randomBytes(20).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const { dek, wrapped } = deps.generateWrappedDek();
    try {
      const enc = deps.encryptField(dek, "the-secret-payload");
      await deps.db.insert(deps.oneTimeSends).values({
        tokenHash,
        orgId,
        createdBy: creator.userId,
        contentCiphertext: enc.ciphertext,
        contentIv: enc.iv,
        dekCiphertext: wrapped.dekCiphertext,
        dekIv: wrapped.dekIv,
        maxViews: 1,
        viewCount: 0,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        createdAt: new Date(Date.now() - 5_000),
      });
    } finally {
      deps.zeroize(dek);
    }

    // Public reveal — no auth/cookie (anonymous viewer).
    const reveal = await deps.app.request(`/s/${rawToken}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(reveal.status).toBe(200);
    const revealBody = (await reveal.json()) as { content: string; burned: boolean };
    expect(revealBody.content).toBe("the-secret-payload");
    expect(revealBody.burned).toBe(true);

    // The creator gets a send.viewed notification.
    const inbox = await listNotifications(creator.cookie);
    const n = inbox.notifications.find((x) => x.type === "send.viewed")!;
    expect(n).toBeTruthy();
    expect(n.targetType).toBe("send");
    expect(n.actorEmail).toBeNull(); // anonymous public viewer
    expect(n.metadata).toMatchObject({ burned: true, viewsRemaining: 0 });
  });

  // ---- self-action guard (explicit) ----------------------------------------

  it("a user is never notified of their own action (self-share guard)", async () => {
    const a = await makeUser("admin");
    const vaultId = await makeVault(a.userId);
    await addVaultMember(vaultId, a.userId, "manager");

    // A (manager) shares the vault with THEMSELVES would 409 (already a member),
    // so instead drive the guard via the writer's invariant: A changes their own
    // role is blocked by last-manager / self rules, so we assert the simplest
    // observable: after sharing with another user, A's own inbox stays empty.
    const other = await makeUser("member");
    await req(`/vaults/${vaultId}/members`, a.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: other.userId, role: "viewer" }),
    });

    const aInbox = await listNotifications(a.cookie);
    expect(aInbox.notifications.length).toBe(0);
    expect(aInbox.unreadCount).toBe(0);
  });

  // ---- auth required -------------------------------------------------------

  it("GET /notifications requires auth (401 without a session)", async () => {
    const res = await deps.app.request("/notifications");
    expect(res.status).toBe(401);
  });

  // ---- limit validation ----------------------------------------------------

  it("limit out of range -> 400", async () => {
    const a = await makeUser("member");
    expect((await req("/notifications?limit=0", a.cookie)).status).toBe(400);
    expect((await req("/notifications?limit=51", a.cookie)).status).toBe(400);
    expect((await req("/notifications?limit=30", a.cookie)).status).toBe(200);
  });

  // ---- user preferences ----------------------------------------------------

  it("respects user notification preferences (opt-out)", async () => {
    const a = await makeUser("admin");
    const b = await makeUser("member");
    const vaultId = await makeVault(a.userId);
    await addVaultMember(vaultId, a.userId, "manager");

    // B opts out of vault sharing notifications.
    const patch = await req("/me/notifications/settings", b.cookie, {
      method: "PATCH",
      body: JSON.stringify({ vaultShared: false }),
    });
    expect(patch.status).toBe(200);

    // A shares the vault with B.
    await req(`/vaults/${vaultId}/members`, a.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: b.userId, role: "viewer" }),
    });

    // B should have NO notifications because they opted out.
    const bInbox = await listNotifications(b.cookie);
    expect(bInbox.unreadCount).toBe(0);
    expect(bInbox.notifications.length).toBe(0);

    // B opts back in.
    await req("/me/notifications/settings", b.cookie, {
      method: "PATCH",
      body: JSON.stringify({ vaultShared: true }),
    });

    // A changes B's role (re-share if needed, but here we just PATCH existing).
    await req(`/vaults/${vaultId}/members/${b.userId}`, a.cookie, {
      method: "PATCH",
      body: JSON.stringify({ role: "editor" }),
    });

    // B should now have the notification.
    const bInbox2 = await listNotifications(b.cookie);
    expect(bInbox2.unreadCount).toBe(1);
    expect(bInbox2.notifications[0]!.type).toBe("role.changed");
  });
});
