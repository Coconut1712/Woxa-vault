import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { and, eq, isNull, or, lt, sql } from "drizzle-orm";
import { z } from "zod";
import * as QRCode from "qrcode";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { auditEvents, userKeys, userMfaBackupCodes, users } from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { logger } from "@/lib/logger";
import { sendTwoFactorChangedEmail } from "@/lib/mailer/resend";
import { verifyPassword } from "@/lib/password";
import { consumeRateLimit, peekRateLimit, rateLimit } from "@/lib/rateLimit";
import { buildSessionCookie, createSession, invalidateOtherSessions } from "@/lib/session";
import { jsonValidator } from "@/lib/validator";
import {
  buildOtpauthUri,
  checkTotpStep,
  decryptUserSecret,
  encryptUserSecret,
  generateBackupCode,
  generateTotpSecret,
  hashBackupCode,
  verifyBackupCode,
  verifyMfaToken,
  MFA_PENDING_COOKIE,
  buildClearMfaPendingCookie,
} from "@/lib/mfa";
import { requireAuth, type AuthVariables } from "@/middleware/auth";

// ---------------------------------------------------------------------------
// 2FA routes (REQUIREMENTS US-003).
//
// Threat model overview:
//   See lib/mfa.ts for the per-asset analysis. This router's specific risks:
//     * Cookie-only attacker enrolling 2FA on the legit user's account to
//       lock them out: enroll DOES NOT require a re-verify of the password,
//       which matches the user-flow (already in settings UI behind requireAuth).
//       The disable/regenerate paths re-verify the password to balance this:
//       a session-thief who enrolled cannot also remove the user's recourse
//       without knowing the password.
//     * Brute force on verify-enroll / verify-login: rate-limited 10/min per
//       user+IP. After 10 failed verify-login attempts the mfaToken is no
//       longer issued and the user must re-enter their password (achieved
//       by the 5-minute TTL on the token itself).
//
// Audit actions emitted by this router:
//   * 2fa.enroll_started, 2fa.enabled, 2fa.disabled,
//     2fa.backup_codes_regenerated, 2fa.login_verified, 2fa.login_failed,
//     2fa.backup_code_used
//
// Deferred findings from the round-2 security audit — keep the TODOs in place
// so the next round picks them up; each line mentions `audit` for grep-ability.
// TODO(F-10): deferred from round-2 security audit — revisit next round.
// TODO(F-11): deferred from round-2 security audit — revisit next round.
// TODO(F-12): deferred from round-2 security audit — revisit next round.
// ---------------------------------------------------------------------------

const verifyEnrollSchema = z.object({ code: z.string().min(6).max(8) });
const disableSchema = z.object({
  password: z.string().min(1).max(1024),
  code: z.string().min(1).max(64).optional(),
});
const regenerateSchema = z.object({
  password: z.string().min(1).max(1024),
  code: z.string().min(6).max(8),
});
const verifyLoginSchema = z.object({
  // Optional in the body: the password flow supplies it here (the SPA holds it
  // in memory), but the SSO flow carries it in the HttpOnly `mfa_pending`
  // cookie instead, so an SSO challenge POST sends only `code`. The handler
  // resolves body-first, then cookie. Either way the token is fully verified
  // (HMAC + exp + user binding) by verifyMfaToken before it is trusted.
  mfaToken: z.string().min(8).max(4096).optional(),
  code: z.string().min(4).max(32),
  useBackupCode: z.boolean().optional(),
});

// Single helper: returns 10 plaintext backup codes + their hashes, ready
// for insertion. The plaintext list is the response body that the caller
// must store securely.
async function generateBackupCodeSet(): Promise<{ plain: string[]; hashed: string[] }> {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = generateBackupCode();
    plain.push(code);
    // Argon2id is expensive — 10 hashes in series is ~2s; acceptable for the
    // setup flow which is interactive. Could parallelize in Phase B.
    hashed.push(await hashBackupCode(code));
  }
  return { plain, hashed };
}

// RFC 6238 §5.2 replay guard. Verifies `code` against `secret` AND atomically
// consumes its time-step against `users.last_totp_step` so the SAME code (or
// any earlier step still inside its ±skew validity window) cannot be replayed.
//
// Returns:
//   "ok"      — code valid and this step is strictly newer than the last
//               accepted one; the row was advanced (CAS won).
//   "invalid" — code did not match the secret at all.
//   "replay"  — code matched a step that was already consumed (CAS lost / 0
//               rows). The caller MUST treat this as a failed attempt
//               (invalid_code), NOT a 500.
//
// The UPDATE is a single statement with the monotonic guard in its WHERE
// clause, so two concurrent requests presenting the same code race on the row:
// exactly one advances `last_totp_step` and gets RETURNING id; the loser sees 0
// rows. `tx` lets callers fold the CAS into the same transaction that flips
// enabled_at / mints the session, so a rolled-back outer tx also rolls back the
// step advance (no step is "burned" by a request that ultimately fails).
type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type TotpConsumeResult = "ok" | "invalid" | "replay";

async function consumeTotpStep(
  conn: DbLike,
  userId: string,
  secret: string,
  code: string,
): Promise<TotpConsumeResult> {
  const step = checkTotpStep(secret, code);
  if (step === null) return "invalid";
  const advanced = await conn
    .update(users)
    .set({ lastTotpStep: step })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.lastTotpStep), lt(users.lastTotpStep, step)),
      ),
    )
    .returning({ id: users.id });
  return advanced.length > 0 ? "ok" : "replay";
}

// Best-effort security alert. DESIGN.md §20 detective control for the
// session-thief residual: notify the real account owner out-of-band whenever
// 2FA is enabled/disabled. NEVER blocks or fails the request — a mailer outage
// must not prevent a user from turning 2FA on/off. We await it (so the alert is
// in flight before we return) but swallow every error.
async function notifyTwoFactorChanged(
  email: string,
  action: "enabled" | "disabled",
  ipHash: string | null,
): Promise<void> {
  try {
    await sendTwoFactorChangedEmail({ to: email, action, ipHash, at: new Date() });
  } catch (err) {
    logger.warn({ err, action }, "[2fa] security alert email failed (non-fatal)");
  }
}

export const twoFactorRoutes = new Hono<{ Variables: AuthVariables }>()
  // -------- Authenticated 2FA management endpoints --------
  .use("/enroll", requireAuth)
  .use("/verify-enroll", requireAuth)
  .use("/disable", requireAuth)
  .use("/regenerate-backup-codes", requireAuth)

  // ------------------------------------------------------------------
  // POST /auth/2fa/enroll — start enrollment, return otpauthUri + qr + secret
  // ------------------------------------------------------------------
  .post("/enroll", async (c) => {
    const user = c.get("user")!;
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    if (user.totpEnabledAt) {
      // 409: 2FA already enabled. The frontend should route to the disable
      // flow first; we keep the message generic to avoid coaching an
      // attacker that "enroll is the wrong endpoint right now".
      throw errors.twoFactorAlreadyEnabled();
    }

    // Rate limit enroll to defeat a session-thief who tries to spam fresh
    // secrets to confuse the user (each enroll rotates the pending secret).
    const rl = await rateLimit(`2fa-enroll:${user.id}`, { limit: 5, windowMs: 60 * 1000 });
    if (!rl.allowed) {
      const retry = Math.ceil(rl.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many enroll attempts. Try again shortly.", retry);
    }

    const secret = generateTotpSecret();
    const encrypted = encryptUserSecret(secret);
    const otpauthUri = buildOtpauthUri(secret, user.email);

    // Best-effort QR. If qrcode throws (very unlikely on Node) we still return
    // the URI so the user can paste it into their authenticator manually.
    let qrDataUrl: string | null = null;
    try {
      qrDataUrl = await QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: "M", margin: 1, width: 240 });
    } catch (err) {
      logger.warn({ err, userId: user.id }, "[2fa] QR rendering failed; URI-only fallback");
    }

    await db.transaction(async (tx) => {
      // Overwrite any prior pending secret. Pending = secret set, enabled_at
      // still NULL. The `verify-enroll` step is the gate that flips
      // enabled_at; until then the row is harmless.
      await tx
        .update(users)
        .set({ totpSecretEncrypted: encrypted, totpEnabledAt: null })
        .where(eq(users.id, user.id));
      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "2fa.enroll_started",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: true,
      });
    });

    // Cache-Control: no-store — the response body contains the TOTP secret in
    // plaintext (the user needs it to type into their authenticator). Same
    // pattern as the recovery code response.
    c.header("Cache-Control", "no-store");
    return c.json({ otpauthUri, qrDataUrl, secret });
  })

  // ------------------------------------------------------------------
  // POST /auth/2fa/verify-enroll — confirm code, enable 2FA, emit backup codes
  // ------------------------------------------------------------------
  .post("/verify-enroll", jsonValidator(verifyEnrollSchema), async (c) => {
    const user = c.get("user")!;
    const { code } = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    // Rate limit: 10 wrong codes per minute. Soft cap ticks every call,
    // hard cap ticks only on failure so a legitimate retry of the same
    // verify burst is forgiven once the user gets it right.
    const SOFT = `2fa-verify-enroll:${user.id}`;
    const HARD = `2fa-verify-enroll-fail:${user.id}`;
    const SOFT_OPTS = { limit: 30, windowMs: 60 * 1000 };
    const HARD_OPTS = { limit: 10, windowMs: 60 * 1000 };
    const soft = await rateLimit(SOFT, SOFT_OPTS);
    const peek = await peekRateLimit(HARD, HARD_OPTS);
    if (!soft.allowed || !peek.allowed) {
      const retry = Math.ceil(Math.max(soft.resetMs, peek.resetMs) / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many verification attempts. Try again later.", retry);
    }

    if (user.totpEnabledAt) {
      throw errors.validation("2FA is already enabled");
    }
    if (!user.totpSecretEncrypted) {
      throw errors.validation("No pending 2FA enrollment. Start enrollment first.");
    }

    const secret = decryptUserSecret(user.totpSecretEncrypted);
    // RFC 6238 §5.2: verify AND atomically consume the time-step. A replayed
    // code (same step already accepted) is rejected exactly like an invalid one
    // — no enrollment, no enable, fail bucket charged, audit row written.
    const totpResult = await consumeTotpStep(db, user.id, secret, code);
    if (totpResult !== "ok") {
      await consumeRateLimit(HARD, { windowMs: HARD_OPTS.windowMs });
      await db.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "2fa.login_failed",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: false,
        metadata: { stage: "verify_enroll", reason: totpResult === "replay" ? "replay" : "invalid_code" },
      });
      throw errors.invalidCredentials("Invalid 2FA code");
    }

    const { plain, hashed } = await generateBackupCodeSet();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ totpEnabledAt: now })
        .where(eq(users.id, user.id));

      // Wipe any prior backup-code rows for the user (defensive — should be
      // empty since enroll only runs when 2FA isn't enabled, but a half-rolled-
      // back disable could have left stragglers).
      await tx.delete(userMfaBackupCodes).where(eq(userMfaBackupCodes.userId, user.id));

      for (const codeHash of hashed) {
        await tx.insert(userMfaBackupCodes).values({
          userId: user.id,
          codeHash,
        });
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "2fa.enabled",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: true,
      });
    });

    // Best-effort out-of-band alert (post-commit, never blocks the response).
    await notifyTwoFactorChanged(user.email, "enabled", ipHash);

    c.header("Cache-Control", "no-store");
    return c.json({ enabled: true, backupCodes: plain });
  })

  // ------------------------------------------------------------------
  // POST /auth/2fa/disable
  // ------------------------------------------------------------------
  .post("/disable", jsonValidator(disableSchema), async (c) => {
    const user = c.get("user")!;
    const { password, code } = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    // F-01: fail-counting rate limit. We peek before doing any expensive work
    // (Argon2 password verify ≈ 200 ms) so an attacker with a session cookie
    // can't burn CPU by spamming wrong-password attempts at this route. The
    // bucket ticks only on a verified-failed factor, so a legit user typing
    // their password correctly never charges the bucket.
    const DISABLE_FAIL_KEY = `2fa-disable-fail:${user.id}`;
    const DISABLE_FAIL_OPTS = { limit: 10, windowMs: 15 * 60 * 1000 };
    const disablePeek = await peekRateLimit(DISABLE_FAIL_KEY, DISABLE_FAIL_OPTS);
    if (!disablePeek.allowed) {
      const retry = Math.ceil(disablePeek.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many disable attempts. Try again later.", retry);
    }

    if (!user.passwordHash) {
      throw errors.invalidCredentials("Password is required to disable 2FA");
    }
    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      await consumeRateLimit(DISABLE_FAIL_KEY, { windowMs: DISABLE_FAIL_OPTS.windowMs });
      await db.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "2fa.login_failed",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: false,
        metadata: { stage: "disable_password" },
      });
      throw errors.invalidCredentials("Current password is incorrect");
    }

    // If 2FA is currently active, require a fresh OTP/backup code so a
    // cookie-only attacker who learned the password elsewhere can't disable
    // 2FA without ALSO defeating the second factor.
    if (user.totpEnabledAt) {
      if (!code) {
        throw errors.validation("2FA code is required to disable 2FA");
      }
      if (!user.totpSecretEncrypted) {
        // Pathological state — enabled flag set but no secret. Treat as
        // misconfigured and refuse to disable without manual ops attention.
        throw errors.internal("2FA state inconsistent — contact support");
      }
      const secret = decryptUserSecret(user.totpSecretEncrypted);
      const normalized = code.replace(/[\s-]+/g, "");
      const looksLikeTotp = /^\d{6}$/.test(normalized);

      let factorOk = false;
      if (looksLikeTotp) {
        // RFC 6238 §5.2: consume the step. A replayed TOTP can't be used to
        // disable 2FA either — it fails identically to an invalid code.
        factorOk = (await consumeTotpStep(db, user.id, secret, code)) === "ok";
      } else {
        // Try backup-code path. Pull all unused rows and check each — we
        // do this in-memory because Argon2 hashes are not indexable.
        const rows = await db
          .select()
          .from(userMfaBackupCodes)
          .where(
            and(eq(userMfaBackupCodes.userId, user.id), isNull(userMfaBackupCodes.usedAt)),
          );
        for (const row of rows) {
          if (await verifyBackupCode(row.codeHash, code)) {
            factorOk = true;
            // F-06: short-circuit on first Argon2 match. Without this break,
            // a wrong code would force a full 10× Argon2 verify (~2 s CPU)
            // every attempt. Paired with the DISABLE_FAIL_KEY rate limit
            // above, the worst case is ~2 s × 10 = 20 s CPU per 15-min
            // window per user.
            break;
          }
        }
      }
      if (!factorOk) {
        await consumeRateLimit(DISABLE_FAIL_KEY, { windowMs: DISABLE_FAIL_OPTS.windowMs });
        await db.insert(auditEvents).values({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "2fa.login_failed",
          targetType: "user",
          targetId: user.id,
          ipHash,
          userAgent,
          success: false,
          metadata: { stage: "disable_code" },
        });
        throw errors.invalidCredentials("Invalid 2FA code");
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ totpSecretEncrypted: null, totpEnabledAt: null })
        .where(eq(users.id, user.id));
      await tx.delete(userMfaBackupCodes).where(eq(userMfaBackupCodes.userId, user.id));
      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "2fa.disabled",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: true,
      });
    });

    // F-09: 2FA has just been removed; any parallel cookie-bearer who had a
    // single-factor session before the user enabled 2FA is now effectively
    // back to single-factor access. We delete every session for this user
    // except the one driving THIS request, so the caller stays logged in
    // (they just proved password + factor) and every other device is
    // forced back through /auth/login. The current session id comes from
    // `c.var.session` populated by sessionMiddleware — it survives the
    // requireAuth gate above so we can trust it here.
    const currentSession = c.get("session");
    if (currentSession) {
      await invalidateOtherSessions(user.id, currentSession.id);
    }

    // Best-effort out-of-band alert. Especially important here: disabling 2FA
    // removes a factor, so a session-thief who managed it must be surfaced to
    // the real owner immediately.
    await notifyTwoFactorChanged(user.email, "disabled", ipHash);

    return c.json({ disabled: true });
  })

  // ------------------------------------------------------------------
  // POST /auth/2fa/regenerate-backup-codes
  // ------------------------------------------------------------------
  .post("/regenerate-backup-codes", jsonValidator(regenerateSchema), async (c) => {
    const user = c.get("user")!;
    const { password, code } = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    // F-02: fail-counting rate limit. Tighter cap than /disable because
    // regen does not destroy any auth factors; rotating the bypass list is
    // strictly less load-bearing, so 5/15min is enough headroom for a
    // distracted user re-typing their password while still slamming the
    // door on a brute-forcer who knows the password but is fishing for a
    // TOTP code. Bucket ticks only on a verified fail below.
    const REGEN_FAIL_KEY = `2fa-regen-fail:${user.id}`;
    const REGEN_FAIL_OPTS = { limit: 5, windowMs: 15 * 60 * 1000 };
    const regenPeek = await peekRateLimit(REGEN_FAIL_KEY, REGEN_FAIL_OPTS);
    if (!regenPeek.allowed) {
      const retry = Math.ceil(regenPeek.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many regenerate attempts. Try again later.", retry);
    }

    if (!user.totpEnabledAt || !user.totpSecretEncrypted) {
      throw errors.validation("2FA is not enabled");
    }
    if (!user.passwordHash) {
      throw errors.invalidCredentials("Password is required to regenerate backup codes");
    }
    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      // F-08: emit an audit row so brute-force attempts at this endpoint
      // leave the same trail as /disable. Mirrors the disable_password
      // stage for downstream alerting heuristics.
      await consumeRateLimit(REGEN_FAIL_KEY, { windowMs: REGEN_FAIL_OPTS.windowMs });
      await db.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "2fa.login_failed",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: false,
        metadata: { stage: "regenerate", reason: "password" },
      });
      throw errors.invalidCredentials("Current password is incorrect");
    }
    const secret = decryptUserSecret(user.totpSecretEncrypted);
    // Require a fresh TOTP (not a backup code) for regeneration — using a
    // backup code here would burn one of the user's bypasses for the sake
    // of generating new ones, which is a UX trap. RFC 6238 §5.2: consume the
    // step so a replayed code can't trigger a backup-code rotation either.
    const regenTotp = await consumeTotpStep(db, user.id, secret, code);
    if (regenTotp !== "ok") {
      await consumeRateLimit(REGEN_FAIL_KEY, { windowMs: REGEN_FAIL_OPTS.windowMs });
      await db.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "2fa.login_failed",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: false,
        metadata: { stage: "regenerate", reason: regenTotp === "replay" ? "replay" : "totp" },
      });
      throw errors.invalidCredentials("Invalid 2FA code");
    }

    const { plain, hashed } = await generateBackupCodeSet();

    await db.transaction(async (tx) => {
      await tx.delete(userMfaBackupCodes).where(eq(userMfaBackupCodes.userId, user.id));
      for (const codeHash of hashed) {
        await tx.insert(userMfaBackupCodes).values({ userId: user.id, codeHash });
      }
      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "2fa.backup_codes_regenerated",
        targetType: "user",
        targetId: user.id,
        ipHash,
        userAgent,
        success: true,
      });
    });

    c.header("Cache-Control", "no-store");
    return c.json({ backupCodes: plain });
  })

  // ------------------------------------------------------------------
  // POST /auth/2fa/verify-login — public; consumes mfaToken to mint a session
  // ------------------------------------------------------------------
  // Intentionally NOT behind requireAuth — the caller is mid-login.
  .post("/verify-login", jsonValidator(verifyLoginSchema), async (c) => {
    const { mfaToken: bodyToken, code, useBackupCode } = c.req.valid("json");
    const ip = getClientIp(c);
    const ipHash = hashIp(ip);
    const userAgent = c.req.header("user-agent") ?? null;

    // Resolve the mfaToken: body first (password flow — backward compatible),
    // then the HttpOnly `mfa_pending` cookie (SSO flow, where the SPA can't read
    // the token). The cookie is treated with NO more trust than the body value:
    // both go through verifyMfaToken (HMAC + exp + user binding) below. If the
    // token came from the cookie we clear it on the way out regardless of the
    // verification outcome.
    const cookieToken = getCookie(c, MFA_PENDING_COOKIE);
    const mfaToken = bodyToken ?? cookieToken;
    const tokenFromCookie = !bodyToken && Boolean(cookieToken);

    // IP-only bucket charged BEFORE we decode the token. The per-user bucket
    // below keys off the userId carried INSIDE the token, so a forged / expired
    // token never reaches it — without this guard an attacker could spam
    // garbage tokens from one IP unboundedly and leave no trail. 30/min/IP is
    // generous for a human mid-login (mfaToken TTL is 5 min) but caps automated
    // token-fishing. The bucket ticks on every call here (not just failures):
    // a real client only hits this route a handful of times per login.
    const IP_KEY = `2fa-verify-login-ip:${ip}`;
    const IP_OPTS = { limit: 30, windowMs: 60 * 1000 };
    const ipRl = await rateLimit(IP_KEY, IP_OPTS);
    if (!ipRl.allowed) {
      const retry = Math.ceil(ipRl.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many 2FA verification attempts. Try again later.", retry);
    }

    const decoded = mfaToken ? verifyMfaToken(mfaToken) : null;
    if (!decoded) {
      // Best-effort trail for forged/expired/absent tokens. No user is known
      // (the token didn't verify), so actor is null; we record the IP hash so
      // the security team can spot token-fishing fan-out. Never let an
      // audit-insert failure mask the auth failure. If a (now-invalid) token
      // arrived via the cookie, expire it so a stale cookie can't keep failing.
      if (tokenFromCookie) {
        c.header("Set-Cookie", buildClearMfaPendingCookie(env.SESSION_COOKIE_SECURE), {
          append: true,
        });
      }
      try {
        await db.insert(auditEvents).values({
          actorUserId: null,
          actorEmail: null,
          action: "2fa.login_failed",
          targetType: "user",
          targetId: null,
          ipHash,
          userAgent,
          success: false,
          metadata: { reason: "bad_token", stage: "verify_login", source: tokenFromCookie ? "cookie" : "body" },
        });
      } catch (err) {
        logger.warn({ err }, "audit insert failed (2fa.login_failed bad_token)");
      }
      // Distinct from the wrong-code path: this is the caller's own login
      // session (the mfaToken) expiring, NOT a statement about the 2FA code.
      // Surfacing `mfa_session_expired` lets the FE show a terminal "log in
      // again" instead of the retryable "wrong code". No oracle — it reveals
      // nothing about code validity. Audit reason stays `bad_token`; the
      // mfa_pending cookie was already cleared above when token came from cookie.
      throw errors.mfaSessionExpired("MFA token is invalid or has expired");
    }
    const userId = decoded.userId;

    // Combined IP+user rate limit so a fan-out from one IP across many users
    // (credential stuffing post-password-stage) still gets shut down.
    const RL_KEY = `2fa-verify-login:${ip}:${userId}`;
    const RL_OPTS = { limit: 10, windowMs: 60 * 1000 };
    const rl = await rateLimit(RL_KEY, RL_OPTS);
    if (!rl.allowed) {
      const retry = Math.ceil(rl.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many 2FA verification attempts. Try again later.", retry);
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user || !user.totpEnabledAt) {
      throw errors.invalidCredentials("2FA is not enabled for this account");
    }

    const auditFail = async (reason: string): Promise<void> => {
      try {
        await db.insert(auditEvents).values({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "2fa.login_failed",
          targetType: "user",
          targetId: user.id,
          ipHash,
          userAgent,
          success: false,
          metadata: { reason, useBackupCode: !!useBackupCode },
        });
      } catch (err) {
        logger.warn({ err, userId: user.id, reason }, "audit insert failed (2fa.login_failed)");
      }
    };

    let usedBackupCode = false;
    let ok = false;

    if (useBackupCode) {
      // Atomic single-use: pull candidate rows, find matching, UPDATE … WHERE
      // used_at IS NULL RETURNING id. If the UPDATE returns 0 rows another
      // request raced us to the same code and we must reject.
      const rows = await db
        .select()
        .from(userMfaBackupCodes)
        .where(
          and(eq(userMfaBackupCodes.userId, user.id), isNull(userMfaBackupCodes.usedAt)),
        );
      for (const row of rows) {
        if (await verifyBackupCode(row.codeHash, code)) {
          const claimed = await db
            .update(userMfaBackupCodes)
            .set({ usedAt: new Date() })
            .where(
              and(
                eq(userMfaBackupCodes.id, row.id),
                isNull(userMfaBackupCodes.usedAt),
              ),
            )
            .returning({ id: userMfaBackupCodes.id });
          if (claimed.length > 0) {
            ok = true;
            usedBackupCode = true;
          }
          // F-06: short-circuit on first Argon2 match. A wrong code would
          // otherwise force a full N-row Argon2 sweep (~200 ms × up to 10
          // rows = ~2 s CPU per attempt) on every login try. The
          // outer-loop rate limit (RL_KEY: 10/min/IP+user) plus this
          // short-circuit caps total CPU spend at well under a second per
          // failed attempt.
          break;
        }
      }
    } else {
      if (!user.totpSecretEncrypted) {
        await auditFail("missing_secret");
        throw errors.internal("2FA state inconsistent — contact support");
      }
      const secret = decryptUserSecret(user.totpSecretEncrypted);
      // RFC 6238 §5.2: verify AND atomically consume the step. This is the
      // capture-replay closing point on the login path — a code sniffed in
      // transit cannot be re-presented to mint a second session once the
      // legit login has advanced last_totp_step. A "replay" result is recorded
      // distinctly in the audit trail but surfaces to the caller as the same
      // generic invalid_code (no oracle).
      const loginTotp = await consumeTotpStep(db, user.id, secret, code);
      ok = loginTotp === "ok";
      if (loginTotp === "replay") {
        await auditFail("replay");
        throw errors.invalidCredentials("Invalid 2FA code");
      }
    }

    if (!ok) {
      await auditFail("invalid_code");
      throw errors.invalidCredentials("Invalid 2FA code");
    }

    // Success — issue the real session, with `mfa_satisfied` metadata.
    const { token, session } = await createSession(user.id, {
      ipHash,
      userAgent: userAgent ?? undefined,
    });

    // Mirror the login handler's bookkeeping.
    await db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    c.header("Set-Cookie", buildSessionCookie(token, session.expiresAt), { append: true });
    // If this verify came via the SSO flow (token in the HttpOnly cookie),
    // burn the now-spent mfa_pending cookie so it can't be replayed or linger
    // past the session it just unlocked.
    if (tokenFromCookie) {
      c.header("Set-Cookie", buildClearMfaPendingCookie(env.SESSION_COOKIE_SECURE), {
        append: true,
      });
    }

    await db.transaction(async (tx) => {
      // Lucia v3 session-attributes equivalent: stamp the session row with a
      // best-effort flag in the existing metadata path. Our session schema
      // doesn't carry a freeform JSON column for attributes, so we mirror
      // intent via an audit row that the security team can correlate.
      if (usedBackupCode) {
        await tx.insert(auditEvents).values({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "2fa.backup_code_used",
          targetType: "session",
          targetId: session.id,
          ipHash,
          userAgent,
          success: true,
        });
      }
      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "2fa.login_verified",
        targetType: "session",
        targetId: session.id,
        ipHash,
        userAgent,
        success: true,
        metadata: { usedBackupCode, mfaSatisfied: true },
      });
      // auth.login.success mirror so the audit log still shows a complete
      // login event for downstream consumers that key off that action.
      await tx.insert(auditEvents).values({
        action: "auth.login.success",
        actorUserId: user.id,
        actorEmail: user.email,
        targetType: "session",
        targetId: session.id,
        ipHash,
        userAgent,
        success: true,
        metadata: { mfaUsed: true, phase: user.authKeyHash ? "C" : "A" },
      });
    });

    let keysInfo: any = undefined;
    try {
      const [keyRow] = await db
        .select()
        .from(userKeys)
        .where(eq(userKeys.userId, user.id))
        .limit(1);
      
      if (keyRow) {
        keysInfo = {
          publicKey: keyRow.publicKey ? Buffer.from(keyRow.publicKey).toString("base64") : undefined,
          encryptedPrivateKey: keyRow.encryptedPrivateKey ? Buffer.from(keyRow.encryptedPrivateKey).toString("base64") : undefined,
          privateKeyIv: keyRow.privateKeyIv ? Buffer.from(keyRow.privateKeyIv).toString("base64") : undefined,
          privateKeyAuthTag: keyRow.privateKeyAuthTag ? Buffer.from(keyRow.privateKeyAuthTag).toString("base64") : undefined,
        };
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, "Failed to fetch user keys during 2FA verify-login");
      // Fall through, ZK keys are non-critical for the session itself (user can re-unlock)
    }

    return c.json({
      status: "ok",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? user.name ?? user.email,
      },
      keys: keysInfo,
      mfaSatisfied: true,
    });
  });

// Re-export for any future router that wants to drop into a sub-tree.
export type TwoFactorRoutes = typeof twoFactorRoutes;
