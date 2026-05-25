import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration tests for the SSO stored-policy enforcement helpers
// (ssoDomainAllowed / ssoJitAllowed) that the /auth/sso/google/callback route
// consults. We exercise the REAL DB-backed logic rather than mocking Google:
// these helpers are the security boundary; the callback just calls them.
//
// We use UNIQUE per-run domains so other rows already in the shared dev DB
// (which may pin their own allowedDomains) cannot interfere with our assertions.

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgres://woxa:woxa_local_dev@localhost:5433/woxa_vault";
  }
  if (!process.env.MFA_TOKEN_SECRET || process.env.MFA_TOKEN_SECRET === "REPLACE_ME_WITH_HEX_64_CHARS") {
    process.env.MFA_TOKEN_SECRET = "a".repeat(64);
  }
  if (!process.env.LOCAL_KEK_BASE64 || process.env.LOCAL_KEK_BASE64 === "REPLACE_ME_WITH_BASE64_32_BYTES") {
    process.env.LOCAL_KEK_BASE64 = Buffer.alloc(32).toString("base64");
  }
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
});

async function loadDeps() {
  const { db, sql } = await import("@/db/client");
  const { organizations } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");
  const { ssoDomainAllowed, ssoJitAllowed } = await import("@/lib/orgPolicy");
  return { db, sql, organizations, inArray, ssoDomainAllowed, ssoJitAllowed };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

describe("SSO stored-policy enforcement (integration)", () => {
  let deps: Deps;
  const createdOrgIds: string[] = [];
  const tag = randomUUID().slice(0, 8);
  // Domains unique to this run so we never collide with pre-existing org policy.
  const claimedDomain = `${tag}-claimed.example`;
  const unclaimedDomain = `${tag}-unclaimed.example`;
  const jitOffDomain = `${tag}-jitoff.example`;

  beforeAll(async () => {
    deps = await loadDeps();

    // Org A: pins claimedDomain, JIT enabled (default).
    const orgA = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgA,
      name: "SSO Org A",
      slug: `ssoa-${tag}`,
      settings: { sso: { allowedDomains: [claimedDomain], jitEnabled: true } },
    });
    createdOrgIds.push(orgA);

    // Org B: pins jitOffDomain with JIT DISABLED.
    const orgB = randomUUID();
    await deps.db.insert(deps.organizations).values({
      id: orgB,
      name: "SSO Org B",
      slug: `ssob-${tag}`,
      settings: { sso: { allowedDomains: [jitOffDomain], jitEnabled: false } },
    });
    createdOrgIds.push(orgB);
  });

  afterAll(async () => {
    if (deps) {
      if (createdOrgIds.length > 0) {
        await deps.db
          .delete(deps.organizations)
          .where(deps.inArray(deps.organizations.id, createdOrgIds));
      }
      await deps.sql.end({ timeout: 5 });
    }
  });

  // ---- domain allow-list --------------------------------------------------

  it("allows a domain that IS pinned by some org's allowedDomains", async () => {
    expect(await deps.ssoDomainAllowed(claimedDomain)).toBe(true);
  });

  it("rejects a domain when SOME org restricts but NONE lists this domain", async () => {
    // Because at least one org (A or B) has a non-empty allowedDomains, an
    // unlisted domain is rejected (union enforcement).
    expect(await deps.ssoDomainAllowed(unclaimedDomain)).toBe(false);
  });

  it("rejects an empty domain", async () => {
    expect(await deps.ssoDomainAllowed("")).toBe(false);
  });

  // ---- JIT gate -----------------------------------------------------------

  it("allows JIT for a domain whose claiming org has jitEnabled=true", async () => {
    expect(await deps.ssoJitAllowed(claimedDomain)).toBe(true);
  });

  it("blocks JIT for a domain whose ONLY claiming org has jitEnabled=false", async () => {
    expect(await deps.ssoJitAllowed(jitOffDomain)).toBe(false);
  });

  it("defaults JIT ON for a domain no org claims (no binding to gate against)", async () => {
    expect(await deps.ssoJitAllowed(unclaimedDomain)).toBe(true);
  });
});
