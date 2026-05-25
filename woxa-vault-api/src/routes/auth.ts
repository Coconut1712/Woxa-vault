import { Hono } from "hono";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, sessions, users } from "@/db/schema";
import { jsonValidator } from "@/lib/validator";
import { hashPassword, verifyPassword } from "@/lib/password";
import { signMfaToken } from "@/lib/mfa";
import {
  SESSION_COOKIE_NAME,
  buildClearSessionCookie,
  buildSessionCookie,
  createSession,
  invalidateSessionToken,
} from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";
import { hashIp } from "@/lib/ipHash";
import { logger } from "@/lib/logger";
import { errors } from "@/lib/errors";
import { getClientIp } from "@/lib/clientIp";
import { normalizeRecoveryCode, splitAndValidateChecksum } from "@/lib/recoveryKit";
import { isUniqueViolation } from "@/lib/pgError";
import type { AuthVariables } from "@/middleware/auth";
import { requireAuth } from "@/middleware/auth";
import { getCookie } from "hono/cookie";

const loginSchema = z.object({
  email: z.string().email().max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(1024),
});

// Self-service signup. `password` here is the LOGIN password (NOT the master
// password — master is set later via `POST /me/password/setup`). Strength
// policy is intentionally identical to `passwordSetupSchema` in routes/me.ts
// (min 10 / max 1024) so login and master credentials share one bar.
const registerSchema = z.object({
  email: z.string().email().max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(10).max(1024),
  displayName: z.string().trim().min(1).max(120).optional(),
});

// Register rate limit — self-service signup is an unauthenticated write that
// creates rows + burns Argon2 cost, so cap it per IP. 5/hour mirrors the
// invite-signup tier; tighter than login because there's no legitimate reason
// to create many accounts from one IP in an hour.
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_LIMIT = 5;

// Login rate limit per REQUIREMENTS §7 (5/IP/15min) + (5/email/15min).
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 5;

// Account lock per AC-002.3: 5 failed attempts → lock 15 min.
const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export const authRoutes = new Hono<{ Variables: AuthVariables }>()
  .post("/login", jsonValidator(loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");

    // ConnectingIP heuristic — uses cf-connecting-ip / fly-client-ip first,
    // honoring `X-Forwarded-For` only when `TRUST_PROXY=true`. See clientIp.ts.
    const ip = getClientIp(c);
    const ipHash = hashIp(ip);

    // Rate limit both by IP and by IP+email to defeat email-enum + brute force.
    const ipLimit = rateLimit(`login:ip:${ip}`, { limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS });
    const comboLimit = rateLimit(`login:${ip}:${email}`, {
      limit: LOGIN_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    });
    if (!ipLimit.allowed || !comboLimit.allowed) {
      const retry = Math.ceil(Math.max(ipLimit.resetMs, comboLimit.resetMs) / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many login attempts. Please try again later.", retry);
    }

    // Look up via `lower(email)` so the result is consistent with the unique
    // index (migration 0006) and the reset-with-recovery lookup. A historical
    // row that stored mixed case still resolves.
    const user = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
    });

    // Two-password model: `/auth/login` verifies the LOGIN password
    // (`login_password_hash`), NOT the master password (`password_hash`). A
    // user with no login password (SSO-only / legacy account) cannot sign in
    // here and must use Google — we treat that case identically to an unknown
    // email so the response does not leak which accounts have a login password.
    //
    // Constant-ish-time response: always run a dummy verify if the row is
    // missing OR has no login password hash.
    if (!user || !user.loginPasswordHash) {
      // Verify against a known-invalid hash so timing leaks email existence less.
      // (Not perfect; argon2 timing varies, but better than instant 401.)
      await verifyPassword(
        "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        password,
      ).catch(() => false);

      await db.insert(auditEvents).values({
        action: "auth.login.failed",
        actorUserId: user?.id ?? null,
        actorEmail: email,
        ipHash,
        userAgent: c.req.header("user-agent") ?? null,
        success: false,
        // Distinguish "no such user" from "user exists but SSO-only" in the
        // audit log (never in the response). Both return invalid_credentials.
        metadata: { reason: !user ? "user_not_found" : "no_login_password" },
      });
      throw errors.invalidCredentials();
    }

    // Account-lock check (AC-002.3).
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const retry = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited(
        `Account locked due to failed attempts. Try again in ${Math.ceil(retry / 60)} minute(s).`,
        retry,
      );
    }

    // Verify the LOGIN password, never the master password.
    const ok = await verifyPassword(user.loginPasswordHash, password);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const shouldLock = failed >= LOCK_THRESHOLD;
      await db
        .update(users)
        .set({
          failedLoginCount: failed,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : user.lockedUntil,
        })
        .where(eq(users.id, user.id));

      await db.insert(auditEvents).values({
        action: shouldLock ? "auth.login.locked" : "auth.login.failed",
        actorUserId: user.id,
        actorEmail: user.email,
        ipHash,
        userAgent: c.req.header("user-agent") ?? null,
        success: false,
        metadata: { failedCount: failed },
      });

      throw errors.invalidCredentials();
    }

    // Password OK — reset counters now so a 2FA-required user isn't locked
    // out by the password-failure window. Session issuance is deferred until
    // either: (a) 2FA is not enabled (issued below) or (b) the
    // /auth/2fa/verify-login handler accepts the second factor.
    await db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // 2FA gate (REQUIREMENTS AC-003.5). When the user has enabled TOTP we do
    // NOT issue a session yet — we return a short-lived `mfaToken` JWT that
    // the client redeems via /auth/2fa/verify-login. The cookie is only set
    // there. Threat consideration: an attacker who steals the JSON response
    // gets only a 5-minute token AND must still produce the rotating OTP /
    // a single-use backup code. The token is HS256-signed with a separate
    // secret so a leaked session signing key does not let an attacker mint
    // mfaTokens (and vice versa).
    if (user.totpEnabledAt) {
      const mfaToken = signMfaToken(user.id);
      await db.insert(auditEvents).values({
        action: "auth.login.mfa_required",
        actorUserId: user.id,
        actorEmail: user.email,
        ipHash,
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
      });
      // Cache-Control: no-store on the mfaToken response so the body can't
      // be retained by intermediaries.
      c.header("Cache-Control", "no-store");
      return c.json({ status: "mfa_required" as const, mfaToken });
    }

    const { token, session } = await createSession(user.id, {
      ipHash,
      userAgent: c.req.header("user-agent") ?? undefined,
    });

    c.header("Set-Cookie", buildSessionCookie(token, session.expiresAt), { append: true });

    await db.insert(auditEvents).values({
      action: "auth.login.success",
      actorUserId: user.id,
      actorEmail: user.email,
      targetType: "session",
      targetId: session.id,
      ipHash,
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
    });

    logger.info({ userId: user.id }, "login success");

    return c.json({
      status: "ok" as const,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? user.name ?? user.email,
      },
    });
  })

  // ------------------------------------------------------------------
  // POST /auth/register — email + login-password self-service signup
  // ------------------------------------------------------------------
  // Threat model:
  //   Asset: the ability to create accounts. Adversaries:
  //     * Spam/automated mass-signup — capped at 5/hour/IP + Retry-After.
  //     * Account-squatting on an email the squatter doesn't own — accepted
  //       residual risk this round: no email verification yet. The invite
  //       acceptance flow is still token-gated, so a squatter cannot use a
  //       squatted row to hijack an invitation (accept requires the invited
  //       email to match the SESSION email AND a valid token).
  //   Mitigations:
  //     * Argon2id hashing of the login password (never plaintext, never
  //       logged — pino redact covers req.body.password).
  //     * Unique `lower(email)` index (migration 0006) is the last-line race
  //       guard: a TOCTOU between the existence check and the insert surfaces
  //       as 23505 → mapped to `email_taken` (not a raw 500).
  //   Residual risk:
  //     * Registration is a deliberate user-enumeration surface (a user must
  //       be told their email is taken). We do NOT make this constant-time; the
  //       per-IP rate limit is the brute-force defence.
  //
  // Two-password note: this sets `login_password_hash` ONLY. `password_hash`
  // (master) is left NULL → `GET /me` reports `requiresPasswordSetup: true`
  // and the frontend ladder routes the new user to /setup-password (which sets
  // master + emits the recovery kit) and then to /spaces. No org membership is
  // created — the user is born org-less (single-Owner onboarding model).
  .post("/register", jsonValidator(registerSchema), async (c) => {
    const { email, password, displayName } = c.req.valid("json");
    const ip = getClientIp(c);
    const ipHash = hashIp(ip);
    const userAgent = c.req.header("user-agent") ?? null;

    const limit = rateLimit(`register:ip:${ip}`, {
      limit: REGISTER_LIMIT,
      windowMs: REGISTER_WINDOW_MS,
    });
    if (!limit.allowed) {
      const retry = Math.ceil(limit.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many signups from this address. Please try again later.", retry);
    }

    // Fast pre-check (UX) — the unique index is the real guard against a race.
    const existing = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
    });
    if (existing) {
      await db.insert(auditEvents).values({
        action: "auth.register.failed",
        actorEmail: email,
        ipHash,
        userAgent,
        success: false,
        metadata: { reason: "email_taken" },
      });
      throw errors.emailTaken();
    }

    // Hash the LOGIN password. Master (`passwordHash`) stays NULL.
    const loginPasswordHash = await hashPassword(password);

    let newUser: { id: string; email: string };
    try {
      const [created] = await db
        .insert(users)
        .values({
          email,
          loginPasswordHash,
          // master not set → requiresPasswordSetup=true downstream
          passwordHash: null,
          displayName: displayName ?? null,
          name: displayName ?? null,
          status: "active",
          lastLoginAt: new Date(),
        })
        .returning({ id: users.id, email: users.email });
      if (!created) throw errors.internal("failed to create user");
      newUser = created;
    } catch (err) {
      // TOCTOU: another request inserted the same email between our pre-check
      // and this insert. The unique `lower(email)` index fired — surface the
      // same 409 the pre-check would have, not a 500.
      if (isUniqueViolation(err)) {
        await db.insert(auditEvents).values({
          action: "auth.register.failed",
          actorEmail: email,
          ipHash,
          userAgent,
          success: false,
          metadata: { reason: "email_taken_race" },
        });
        throw errors.emailTaken();
      }
      throw err;
    }

    // Log the user in immediately (Lucia session + cookie).
    const { token, session } = await createSession(newUser.id, {
      ipHash,
      userAgent: userAgent ?? undefined,
    });
    c.header("Set-Cookie", buildSessionCookie(token, session.expiresAt), { append: true });

    await db.insert(auditEvents).values({
      action: "auth.register",
      actorUserId: newUser.id,
      actorEmail: newUser.email,
      targetType: "user",
      targetId: newUser.id,
      ipHash,
      userAgent,
      success: true,
      metadata: { method: "email_password" },
    });

    logger.info({ userId: newUser.id }, "register success");

    // No recoveryCode here — the recovery kit is bound to the MASTER password,
    // which is set later at /setup-password (POST /me/password/setup).
    c.header("Cache-Control", "no-store");
    return c.json({
      status: "ok" as const,
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: displayName ?? newUser.email,
      },
    });
  })

  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (token) {
      await invalidateSessionToken(token);
      const user = c.get("user");
      await db.insert(auditEvents).values({
        action: "auth.logout",
        actorUserId: user?.id,
        actorEmail: user?.email,
        success: true,
      });
    }
    c.header("Set-Cookie", buildClearSessionCookie(), { append: true });
    return c.json({ ok: true });
  })
  .get("/me", requireAuth, async (c) => {
    const user = c.get("user")!;
    return c.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? user.name ?? user.email,
      },
    });
  })

  // ------------------------------------------------------------------
  // POST /auth/password/reset-with-recovery — forgotten-password reset
  // ------------------------------------------------------------------
  // Threat model:
  //   Asset: ability to mint a brand-new `password_hash` without proving
  //   knowledge of the current password. Recovery code IS the auth factor.
  //   Adversaries:
  //     * Online brute-forcer of the recovery code — defeated by 256-bit
  //       entropy + Argon2 verify cost + 5/hour/IP + 3/hour/email caps.
  //     * Email-enumeration oracle — for unknown emails we run a constant-
  //       time Argon2 verify against a pre-baked dummy hash so timing
  //       cannot distinguish unknown-email from known-email-wrong-code.
  //     * Replay after compromise — the kit is single-use: a successful
  //       reset clears `recovery_kit_hash` and sets `recovery_kit_used_at`.
  //   Mitigations:
  //     * Hash-of-hash storage: server never has the plaintext recovery code.
  //     * Atomic transaction: hash rotation + session purge + kit invalidate
  //       commit together.
  //     * All active sessions are deleted — a recovery is treated as a
  //       sign-of-compromise (lost device, phished). The user must log in
  //       fresh with their new password.
  //   Residual risk:
  //     * Argon2 timing is not perfectly constant — there will be small
  //       observable variation between dummy and real verifies. Acceptable
  //       for Phase A; the rate limiter is the primary defense.
  .post(
    "/password/reset-with-recovery",
    jsonValidator(
      z.object({
        email: z.string().email().max(254).transform((v) => v.trim().toLowerCase()),
        recoveryCode: z.string().min(8).max(256),
        newPassword: z.string().min(10).max(1024),
      }),
    ),
    async (c) => {
      const { email, recoveryCode, newPassword } = c.req.valid("json");

      const ip = getClientIp(c);
      const ipHash = hashIp(ip);
      const userAgent = c.req.header("user-agent") ?? null;

      // Aggressive rate limiting — recovery is a high-value target. We key on
      // both IP and email so an attacker can't pivot across emails from the
      // same IP, and can't hammer one email from many IPs without burning
      // the per-email window.
      const ipLimit = rateLimit(`pwreset:ip:${ip}`, {
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      const emailLimit = rateLimit(`pwreset:email:${email}`, {
        limit: 3,
        windowMs: 60 * 60 * 1000,
      });
      if (!ipLimit.allowed || !emailLimit.allowed) {
        const retry = Math.ceil(Math.max(ipLimit.resetMs, emailLimit.resetMs) / 1000);
        c.header("Retry-After", String(retry));
        throw errors.rateLimited(
          "Too many password reset attempts. Please try again later.",
          retry,
        );
      }

      // Refuse if the new password is literally the recovery code itself
      // (defense against a user copy-pasting the code into both fields).
      const normalizedCode = normalizeRecoveryCode(recoveryCode);
      if (normalizeRecoveryCode(newPassword) === normalizedCode) {
        throw errors.validation("New password must not equal the recovery code");
      }

      // Constant-ish-time pattern: always do the Argon2 verify so the
      // response time doesn't leak whether the email exists. The dummy
      // hash matches the params we use elsewhere (`t=3, m=64MB, p=4`).
      const DUMMY_HASH =
        "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

      // CRITICAL-1: only consider active, non-soft-deleted users. A user
      // whose row was disabled (status != 'active') or soft-deleted is
      // treated identically to an unknown email — we still run the dummy
      // Argon2 verify so the response timing cannot distinguish the cases.
      const userRow = await db.query.users.findFirst({
        where: and(
          sql`lower(${users.email}) = ${email}`,
          eq(users.status, "active"),
          isNull(users.deletedAt),
        ),
      });
      const user = userRow ?? null;

      // WARN-7: strip + validate the 4-char checksum BEFORE running the slow
      // Argon2 verify so a typo doesn't burn the user's rate-limit quota.
      // On bad checksum we still run a dummy verify to preserve constant-ish
      // time, but we set `body` to a known-bad sentinel so the verify always
      // returns false (no need to consult the DB-stored hash).
      const body = splitAndValidateChecksum(normalizedCode);

      const candidateHash = user?.recoveryKitHash ?? DUMMY_HASH;
      // Compare the BODY (post-checksum) against the stored hash; the user's
      // grouping/casing is normalized away upstream. If the checksum failed
      // we verify against the dummy hash with a fixed sentinel so the path
      // takes the same Argon2 cost as a real attempt.
      const ok = body
        ? await verifyPassword(candidateHash, body)
        : (await verifyPassword(DUMMY_HASH, "checksum_fail").catch(() => false), false);

      // If the user exists but the hash has already been used (single-use),
      // `recoveryKitHash` is NULL → we matched the dummy → ok will be false.
      // That's the correct outcome.
      if (!user || !user.recoveryKitHash || !ok) {
        await db.insert(auditEvents).values({
          action: "account.password_reset_failed",
          actorUserId: user?.id ?? null,
          actorEmail: email,
          targetType: "user",
          targetId: user?.id ?? null,
          ipHash,
          userAgent,
          success: false,
          metadata: {
            reason: !user
              ? "unknown_email"
              : !user.recoveryKitHash
                ? "no_kit"
                : !body
                  ? "checksum_invalid"
                  : "wrong_code",
          },
        });
        throw errors.recoveryKitInvalid();
      }

      const newHash = await hashPassword(newPassword);
      const now = new Date();

      await db.transaction(async (tx) => {
        // Rotate auth credential + invalidate recovery kit. The next login
        // will set `requiresNewRecoveryKit` semantics for the frontend
        // via `hasRecoveryKit: false` on GET /me, prompting regeneration.
        await tx
          .update(users)
          .set({
            passwordHash: newHash,
            passwordUpdatedAt: now,
            recoveryKitHash: null,
            recoveryKitUsedAt: now,
            // Don't clear `recoveryKitCreatedAt` — the timestamp on the
            // previous kit is useful audit context. Frontend reads
            // hasRecoveryKit (boolean) to decide whether to prompt.
            failedLoginCount: 0,
            lockedUntil: null,
          })
          .where(eq(users.id, user.id));

        // Recovery = sign of compromise. Nuke every active session so a
        // device that has the OLD password cached has to re-authenticate
        // and any session the attacker may have planted is killed.
        await tx.delete(sessions).where(eq(sessions.userId, user.id));

        await tx.insert(auditEvents).values({
          action: "account.password_reset_via_recovery",
          actorUserId: user.id,
          actorEmail: user.email,
          targetType: "user",
          targetId: user.id,
          ipHash,
          userAgent,
          success: true,
          metadata: { phase: "A", kekRotated: false },
        });
      });

      logger.info({ userId: user.id }, "password reset via recovery completed");

      // No plaintext secret returned, but the response signals an auth state
      // change — mark uncacheable so an intermediary won't retain stale
      // success/failure responses keyed off the request body.
      c.header("Cache-Control", "no-store");
      return c.json({ ok: true, requiresNewRecoveryKit: true });
    },
  );

export type AuthRoutes = typeof authRoutes;
