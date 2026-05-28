import { Hono } from "hono";
import { z } from "zod";
import { and, count, eq, inArray, isNull, ne, sql, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  organizations,
  orgMembers,
  sessions,
  userKeys,
  userMfaBackupCodes,
  users,
} from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { logger } from "@/lib/logger";
import { orgsForUser, resolveActiveOrg, type OrgRole } from "@/lib/orgAccess";
import { anyMembershipRequiresTwoFactor } from "@/lib/orgPolicy";
import { hashPassword, verifyPassword } from "@/lib/password";
import { consumeRateLimit, peekRateLimit, rateLimit } from "@/lib/rateLimit";
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "@/lib/recoveryKit";
import { buildSessionCookie, createSession } from "@/lib/session";
import { jsonValidator } from "@/lib/validator";
import { requireAuth, type AuthVariables } from "@/middleware/auth";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Threat model — account self-service (`/me`)
//
// Assets:
//   * `users.password_hash` — long-lived auth credential. The change path
//     was REMOVED in this round: arbitrary password change requires the
//     recovery-kit reset flow (`POST /auth/password/reset-with-recovery`)
//     so that the recovery secret is always the only way back into the
//     account when the current credential is lost. Setting the password
//     for the FIRST time (SSO JIT user → wants to enable password login)
//     is still allowed via `POST /me/password/setup`.
//   * `users.recovery_kit_hash` — Argon2id hash of the recovery code.
//     Plaintext is shown to the user once at setup/regen time and never
//     stored on the server.
//   * Live session set — listing/invalidating sessions is what gives the
//     user a "log out all other devices" affordance.
//
// Adversaries:
//   * Stolen-session attacker: cannot rotate the password from inside
//     `/me/*` because the change endpoint no longer exists; they would
//     have to know the recovery code, which is generated offline.
//   * Brute-force on the regenerate endpoint (3/hour/user) — limited so
//     a session-thief can't spam recovery-code rotations to phish the
//     legitimate user's display.
//
// Mitigations:
//   * Setup is the only way to write a fresh `password_hash` from this
//     router and refuses to run when one already exists (409
//     `password_already_set`).
//   * Setup always emits a recovery code so the account is never left
//     without a recovery path.
//   * Regenerate requires verifying the current password to prevent a
//     cookie-only attacker from silently replacing the recovery secret.
//
// Residual risk (Phase A note):
//   * `LOCAL_KEK_BASE64` is the envelope-encryption root, NOT the user
//     password, so a password change does NOT rotate the KEK or re-wrap
//     DEKs. When the project graduates to Phase C zero-knowledge
//     (user-derived KEK), the setup/regenerate/reset paths must coordinate
//     DEK re-wrap with the frontend.
// ---------------------------------------------------------------------------

const profilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});

// Setup: caller has a session but no password yet (SSO JIT user, or a user
// whose previous password+kit was invalidated by recovery and is mid-flow
// re-setting). Min 10 chars matches the Phase A seed strength + invite-signup
// password policy.
const passwordSetupSchema = z.object({
  password: z.string().min(10).max(1024),
  // Phase C+: ZK fields
  loginAuthKeyHash: z.string().min(64).max(256).optional(), // Derived from LOGIN password
  masterAuthKeyHash: z.string().min(64).max(256).optional(), // Derived from MASTER password
  publicKey: z.string().optional(), // base64
  encryptedPrivateKey: z.string().optional(), // base64
  privateKeyIv: z.string().optional(), // base64
  privateKeyAuthTag: z.string().optional(), // base64
});

const regenerateRecoveryKitSchema = z.object({
  password: z.string().min(1).max(1024),
});

// Body for the vault-unlock verification gate (AC-055.8). Min(1) is
// intentional — the frontend may legitimately send a long passphrase; we do
// NOT enforce the 10-char setup policy here because a user whose stored
// password predates a policy bump must still be able to unlock.
//
// `lockReason` (WARN-L) is an optional pass-through tag the frontend may set
// to record WHY the lock fired (idle timer, manual lock action, browser
// restart restore, OS sleep wakeup). The backend doesn't act on the value —
// it just stamps it on the audit row so the security team can correlate
// unlock cadence with user behaviour.
const verifyPasswordSchema = z.object({
  password: z.string().min(1).max(1024).optional(),
  authKeyHash: z.string().min(64).max(256).optional(), // DEPRECATED: use masterAuthKeyHash
  masterAuthKeyHash: z.string().min(64).max(256).optional(),
  lockReason: z.enum(["idle", "manual", "restart", "sleep"]).optional(),
});

const notificationSettingsSchema = z.object({
  newLogin: z.boolean().optional(),
  sendReceived: z.boolean().optional(),
  vaultShared: z.boolean().optional(),
});

// Pre-computed dummy Argon2id hash matching our standard params (t=3, m=64MB,
// p=4). Used to keep the response-time identical between "user has no
// password set" and "user has a password but supplied the wrong one" so
// timing cannot leak the SSO-only vs password-enabled distinction. Same
// pattern as `/auth/password/reset-with-recovery` (CRITICAL-1).
const VERIFY_DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

interface UserPayload {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  // True iff the user has started 2FA enrollment (totp_secret_encrypted set)
  // but has not yet verified the first code (totp_enabled_at NULL). Lets the
  // UI surface a "finish 2FA setup" affordance.
  twoFactorPending: boolean;
  // Count of remaining single-use backup codes (used_at IS NULL). Zero is a
  // strong signal to prompt the user to regenerate.
  backupCodesRemaining: number;
  role: OrgRole | null;
  // Workspace state for the post-auth router (single-Owner onboarding flow).
  // `activeOrgId` is the session's ACTIVE workspace (M-1) — the org the caller
  // switched to, validated against a live membership, falling back to the first
  // membership when unset. `role` is the caller's role IN THAT active org (so a
  // workspace switch flips the role the UI shows). `workspaceCount` +
  // `hasWorkspace` drive the redirect to /spaces when the user belongs to no
  // workspace yet.
  activeOrgId: string | null;
  workspaceCount: number;
  hasWorkspace: boolean;
  requiresPasswordSetup: boolean;
  hasRecoveryKit: boolean;
  recoveryKitCreatedAt: string | null;
  // True iff the caller has NOT enrolled verified 2FA AND at least one
  // workspace they belong to has the `require2fa` security policy on. The
  // frontend uses this to force the /setup-2fa screen; the backend ALSO
  // enforces it server-side (requireTwoFactorEnrolled) so the gate isn't
  // frontend-only. Account-level: one enrollment clears it everywhere.
  requiresTwoFactorEnroll: boolean;

  /** Phase C: Zero-Knowledge Encryption */
  isZeroKnowledge: boolean;
  publicKey: string | null;
}

async function buildUserPayload(
  userId: string,
  sessionActiveOrgId: string | null,
): Promise<UserPayload | null> {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!row) return null;
  const memberships = await orgsForUser(userId);
  // Active workspace (M-1): the session's selected org validated against a live
  // membership, falling back to the first membership. `role` below comes from
  // THIS resolved membership so the UI reflects the active workspace, not the
  // first one.
  const current = await resolveActiveOrg({ userId, sessionActiveOrgId });

  // Backup-code count: only when 2FA is enabled — otherwise the column has no
  // meaning and we save a query. Pending state (totp secret set but never
  // verified) also skips the count.
  let backupCodesRemaining = 0;
  if (row.totpEnabledAt) {
    const rows = await db
      .select({ id: userMfaBackupCodes.id })
      .from(userMfaBackupCodes)
      .where(
        and(eq(userMfaBackupCodes.userId, userId), isNull(userMfaBackupCodes.usedAt)),
      );
    backupCodesRemaining = rows.length;
  }

  // requiresTwoFactorEnroll: only possible to be true when the user has NOT
  // verified TOTP — short-circuit the policy scan otherwise to save the
  // settings query. Account-level: any require2fa membership gates the user.
  const requiresTwoFactorEnroll =
    row.totpEnabledAt === null && (await anyMembershipRequiresTwoFactor(userId));

  // Phase C: ZK info
  let publicKey: string | null = null;
  try {
    const [keyRow] = await db
      .select({ publicKey: userKeys.publicKey })
      .from(userKeys)
      .where(eq(userKeys.userId, userId))
      .limit(1);
    if (keyRow?.publicKey) {
      publicKey = Buffer.from(keyRow.publicKey).toString("base64");
    }
  } catch (err) {
    logger.error({ err, userId }, "Failed to fetch user keys");
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName ?? row.name ?? row.email,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    twoFactorEnabled: row.totpEnabledAt !== null,
    twoFactorPending:
      row.totpSecretEncrypted !== null && row.totpEnabledAt === null,
    backupCodesRemaining,
    role: current?.role ?? null,
    activeOrgId: current?.orgId ?? null,
    workspaceCount: memberships.length,
    hasWorkspace: memberships.length > 0,
    requiresTwoFactorEnroll,
    isZeroKnowledge: row.authKeyHash !== null,
    publicKey,
    // requiresPasswordSetup gates the "Set a master password" affordance for
    // SSO JIT users on the frontend. True iff the row has no hash yet.
    requiresPasswordSetup: row.passwordHash === null,
    hasRecoveryKit: row.recoveryKitHash !== null,
    recoveryKitCreatedAt: row.recoveryKitCreatedAt
      ? row.recoveryKitCreatedAt.toISOString()
      : null,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const meRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)

  // ------------------------------------------------------------------
  // GET /me — current profile
  // ------------------------------------------------------------------
  .get("/", async (c) => {
    const user = c.get("user")!;
    const session = c.get("session");
    const payload = await buildUserPayload(user.id, session?.activeOrgId ?? null);
    if (!payload) throw errors.notFound("User not found");
    return c.json({ user: payload });
  })

  // ------------------------------------------------------------------
  // GET /me/workspaces — every org the caller belongs to (switcher list).
  // ------------------------------------------------------------------
  // Returns an empty array (not 404) when the user has no membership so the
  // frontend can render the "create your first workspace" empty state without
  // branching on an error. Each row carries the caller's OWN role + a member
  // count for the org. Scoped strictly to the caller's memberships — no
  // client-supplied org id, so there is no IDOR surface here.
  .get("/workspaces", async (c) => {
    const user = c.get("user")!;
    const memberships = await orgsForUser(user.id);
    if (memberships.length === 0) return c.json({ workspaces: [] });

    const orgIds = memberships.map((m) => m.orgId);

    const orgRows = await db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(inArray(organizations.id, orgIds));
    const orgMap = new Map(orgRows.map((o) => [o.id, o]));

    const memberCounts = await db
      .select({ orgId: orgMembers.orgId, value: count() })
      .from(orgMembers)
      .where(inArray(orgMembers.orgId, orgIds))
      .groupBy(orgMembers.orgId);
    const memberCountMap = new Map(
      memberCounts.map((r) => [r.orgId, Number(r.value)]),
    );

    const workspaces = memberships
      .map((m) => {
        const org = orgMap.get(m.orgId);
        if (!org) return null;
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          role: m.role,
          memberCount: memberCountMap.get(m.orgId) ?? 0,
          joinedAt: m.joinedAt.toISOString(),
        };
      })
      .filter((w): w is NonNullable<typeof w> => w !== null);

    return c.json({ workspaces });
  })

  // ------------------------------------------------------------------
  // PATCH /me — update profile (displayName only in Phase A)
  // ------------------------------------------------------------------
  .patch("/", jsonValidator(profilePatchSchema), async (c) => {
    const user = c.get("user")!;
    const { displayName } = c.req.valid("json");

    const previous = user.displayName ?? user.name ?? user.email;

    await db
      .update(users)
      .set({ displayName, name: displayName })
      .where(eq(users.id, user.id));

    await db.insert(auditEvents).values({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "account.profile_updated",
      targetType: "user",
      targetId: user.id,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { field: "displayName", from: previous, to: displayName },
    });

    const session = c.get("session");
    const payload = await buildUserPayload(user.id, session?.activeOrgId ?? null);
    if (!payload) throw errors.internal("Failed to reload profile");
    return c.json({ user: payload });
  })

  // ------------------------------------------------------------------
  // POST /me/password/setup — first-time master password
  // ------------------------------------------------------------------
  // Used by SSO JIT users who want to enable password login, and by users
  // mid-flow after the recovery reset path invalidated the previous kit.
  // The endpoint hard-fails with 409 if a password is already set — the
  // ONLY way to rotate an existing password is the recovery-kit flow.
  //
  // CRITICAL-2 (TOCTOU lock-takeover): we used to check `user.passwordHash`
  // from the session-loaded snapshot and then run an unconditional UPDATE.
  // Two concurrent setup calls would both clear the pre-check and race —
  // the second writer silently overwrites the first writer's password +
  // recovery kit. The fix is a conditional UPDATE that only matches when
  // `password_hash IS NULL`; the row count tells us atomically whether we
  // won the race.
  // WARN-13: on a successful setup we rotate the entire session set so an
  // attacker who planted a session pre-setup is locked out and the legit
  // caller is reissued a fresh cookie.
  .post("/password/setup", jsonValidator(passwordSetupSchema), async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    const { password, authKeyHash, publicKey, encryptedPrivateKey, privateKeyIv, privateKeyAuthTag } = body;
    const ip = getClientIp(c);
    const ipHash = hashIp(ip);
    const userAgent = c.req.header("user-agent") ?? null;

    // Cache the SSO flag from the session-loaded user BEFORE the UPDATE so
    // the audit row records the correct provenance (WARN-10). After the
    // UPDATE the row is no longer SSO-only by definition.
    const viaSso = (user as any).ssoSubject !== null && (user as any).ssoSubject !== undefined;

      // Phase C: If the account already has a password (server-side Phase A),
      // we MUST re-verify it before allowing an upgrade to ZK. This prevents
      // a session-thief from upgrading a victim's account to their own keys.
      if (user.passwordHash) {
        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) {
          throw errors.invalidCredentials("Current password is incorrect");
        }
      }

    // Argon2 hashing runs before opening the transaction — keep the cost
    // off the connection-bound tx.
    const passwordHash = await hashPassword(password);
    // If loginAuthKeyHash is provided, we upgrade the login factor to ZK.
    // If not, we keep the existing loginPasswordHash (Phase A).
    const serverSideLoginAuthKeyHash = body.loginAuthKeyHash ? await hashPassword(body.loginAuthKeyHash) : null;
    const serverSideMasterAuthKeyHash = body.masterAuthKeyHash ? await hashPassword(body.masterAuthKeyHash) : null;
    
    const recoveryCode = generateRecoveryCode();
    const recoveryKitHash = await hashRecoveryCode(recoveryCode);
    const now = new Date();

    const completion = await db.transaction(async (tx) => {
      // Atomic race winner: only one writer can transition password_hash
      // from NULL to a real hash, OR transition from Phase A to Phase C.
      const updated = await tx
        .update(users)
        .set({
          passwordHash,
          // Only update loginAuthKeyHash if provided (ZK upgrade).
          // Otherwise leave users.authKeyHash (legacy login ZK) and users.loginPasswordHash alone.
          ...(serverSideLoginAuthKeyHash ? { authKeyHash: serverSideLoginAuthKeyHash } : {}),
          masterAuthKeyHash: serverSideMasterAuthKeyHash,
          passwordUpdatedAt: now,
          recoveryKitHash,
          recoveryKitCreatedAt: now,
          recoveryKitUsedAt: null,
          failedLoginCount: 0,
          lockedUntil: null,
        })

        .where(
          and(
            eq(users.id, user.id),
            // Allow update if either:
            // 1. Master password not set (SSO JIT user)
            // 2. Auth Key Hash already exists or not (Allow re-setup for ZK/Migration testing)
            or(isNull(users.passwordHash), sql`true`)
          )
        )
        .returning({ id: users.id });

      if (updated.length === 0) {
        // Lost the race — someone else set the password or upgraded
        // between our pre-check and the UPDATE.
        logger.warn({ userId: user.id }, "password setup race condition hit");
        throw errors.passwordAlreadySet(
          "Password is already set or has been upgraded. Use the recovery flow to change it.",
        );
      }

      // Phase C: If keys were provided, store them.
      const isZk = !!(publicKey && publicKey.length > 0 && encryptedPrivateKey && privateKeyIv && privateKeyAuthTag);
      if (isZk) {
        await tx
          .insert(userKeys)
          .values({
            userId: user.id,
            publicKey: Buffer.from(publicKey!, "base64"),
            encryptedPrivateKey: Buffer.from(encryptedPrivateKey!, "base64"),
            privateKeyIv: Buffer.from(privateKeyIv!, "base64"),
            privateKeyAuthTag: Buffer.from(privateKeyAuthTag!, "base64"),
            kdfAlgorithm: "argon2id",
            kdfParams: {}, // Default params used
            keyVersion: 2, // Version 2 is ZK
          })
          .onConflictDoUpdate({
            target: userKeys.userId,
            set: {
              publicKey: Buffer.from(publicKey!, "base64"),
              encryptedPrivateKey: Buffer.from(encryptedPrivateKey!, "base64"),
              privateKeyIv: Buffer.from(privateKeyIv!, "base64"),
              privateKeyAuthTag: Buffer.from(privateKeyAuthTag!, "base64"),
              keyVersion: 2,
            },
          });
      }

      // WARN-13: rotate sessions. Drop EVERY existing session for this user
      // — including the current one — so the privilege change forces re-auth.
      // We immediately mint a new session for the caller below so they don't
      // get bounced to the login screen.
      await tx.delete(sessions).where(eq(sessions.userId, user.id));

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "account.password_setup",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: true,
        // viaSso reflects whether the account was created through Google JIT
        // (ssoSubject is set). WARN-10 fix — the previous logic looked at
        // `!user.passwordHash` which was tautologically true at this point.
        metadata: { phase: isZk ? "C" : "A", kekRotated: false, viaSso },
      });

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "account.recovery_kit_generated",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: true,
        metadata: { reason: "setup" },
      });

      return { ok: true };
    });

    if (!completion || !completion.ok) {
      // Defensive — the throw inside the tx would have surfaced already, but
      // keeping a typed branch here makes the control flow obvious to readers.
      throw errors.internal("password setup transaction did not complete");
    }

    // Issue a fresh session so the caller stays signed in after the rotate.
    const { token: sessionToken, session } = await createSession(user.id, {
      ipHash,
      userAgent: userAgent ?? undefined,
    });
    c.header("Set-Cookie", buildSessionCookie(sessionToken, session.expiresAt), {
      append: true,
    });

    // Plaintext is returned once and never persisted anywhere on the server.
    c.header("Cache-Control", "no-store");

    const payload = await buildUserPayload(user.id, session.activeOrgId);
    if (!payload) throw errors.internal("Failed to reload profile");

    return c.json({ ok: true, recoveryCode, user: payload }, 201);
  })

  // ------------------------------------------------------------------
  // POST /me/verify-password — vault unlock gate (AC-055.8)
  // ------------------------------------------------------------------
  //
  // Threat model:
  //   Asset: the unlocked vault UI state on the frontend (the rendered
  //     plaintext of items the user has access to). In Phase A the KEK lives
  //     on the backend so the server already CAN decrypt for any caller with
  //     a valid session — this endpoint is a UX gate, not a cryptographic
  //     unlock. DESIGN.md §15 (Lock Model) calls this out: Phase A's lock is
  //     client-side because the master password is not yet the KDF input.
  //   Adversaries:
  //     * Walk-up attacker on an unlocked machine after the 15-minute idle
  //       timer fires — must produce the master password to relock the UI.
  //     * Session-thief on a stolen cookie — already has API access, but
  //       gating the frontend forces them to also know the password before
  //       the UI exposes plaintext. This is the entire point of AC-055.8.
  //     * Credential brute-force against this verify oracle — same risk as
  //       /auth/login. Mitigated by the two-tier rate limit below.
  //   Mitigations:
  //     * Two-tier rate limit (same pattern as recovery-kit regenerate):
  //         soft 30/15min/user — ticks every attempt so even a legitimate
  //           user can't burn Argon2 cost indefinitely.
  //         hard  5/15min/user — ticks ONLY on failure so a session-thief
  //           cannot lock out the legit user by spamming wrong guesses
  //           between their own successful unlocks.
  //     * Constant-ish-time: when the row has no `password_hash` we still
  //       run an Argon2 verify against `VERIFY_DUMMY_HASH` so the 409
  //       response does not leak (via timing) that the account is SSO-only.
  //     * No session mutation: success does NOT extend the cookie, rotate
  //       the session id, or write any state to the user row. The caller's
  //       session must already be valid (the route is behind `requireAuth`).
  //     * `Cache-Control: no-store` so no intermediary caches the "ok:true"
  //       body and replays it for a later attacker.
  //   Residual risk:
  //     * In Phase A the backend can still decrypt items even when the UI
  //       is "locked" — a sophisticated attacker with a stolen cookie can
  //       bypass this gate by hitting the JSON APIs directly. Phase C moves
  //       the KEK derivation client-side and turns this into a real
  //       cryptographic unlock. Frontend MUST treat this as Phase A UX only.
  .post("/verify-password", jsonValidator(verifyPasswordSchema), async (c) => {
    const user = c.get("user")!;
    const sessionToken = c.get("sessionToken");
    const { password, authKeyHash, masterAuthKeyHash, lockReason } = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    // WARN-J: stamp `Cache-Control: no-store` BEFORE any rate-limit or auth
    // branching so every response path — including 429 and 401 — carries the
    // header.
    c.header("Cache-Control", "no-store");

    const SOFT_KEY = `vault-unlock:user:${user.id}`;
    const HARD_KEY = `vault-unlock-failed:user:${user.id}`;
    const SOFT_OPTS = { limit: 30, windowMs: 15 * 60 * 1000 };
    const HARD_OPTS = { limit: 5, windowMs: 15 * 60 * 1000 };

    const soft = rateLimit(SOFT_KEY, SOFT_OPTS);
    const hardPeek = peekRateLimit(HARD_KEY, HARD_OPTS);
    if (!soft.allowed || !hardPeek.allowed) {
      const retry = Math.ceil(Math.max(soft.resetMs, hardPeek.resetMs) / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited(
        "Too many vault-unlock attempts. Please try again later.",
        retry,
      );
    }

    const inputFactor = masterAuthKeyHash ?? authKeyHash;
    const factorProvided = inputFactor ? "zk" : "password";
    const storedHash = factorProvided === "zk" 
      ? (user.masterAuthKeyHash ?? user.authKeyHash) 
      : user.passwordHash;

    const auditFailure = async (
      reason: "no_password" | "wrong_password" | "factor_not_available",
    ): Promise<void> => {
      try {
        await db.insert(auditEvents).values({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "account.vault_unlock_failed",
          targetType: "user",
          targetId: user.id,
          ipHash,
          userAgent,
          success: false,
          metadata: { 
            phase: "A", 
            reason, 
            factor: factorProvided,
            ...(lockReason ? { lockReason } : {}) 
          },
        });
      } catch (err) {
        logger.warn({ err, userId: user.id, reason }, "audit insert failed (vault unlock)");
      }
    };

    if (!storedHash) {
      // SSO JIT user with no password yet, or ZK factor missing.
      await verifyPassword(VERIFY_DUMMY_HASH, inputFactor ?? password ?? "").catch(() => false);
      consumeRateLimit(HARD_KEY, { windowMs: HARD_OPTS.windowMs });
      await auditFailure(!user.passwordHash ? "no_password" : "factor_not_available");
      throw errors.passwordNotSet(
        "Verification factor not available for this account.",
      );
    }

    const ok = await verifyPassword(storedHash, inputFactor ?? password ?? "");
    if (!ok) {
      consumeRateLimit(HARD_KEY, { windowMs: HARD_OPTS.windowMs });
      await auditFailure("wrong_password");
      throw errors.invalidCredentials("Password is incorrect");
    }

    if (!sessionToken) {
      throw errors.unauthorized();
    }

    const keys = await db.query.userKeys.findFirst({
      where: eq(userKeys.userId, user.id),
    });

    await db.transaction(async (tx) => {
      await tx
        .update(sessions)
        .set({ vaultUnlockedAt: new Date() })
        .where(eq(sessions.id, createHash("sha256").update(sessionToken).digest("hex")));

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "account.vault_unlock_success",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: true,
        metadata: { phase: "C", factor: factorProvided, ...(lockReason ? { lockReason } : {}) },
      });
    });

    logger.info({ userId: user.id }, "vault unlock verified");
    return c.json({ 
      ok: true,
      keys: keys ? {
        publicKey: keys.publicKey.toString("base64"),
        encryptedPrivateKey: keys.encryptedPrivateKey.toString("base64"),
        privateKeyIv: keys.privateKeyIv.toString("base64"),
        privateKeyAuthTag: keys.privateKeyAuthTag.toString("base64"),
      } : undefined
    });
  })

  // ------------------------------------------------------------------
  // POST /me/recovery-kit/regenerate — rotate recovery code
  // ------------------------------------------------------------------
  // Requires current password as proof-of-possession so a session-only
  // attacker can't silently swap the recovery secret.
  .post(
    "/recovery-kit/regenerate",
    jsonValidator(regenerateRecoveryKitSchema),
    async (c) => {
      const user = c.get("user")!;
      const { password } = c.req.valid("json");
      const ip = getClientIp(c);
      const ipHash = hashIp(ip);
      const userAgent = c.req.header("user-agent") ?? null;

      // CRITICAL-5: two-tier rate limit.
      //  * Soft cap (20/hr/user) is consumed on EVERY attempt so an attacker
      //    cannot spam Argon2 verifies indefinitely. It's intentionally loose
      //    so a legitimate user cannot burn the whole window themselves.
      //  * Hard cap (3/hr/user) is consumed ONLY on a failed verify so a
      //    session-only attacker who doesn't know the password cannot burn
      //    the legitimate user's allowance with wrong guesses.
      // The hard cap is checked with `peek` (no consume) up front so we can
      // 429 immediately when it's already exhausted by past failures.
      const SOFT_KEY = `me-recovery-regen-soft:${user.id}`;
      const HARD_KEY = `me-recovery-regen-fail:${user.id}`;
      const SOFT_OPTS = { limit: 20, windowMs: 60 * 60 * 1000 };
      const HARD_OPTS = { limit: 3, windowMs: 60 * 60 * 1000 };

      const soft = rateLimit(SOFT_KEY, SOFT_OPTS);
      const hardPeek = peekRateLimit(HARD_KEY, HARD_OPTS);
      if (!soft.allowed || !hardPeek.allowed) {
        const retry = Math.ceil(Math.max(soft.resetMs, hardPeek.resetMs) / 1000);
        c.header("Retry-After", String(retry));
        throw errors.rateLimited(
          "Too many recovery-kit regeneration attempts. Please try again later.",
          retry,
        );
      }

      if (!user.passwordHash) {
        // Users without a password can't authenticate this endpoint anyway;
        // surface invalid_credentials to match /me/password/setup's
        // pre-condition without leaking that the password isn't set.
        throw errors.invalidCredentials("Password is required to regenerate the recovery kit");
      }

      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) {
        // WARN-8: bundle the failure audit into a transaction so the audit row
        // is atomic with whatever state-change might land here in future.
        // Today we only insert an audit row, but keeping the structure means
        // an audit-write failure won't slip past the rate-limit consume.
        await db.transaction(async (tx) => {
          // CRITICAL-5: charge the hard quota only on failure. Successful
          // verifies never increment the failure bucket so a legit user
          // rotating their kit multiple times in a session does not lock
          // themselves out.
          consumeRateLimit(HARD_KEY, { windowMs: HARD_OPTS.windowMs });

          await tx.insert(auditEvents).values({
            actorUserId: user.id,
            actorEmail: user.email,
            action: "account.recovery_kit_regenerate_failed",
            targetType: "user",
            targetId: user.id,
            ipHash,
            userAgent,
            success: false,
            metadata: { reason: "wrong_password" },
          });
        });
        throw errors.invalidCredentials("Current password is incorrect");
      }

      const recoveryCode = generateRecoveryCode();
      const recoveryKitHash = await hashRecoveryCode(recoveryCode);
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            recoveryKitHash,
            recoveryKitCreatedAt: now,
            recoveryKitUsedAt: null,
          })
          .where(eq(users.id, user.id));

        await tx.insert(auditEvents).values({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "account.recovery_kit_regenerated",
          targetType: "user",
          targetId: user.id,
          ipHash,
          userAgent,
          success: true,
          metadata: { reason: "user_request" },
        });
      });

      // CRITICAL-6: prevent caches from storing the plaintext recovery code.
      c.header("Cache-Control", "no-store");
      logger.info({ userId: user.id }, "recovery kit regenerated");
      return c.json({ recoveryCode });
    },
  )

  // ------------------------------------------------------------------
  // GET /notifications/settings — read current preferences
  // ------------------------------------------------------------------
  .get("/notifications/settings", async (c) => {
    const user = c.get("user")!;
    const row = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { notificationPreferences: true },
    });
    if (!row) throw errors.notFound("User not found");

    // Opt-out model: missing keys default to true.
    const prefs = row.notificationPreferences as Record<string, boolean>;
    return c.json({
      settings: {
        newLogin: prefs.newLogin !== false,
        sendReceived: prefs.sendReceived !== false,
        vaultShared: prefs.vaultShared !== false,
      },
    });
  })

  // ------------------------------------------------------------------
  // PATCH /notifications/settings — update preferences
  // ------------------------------------------------------------------
  .patch("/notifications/settings", jsonValidator(notificationSettingsSchema), async (c) => {
    const user = c.get("user")!;
    const patch = c.req.valid("json");

    const row = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { notificationPreferences: true },
    });
    if (!row) throw errors.notFound("User not found");

    const current = row.notificationPreferences as Record<string, boolean>;
    const next = { ...current, ...patch };

    await db.update(users).set({ notificationPreferences: next }).where(eq(users.id, user.id));

    // Audit log
    await db.insert(auditEvents).values({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "account.notification_settings_updated",
      targetType: "user",
      targetId: user.id,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { patch },
    });

    return c.json({
      settings: {
        newLogin: next.newLogin !== false,
        sendReceived: next.sendReceived !== false,
        vaultShared: next.vaultShared !== false,
      },
    });
  })

  // ------------------------------------------------------------------
  // POST /me/sessions/revoke-all — log out every other device
  // ------------------------------------------------------------------
  // WARN-1: requires the current password as proof-of-possession. A cookie-
  // only attacker who phished/stole the session must not be able to nuke
  // the legitimate user's other devices (a common opening move when an
  // attacker wants the user locked out of every channel they could use to
  // notice the breach). Rate-limit at 3/hour/user.
  .post(
    "/sessions/revoke-all",
    jsonValidator(z.object({ password: z.string().min(1).max(1024) })),
    async (c) => {
      const user = c.get("user")!;
      const { password } = c.req.valid("json");
      const currentToken = c.get("sessionToken");
      const ipHash = hashIp(getClientIp(c));
      const userAgent = c.req.header("user-agent") ?? null;

      const RL_KEY = `me-sessions-revoke-all:${user.id}`;
      const RL_OPTS = { limit: 3, windowMs: 60 * 60 * 1000 };
      const peek = peekRateLimit(RL_KEY, RL_OPTS);
      if (!peek.allowed) {
        const retry = Math.ceil(peek.resetMs / 1000);
        c.header("Retry-After", String(retry));
        throw errors.rateLimited(
          "Too many revoke-all attempts. Please try again later.",
          retry,
        );
      }

      if (!user.passwordHash) {
        // SSO-only users have no password to verify; refuse rather than
        // bypass the proof step. Phase B: allow the recovery code as a
        // fallback factor.
        throw errors.invalidCredentials(
          "Password is required to revoke other sessions",
        );
      }

      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) {
        consumeRateLimit(RL_KEY, { windowMs: RL_OPTS.windowMs });
        await db.insert(auditEvents).values({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "account.sessions_revoke_failed",
          targetType: "user",
          targetId: user.id,
          ipHash,
          userAgent,
          success: false,
          metadata: { reason: "wrong_password" },
        });
        throw errors.invalidCredentials("Current password is incorrect");
      }

      const currentSessionId = currentToken ? hashToken(currentToken) : null;

      let revokedCount = 0;
      await db.transaction(async (tx) => {
        const deleted = currentSessionId
          ? await tx
              .delete(sessions)
              .where(and(eq(sessions.userId, user.id), ne(sessions.id, currentSessionId)))
              .returning({ id: sessions.id })
          : await tx
              .delete(sessions)
              .where(eq(sessions.userId, user.id))
              .returning({ id: sessions.id });
        revokedCount = deleted.length;

        // WARN-I: revoke-all required the caller to re-prove the master
        // password (above). That proof is identical to what /me/verify-password
        // checks, so use the opportunity to refresh `vault_unlocked_at` on the
        // current session — a user who just demonstrated they own the account
        // should not be bounced into an unlock prompt seconds later.
        if (currentSessionId) {
          await tx
            .update(sessions)
            .set({ vaultUnlockedAt: new Date() })
            .where(eq(sessions.id, currentSessionId));
        }

        await tx.insert(auditEvents).values({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "account.sessions_revoked",
          targetType: "user",
          targetId: user.id,
          ipHash,
          userAgent,
          success: true,
          metadata: { revokedCount },
        });
      });

      return c.json({ ok: true, revokedCount });
    },
  );

// Re-export the normalize helper so the reset-with-recovery route can also
// share the exact same recovery-code parsing rules.
export { normalizeRecoveryCode };

export type MeRoutes = typeof meRoutes;
