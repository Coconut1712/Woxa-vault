import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for granular folder/item sharing (DESIGN.md §11.3 most-
// specific-wins). Drives the REAL app + REAL Postgres (project memory:
// integration tests hit a real database, never mocks).
//
// What this pins:
//   * resolveItemRole precedence: item override beats folder beats vault.
//   * Override can DOWNGRADE (vault editor + item viewer → reveal/edit blocked,
//     item still listed with effectiveRole=viewer) and UPGRADE (vault viewer +
//     item editor → can edit).
//   * Additive surfacing: a non-vault-member with an item grant can GET that
//     item, sees it (and only it) in GET /vaults/:id/items, and the vault
//     appears in GET /vaults.
//   * Folder grant cascades to items in the folder (incl. future items).
//   * Reveal gate: effective viewer → GET /items/:id 403.
//   * Share authority caps: editor grants up to editor (not manager); a
//     creator who is only a vault 'user' can still share up to editor; a
//     viewer cannot share at all.
//   * Guest blocked from share mutations (blockGuestWrites → 403).

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
  const { organizations, orgMembers, users, vaults, vaultMembers, items, folders } = await import(
    "@/db/schema"
  );
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
    items,
    folders,
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

describe("Granular folder/item sharing (integration)", () => {
  let deps: Deps;
  let orgId: string;
  const createdUserIds: string[] = [];
  const createdVaultIds: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
    orgId = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgId,
      name: "Sharing Test Org",
      slug: `share-${orgId.slice(0, 8)}`,
    });
  });

  afterAll(async () => {
    if (!deps) return;
    if (createdVaultIds.length > 0) {
      // Cascades clean up vault_members / folders / items / *_members.
      await deps.db.delete(deps.vaults).where(deps.inArray(deps.vaults.id, createdVaultIds));
    }
    if (createdUserIds.length > 0) {
      await deps.db.delete(deps.users).where(deps.inArray(deps.users.id, createdUserIds));
    }
    await deps.db.delete(deps.organizations).where(deps.eq(deps.organizations.id, orgId));
    await deps.sql.end({ timeout: 5 });
  });

  // ---- helpers -------------------------------------------------------------

  async function makeUser(orgRole = "member"): Promise<{ userId: string; cookie: string }> {
    const userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `share-${userId}@test.local`,
      passwordHash: null,
      totpEnabledAt: new Date(), // satisfy requireTwoFactorEnrolled
      status: "active",
    });
    await deps.db.insert(deps.orgMembers).values({ orgId, userId, role: orgRole });
    createdUserIds.push(userId);
    const { token } = await deps.createSession(userId);
    return { userId, cookie: `${deps.SESSION_COOKIE_NAME}=${token}` };
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

  // Create an item directly in the DB with a real wrapped DEK + encrypted
  // password, so the reveal path actually decrypts.
  async function makeItem(
    vaultId: string,
    createdBy: string,
    folderId: string | null = null,
    secret = "s3cret",
  ): Promise<string> {
    const { dek, wrapped } = deps.generateWrappedDek();
    try {
      const enc = deps.encryptField(dek, secret);
      const [it] = await deps.db
        .insert(deps.items)
        .values({
          vaultId,
          type: "login",
          name: `item-${randomUUID().slice(0, 8)}`,
          folderId,
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

  // ---- precedence: item override beats folder beats vault ------------------

  it("item override DOWNGRADES below vault role (AWS Root Key example)", async () => {
    const owner = await makeUser("admin");
    const editor = await makeUser("member");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, editor.userId, "editor"); // vault Editor
    const itemId = await makeItem(vaultId, owner.userId);

    // Owner pins an item override = viewer for the editor.
    const share = await req(`/items/${itemId}/members`, owner.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: editor.userId, role: "viewer" }),
    });
    expect(share.status).toBe(201);

    // VIEW returns metadata-only for an effective viewer: 200 but the password
    // is null (always withheld by the view endpoint) and effectiveRole reflects
    // the override.
    const reveal = await req(`/items/${itemId}`, editor.cookie);
    expect(reveal.status).toBe(200);
    const revealBody = (await reveal.json()) as {
      item: { password: string | null; effectiveRole: string };
    };
    expect(revealBody.item.password).toBeNull();
    expect(revealBody.item.effectiveRole).toBe("viewer");

    // The dedicated REVEAL endpoint is blocked for the effective viewer (403).
    const pw = await req(`/items/${itemId}/password`, editor.cookie);
    expect(pw.status).toBe(403);

    // Edit blocked.
    const edit = await req(`/items/${itemId}`, editor.cookie, {
      method: "PATCH",
      body: JSON.stringify({ name: "renamed" }),
    });
    expect(edit.status).toBe(403);

    // Delete blocked.
    const del = await req(`/items/${itemId}`, editor.cookie, { method: "DELETE" });
    expect(del.status).toBe(403);

    // Item still LISTED with effectiveRole=viewer.
    const list = await req(`/vaults/${vaultId}/items`, editor.cookie);
    expect(list.status).toBe(200);
    const body = (await list.json()) as { items: { id: string; effectiveRole: string }[] };
    const found = body.items.find((i) => i.id === itemId);
    expect(found?.effectiveRole).toBe("viewer");
  });

  it("item override UPGRADES above vault role (vault viewer + item editor → can edit)", async () => {
    const owner = await makeUser("admin");
    const viewer = await makeUser("member");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, viewer.userId, "viewer"); // vault Viewer
    const itemId = await makeItem(vaultId, owner.userId);

    await req(`/items/${itemId}/members`, owner.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: viewer.userId, role: "editor" }),
    });

    const edit = await req(`/items/${itemId}`, viewer.cookie, {
      method: "PATCH",
      body: JSON.stringify({ name: "now-editable" }),
    });
    expect(edit.status).toBe(200);

    // And reveal works (effective editor): VIEW = 200, /password = 200.
    const reveal = await req(`/items/${itemId}`, viewer.cookie);
    expect(reveal.status).toBe(200);
    const pw = await req(`/items/${itemId}/password`, viewer.cookie);
    expect(pw.status).toBe(200);
  });

  // ---- additive surfacing for non-vault-members ----------------------------

  it("non-member with an item grant sees ONLY that item + the vault appears in list", async () => {
    const owner = await makeUser("admin");
    const outsider = await makeUser("member"); // org member, NOT a vault member
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const sharedItem = await makeItem(vaultId, owner.userId, null, "shared-pw");
    const otherItem = await makeItem(vaultId, owner.userId, null, "other-pw");

    await req(`/items/${sharedItem}/members`, owner.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: outsider.userId, role: "user" }),
    });

    // Can GET (view) the shared item (role user >= user). The VIEW endpoint
    // never returns the password (always null now); the password is revealed via
    // the dedicated /password endpoint.
    const reveal = await req(`/items/${sharedItem}`, outsider.cookie);
    expect(reveal.status).toBe(200);
    const revealBody = (await reveal.json()) as { item: { password: string | null } };
    expect(revealBody.item.password).toBeNull();
    const pw = await req(`/items/${sharedItem}/password`, outsider.cookie);
    expect(pw.status).toBe(200);
    expect(((await pw.json()) as { password: string | null }).password).toBe("shared-pw");

    // Cannot see the OTHER item.
    const other = await req(`/items/${otherItem}`, outsider.cookie);
    expect(other.status).toBe(404);

    // GET /vaults/:id/items returns ONLY the shared item.
    const list = await req(`/vaults/${vaultId}/items`, outsider.cookie);
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { items: { id: string; effectiveRole: string }[] };
    expect(listBody.items.map((i) => i.id)).toEqual([sharedItem]);
    expect(listBody.items[0]?.effectiveRole).toBe("user");

    // The vault appears in GET /vaults for the outsider. (Each test user has a
    // single org membership, so the active-org fallback already targets it — no
    // explicit /workspace/switch needed.)
    const vaultsRes = await req("/vaults", outsider.cookie);
    expect(vaultsRes.status).toBe(200);
    const vaultsBody = (await vaultsRes.json()) as { vaults: { id: string }[] };
    expect(vaultsBody.vaults.map((v) => v.id)).toContain(vaultId);
  });

  // ---- folder grant cascade ------------------------------------------------

  it("folder grant cascades to items in the folder, including future items", async () => {
    const owner = await makeUser("admin");
    const grantee = await makeUser("member"); // not a vault member
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const folderId = await makeFolder(vaultId);
    const itemA = await makeItem(vaultId, owner.userId, folderId, "pw-a");

    // Grant folder editor to the outsider.
    const share = await req(`/folders/${folderId}/members`, owner.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: grantee.userId, role: "editor" }),
    });
    expect(share.status).toBe(201);

    // Can reveal + edit itemA via the folder cascade.
    expect((await req(`/items/${itemA}`, grantee.cookie)).status).toBe(200);
    const editA = await req(`/items/${itemA}`, grantee.cookie, {
      method: "PATCH",
      body: JSON.stringify({ name: "edited-via-folder" }),
    });
    expect(editA.status).toBe(200);

    // A FUTURE item added to the folder is also covered.
    const itemB = await makeItem(vaultId, owner.userId, folderId, "pw-b");
    expect((await req(`/items/${itemB}`, grantee.cookie)).status).toBe(200);
  });

  // ---- reveal gate ---------------------------------------------------------

  it("effective viewer gets metadata-only on reveal (200, secrets null)", async () => {
    const owner = await makeUser("admin");
    const viewer = await makeUser("member");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, viewer.userId, "viewer");
    const itemId = await makeItem(vaultId, owner.userId);

    const reveal = await req(`/items/${itemId}`, viewer.cookie);
    expect(reveal.status).toBe(200);
    const body = (await reveal.json()) as {
      item: { password: string | null; notes: string | null; effectiveRole: string };
    };
    expect(body.item.password).toBeNull();
    expect(body.item.notes).toBeNull();
    expect(body.item.effectiveRole).toBe("viewer");

    // The dedicated REVEAL endpoint is forbidden for a viewer.
    expect((await req(`/items/${itemId}/password`, viewer.cookie)).status).toBe(403);
  });

  // ---- share authority caps ------------------------------------------------

  it("editor can grant up to editor but NOT manager", async () => {
    const owner = await makeUser("admin");
    const editor = await makeUser("member");
    const target = await makeUser("member");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, editor.userId, "editor");
    const itemId = await makeItem(vaultId, owner.userId);

    // editor → grant manager = 403.
    const tooHigh = await req(`/items/${itemId}/members`, editor.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: target.userId, role: "manager" }),
    });
    expect(tooHigh.status).toBe(403);

    // editor → grant editor = 201.
    const ok = await req(`/items/${itemId}/members`, editor.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: target.userId, role: "editor" }),
    });
    expect(ok.status).toBe(201);
  });

  it("item creator who is only a vault 'user' can still share up to editor", async () => {
    const creator = await makeUser("member");
    const target = await makeUser("member");
    const vaultId = await makeVault(creator.userId);
    await addVaultMember(vaultId, creator.userId, "user"); // vault role 'user'
    const itemId = await makeItem(vaultId, creator.userId); // creator owns the item

    const ok = await req(`/items/${itemId}/members`, creator.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: target.userId, role: "editor" }),
    });
    expect(ok.status).toBe(201);

    // ...but still cannot mint a manager (authority caps at editor).
    const target2 = await makeUser("member");
    const tooHigh = await req(`/items/${itemId}/members`, creator.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: target2.userId, role: "manager" }),
    });
    expect(tooHigh.status).toBe(403);
  });

  it("a viewer cannot share at all", async () => {
    const owner = await makeUser("admin");
    const viewer = await makeUser("member");
    const target = await makeUser("member");
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, viewer.userId, "viewer");
    const itemId = await makeItem(vaultId, owner.userId);

    const res = await req(`/items/${itemId}/members`, viewer.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: target.userId, role: "viewer" }),
    });
    expect(res.status).toBe(403);
  });

  // ---- guest blocked -------------------------------------------------------

  it("guest is blocked from share mutations (blockGuestWrites → 403)", async () => {
    const owner = await makeUser("admin");
    const guest = await makeUser("guest"); // org guest
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    await addVaultMember(vaultId, guest.userId, "manager"); // even vault manager...
    const target = await makeUser("member");
    const itemId = await makeItem(vaultId, owner.userId);

    // ...the GUEST org role blocks all writes.
    const res = await req(`/items/${itemId}/members`, guest.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: target.userId, role: "viewer" }),
    });
    expect(res.status).toBe(403);
  });

  // ---- anti-enumeration ----------------------------------------------------

  it("caller with no access to an item gets 404 (not 403) on share", async () => {
    const owner = await makeUser("admin");
    const stranger = await makeUser("member"); // org member, no vault/item access
    const vaultId = await makeVault(owner.userId);
    await addVaultMember(vaultId, owner.userId, "manager");
    const itemId = await makeItem(vaultId, owner.userId);
    const target = await makeUser("member");

    const res = await req(`/items/${itemId}/members`, stranger.cookie, {
      method: "POST",
      body: JSON.stringify({ userId: target.userId, role: "viewer" }),
    });
    expect(res.status).toBe(404);
  });
});
