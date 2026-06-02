import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for GET /search (US-017 / AC-017.2/.3/.5). Drives the REAL
// app + REAL Postgres (project convention: integration tests never mock the DB).
//
// What this pins:
//   * Finds an accessible item by name / username / url substring (fuzzy ILIKE).
//   * RBAC: does NOT return an item the caller has no grant on (sub-grant model).
//   * Org isolation: a query never returns items from another org.
//   * AC-017.3 sort: exact name match ranks before a partial match.

interface SearchResultRow {
  id: string;
  effectiveRole: string;
  vaultName: string;
}
interface SearchBody {
  results: SearchResultRow[];
}

beforeAll(() => {
  if (!process.env.MFA_TOKEN_SECRET || process.env.MFA_TOKEN_SECRET === "REPLACE_ME_WITH_HEX_64_CHARS") {
    process.env.MFA_TOKEN_SECRET = "a".repeat(64);
  }
  if (!process.env.LOCAL_KEK_BASE64 || process.env.LOCAL_KEK_BASE64 === "REPLACE_ME_WITH_BASE64_32_BYTES") {
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
  const { organizations, orgMembers, users, vaults, vaultMembers, items, folders, folderMembers } =
    await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const { createSession, SESSION_COOKIE_NAME } = await import("@/lib/session");
  return {
    app: createApp(),
    db,
    sql,
    organizations,
    orgMembers,
    users,
    vaults,
    vaultMembers,
    items,
    folders,
    folderMembers,
    eq,
    inArray,
    createSession,
    SESSION_COOKIE_NAME,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

describe("GET /search (integration)", () => {
  let deps: Deps;
  let orgA: string;
  let orgB: string;
  const userIds: string[] = [];
  const vaultIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
    orgA = randomUUID();
    orgB = randomUUID();
    await deps.db.insert(deps.organizations).values([
      { id: orgA, name: "Search Org A", slug: `sa-${orgA.slice(0, 8)}` },
      { id: orgB, name: "Search Org B", slug: `sb-${orgB.slice(0, 8)}` },
    ]);
  });

  afterAll(async () => {
    if (!deps) return;
    if (vaultIds.length) await deps.db.delete(deps.vaults).where(deps.inArray(deps.vaults.id, vaultIds));
    if (userIds.length) await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, userIds));
    await deps.db.delete(deps.organizations).where(deps.inArray(deps.organizations.id, [orgA, orgB]));
    await deps.sql.end({ timeout: 5 });
  });

  async function makeUser(orgId: string, orgRole = "member") {
    const userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `srch-${userId}@test.local`,
      passwordHash: null,
      totpEnabledAt: new Date(),
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    userIds.push(userId);
    const { token } = await deps.createSession(userId);
    return { userId, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
  }

  async function makeVault(orgId: string, createdBy: string) {
    const [v] = await deps.db
      .insert(deps.vaults)
      .values({ orgId, name: `v-${randomUUID().slice(0, 8)}`, createdBy })
      .returning();
    vaultIds.push(v!.id);
    return v!.id;
  }

  async function addVaultMember(vaultId: string, userId: string, role: string) {
    await deps.db.insert(deps.vaultMembers).values({ vaultId, userId, role });
  }

  async function makeItem(
    vaultId: string,
    createdBy: string,
    fields: { name: string; username?: string; url?: string; type?: string },
  ) {
    const [it] = await deps.db
      .insert(deps.items)
      .values({
        vaultId,
        type: fields.type ?? "login",
        name: fields.name,
        username: fields.username ?? null,
        url: fields.url ?? null,
        createdBy,
      })
      .returning();
    return it!.id;
  }

  async function search(path: string, cookie: string): Promise<{ status: number; body: SearchBody }> {
    const res = await deps.app.request(path, { headers: { Cookie: cookie } });
    const body = (await res.json()) as SearchBody;
    return { status: res.status, body };
  }

  it("finds an accessible item by name substring and reports effectiveRole", async () => {
    const u = await makeUser(orgA, "member");
    const vaultId = await makeVault(orgA, u.userId);
    await addVaultMember(vaultId, u.userId, "editor");
    const itemId = await makeItem(vaultId, u.userId, { name: "GitHub Production Token" });

    const { status, body } = await search(`/search?q=github`, u.cookie);
    expect(status).toBe(200);
    const found = body.results.find((r) => r.id === itemId);
    expect(found).toBeTruthy();
    expect(found!.effectiveRole).toBe("editor");
    expect(found!.vaultName).toBeTruthy();
    // No secret material in the search payload.
    expect(found).not.toHaveProperty("password");
    expect(found).not.toHaveProperty("notes");
  });

  it("matches on username and url too", async () => {
    const u = await makeUser(orgA, "member");
    const vaultId = await makeVault(orgA, u.userId);
    await addVaultMember(vaultId, u.userId, "manager");
    const byUser = await makeItem(vaultId, u.userId, { name: "Bastion", username: "deploy-bot@corp.io" });
    const byUrl = await makeItem(vaultId, u.userId, { name: "Dashboard", url: "https://grafana.internal" });

    const r1 = await search(`/search?q=deploy-bot`, u.cookie);
    expect(r1.body.results.map((x) => x.id)).toContain(byUser);
    const r2 = await search(`/search?q=grafana`, u.cookie);
    expect(r2.body.results.map((x) => x.id)).toContain(byUrl);
  });

  it("does NOT return an item the caller has no grant on (sub-grant RBAC)", async () => {
    const owner = await makeUser(orgA, "member");
    const outsider = await makeUser(orgA, "member"); // same org, no vault membership
    const vaultId = await makeVault(orgA, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const secretItem = await makeItem(vaultId, owner.userId, { name: "ZZZ Secret Marker" });

    const res = await search(`/search?q=ZZZ%20Secret%20Marker`, outsider.cookie);
    expect(res.body.results.map((x) => x.id)).not.toContain(secretItem);

    // Owner CAN see it.
    const ownerRes = await search(`/search?q=ZZZ%20Secret%20Marker`, owner.cookie);
    expect(ownerRes.body.results.map((x) => x.id)).toContain(secretItem);
  });

  it("never leaks items from another org (active-org scope)", async () => {
    const userInA = await makeUser(orgA, "member");
    const ownerB = await makeUser(orgB, "member");
    const vaultB = await makeVault(orgB, ownerB.userId);
    await addVaultMember(vaultB, ownerB.userId, "manager");
    const crossOrgItem = await makeItem(vaultB, ownerB.userId, { name: "CrossOrgUnique Marker" });

    // userInA's active org is orgA; the item lives in orgB → must be invisible.
    const res = await search(`/search?q=CrossOrgUnique`, userInA.cookie);
    expect(res.body.results.map((x) => x.id)).not.toContain(crossOrgItem);
  });

  // #2 (batch resolver) — folder-grant-only access must still resolve via the
  // most-specific-wins engine (folder grant beats absent vault membership).
  it("returns an item the caller can reach via a FOLDER grant only (batch resolver)", async () => {
    const owner = await makeUser(orgA, "member");
    const folderUser = await makeUser(orgA, "member"); // no vault membership
    const vaultId = await makeVault(orgA, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");

    const [folder] = await deps.db
      .insert(deps.folders)
      .values({ vaultId, name: `f-${randomUUID().slice(0, 8)}` })
      .returning();
    const [it] = await deps.db
      .insert(deps.items)
      .values({ vaultId, type: "login", name: "FolderGrantMarker", folderId: folder!.id, createdBy: owner.userId })
      .returning();
    await deps.db
      .insert(deps.folderMembers)
      .values({ folderId: folder!.id, userId: folderUser.userId, role: "editor" });

    const res = await search(`/search?q=FolderGrantMarker`, folderUser.cookie);
    const found = res.body.results.find((r) => r.id === it!.id);
    expect(found).toBeTruthy();
    expect(found!.effectiveRole).toBe("editor"); // folder grant wins
  });

  // #2 — org auditor sees every org item as a viewer (auditor branch, no batch).
  it("org auditor sees items as viewer across the org", async () => {
    const owner = await makeUser(orgA, "member");
    const auditor = await makeUser(orgA, "auditor"); // no vault grant
    const vaultId = await makeVault(orgA, owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const it = await makeItem(vaultId, owner.userId, { name: "AuditorVisibleMarker" });

    const res = await search(`/search?q=AuditorVisibleMarker`, auditor.cookie);
    const found = res.body.results.find((r) => r.id === it);
    expect(found).toBeTruthy();
    expect(found!.effectiveRole).toBe("viewer");
  });

  it("ranks an exact name match ahead of a partial match (AC-017.3)", async () => {
    const u = await makeUser(orgA, "member");
    const vaultId = await makeVault(orgA, u.userId);
    await addVaultMember(vaultId, u.userId, "manager");
    const partial = await makeItem(vaultId, u.userId, { name: "Acme Staging Database" });
    const exact = await makeItem(vaultId, u.userId, { name: "Acme" });

    const { body } = await search(`/search?q=Acme`, u.cookie);
    const ids = body.results.map((x) => x.id);
    expect(ids.indexOf(exact)).toBeLessThan(ids.indexOf(partial));
  });
});
