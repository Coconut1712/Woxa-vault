import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import {
  SESSION_COOKIE_NAME,
  buildSessionCookie,
  validateSessionToken,
} from "@/lib/session";
import { db } from "@/db/client";
import { auditEvents, users, type Session, type User } from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { logger } from "@/lib/logger";
import { resolveActiveOrg, type OrgRole } from "@/lib/orgAccess";
import { userRequiresTwoFactorEnroll } from "@/lib/orgPolicy";

export type AuthVariables = {
  user: User | null;
  sessionToken: string | null;
  // WARN-I (Phase A.5): the live session row is exposed so the
  // `requireVaultUnlocked` middleware can read `vault_unlocked_at` without
  // re-hashing the token + fetching the row again. Null when the request has
  // no valid session.
  session: Session | null;
};

// WARN-I: idle window between successful unlock and the next forced re-verify.
// 15 minutes mirrors the frontend's auto-lock timer (AC-055.8 + DESIGN.md §15).
// Centralised here so future env-driven tuning lives in one place.
export const VAULT_UNLOCK_IDLE_MS = 15 * 60 * 1000;

// Reads the session cookie and populates `c.var.user` / `c.var.sessionToken`.
// Does NOT enforce authentication — use `requireAuth` for that.
export const sessionMiddleware: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next,
) => {
  const token = getCookie(c, SESSION_COOKIE_NAME) ?? null;
  if (!token) {
    c.set("user", null);
    c.set("sessionToken", null);
    c.set("session", null);
    return next();
  }

  const validated = await validateSessionToken(token);
  if (!validated) {
    c.set("user", null);
    c.set("sessionToken", null);
    c.set("session", null);
    return next();
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, validated.session.userId) });
  c.set("user", user ?? null);
  c.set("sessionToken", token);
  c.set("session", validated.session);

  // If sliding-window extended expiry, push refreshed cookie to client.
  if (validated.fresh) {
    c.header("Set-Cookie", buildSessionCookie(token, validated.session.expiresAt), {
      append: true,
    });
  }

  return next();
};

export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: { code: "unauthorized", message: "Authentication required" } }, 401);
  }
  return next();
};

// ---------------------------------------------------------------------------
// requireVaultUnlocked — WARN-I (Phase A.5 server-side vault lock)
// ---------------------------------------------------------------------------
//
// Threat model:
//   Asset: plaintext output of sensitive item-read endpoints (item secrets,
//     attachment bytes, send creation which dereferences plaintext to encrypt
//     it). Pre-A.5 these were guarded only by the frontend lock screen, so a
//     session-thief could bypass the lock by hitting the JSON API directly.
//   Adversary: cookie-only attacker (XSS exfiltration, replayed log capture).
//     They have a valid session but they DO NOT know the master password.
//   Mitigation: require `vault_unlocked_at` (per-session, set only on
//     successful master-password verification) to fall within
//     `VAULT_UNLOCK_IDLE_MS` of now. Past that window we 401 `vault_locked`
//     and force a fresh /me/verify-password call.
//
// Design choices:
//   * Per-session column (not per-user) so unlocking on device A does NOT
//     unlock device B. Each session bearer must prove the password.
//   * The middleware does NOT extend the window on activity. Phase A.5 keeps
//     the frontend as the canonical idle-detector — backend just enforces the
//     same window so a stolen cookie can't read past it.
//   * Apply ONLY to endpoints that return decrypted plaintext (reveal,
//     download, send-create). Metadata-list endpoints are NOT gated, so the
//     locked UI can still navigate vaults/folders/items by name.
//   * MUST be mounted AFTER `requireAuth` — relies on `c.var.session` being
//     populated.
//   * Audit: tripped checks are intentionally NOT audited per-request to
//     avoid log floods when a frontend hammers a now-locked vault. The
//     legitimate unlock and revoke paths already write audit rows; a missing
//     verify-password is observable from the rate limiter.
export const requireVaultUnlocked: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next,
) => {
  const session = c.get("session");
  if (!session) {
    // Defensive — requireAuth should have already rejected this. Keep the
    // branch so a misordered router never silently lets a no-session caller
    // reach a sensitive handler.
    throw errors.unauthorized();
  }

  const unlockedAt = session.vaultUnlockedAt;
  const stillFresh =
    unlockedAt !== null && Date.now() - unlockedAt.getTime() <= VAULT_UNLOCK_IDLE_MS;
  if (!stillFresh) {
    // Low-priority audit only when a USER is identified. The frontend will
    // typically swallow a single vault_locked response and prompt for the
    // password, so we log at debug level too.
    const user = c.get("user");
    if (user) {
      // Best-effort — if the audit write itself fails the gate is what
      // matters; we still 401.
      try {
        await db.insert(auditEvents).values({
          actorUserId: user.id,
          actorEmail: user.email,
          action: "vault.access_denied_locked",
          targetType: "session",
          targetId: session.id,
          ipHash: hashIp(getClientIp(c)),
          userAgent: c.req.header("user-agent") ?? null,
          success: false,
          metadata: {
            phase: "A",
            unlockedAt: unlockedAt ? unlockedAt.toISOString() : null,
            idleMs: VAULT_UNLOCK_IDLE_MS,
          },
        });
      } catch (err) {
        logger.warn({ err }, "audit insert failed for vault.access_denied_locked");
      }
    }
    throw errors.vaultLocked();
  }
  return next();
};

// ---------------------------------------------------------------------------
// requireTwoFactorEnrolled — workspace "Require 2FA" policy enforcement.
// ---------------------------------------------------------------------------
//
// Threat model:
//   Asset: secret-bearing API surface (vaults / items / sends / folders /
//     attachments). When an org turns on the `require2fa` security policy, a
//     member who has not enrolled 2FA must be unable to read or write secrets
//     until they enroll — for INVITED-NEW and EXISTING members alike.
//   Adversary: a member who simply ignores the frontend's forced-enrollment
//     gate and calls the JSON APIs directly (curl / extension / stale SPA).
//     Frontend gating alone is not a security boundary — the data layer is.
//   Mitigation: this middleware blocks the gated routers with
//     403 `two_factor_required` whenever `userRequiresTwoFactorEnroll` is true
//     (no verified TOTP AND at least one membership org has require2fa on).
//
// Design choices / lockout avoidance:
//   * Applied ONLY to secret-bearing routers, never to the routes the user
//     needs to REMEDY: POST /auth/2fa/enroll, POST /auth/2fa/verify-enroll,
//     GET /me, /me/workspaces, GET /workspace/settings, and logout all live on
//     routers this guard is NOT mounted on — so a gated user can always finish
//     enrollment. Misordering that mounts this on those routers would lock the
//     user out; the test suite pins enroll/me reachability.
//   * MUST be mounted AFTER requireAuth — relies on c.var.user.
//   * Account-level (one enrollment satisfies every workspace) — see
//     userRequiresTwoFactorEnroll in lib/orgPolicy.ts.
//   * Not audited per-request: a frontend that ignores the gate could spam
//     this and flood the audit log. The policy CHANGE is audited at PATCH
//     time; the block itself is a stateless deterministic check.
export const requireTwoFactorEnrolled: MiddlewareHandler<{
  Variables: AuthVariables;
}> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    // Defensive — requireAuth must run first.
    throw errors.unauthorized();
  }
  if (await userRequiresTwoFactorEnroll(user.id)) {
    throw errors.twoFactorRequired();
  }
  return next();
};

// ---------------------------------------------------------------------------
// blockGuestWrites — org-level READ-ONLY enforcement for the `guest` role.
// ---------------------------------------------------------------------------
//
// Threat model:
//   Asset: every mutating secret-bearing endpoint — create/edit/delete of
//     vaults, items, folders and attachments; one-time send create/burn; and
//     vault-membership (share) changes.
//   Policy (owner directive 2026-05-21): a `guest` org member is READ-ONLY.
//     They may list / read / reveal / copy items in the vaults explicitly
//     shared with them (via vault membership), but may NOT create, edit,
//     delete or share anything — REGARDLESS of the vault role they were
//     granted. So even a guest added to a vault as `manager` cannot mutate.
//   Adversary: a guest who ignores the read-only UI and calls the JSON API
//     directly (curl / extension / stale SPA). Frontend hiding is not a
//     security boundary — this server gate is.
//
// Design choices:
//   * Method-scoped: GET/HEAD/OPTIONS pass through untouched so reveals,
//     downloads and metadata lists keep working. Every other verb
//     (POST/PATCH/PUT/DELETE) is checked.
//   * The role comes from `activeOrgForContext` (re-validated per request by
//     resolveActiveOrg — never a cached/session value), so a guest is judged
//     by their role in the ACTIVE workspace and higher roles elsewhere don't
//     leak across.
//   * No identified user (anonymous) → pass through; the router's `requireAuth`
//     returns 401 first. We only short-circuit a confirmed guest.
//   * MUST be mounted AFTER `requireAuth` in the router chain.
export const blockGuestWrites: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next,
) => {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }
  const user = c.get("user");
  if (!user) return next(); // requireAuth handles the 401 for anonymous callers
  const current = await activeOrgForContext(c);
  if (current?.role === "guest") {
    throw errors.forbidden("Guests have read-only access and cannot modify vault data");
  }
  return next();
};

// ---------------------------------------------------------------------------
// activeOrgForContext — resolve the request's active workspace (finding M-1).
//
// The single seam every org-scoped handler uses instead of the old
// `currentOrgForUser(user.id)`. It reads the active-org pointer off the live
// session row (already loaded by `sessionMiddleware`, so no extra session
// fetch) and hands it to `resolveActiveOrg`, which RE-VALIDATES the caller's
// membership and derives the role from the active org — never trusting the
// pointer blindly (IDOR / stale / privilege-escalation defence; see
// resolveActiveOrg's threat model).
//
// Returns null exactly when the caller has no membership at all (fresh signup
// pre-creation) — handlers map that to their existing 404 "no workspace".
// MUST be called only on routes behind `requireAuth` (relies on c.var.user).
export async function activeOrgForContext(
  c: Context<{ Variables: AuthVariables }>,
): Promise<{ orgId: string; role: OrgRole } | null> {
  const user = c.get("user");
  if (!user) return null;
  const session = c.get("session");
  return resolveActiveOrg({ userId: user.id, sessionActiveOrgId: session?.activeOrgId ?? null });
}
