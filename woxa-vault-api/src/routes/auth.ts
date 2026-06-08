import { Hono } from "hono";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, sessions, userKeys, users } from "@/db/schema";
import { jsonValidator } from "@/lib/validator";
import { hashPassword, verifyPassword } from "@/lib/password";
import { signMfaToken } from "@/lib/mfa";

const VERIFY_DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
import {
  SESSION_COOKIE_NAME,
  buildClearSessionCookie,
  buildSessionCookie,
  createSession,
  invalidateSessionToken,
} from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";
import { hashIp, maskIp, clientIpAuditFields } from "@/lib/ipHash";
import { logger } from "@/lib/logger";
import { errors } from "@/lib/errors";
import { getClientIp } from "@/lib/clientIp";
import { normalizeRecoveryCode, splitAndValidateChecksum } from "@/lib/recoveryKit";
import { isUniqueViolation } from "@/lib/pgError";
import { fakeKdfSaltForEmail, generateKdfSalt } from "@/lib/kdfSalt";
import type { AuthVariables } from "@/middleware/auth";
import { requireAuth } from "@/middleware/auth";
import { getCookie } from "hono/cookie";

const loginSchema = z.object({
  email: z.string().email().max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(1024).optional(),
  authKeyHash: z.string().min(64).max(256).optional(),
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
  .get("/login-info", async (c) => {
    const email = c.req.query("email")?.trim().toLowerCase();
    if (!email) throw errors.invalidCredentials();

    const user = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
    });

    if (!user) {
      // Return dummy data to prevent email enumeration
      return c.json({
        userId: "00000000-0000-0000-0000-000000000000",
        kdf: "argon2id",
        kdfParams: { iterations: 3, memorySize: 65536, parallelism: 4 },
      });
    }

    return c.json({
      userId: user.id,
      kdf: "argon2id",
      kdfParams: { iterations: 3, memorySize: 65536, parallelism: 4 },
      // `requiresZk` describes the VAULT-UNLOCK master factor (legacy
      // auth_key_hash present) — the lock screen consumes it to choose the
      // verify-password payload shape (ZK vs plaintext-master). It must NOT
      // drive LOGIN factor selection: an account can have BOTH a login password
      // and a legacy auth_key_hash, in which case login must authenticate
      // against `login_password_hash`, not derive a ZK hash from the typed
      // login password (which would never match the master-derived auth key).
      requiresZk: user.authKeyHash !== null,
      // `hasLoginPassword` is the LOGIN factor signal: when true, the client
      // sends the plaintext login password (checked server-side against
      // `login_password_hash`). This is the normal sign-in path and is
      // independent of `requiresZk`.
      hasLoginPassword: user.loginPasswordHash !== null,
    });
  })

  // ------------------------------------------------------------------
  // GET /auth/kdf-salt?email= — pre-auth per-user KDF salt lookup
  // ------------------------------------------------------------------
  //
  // Threat model:
  //   Asset: the per-user Argon2id salt the client needs to derive the master
  //     key. The salt is NOT secret — knowing it does not help derive the key
  //     without the master password. The only sensitive signal here is the
  //     EXISTENCE of an account for a given email.
  //   Adversaries:
  //     * Email-enumeration probe: hits this endpoint to learn which emails
  //       have accounts (or have set up ZK). Mitigated by returning a
  //       DETERMINISTIC decoy salt (HMAC over the email) for unknown / no-salt
  //       accounts — same response shape + same value on every probe, so the
  //       attacker cannot distinguish real from decoy or watch the value change.
  //     * Brute-force / cost-burn: same rate limit as /auth/login (5/IP +
  //       5/IP+email per 15 min) so this can't be used as a cheaper oracle.
  //   Mitigations:
  //     * Constant response shape `{ kdfSalt }` for hit AND miss.
  //     * Decoy salt is deterministic per email (HMAC), never reveals existence,
  //       and is never usable to derive a real key.
  //     * `Cache-Control: no-store` so the per-email value isn't cached.
  //   Residual risk:
  //     * A real account whose `kdf_salt` somehow never got backfilled would be
  //       served a decoy and fail to unlock — migration 0030 backfills every
  //       existing row, and all creation sites populate it, so this is N/A.
  .get("/kdf-salt", async (c) => {
    const rawEmail = c.req.query("email")?.trim().toLowerCase();
    if (!rawEmail) throw errors.invalidCredentials();

    const ip = getClientIp(c);
    const ipLimit = await rateLimit(`kdf-salt:ip:${ip}`, {
      limit: LOGIN_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    });
    const comboLimit = await rateLimit(`kdf-salt:${ip}:${rawEmail}`, {
      limit: LOGIN_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    });
    if (!ipLimit.allowed || !comboLimit.allowed) {
      const retry = Math.ceil(Math.max(ipLimit.resetMs, comboLimit.resetMs) / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many requests. Please try again later.", retry);
    }

    c.header("Cache-Control", "no-store");

    const user = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${rawEmail}`,
      columns: { kdfSalt: true },
    });

    // Real salt when present; deterministic decoy otherwise (anti-enumeration).
    const kdfSalt = user?.kdfSalt ?? fakeKdfSaltForEmail(rawEmail);
    return c.json({ kdfSalt });
  })

  .post("/login", jsonValidator(loginSchema), async (c) => {
    const { email, password, authKeyHash } = c.req.valid("json");

    // ConnectingIP heuristic — uses cf-connecting-ip / fly-client-ip first,
    // honoring `X-Forwarded-For` only when `TRUST_PROXY=true`. See clientIp.ts.
    const ip = getClientIp(c);
    const ipHash = hashIp(ip);

    const ipMasked = maskIp(ip);

    // Rate limit both by IP and by IP+email to defeat email-enum + brute force.
    const ipLimit = await rateLimit(`login:ip:${ip}`, { limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS });
    const comboLimit = await rateLimit(`login:${ip}:${email}`, {
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

    // Constant-ish-time response: always run a dummy verify if the row is
    // missing OR has no valid hash for the supplied factor.
    const factorProvided = authKeyHash ? "zk" : "password";
    const storedHash = factorProvided === "zk" ? user?.authKeyHash : user?.loginPasswordHash;

    if (!user || !storedHash) {
      // Verify against a known-invalid hash so timing leaks email existence less.
      await verifyPassword(VERIFY_DUMMY_HASH, authKeyHash ?? password ?? "").catch(() => false);

      await db.insert(auditEvents).values({
        action: "auth.login.failed",
        actorUserId: user?.id ?? null,
        actorEmail: email,
        ipHash,
        ipMasked,
        userAgent: c.req.header("user-agent") ?? null,
        success: false,
        metadata: { 
          factor: factorProvided,
          reason: !user ? "user_not_found" : "factor_not_available" 
        },
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

    // Verify the supplied factor.
    const ok = await verifyPassword(storedHash, authKeyHash ?? password ?? "");
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
        ipMasked,
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
        ipMasked,
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
      ipMasked,
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
    });

    logger.info({ userId: user.id }, "login success");

    const keys = await db.query.userKeys.findFirst({
      where: eq(userKeys.userId, user.id),
    });

    return c.json({
      status: "ok" as const,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? user.name ?? user.email,
      },
      keys: keys ? {
        publicKey: keys.publicKey.toString("base64"),
        encryptedPrivateKey: keys.encryptedPrivateKey.toString("base64"),
        privateKeyIv: keys.privateKeyIv.toString("base64"),
        privateKeyAuthTag: keys.privateKeyAuthTag.toString("base64"),
      } : undefined,
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
    const ipMasked = maskIp(ip);
    const userAgent = c.req.header("user-agent") ?? null;

    const limit = await rateLimit(`register:ip:${ip}`, {
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
        ipMasked,
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
          // Per-user KDF salt (Phase C fix #2) — random, server-stored, handed
          // to the client at unlock/setup so it can derive the master key.
          kdfSalt: generateKdfSalt(),
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
          ipMasked,
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
      ipMasked,
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
      const ipMasked = maskIp(ip);
      const userAgent = c.req.header("user-agent") ?? null;

      // Aggressive rate limiting — recovery is a high-value target. We key on
      // both IP and email so an attacker can't pivot across emails from the
      // same IP, and can't hammer one email from many IPs without burning
      // the per-email window.
      const ipLimit = await rateLimit(`pwreset:ip:${ip}`, {
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      const emailLimit = await rateLimit(`pwreset:email:${email}`, {
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
          ipMasked,
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
            // FINDING 2: /forgot-password is the PUBLIC "I can't log in"
            // recovery surface — the UX forwards to /login/password and
            // expects the new password to work for login. `POST /auth/login`
            // verifies `login_password_hash` (auth.ts:117/149), so we MUST
            // rotate it. We rotate `password_hash` (master) too so the chosen
            // password works for both login AND vault-unlock — a single fresh
            // credential, no split-brain where login works but unlock uses a
            // stale master. (Two-password model: schema.ts:68/73.)
            loginPasswordHash: newHash,
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
          ipMasked,
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
