import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for Phase C crypto fix #2 — per-user KDF salt.
// Drives the REAL app + REAL Postgres (project memory: integration tests hit a
// real database, never mocks).
//
// What this pins:
//   1. POST /auth/register populates a random per-user `kdf_salt` (32 bytes b64).
//   2. GET /auth/kdf-salt?email= returns the user's REAL salt for a known email.
//   3. For an UNKNOWN email it returns a DECOY salt that is (a) the same shape,
//      (b) DETERMINISTIC across calls, and (c) different from any real salt —
//      so it can't be used to enumerate accounts.
//   4. GET /me exposes `kdfSalt` for the logged-in user, equal to the DB value.

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
  const { users } = await import("@/db/schema");
  const { inArray, sql: dsql } = await import("drizzle-orm");
  const { SESSION_COOKIE_NAME } = await import("@/lib/session");
  return { app: createApp(), db, sql, users, inArray, dsql, SESSION_COOKIE_NAME };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

function uniqEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@kdfsalt-test.local`;
}

function cookieFromSetCookie(res: Response, name: string): string | null {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const m = raw.match(new RegExp(`${name}=([^;]+)`));
  return m ? `${name}=${m[1]}` : null;
}

function isBase64_32Bytes(s: string): boolean {
  try {
    return Buffer.from(s, "base64").length === 32;
  } catch {
    return false;
  }
}

describe("per-user KDF salt (Phase C fix #2, integration)", () => {
  let deps: Deps;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    deps = await loadDeps();
  });

  afterAll(async () => {
    if (deps) {
      if (createdEmails.length > 0) {
        await deps.db.delete(deps.users).where(deps.inArray(deps.users.email, createdEmails));
      }
      await deps.sql.end({ timeout: 5 });
    }
  });

  async function register(email: string): Promise<Response> {
    createdEmails.push(email.toLowerCase());
    return deps.app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "login-secret-123" }),
    });
  }

  it("register populates a random 32-byte kdf_salt", async () => {
    const email = uniqEmail("reg");
    const res = await register(email);
    expect(res.status).toBe(200);

    const row = await deps.db.query.users.findFirst({
      where: deps.dsql`lower(${deps.users.email}) = ${email}`,
    });
    expect(row?.kdfSalt).toBeTruthy();
    expect(isBase64_32Bytes(row!.kdfSalt!)).toBe(true);
  });

  it("GET /auth/kdf-salt returns the REAL salt for a known email", async () => {
    const email = uniqEmail("known");
    await register(email);

    const row = await deps.db.query.users.findFirst({
      where: deps.dsql`lower(${deps.users.email}) = ${email}`,
    });

    const res = await deps.app.request(`/auth/kdf-salt?email=${encodeURIComponent(email)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kdfSalt: string };
    expect(body.kdfSalt).toBe(row!.kdfSalt);
  });

  it("GET /auth/kdf-salt returns a deterministic DECOY for an unknown email (anti-enumeration)", async () => {
    const unknown = uniqEmail("ghost"); // never registered
    const first = await deps.app.request(`/auth/kdf-salt?email=${encodeURIComponent(unknown)}`);
    const second = await deps.app.request(`/auth/kdf-salt?email=${encodeURIComponent(unknown.toUpperCase())}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const a = (await first.json()) as { kdfSalt: string };
    const b = (await second.json()) as { kdfSalt: string };

    // Same shape as a real salt → indistinguishable.
    expect(isBase64_32Bytes(a.kdfSalt)).toBe(true);
    // Deterministic per email, case-insensitive → no value-change signal.
    expect(a.kdfSalt).toBe(b.kdfSalt);
  });

  it("decoy salt for an unknown email differs from a real user's salt", async () => {
    const email = uniqEmail("real");
    await register(email);
    const row = await deps.db.query.users.findFirst({
      where: deps.dsql`lower(${deps.users.email}) = ${email}`,
    });

    const ghost = uniqEmail("ghost2");
    const res = await deps.app.request(`/auth/kdf-salt?email=${encodeURIComponent(ghost)}`);
    const body = (await res.json()) as { kdfSalt: string };
    expect(body.kdfSalt).not.toBe(row!.kdfSalt);
  });

  it("GET /me exposes kdfSalt equal to the stored value", async () => {
    const email = uniqEmail("me");
    const reg = await register(email);
    const cookie = cookieFromSetCookie(reg, deps.SESSION_COOKIE_NAME);
    expect(cookie).not.toBeNull();

    const row = await deps.db.query.users.findFirst({
      where: deps.dsql`lower(${deps.users.email}) = ${email}`,
    });

    const me = await deps.app.request("/me", { headers: { Cookie: cookie! } });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { user: { kdfSalt: string | null } };
    expect(meBody.user.kdfSalt).toBe(row!.kdfSalt);
  });

  it("rejects GET /auth/kdf-salt without an email", async () => {
    const res = await deps.app.request("/auth/kdf-salt");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
