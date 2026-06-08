import { Hono } from "hono";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { auditEvents, invitations, organizations, orgMembers, users } from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp, maskIp, clientIpAuditFields } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { logger } from "@/lib/logger";
import type { OrgRole } from "@/lib/orgAccess";
import { hashPassword } from "@/lib/password";
import { generateKdfSalt } from "@/lib/kdfSalt";
import { rateLimit } from "@/lib/rateLimit";
import { buildSessionCookie, createSession } from "@/lib/session";
import { jsonValidator, paramValidator } from "@/lib/validator";
import { requireAuth, sessionMiddleware, type AuthVariables } from "@/middleware/auth";

// ---------------------------------------------------------------------------
// Threat model — invitation acceptance
//
// Assets: org_members rows (grant access to org vaults). Pending invitations
//   carry a server-secret token that anyone holding the URL can present.
// Adversaries:
//   * Random URL guesser — defeated by 24-byte (~192-bit) base32 token.
//   * Authenticated attacker who phished an invite URL but has a different
//     email — defeated by case-insensitive email match between session user
//     and invitation row (403 invitation_email_mismatch).
//   * Replay after accept/revoke/expiry — defeated by status check on every
//     lookup (token_hash is unique but status gates correctness).
//   * Token exfiltration from DB — DB only stores SHA-256(token). Raw token
//     lives only in the recipient's URL/email.
// Mitigations:
//   * Hash lookup by SHA-256(token) — constant-time DB lookup, no plain token.
//   * Public GET preview is intentionally read-only and reveals only fields
//     the recipient already controls (their own email) plus org name and
//     inviter name (audit trail content).
//   * Accept flow runs inside a single transaction — invite status flip and
//     org_members insert are atomic so a crash can never leave a half-claimed
//     invite that still appears pending.
// Residual risk:
//   * The acceptUrl is currently logged at info level in dev (Phase A — see
//     members.ts comment). Phase B will move this to Resend + redact.
//   * `GET /invite/:token` leaks org name to anyone holding the token. By
//     design — recipients need to know which org they're joining before they
//     accept. Token is the auth boundary here.
// ---------------------------------------------------------------------------

// Token format: base32 lowercase, no padding. Generation uses 24 bytes →
// 39-char string. We accept 24..48 chars to leave room for future widening
// without breaking older outstanding invites.
const tokenParam = z.object({
  token: z
    .string()
    .min(8) // upper bound on guessability; bare minimum sanity floor
    .max(64)
    .regex(/^[a-z0-9]+$/, "Invalid invitation token format"),
});

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isExpired(row: { expiresAt: Date }): boolean {
  return row.expiresAt.getTime() <= Date.now();
}

// Public preview endpoints (`GET /invite/:token`) must be reachable without a
// session, but we still want `sessionMiddleware` populated for the accept path.
// The router below mounts at `/invite` and applies `requireAuth` only on the
// POST handler — the GET handler runs unauthenticated by design.
export const invitationRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", sessionMiddleware)

  // ------------------------------------------------------------------
  // GET /invite/:token — public preview
  // ------------------------------------------------------------------
  .get("/:token", paramValidator(tokenParam), async (c) => {
    const { token } = c.req.valid("param");
    const tokenHash = hashInviteToken(token);

    const rows = await db
      .select({
        id: invitations.id,
        orgId: invitations.orgId,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        invitedBy: invitations.invitedBy,
        orgName: organizations.name,
        inviterName: users.displayName,
        inviterFallbackName: users.name,
        inviterEmail: users.email,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.orgId))
      .leftJoin(users, eq(users.id, invitations.invitedBy))
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);

    const row = rows[0];
    if (!row) throw errors.notFound("Invitation not found");

    if (row.revokedAt) {
      return c.json(
        { error: { code: "invitation_revoked", message: "Invitation has been revoked" } },
        410,
      );
    }
    if (row.acceptedAt) {
      return c.json(
        {
          error: {
            code: "invitation_already_accepted",
            message: "Invitation has already been accepted",
          },
        },
        409,
      );
    }
    if (isExpired(row)) {
      return c.json(
        { error: { code: "invitation_expired", message: "Invitation has expired" } },
        410,
      );
    }

    // Existence check so the frontend can decide between "sign in to accept"
    // (existing account) and "set a password and join" (new user signup).
    // Token possession is the auth boundary here — the recipient already
    // knows which email was invited (they see it on this same page), so
    // leaking userExists conditioned on a valid invite token is acceptable.
    const userMatch = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${row.email.toLowerCase()}`)
      .limit(1);
    const userExists = userMatch.length > 0;

    return c.json({
      invitation: {
        email: row.email,
        role: row.role as OrgRole,
        orgName: row.orgName,
        invitedByName:
          row.inviterName ?? row.inviterFallbackName ?? row.inviterEmail ?? null,
        expiresAt: row.expiresAt.toISOString(),
        userExists,
      },
    });
  })

  // ------------------------------------------------------------------
  // POST /invite/:token/accept — finalize membership
  // ------------------------------------------------------------------
  .post("/:token/accept", paramValidator(tokenParam), requireAuth, async (c) => {
    const user = c.get("user")!;
    const { token } = c.req.valid("param");
    const tokenHash = hashInviteToken(token);

    // F-03: rate limit per (IP, token-hash) before any DB lookup. Mirrors
    // the cap on /signup-and-accept so a scripted attacker can't probe many
    // tokens (or many sessions against one token) cheaply. We cap on the
    // server-stored hash, not the raw token, so logs can't be used to
    // replay the bucket key — and we charge the bucket on every call,
    // including success, which is fine because legitimate users only ever
    // hit this endpoint once per invitation.
    const ip = getClientIp(c);
    const acceptLimit = await rateLimit(`invite-accept:${ip}:${tokenHash}`, {
      limit: 10,
      windowMs: 60 * 1000,
    });
    if (!acceptLimit.allowed) {
      const retry = Math.ceil(acceptLimit.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many invitation accept attempts. Please try again later.", retry);
    }

    const row = await db.query.invitations.findFirst({
      where: eq(invitations.tokenHash, tokenHash),
    });
    if (!row) throw errors.notFound("Invitation not found");

    if (row.revokedAt) {
      return c.json(
        { error: { code: "invitation_revoked", message: "Invitation has been revoked" } },
        410,
      );
    }
    if (row.acceptedAt) {
      return c.json(
        {
          error: {
            code: "invitation_already_accepted",
            message: "Invitation has already been accepted",
          },
        },
        409,
      );
    }
    if (isExpired(row)) {
      return c.json(
        { error: { code: "invitation_expired", message: "Invitation has expired" } },
        410,
      );
    }

    // Email match — case-insensitive. Invitation emails are stored lowercased
    // by `members.ts` (Zod `.toLowerCase()`) but defense in depth here in case
    // a future code path inserts a row without normalizing.
    if (row.email.toLowerCase() !== user.email.toLowerCase()) {
      return c.json(
        {
          error: {
            code: "invitation_email_mismatch",
            message: "This invitation was sent to a different email address",
          },
        },
        403,
      );
    }

    // If the caller is already a member of the target org, mark the invitation
    // accepted (idempotent close-out) but DO NOT touch the existing role —
    // promoting via an invite would silently override an explicit admin
    // demotion. We surface a 409 so the UI can show "you're already in this
    // workspace" instead of pretending the role changed.
    const existing = await db
      .select({ orgId: orgMembers.orgId, role: orgMembers.role, joinedAt: orgMembers.joinedAt })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, row.orgId), eq(orgMembers.userId, user.id)))
      .limit(1);

    if (existing[0]) {
      // Close out the invitation row so it stops appearing as pending.
      await db.transaction(async (tx) => {
        await tx
          .update(invitations)
          .set({ acceptedAt: new Date() })
          .where(eq(invitations.id, row.id));
        await tx.insert(auditEvents).values({
          orgId: row.orgId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: "member.invitation_accepted",
          targetType: "invitation",
          targetId: row.id,
          targetName: row.email,
          ...clientIpAuditFields(c),
          userAgent: c.req.header("user-agent") ?? null,
          success: true,
          metadata: { role: row.role, alreadyMember: true, existingRole: existing[0]!.role },
        });
      });
      return c.json(
        { error: { code: "already_member", message: "You are already a member of this workspace" } },
        409,
      );
    }

    // Happy path — insert the membership and flip the invitation status in
    // one transaction. Audit row goes in the same transaction so a partial
    // commit can never leave the system claiming the invite was accepted
    // without a matching member row.
    const joinedAt = await db.transaction(async (tx) => {
      const [member] = await tx
        .insert(orgMembers)
        .values({
          orgId: row.orgId,
          userId: user.id,
          role: row.role,
        })
        .returning({ joinedAt: orgMembers.joinedAt });

      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, row.id));

      await tx.insert(auditEvents).values({
        orgId: row.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "member.invitation_accepted",
        targetType: "invitation",
        targetId: row.id,
        targetName: row.email,
        ...clientIpAuditFields(c),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { role: row.role },
      });

      return member!.joinedAt;
    });

    return c.json({
      membership: {
        orgId: row.orgId,
        role: row.role as OrgRole,
        joinedAt: joinedAt.toISOString(),
      },
    });
  })

  // ------------------------------------------------------------------
  // POST /invite/:token/signup-and-accept — public; creates a new user
  // ------------------------------------------------------------------
  //
  // Threat model — signup via invitation
  // Assets: ability to mint a new `users` row + an `org_members` row in one
  //   shot. Without an invite token this would be open self-signup, which
  //   Phase A explicitly does NOT support.
  // Adversaries:
  //   * Random URL guesser — same defense as accept (24-byte token, hashed).
  //   * Brute-forcer trying many tokens — rate-limited per IP+token below
  //     (5/min) so a leaked token can't be guessed-around its hash space.
  //   * Account take-over via signup race when the invited email already
  //     has a user: we return 409 `user_exists` and never touch the row.
  // Mitigations:
  //   * Same token validation + status checks as accept (revoked/expired/
  //     already-accepted).
  //   * Single transaction: insert user + insert org_members + flip
  //     invitation status — partial commit can't leave a half-claimed invite.
  //   * Two-password model: the password chosen here is the LOGIN password and
  //     is stored in `login_password_hash` (the only field /auth/login reads).
  //     The MASTER password (`password_hash`) is left NULL — the user sets it
  //     later at /me/password/setup, which is where the recovery kit (bound to
  //     master) is minted. This closes the lockout where an invite-signup user
  //     held a master hash but no login hash and could never sign back in.
  //   * Password hashed with the same Argon2id parameters used by /auth/login.
  //   * Session is created server-side (Lucia v3 pattern) and returned via
  //     Set-Cookie — caller is logged in immediately; GET /me then reports
  //     requiresPasswordSetup=true so the frontend routes to /setup-password.
  //   * `email_verified_at` is set: holding the invite token proves control of
  //     the invited mailbox, so the email is verified by construction.
  // Residual risk: timing leak on userExists is acceptable because the
  //   recipient already knows their own email; token possession is the auth
  //   boundary, not email secrecy.
  .post(
    "/:token/signup-and-accept",
    paramValidator(tokenParam),
    jsonValidator(
      z.object({
        // Password policy: ≥10 chars (matches Phase A seed strength), upper
        // bound at 1024 to align with /auth/login. Stronger policy lives at
        // the frontend layer (mixed case, digit, symbol) but the backend
        // enforces a length floor + non-empty trim to defend the DB+hash
        // path against trivial inputs.
        password: z.string().min(10).max(1024),
        displayName: z.string().trim().min(1).max(120).optional(),
      }),
    ),
    async (c) => {
      const { token } = c.req.valid("param");
      const body = c.req.valid("json");
      const tokenHash = hashInviteToken(token);

      // Rate limit per (IP, token) to defeat password-stuffing across many
      // accounts using the same token, and per IP to bound brute-force.
      const ip = getClientIp(c);
      const limitByIpToken = await rateLimit(`invite-signup:${ip}:${tokenHash}`, {
        limit: 5,
        windowMs: 60 * 1000,
      });
      if (!limitByIpToken.allowed) {
        const retry = Math.ceil(limitByIpToken.resetMs / 1000);
        c.header("Retry-After", String(retry));
        throw errors.rateLimited("Too many signup attempts. Please try again later.", retry);
      }

      const row = await db.query.invitations.findFirst({
        where: eq(invitations.tokenHash, tokenHash),
      });
      if (!row) throw errors.notFound("Invitation not found");

      if (row.revokedAt) {
        return c.json(
          { error: { code: "invitation_revoked", message: "Invitation has been revoked" } },
          410,
        );
      }
      if (row.acceptedAt) {
        return c.json(
          {
            error: {
              code: "invitation_already_accepted",
              message: "Invitation has already been accepted",
            },
          },
          409,
        );
      }
      if (isExpired(row)) {
        return c.json(
          { error: { code: "invitation_expired", message: "Invitation has expired" } },
          410,
        );
      }

      // If the invited email already has an account, refuse — caller must
      // log in first then call POST /invite/:token/accept. We don't touch the
      // existing row to avoid silent password resets via invite link.
      const normalizedEmail = row.email.toLowerCase();
      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${normalizedEmail}`)
        .limit(1);
      if (existingUser[0]) {
        return c.json(
          {
            error: {
              code: "user_exists",
              message: "An account already exists for this email. Please sign in and accept the invitation.",
            },
          },
          409,
        );
      }

      // Hash before opening the tx so the work happens off the connection.
      // Two-password model: this is the LOGIN password. The MASTER password
      // (`password_hash`) and the master-bound recovery kit are deliberately
      // NOT set here — the user mints them at /me/password/setup after landing.
      const loginPasswordHash = await hashPassword(body.password);
      const now = new Date();
      const ipHash = hashIp(ip);
      const ipMasked = maskIp(ip);
      const userAgent = c.req.header("user-agent") ?? null;
      const displayName = body.displayName?.trim() || null;

      // Atomic signup: insert user → insert org_members → flip invitation +
      // audit row. Crash mid-way is fully rolled back.
      const created = await db.transaction(async (tx) => {
        const [newUser] = await tx
          .insert(users)
          .values({
            // Normalize at the insert boundary so the row matches the
            // `lower(email)` unique index (migration 0006). The invitation
            // row may carry mixed case from a historical send; we don't
            // want that leaking into the canonical `users` row.
            email: normalizedEmail,
            displayName,
            name: displayName,
            // LOGIN password only. Master (`passwordHash`) stays NULL →
            // requiresPasswordSetup=true → frontend routes to /setup-password.
            loginPasswordHash,
            passwordHash: null,
            // Per-user KDF salt (Phase C fix #2) — random, server-stored salt
            // for client-side master-key derivation.
            kdfSalt: generateKdfSalt(),
            // Invite token proves mailbox ownership → email is verified.
            emailVerifiedAt: now,
            status: "active",
            lastLoginAt: now,
          })
          .returning({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
          });
        if (!newUser) throw errors.internal("Failed to create user");

        const [membership] = await tx
          .insert(orgMembers)
          .values({
            orgId: row.orgId,
            userId: newUser.id,
            role: row.role,
          })
          .returning({ joinedAt: orgMembers.joinedAt });
        if (!membership) throw errors.internal("Failed to create membership");

        await tx
          .update(invitations)
          .set({ acceptedAt: now })
          .where(eq(invitations.id, row.id));

        await tx.insert(auditEvents).values({
          orgId: row.orgId,
          actorUserId: newUser.id,
          actorEmail: newUser.email,
          action: "member.invitation_accepted",
          targetType: "invitation",
          targetId: row.id,
          targetName: row.email,
          ipHash,
          ipMasked,
          userAgent,
          success: true,
          metadata: { role: row.role, viaSignup: true },
        });

        return { user: newUser, joinedAt: membership.joinedAt };
      });

      // Issue a session cookie — Lucia v3 createSession pattern; identical to
      // /auth/login success path so the frontend doesn't need a second hop.
      const { token: sessionToken, session } = await createSession(created.user.id, {
        ipHash,
        userAgent: userAgent ?? undefined,
      });
      c.header("Set-Cookie", buildSessionCookie(sessionToken, session.expiresAt), {
        append: true,
      });

      logger.info(
        { userId: created.user.id, orgId: row.orgId, invitationId: row.id },
        "invitation signup completed",
      );

      // Response sets a session cookie and returns identity/membership only —
      // no secrets in the body (recovery kit moved to /me/password/setup).
      // Still mark uncacheable: the response is tied to a freshly minted
      // session and must not be retained by any intermediate.
      c.header("Cache-Control", "no-store");

      return c.json({
        user: {
          id: created.user.id,
          email: created.user.email,
          displayName: created.user.displayName ?? row.email,
        },
        membership: {
          orgId: row.orgId,
          role: row.role as OrgRole,
          joinedAt: created.joinedAt.toISOString(),
        },
        // requiresPasswordSetup is implicit (master is NULL). The frontend's
        // SessionGuard reads it from GET /me and routes to /setup-password,
        // where the master password + recovery kit are created.
      });
    },
  );

export type InvitationRoutes = typeof invitationRoutes;
