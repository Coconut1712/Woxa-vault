import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import { db } from "@/db/client";
import { auditEvents, invitations, organizations, orgMembers, userKeys, users } from "@/db/schema";
import { env } from "@/config/env";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { logger } from "@/lib/logger";
import { redactEmail, sendInviteEmail } from "@/lib/mailer/resend";
import {
  ASSIGNABLE_ORG_ROLES,
  canManageOrgMembers,
  getOrgMembership,
  outranks,
  type OrgRole,
} from "@/lib/orgAccess";
import { createNotification } from "@/lib/notifications";
import { jsonValidator, paramValidator } from "@/lib/validator";
import { activeOrgForContext, requireAuth, type AuthVariables } from "@/middleware/auth";

// ---------------------------------------------------------------------------
// Threat model — workspace member management
//
// Assets: org membership rows (control who can see vaults inside the org).
// Adversaries: malicious member trying to escalate themselves to `owner`, or
//   non-admin trying to enumerate org members. Last-owner removal is the
//   classic "lock yourself out" footgun.
// Mitigations:
//   * RBAC: only `owner` and `admin` may PATCH/DELETE rows.
//   * Last-owner guard: refuse the operation when it would leave the org
//     without any `owner` row.
//   * 404 vs 403 boundary: a non-org caller never gets to a member route —
//     active-org resolution returns null → 404. We DO return 403 inside the
//     org so the UI can show "Only admins can manage members" without ambiguity.
//   * M-1 (active workspace): every handler resolves the org via
//     `activeOrgForContext(c)` (the session's selected workspace, re-validated
//     against a live membership), never the caller's FIRST membership — so a
//     multi-workspace admin manages the workspace they actually switched to.
// Residual risk:
//   * Pre-JIT users (no membership) cannot manage themselves; we return 404.
//   * Email enumeration: list endpoint exposes member emails to ALL members
//     (matches the existing vault member behavior — acceptable per
//     REQUIREMENTS.md §4.3).
// ---------------------------------------------------------------------------

// PATCH role accepts ONLY assignable roles (admin/member/guest). `owner` is
// rejected at validation — ownership moves exclusively through
// `POST /workspace/transfer-ownership`, which keeps the single-owner invariant.
const roleSchema = z.enum(ASSIGNABLE_ORG_ROLES);
const userIdParam = z.object({ userId: z.string().uuid() });
const inviteIdParam = z.object({ id: z.string().uuid() });
const patchSchema = z.object({ role: roleSchema });

// Email validation: lowercased, trimmed, RFC-ish. We narrow the role to
// non-owner roles in the invite flow — only an existing owner can promote
// a member to owner via PATCH, never at invite time.
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["admin", "member", "guest"]),
});

// Invite token lifetime (DESIGN.md §3 "signed invite link, HMAC, exp 7d").
const INVITE_TTL_DAYS = 7;
const INVITE_TOKEN_BYTES = 24; // ~192 bits

function generateInviteToken(): string {
  return encodeBase32LowerCaseNoPadding(randomBytes(INVITE_TOKEN_BYTES));
}
function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function buildAcceptUrl(token: string): string {
  const base = env.WEB_BASE_URL.replace(/\/+$/, "");
  return `${base}/invite/${token}`;
}

interface OrgMemberDTO {
  userId: string;
  email: string;
  displayName: string;
  role: OrgRole;
  joinedAt: string;
  status: "active" | "disabled" | "invited";
}

interface InvitationDTO {
  id: string;
  email: string;
  role: OrgRole;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
  lastSentAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}

function inviteStatus(row: typeof invitations.$inferSelect): InvitationDTO["status"] {
  if (row.acceptedAt) return "accepted";
  if (row.revokedAt) return "revoked";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  return "pending";
}

function toInvitationDTO(row: typeof invitations.$inferSelect): InvitationDTO {
  return {
    id: row.id,
    email: row.email,
    role: row.role as OrgRole,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    lastSentAt: row.lastSentAt.toISOString(),
    status: inviteStatus(row),
  };
}

async function loadMember(orgId: string, userId: string): Promise<OrgMemberDTO | null> {
  const rows = await db
    .select({
      userId: orgMembers.userId,
      role: orgMembers.role,
      joinedAt: orgMembers.joinedAt,
      email: users.email,
      displayName: users.displayName,
      name: users.name,
      status: users.status,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    userId: r.userId,
    email: r.email,
    displayName: r.displayName ?? r.name ?? r.email,
    role: r.role as OrgRole,
    joinedAt: r.joinedAt.toISOString(),
    status: r.status === "active" ? "active" : "disabled",
  };
}

export const memberRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)

  // ------------------------------------------------------------------
  // List org members
  // ------------------------------------------------------------------
  .get("/", async (c) => {
    const user = c.get("user")!;
    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace");

    // `guest` is the only role we explicitly hide the list from. Everyone
    // else can see the basic profile + role of their org members.
    if (current.role === "guest") {
      throw errors.forbidden("Guests cannot view workspace members");
    }

    const rows = await db
      .select({
        userId: orgMembers.userId,
        role: orgMembers.role,
        joinedAt: orgMembers.joinedAt,
        email: users.email,
        displayName: users.displayName,
        name: users.name,
        status: users.status,
        publicKey: userKeys.publicKey,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .leftJoin(userKeys, eq(userKeys.userId, users.id))
      .where(eq(orgMembers.orgId, current.orgId))
      .orderBy(asc(orgMembers.joinedAt));

    const members: (OrgMemberDTO & { publicKey: string | null })[] = rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      displayName: r.displayName ?? r.name ?? r.email,
      role: r.role as OrgRole,
      joinedAt: r.joinedAt.toISOString(),
      status: r.status === "active" ? "active" : "disabled",
      publicKey: r.publicKey ? r.publicKey.toString("base64") : null,
    }));

    // Pending invites are surfaced as a sibling list so the UI can render
    // them in a "Pending invitations" section without mixing them into the
    // active-member table. Expired/revoked/accepted rows are excluded — they
    // would only confuse the page. Admin-only — masks email enumeration.
    let pendingInvites: InvitationDTO[] = [];
    if (canManageOrgMembers(current.role)) {
      const inviteRows = await db
        .select()
        .from(invitations)
        .where(and(eq(invitations.orgId, current.orgId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .orderBy(asc(invitations.createdAt));
      pendingInvites = inviteRows
        .map(toInvitationDTO)
        .filter((i) => i.status === "pending");
    }

    await db.insert(auditEvents).values({
      orgId: current.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "member.list_viewed",
      targetType: "organization",
      targetId: current.orgId,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { memberCount: members.length, pendingInviteCount: pendingInvites.length },
    });

    return c.json({ members, invitations: pendingInvites });
  })

  // ------------------------------------------------------------------
  // Change a member's role
  // ------------------------------------------------------------------
  .patch("/:userId", paramValidator(userIdParam), jsonValidator(patchSchema), async (c) => {
    const user = c.get("user")!;
    const { userId } = c.req.valid("param");
    const { role } = c.req.valid("json");

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace");
    if (!canManageOrgMembers(current.role)) {
      throw errors.forbidden("Only admins and owners can change member roles");
    }

    const target = await getOrgMembership(current.orgId, userId);
    if (!target) throw errors.notFound("Member not found");

    // RBAC hierarchy (DESIGN.md §3 — Owner > Admin > Member > Guest):
    //   * Owner cannot be modified via PATCH at all — the only legal change to
    //     an owner row is the transfer-ownership flow. An admin trying to
    //     demote the owner, OR an owner trying to demote themselves here, both
    //     fall through `outranks` (owner outranks nobody as a target / equal
    //     ranks return false) and are rejected. We surface a specific message
    //     for the owner case.
    //   * A caller must STRICTLY outrank the target to change their role, so
    //     an admin cannot modify another admin (peer) or the owner.
    if (target.role === "owner") {
      throw errors.forbidden(
        "The workspace owner's role can only be changed via ownership transfer",
      );
    }
    if (!outranks(current.role, target.role)) {
      throw errors.forbidden("You do not have permission to change this member's role");
    }
    // The caller must ALSO strictly outrank the NEW role being assigned —
    // outranking the target only proves "which row I may edit", not "which
    // rank I may grant". Without this an admin (rank 2) could promote a member
    // to `admin` (rank 2) and mint a peer admin: a self-grant of privilege.
    //   * Owner (3) outranks admin/member/guest → may assign any of them.
    //   * Admin (2) outranks member/guest but NOT admin → cannot create/promote
    //     to admin. (`owner` is already excluded by ASSIGNABLE_ORG_ROLES.)
    if (!outranks(current.role, role)) {
      throw errors.forbidden("You cannot assign a role at or above your own");
    }

    // Load the member's identity first (email/displayName don't change with the
    // role update) so the audit can name them.
    const member = await loadMember(current.orgId, userId);
    if (!member) throw errors.internal("Failed to load member");

    // Role change + audit in ONE transaction: a failed audit insert rolls back
    // the role change, so a privilege change is never silently unlogged (matches
    // the member-remove path). Record WHO was changed + from→to for a detailed
    // audit entry, not a bare "member role changed".
    await db.transaction(async (tx) => {
      await tx
        .update(orgMembers)
        .set({ role })
        .where(and(eq(orgMembers.orgId, current.orgId), eq(orgMembers.userId, userId)));
      await tx.insert(auditEvents).values({
        orgId: current.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "member.role_change",
        targetType: "user",
        targetId: userId,
        targetName: member.displayName,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { from: target.role, to: role, targetEmail: member.email },
      });
      // Notify the member whose workspace role changed (recipient = userId).
      await createNotification(tx, {
        userId,
        orgId: current.orgId,
        type: "member.role_changed",
        actorUserId: user.id,
        actorEmail: user.email,
        targetType: "user",
        targetId: userId,
        targetName: member.displayName,
        metadata: { from: target.role, to: role },
      });
    });

    return c.json({ member: { ...member, role } });
  })

  // ------------------------------------------------------------------
  // Remove a member from the workspace
  // ------------------------------------------------------------------
  .delete("/:userId", paramValidator(userIdParam), async (c) => {
    const user = c.get("user")!;
    const { userId } = c.req.valid("param");

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace");
    if (!canManageOrgMembers(current.role)) {
      throw errors.forbidden("Only admins and owners can remove members");
    }

    const target = await getOrgMembership(current.orgId, userId);
    if (!target) throw errors.notFound("Member not found");

    // RBAC hierarchy (DESIGN.md §3): the single owner can NEVER be removed via
    // this endpoint — they must transfer ownership first (which demotes them to
    // admin) or delete the workspace. This also enforces the "never zero
    // owners" half of the single-owner invariant. A caller must strictly
    // outrank the target to remove them, so an admin cannot remove a peer admin
    // or the owner; an owner can remove any admin/member/guest.
    if (target.role === "owner") {
      throw errors.forbidden(
        "The workspace owner cannot be removed. Transfer ownership or delete the workspace instead.",
      );
    }
    if (!outranks(current.role, target.role)) {
      throw errors.forbidden("You do not have permission to remove this member");
    }

    // Capture the removed user's identity BEFORE the delete so the audit row can
    // name who was removed (the membership/user rows are about to go).
    const removed = await loadMember(current.orgId, userId);

    await db.transaction(async (tx) => {
      await tx
        .delete(orgMembers)
        .where(and(eq(orgMembers.orgId, current.orgId), eq(orgMembers.userId, userId)));

      await tx.insert(auditEvents).values({
        orgId: current.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "member.remove",
        targetType: "user",
        targetId: userId,
        targetName: removed?.displayName ?? null,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { removedRole: target.role, targetEmail: removed?.email ?? null },
      });
    });

    return c.body(null, 204);
  })

  // ------------------------------------------------------------------
  // Invite by email
  // ------------------------------------------------------------------
  // Email delivery is wired to Resend (lib/mailer/resend.ts). When
  // RESEND_API_KEY is configured the inviter does not need to share the
  // accept URL manually — the recipient receives a transactional email
  // with the same URL embedded as the CTA. In development (no key set)
  // the mailer falls back to printing the rendered body to stdout so
  // a developer can still grab the URL; production refuses to boot
  // without the key (env.ts guard).
  //
  // We still return `acceptUrl` in the response body so the admin UI can
  // surface it as a copy-link affordance even when the transport
  // succeeded — this is the documented contract with the frontend.
  .post("/invite", jsonValidator(inviteSchema), async (c) => {
    const user = c.get("user")!;
    const { email, role } = c.req.valid("json");

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace");
    if (!canManageOrgMembers(current.role)) {
      throw errors.forbidden("Only admins and owners can invite members");
    }
    // Same rank-grant guard as PATCH: an inviter may only grant a role they
    // strictly outrank, so an admin cannot invite a peer admin (privilege
    // escalation via the invite path). Owner may invite admin/member/guest.
    if (!outranks(current.role, role)) {
      throw errors.forbidden("You cannot invite a member at or above your own role");
    }

    // If the email already maps to an active member of this org, refuse.
    const existing = await db
      .select({ userId: orgMembers.userId, role: orgMembers.role })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(
        and(
          eq(orgMembers.orgId, current.orgId),
          sql`lower(${users.email}) = ${email}`,
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return c.json(
        {
          error: {
            code: "already_member",
            message: "User is already a member of this workspace",
          },
        },
        409,
      );
    }

    // If a pending invite already exists for this email, refresh its token
    // + expiry instead of creating a duplicate row. This keeps the wire
    // contract idempotent for re-clicks of the same UI button.
    const existingInvite = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, current.orgId),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .limit(1);

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    let stored: typeof invitations.$inferSelect;
    if (existingInvite[0]) {
      const [updated] = await db
        .update(invitations)
        .set({
          tokenHash,
          role,
          expiresAt,
          invitedBy: user.id,
          lastSentAt: new Date(),
        })
        .where(eq(invitations.id, existingInvite[0].id))
        .returning();
      stored = updated!;
    } else {
      const [created] = await db
        .insert(invitations)
        .values({
          orgId: current.orgId,
          email,
          role,
          tokenHash,
          invitedBy: user.id,
          expiresAt,
        })
        .returning();
      stored = created!;
    }

    await db.insert(auditEvents).values({
      orgId: current.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "member.invite",
      targetType: "invitation",
      targetId: stored.id,
      // Email is the actor's choice to share — fine to log as targetName.
      targetName: email,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
      metadata: { role },
    });

    const acceptUrl = buildAcceptUrl(token);
    // Fire-and-track the outbound email. The DB row already exists — Resend
    // failures must NOT roll back the invitation. Frontend can surface
    // `emailSent: false` to the admin who can then resend / share manually.
    // CRITICAL: do NOT log the acceptUrl here. The mailer module logs only
    // redacted recipient + invitationId.
    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, current.orgId),
    });
    const mailResult = await sendInviteEmail({
      to: email,
      inviterName: user.displayName ?? user.name ?? user.email,
      orgName: orgRow?.name ?? "Woxa Vault workspace",
      acceptUrl,
      expiresAt,
      role,
      invitationId: stored.id,
    });

    // Best-effort audit-only trace. Redacted address + status only.
    logger.info(
      { invitationId: stored.id, to: redactEmail(email), emailSent: mailResult.sent },
      "[invite] dispatched",
    );

    // In production the acceptUrl MUST flow only via email. In dev we keep
    // it in the response so the QA flow doesn't need a Resend account.
    const includeUrl = env.NODE_ENV !== "production";
    return c.json(
      {
        invitation: toInvitationDTO(stored),
        emailSent: mailResult.sent,
        ...(mailResult.errorCode ? { emailError: mailResult.errorCode } : {}),
        ...(includeUrl ? { acceptUrl } : {}),
      },
      201,
    );
  })

  // ------------------------------------------------------------------
  // Resend invite — rotates the token + expiry, returns the new URL.
  // ------------------------------------------------------------------
  .post("/invite/:id/resend", paramValidator(inviteIdParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace");
    if (!canManageOrgMembers(current.role)) {
      throw errors.forbidden("Only admins and owners can resend invites");
    }

    const row = await db.query.invitations.findFirst({
      where: and(eq(invitations.id, id), eq(invitations.orgId, current.orgId)),
    });
    if (!row) throw errors.notFound("Invitation not found");
    if (row.acceptedAt) {
      return c.json(
        { error: { code: "invitation_already_accepted", message: "Invitation already accepted" } },
        409,
      );
    }
    if (row.revokedAt) {
      return c.json(
        { error: { code: "invitation_revoked", message: "Invitation has been revoked" } },
        409,
      );
    }

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const [updated] = await db
      .update(invitations)
      .set({ tokenHash, expiresAt, lastSentAt: new Date() })
      .where(eq(invitations.id, id))
      .returning();

    await db.insert(auditEvents).values({
      orgId: current.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "member.invite_resent",
      targetType: "invitation",
      targetId: id,
      targetName: row.email,
      ipHash: hashIp(getClientIp(c)),
      userAgent: c.req.header("user-agent") ?? null,
      success: true,
    });

    const acceptUrl = buildAcceptUrl(token);
    // Re-dispatch the email under the rotated token. Same failure semantics
    // as /invite: row updated even when Resend rejects so the admin can
    // copy/share manually in dev or trigger another resend in prod.
    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, current.orgId),
    });
    const mailResult = await sendInviteEmail({
      to: row.email,
      inviterName: user.displayName ?? user.name ?? user.email,
      orgName: orgRow?.name ?? "Woxa Vault workspace",
      acceptUrl,
      expiresAt,
      role: row.role,
      invitationId: id,
    });

    logger.info(
      { invitationId: id, to: redactEmail(row.email), emailSent: mailResult.sent },
      "[invite] resent",
    );

    const includeUrl = env.NODE_ENV !== "production";
    return c.json({
      invitation: toInvitationDTO(updated!),
      emailSent: mailResult.sent,
      ...(mailResult.errorCode ? { emailError: mailResult.errorCode } : {}),
      ...(includeUrl ? { acceptUrl } : {}),
    });
  })

  // ------------------------------------------------------------------
  // Revoke (cancel) a pending invite
  // ------------------------------------------------------------------
  .delete("/invite/:id", paramValidator(inviteIdParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace");
    if (!canManageOrgMembers(current.role)) {
      throw errors.forbidden("Only admins and owners can revoke invites");
    }

    const row = await db.query.invitations.findFirst({
      where: and(eq(invitations.id, id), eq(invitations.orgId, current.orgId)),
    });
    if (!row) throw errors.notFound("Invitation not found");
    if (row.acceptedAt) {
      return c.json(
        { error: { code: "invitation_already_accepted", message: "Cannot revoke an accepted invitation" } },
        409,
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(eq(invitations.id, id));
      await tx.insert(auditEvents).values({
        orgId: current.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "member.invite_revoked",
        targetType: "invitation",
        targetId: id,
        targetName: row.email,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
      });
    });

    return c.body(null, 204);
  });

export type MemberRoutes = typeof memberRoutes;
