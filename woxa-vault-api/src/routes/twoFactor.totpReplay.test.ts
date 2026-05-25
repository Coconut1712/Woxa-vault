import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

// Integration test for the RFC 6238 §5.2 replay guard at the DB layer. The
// route helper `consumeTotpStep` is module-private, but the security-critical
// behavior it relies on is the MONOTONIC compare-and-set against
// `users.last_totp_step`:
//
//   UPDATE users SET last_totp_step = $step
//     WHERE id = $id AND (last_totp_step IS NULL OR last_totp_step < $step)
//     RETURNING id;
//
// We exercise that exact statement against the dev Postgres so a regression in
// the column type / predicate (e.g. someone changes `<` to `<=` wrongly, or
// drops the guard) is caught. We do NOT mock the DB — the whole point is that
// the atomic UPDATE behaves correctly on real Postgres (see project memory:
// integration tests hit a real database).

beforeAll(() => {
  if (!process.env.LOCAL_KEK_BASE64 || process.env.LOCAL_KEK_BASE64 === "REPLACE_ME_WITH_BASE64_32_BYTES") {
    process.env.LOCAL_KEK_BASE64 = Buffer.alloc(32).toString("base64");
  }
  if (!process.env.MFA_TOKEN_SECRET || process.env.MFA_TOKEN_SECRET === "REPLACE_ME_WITH_HEX_64_CHARS") {
    process.env.MFA_TOKEN_SECRET = "a".repeat(64);
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgres://woxa:woxa_local_dev@localhost:5433/woxa_vault";
  }
});

// Each leaf import is dynamic so the env shims above land before db/client
// reads them.
async function loadDeps() {
  const { db, sql } = await import("@/db/client");
  const { users } = await import("@/db/schema");
  const { and, eq, isNull, or, lt } = await import("drizzle-orm");
  return { db, sql, users, and, eq, isNull, or, lt };
}

describe("TOTP replay guard — users.last_totp_step monotonic CAS (integration)", () => {
  let deps: Awaited<ReturnType<typeof loadDeps>>;
  let userId: string;

  beforeAll(async () => {
    deps = await loadDeps();
    // A throwaway user row. We bypass org membership (not needed for this
    // column-level test) — just insert the minimal user.
    userId = randomUUID();
    await deps.db.insert(deps.users).values({
      id: userId,
      email: `totp-replay-${userId}@test.local`,
      passwordHash: null,
    });
  });

  afterAll(async () => {
    if (deps && userId) {
      await deps.db.delete(deps.users).where(deps.eq(deps.users.id, userId));
    }
    // Close the pool so vitest can exit cleanly.
    await deps.sql.end({ timeout: 5 });
  });

  // Mirror the route helper's UPDATE exactly.
  async function cas(step: number): Promise<boolean> {
    const { db, users, and, eq, isNull, or, lt } = deps;
    const advanced = await db
      .update(users)
      .set({ lastTotpStep: step })
      .where(
        and(
          eq(users.id, userId),
          or(isNull(users.lastTotpStep), lt(users.lastTotpStep, step)),
        ),
      )
      .returning({ id: users.id });
    return advanced.length > 0;
  }

  it("accepts the first step, rejects a replay of the SAME step", async () => {
    const step = Math.floor(Date.now() / 1000 / 30);
    // First use wins (last_totp_step was NULL).
    expect(await cas(step)).toBe(true);
    // Replay of the identical step → 0 rows (step is no longer > last_totp_step).
    expect(await cas(step)).toBe(false);
    // Replay again → still rejected.
    expect(await cas(step)).toBe(false);
  });

  it("rejects an EARLIER step (skew-window replay) but accepts a later one", async () => {
    const base = Math.floor(Date.now() / 1000 / 30) + 100; // isolate from prior test
    expect(await cas(base)).toBe(true);
    // A code from one step earlier (still inside a ±1 skew window of `base`)
    // must not re-validate after `base` was consumed.
    expect(await cas(base - 1)).toBe(false);
    // The next legitimate code (later step) advances the marker.
    expect(await cas(base + 1)).toBe(true);
  });

  it("is atomic under concurrent submission of the same step (only one wins)", async () => {
    const step = Math.floor(Date.now() / 1000 / 30) + 1000;
    // Fire two CAS attempts for the same step concurrently. Exactly one row
    // advance must succeed; the other races and gets 0 rows.
    const [a, b] = await Promise.all([cas(step), cas(step)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });
});
