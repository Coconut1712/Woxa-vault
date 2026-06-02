import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { auditEvents, users } from "@/db/schema";
import { errors } from "@/lib/errors";
import { getClientIp } from "@/lib/clientIp";
import { hashIp } from "@/lib/ipHash";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rateLimit";
import { buildSessionCookie, createSession } from "@/lib/session";
import { buildMfaPendingCookie, signMfaToken } from "@/lib/mfa";
import { ssoDomainAllowed, ssoJitAllowed } from "@/lib/orgPolicy";
import type { AuthVariables } from "@/middleware/auth";

// ---------------------------------------------------------------------------
// Google Workspace SSO (REQUIREMENTS §4.1 US-001 / AC-001.x).
//
// Threat model:
//   - Asset: user identity + session issuance via Google IdP.
//   - Adversaries:
//     1) Phishing / open-redirect — attacker crafts `next` to bounce the
//        user to an attacker-controlled URL post-login.
//     2) Workspace-impersonation — attacker uses a personal gmail account
//        when the workspace requires `@iux24.com`.
//     3) State / CSRF — attacker forces a victim through their own OAuth
//        flow to bind the victim's session to the attacker's identity.
//     4) Email-spoofing — attacker controls a domain matching `hd` but the
//        Google account itself is unverified.
//   - Mitigations:
//     1) `next` validation: must start with `/`, must NOT start with `//`,
//        no scheme/host, length ≤ 256. Anything else → "/app".
//     2) Domain check happens twice: `hd` param to Google (UI-level), AND a
//        post-callback verification that both the `hd` claim AND the email
//        domain are in the allow-list. `hd` alone is not trusted.
//     3) Random `state` (32 hex chars) stored in HttpOnly cookie + sent to
//        Google; callback verifies both match.
//     4) Require `email_verified=true` on the userinfo claim.
//   - Residual risk:
//     * Compromised Google session can issue valid tokens — outside our
//       trust boundary (this is the *point* of federated identity).
//     * `hd` claim can be missing on personal Google accounts; treated as
//       a verification failure when allow-list is non-empty.
// ---------------------------------------------------------------------------

const STATE_COOKIE = "woxa_oauth_state";
const STATE_COOKIE_MAX_AGE = 600; // 10 minutes
const SSO_RATE_LIMIT_LIMIT = 10;
const SSO_RATE_LIMIT_WINDOW_MS = 60_000;

const NEXT_RE = /^\/(?!\/)[A-Za-z0-9_\-./~?&=#%@:+,]*$/;
function sanitizeNext(input: string | undefined): string {
  if (!input) return "/app";
  if (input.length > 256) return "/app";
  if (!NEXT_RE.test(input)) return "/app";
  return input;
}

function isSsoConfigured(): boolean {
  return Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

function buildStateCookie(value: string, sameSite: "Lax" = "Lax"): string {
  const attrs = [
    `${STATE_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${STATE_COOKIE_MAX_AGE}`,
  ];
  if (env.SESSION_COOKIE_SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

function clearStateCookie(): string {
  const attrs = [
    `${STATE_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (env.SESSION_COOKIE_SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

function redirectToWebError(code: string): string {
  return `${env.WEB_BASE_URL}/?error=${encodeURIComponent(code)}`;
}

function redirectToWebPath(next: string): string {
  return `${env.WEB_BASE_URL}${next}`;
}

// State cookie payload = `<state>:<base64url(next)>`. Single cookie avoids
// having to maintain a server-side OAuth state store for Phase A.
function encodeStateCookie(state: string, next: string): string {
  return `${state}:${Buffer.from(next, "utf8").toString("base64url")}`;
}
function decodeStateCookie(raw: string): { state: string; next: string } | null {
  const idx = raw.indexOf(":");
  if (idx <= 0) return null;
  const state = raw.slice(0, idx);
  const nextEncoded = raw.slice(idx + 1);
  try {
    const next = Buffer.from(nextEncoded, "base64url").toString("utf8");
    return { state, next: sanitizeNext(next) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const ssoRoutes = new Hono<{ Variables: AuthVariables }>()

  .get("/google/start", async (c) => {
    if (!isSsoConfigured()) {
      throw errors.internal("Google SSO is not configured on this server");
    }

    // Per-IP rate limit so an automated attacker can't spam the start URL
    // and exhaust outbound Google quota.
    const ip = getClientIp(c);
    const limit = await rateLimit(`sso:start:${ip}`, {
      limit: SSO_RATE_LIMIT_LIMIT,
      windowMs: SSO_RATE_LIMIT_WINDOW_MS,
    });
    if (!limit.allowed) {
      const retry = Math.ceil(limit.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many SSO start attempts", retry);
    }

    const emailHint = c.req.query("email");
    const next = sanitizeNext(c.req.query("next"));
    const state = randomBytes(16).toString("hex");
    const nonce = randomBytes(16).toString("hex");

    const params = new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI!,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      access_type: "online",
      prompt: "select_account",
    });
    if (emailHint) params.set("login_hint", emailHint);
    if (env.GOOGLE_OAUTH_ALLOWED_DOMAIN.length > 0) {
      params.set("hd", env.GOOGLE_OAUTH_ALLOWED_DOMAIN[0]!);
    }

    c.header("Set-Cookie", buildStateCookie(encodeStateCookie(state, next)), {
      append: true,
    });
    const target = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return c.redirect(target, 302);
  })

  .get("/google/callback", async (c) => {
    // Always clear the state cookie on the way out, success or failure.
    const finish = (location: string) => {
      c.header("Set-Cookie", clearStateCookie(), { append: true });
      return c.redirect(location, 302);
    };

    if (!isSsoConfigured()) {
      logger.error("SSO callback hit but Google OAuth is not configured");
      return finish(redirectToWebError("sso_internal_error"));
    }

    const error = c.req.query("error");
    if (error) {
      logger.warn({ error }, "Google returned an OAuth error to our callback");
      return finish(redirectToWebError("sso_provider_error"));
    }

    const code = c.req.query("code");
    const stateQuery = c.req.query("state");
    if (!code || !stateQuery) {
      return finish(redirectToWebError("sso_state_mismatch"));
    }

    const stateCookieRaw = getCookie(c, STATE_COOKIE);
    if (!stateCookieRaw) return finish(redirectToWebError("sso_state_mismatch"));
    const decoded = decodeStateCookie(stateCookieRaw);
    if (!decoded || decoded.state !== stateQuery) {
      return finish(redirectToWebError("sso_state_mismatch"));
    }

    try {
      // 1) Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
          client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
          redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI!,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) {
        const detail = await tokenRes.text();
        logger.warn({ status: tokenRes.status, detail }, "Google token exchange failed");
        return finish(redirectToWebError("sso_provider_error"));
      }
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenJson.access_token) {
        return finish(redirectToWebError("sso_provider_error"));
      }

      // 2) Fetch userinfo
      const userRes = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { Authorization: `Bearer ${tokenJson.access_token}` } },
      );
      if (!userRes.ok) {
        logger.warn({ status: userRes.status }, "Google userinfo fetch failed");
        return finish(redirectToWebError("sso_provider_error"));
      }
      const profile = (await userRes.json()) as {
        sub: string;
        email: string;
        email_verified?: boolean;
        name?: string;
        hd?: string;
        picture?: string;
      };

      if (!profile.email_verified) {
        return finish(redirectToWebError("sso_email_unverified"));
      }

      const email = profile.email.toLowerCase();
      const emailDomain = email.split("@")[1] ?? "";

      // Gate 1 — ENV allow-list (server-wide, deployment-level). Unchanged.
      // Empty = no env restriction (dev). When set, both the `hd` claim AND the
      // email domain must be listed (hd alone is not trusted — see threat model).
      const allowList = env.GOOGLE_OAUTH_ALLOWED_DOMAIN;
      if (allowList.length === 0) {
        logger.warn(
          { email },
          "GOOGLE_OAUTH_ALLOWED_DOMAIN is empty — env-level domain check disabled (dev mode)",
        );
      } else {
        const hdOk = profile.hd ? allowList.includes(profile.hd.toLowerCase()) : false;
        const domainOk = allowList.includes(emailDomain);
        if (!hdOk || !domainOk) {
          await db.insert(auditEvents).values({
            action: "auth.sso.login.failed",
            actorEmail: email,
            ipHash: hashIp(getClientIp(c)),
            userAgent: c.req.header("user-agent") ?? null,
            success: false,
            metadata: {
              reason: "domain_forbidden",
              gate: "env",
              hd: profile.hd ?? null,
              emailDomain,
            },
          });
          return finish(redirectToWebError("sso_domain_forbidden"));
        }
      }

      // Gate 2 — STORED ORG POLICY allow-list (`sso.allowedDomains`). This is
      // what makes the per-workspace SSO config actually enforce. If ANY live
      // org pins a non-empty allowedDomains list, the signing-in domain must
      // appear in at least one such list (an org with no list imposes no
      // restriction). See ssoDomainAllowed for the cross-org rationale — the
      // SSO callback predates membership for new users, so there is no single
      // org to consult; we enforce the union of stored policies by domain.
      if (!(await ssoDomainAllowed(emailDomain))) {
        await db.insert(auditEvents).values({
          action: "auth.sso.login.failed",
          actorEmail: email,
          ipHash: hashIp(getClientIp(c)),
          userAgent: c.req.header("user-agent") ?? null,
          success: false,
          metadata: {
            reason: "domain_forbidden",
            gate: "org_policy",
            emailDomain,
          },
        });
        return finish(redirectToWebError("sso_domain_forbidden"));
      }

      // 3) Resolve / JIT-provision the user.
      type SsoResolveResult =
        | { blocked: true }
        | { blocked: false; user: typeof users.$inferSelect; jit: boolean };
      const result: SsoResolveResult = await db.transaction(async (tx) => {
        // Prefer match by sso_subject for stable identity across email rename.
        let existing = await tx.query.users.findFirst({
          where: eq(users.ssoSubject, profile.sub),
        });
        if (!existing) {
          // `email` is already lowercased above; use the index-aligned
          // expression so a historical mixed-case row still matches.
          existing = await tx.query.users.findFirst({
            where: sql`lower(${users.email}) = ${email}`,
          });
        }
        if (existing) {
          const updates: Partial<typeof users.$inferInsert> = {};
          if (!existing.ssoSubject) updates.ssoSubject = profile.sub;
          if (!existing.displayName && profile.name) updates.displayName = profile.name;
          if (!existing.emailVerifiedAt) updates.emailVerifiedAt = new Date();
          updates.lastLoginAt = new Date();
          if (Object.keys(updates).length > 0) {
            await tx.update(users).set(updates).where(eq(users.id, existing.id));
          }
          return { blocked: false, user: { ...existing, ...updates }, jit: false };
        }

        // JIT GATE (stored policy `sso.jitEnabled`). A brand-new SSO user from a
        // domain whose claiming org(s) ALL have jitEnabled=false must NOT be
        // auto-provisioned — the admin has to invite them first. We re-check the
        // policy INSIDE the transaction (just before the insert) so a concurrent
        // policy flip can't slip a user through. When no org claims the domain
        // there is no binding to gate against → JIT defaults on (prior behavior).
        if (!(await ssoJitAllowed(emailDomain))) {
          return { blocked: true };
        }

        // JIT provision the USER row. Single-Owner onboarding (DESIGN.md §4.1):
        // we provision ONLY the user — NEVER an org membership.
        //
        // HIGH#2 (cross-tenant auto-join): the previous behaviour auto-joined a
        // new SSO user to whatever org had `slug === emailDomain.split('.')[0]`.
        // But `slug` is derived from the workspace NAME at creation time
        // (`slugifyBase(name)`), so it is an ATTACKER-INFLUENCEABLE string, not
        // a verified domain mapping. Any allow-listed user could pre-register a
        // workspace whose slug matched a target domain's first label and then
        // silently capture every future SSO sign-in from that domain as a
        // `member` of the attacker's org. The join key must be a verified
        // domain→org binding, which we do not have yet.
        //
        // Phase A fix: no slug-based auto-join. A brand-new SSO user always
        // lands ORG-LESS. `GET /me` returns `hasWorkspace: false`, the frontend
        // routes them to `/spaces`, and the ONLY ways into a workspace are:
        //   * create one (becoming Owner), or
        //   * accept an explicit invitation (the trusted join path).
        //
        // FOLLOW-UP (AC-006.2): a real `org_domains` verified-domain mapping
        // table would let admins opt a domain into JIT auto-join safely. Out of
        // scope for this round — see API_CONTRACT / DESIGN notes.
        const [newUser] = await tx
          .insert(users)
          .values({
            email,
            displayName: profile.name ?? null,
            name: profile.name ?? null,
            emailVerifiedAt: new Date(),
            ssoSubject: profile.sub,
            status: "active",
            lastLoginAt: new Date(),
          })
          .returning();
        if (!newUser) throw new Error("failed to create user during JIT");

        return { blocked: false, user: newUser, jit: true };
      });

      // JIT was disabled for this domain's workspace(s) — refuse the new-user
      // provisioning and route the browser to a clear error. Audit the rejection
      // (org-less; we have no membership for this user). The admin must invite.
      if (result.blocked) {
        await db.insert(auditEvents).values({
          action: "auth.sso.login.failed",
          actorEmail: email,
          ipHash: hashIp(getClientIp(c)),
          userAgent: c.req.header("user-agent") ?? null,
          success: false,
          metadata: { reason: "jit_disabled", emailDomain },
        });
        return finish(redirectToWebError("sso_jit_disabled"));
      }

      const ipHash = hashIp(getClientIp(c));

      // 3.5) app-level 2FA gate (REQUIREMENTS AC-003.5). SSO must clear the
      // SAME second factor as password login — Google proving the first factor
      // does NOT exempt the user from TOTP. If the resolved user has TOTP
      // enabled we issue NO full session here; instead we hand a short-lived
      // mfaToken to the standalone /login/mfa challenge page via an HttpOnly
      // cookie (never the URL — see lib/mfa.ts buildMfaPendingCookie threat
      // model). The session cookie is only minted by /auth/2fa/verify-login
      // once the OTP/backup code verifies. A brand-new JIT user has
      // totpEnabledAt === null and falls through to the normal session path.
      if (result.user.totpEnabledAt) {
        const mfaToken = signMfaToken(result.user.id);

        await db.insert(auditEvents).values({
          actorUserId: result.user.id,
          actorEmail: email,
          action: "auth.login.mfa_required",
          ipHash,
          userAgent: c.req.header("user-agent") ?? null,
          success: true,
          metadata: { provider: "google", sub: profile.sub, channel: "sso" },
        });

        // Clear the OAuth state cookie + set the mfa_pending cookie. NO session
        // cookie is set on this path. `next` is already sanitized; we forward it
        // (token-free) so /login/mfa can route the user onward after verify.
        c.header("Set-Cookie", clearStateCookie(), { append: true });
        c.header("Set-Cookie", buildMfaPendingCookie(mfaToken, env.SESSION_COOKIE_SECURE), {
          append: true,
        });
        const mfaTarget =
          decoded.next && decoded.next !== "/app"
            ? `/login/mfa?next=${encodeURIComponent(decoded.next)}`
            : "/login/mfa";
        return c.redirect(redirectToWebPath(mfaTarget), 302);
      }

      // 4) Issue session
      const { token, session } = await createSession(result.user.id, {
        ipHash,
        userAgent: c.req.header("user-agent") ?? undefined,
        deviceName: "Google SSO",
      });

      await db.insert(auditEvents).values({
        actorUserId: result.user.id,
        actorEmail: email,
        action: result.jit ? "auth.sso.jit_provisioned" : "auth.sso.login.success",
        targetType: "session",
        targetId: session.id,
        ipHash,
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { provider: "google", sub: profile.sub },
      });

      c.header("Set-Cookie", clearStateCookie(), { append: true });
      c.header("Set-Cookie", buildSessionCookie(token, session.expiresAt), { append: true });

      // If this account has no master password yet (JIT user, or a legacy SSO
      // user who never set one), force them through /setup-password before the
      // app. We carry the original `next` along so they land where they meant
      // to go after setup completes. The frontend SessionGuard still enforces
      // this on every request, but redirecting here closes the race window
      // where the user could hit /app before the guard mounts.
      const needsSetup = !result.user.passwordHash;
      const target = needsSetup
        ? `/setup-password${
            decoded.next && decoded.next !== "/app"
              ? `?next=${encodeURIComponent(decoded.next)}`
              : ""
          }`
        : decoded.next;
      return c.redirect(redirectToWebPath(target), 302);
    } catch (err) {
      logger.error({ err }, "SSO callback unhandled error");
      return finish(redirectToWebError("sso_internal_error"));
    }
  });

export type SsoRoutes = typeof ssoRoutes;
