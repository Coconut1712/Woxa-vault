import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, users, vaultMembers } from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { getOrgMembership } from "@/lib/orgAccess";
import { createNotification } from "@/lib/notifications";
import { jsonValidator, paramValidator } from "@/lib/validator";
import {
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  type AuthVariables,
} from "@/middleware/auth";
import { loadVaultForUser, type Role } from "@/routes/vaults";

// ---------------------------------------------------------------------------
// Threat model — vault membership management
//
// Asset: vault_members rows (control which org members can decrypt items).
// Adversaries:
//   * Member of org but not of vault probing for vault ids — mitigated by
//     `loadVaultForUser` returning null (→ 404).
//   * Vault manager attempting to add a user OUTSIDE their org — guard via
//     `getOrgMembership` on the target user against the *vault's* org.
//   * Vault manager removing themselves and leaving the vault ownerless —
//     last-manager guard mirrors the org-owner pattern.
// Mitigations: explicit role check, target-must-be-in-org check, 404 anti-
// enumeration on missing target. Audit log on every state-change.
// Residual risk: a vault manager can still add any org member (no separate
// invite/accept). Acceptable in round 2 — fine-grained invite flow is in the
// "deferred" pile.
// ---------------------------------------------------------------------------

const ROLES = ["manager", "editor", "user", "viewer"] as const;
const roleSchema = z.enum(ROLES);

const vaultParam = z.object({ id: z.string().uuid() });
const vaultUserParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

const createSchema = z.object({
  userId: z.string().uuid(),
  role: roleSchema,
});
const patchSchema = z.object({ role: roleSchema });

interface VaultMemberDTO {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

async function countManagers(vaultId: string): Promise<number> {
  const rows = await db
    .select({ role: vaultMembers.role })
    .from(vaultMembers)
    .where(eq(vaultMembers.vaultId, vaultId));
  return rows.filter((r) => r.role === "manager").length;
}

// Look up a user's email (for enriching share audit metadata). Returns null
// when the user is unknown — the audit row still writes with granteeEmail=null
// rather than failing the grant.
async function emailFor(userId: string): Promise<string | null> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return u?.email ?? null;
}

async function loadVaultMember(vaultId: string, userId: string): Promise<VaultMemberDTO | null> {
  const rows = await db
    .select({
      userId: vaultMembers.userId,
      role: vaultMembers.role,
      email: users.email,
      displayName: users.displayName,
      name: users.name,
    })
    .from(vaultMembers)
    .innerJoin(users, eq(users.id, vaultMembers.userId))
    .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    userId: r.userId,
    email: r.email,
    displayName: r.displayName ?? r.name ?? r.email,
    role: r.role as Role,
  };
}

export const vaultMemberRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  // ------------------------------------------------------------------
  // List vault members
  // ------------------------------------------------------------------
  .get("/:id/members", paramValidator(vaultParam), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");

    const rows = await db
      .select({
        userId: vaultMembers.userId,
        role: vaultMembers.role,
        email: users.email,
        displayName: users.displayName,
        name: users.name,
      })
      .from(vaultMembers)
      .innerJoin(users, eq(users.id, vaultMembers.userId))
      .where(eq(vaultMembers.vaultId, id))
      .orderBy(asc(vaultMembers.createdAt));

    const members: VaultMemberDTO[] = rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      displayName: r.displayName ?? r.name ?? r.email,
      role: r.role as Role,
    }));

    return c.json({ members });
  })

  // ------------------------------------------------------------------
  // Add a member
  // ------------------------------------------------------------------
  .post("/:id/members", paramValidator(vaultParam), jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (access.role !== "manager") {
      throw errors.forbidden("Only managers can add members to this vault");
    }

    // Target must belong to the SAME org as the vault. Returning 404 keeps
    // membership in other orgs unenumerable.
    const targetMembership = await getOrgMembership(access.vault.orgId, body.userId);
    if (!targetMembership) throw errors.notFound("Target user is not a member of this workspace");

    const existing = await loadVaultMember(id, body.userId);
    if (existing) {
      return c.json(
        { error: { code: "member_conflict", message: "User is already a member of this vault" } },
        409,
      );
    }

    const granteeEmail = await emailFor(body.userId);

    await db.transaction(async (tx) => {
      await tx.insert(vaultMembers).values({
        vaultId: id,
        userId: body.userId,
        role: body.role,
      });
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "vault.share",
        targetType: "vault",
        targetId: id,
        targetName: access.vault.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { granteeUserId: body.userId, granteeEmail, role: body.role },
      });
      await createNotification(tx, {
        userId: body.userId,
        orgId: access.vault.orgId,
        type: "share.received",
        actorUserId: user.id,
        actorEmail: user.email,
        targetType: "vault",
        targetId: id,
        targetName: access.vault.name,
        metadata: { resourceKind: "vault", role: body.role },
      });
    });

    const created = await loadVaultMember(id, body.userId);
    if (!created) throw errors.internal("Failed to reload member after insert");
    return c.json({ member: created }, 201);
  })

  // ------------------------------------------------------------------
  // Change a member's role
  // ------------------------------------------------------------------
  .patch(
    "/:id/members/:userId",
    paramValidator(vaultUserParam),
    jsonValidator(patchSchema),
    async (c) => {
      const user = c.get("user")!;
      const { id, userId } = c.req.valid("param");
      const { role } = c.req.valid("json");

      const access = await loadVaultForUser(id, user.id);
      if (!access) throw errors.notFound("Vault not found");
      if (access.role !== "manager") {
        throw errors.forbidden("Only managers can change vault member roles");
      }

      const target = await loadVaultMember(id, userId);
      if (!target) throw errors.notFound("Vault member not found");

      // Last-manager guard.
      if (target.role === "manager" && role !== "manager") {
        const managers = await countManagers(id);
        if (managers <= 1) {
          return c.json(
            {
              error: {
                code: "forbidden",
                message: "Cannot demote the last manager of this vault",
                details: { reason: "last_manager" },
              },
            },
            409,
          );
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(vaultMembers)
          .set({ role })
          .where(and(eq(vaultMembers.vaultId, id), eq(vaultMembers.userId, userId)));

        await tx.insert(auditEvents).values({
          orgId: access.vault.orgId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: "vault.role_change",
          targetType: "vault",
          targetId: id,
          targetName: access.vault.name,
          ipHash: hashIp(getClientIp(c)),
          userAgent: c.req.header("user-agent") ?? null,
          success: true,
          metadata: {
            granteeUserId: userId,
            granteeEmail: target.email,
            from: target.role,
            to: role,
          },
        });
        await createNotification(tx, {
          userId,
          orgId: access.vault.orgId,
          type: "role.changed",
          actorUserId: user.id,
          actorEmail: user.email,
          targetType: "vault",
          targetId: id,
          targetName: access.vault.name,
          metadata: { resourceKind: "vault", from: target.role, to: role },
        });
      });

      const updated = await loadVaultMember(id, userId);
      if (!updated) throw errors.internal("Failed to reload member after update");
      return c.json({ member: updated });
    },
  )

  // ------------------------------------------------------------------
  // Remove a member from the vault
  // ------------------------------------------------------------------
  .delete("/:id/members/:userId", paramValidator(vaultUserParam), async (c) => {
    const user = c.get("user")!;
    const { id, userId } = c.req.valid("param");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (access.role !== "manager") {
      throw errors.forbidden("Only managers can remove vault members");
    }

    const target = await loadVaultMember(id, userId);
    if (!target) throw errors.notFound("Vault member not found");

    if (target.role === "manager") {
      const managers = await countManagers(id);
      if (managers <= 1) {
        return c.json(
          {
            error: {
              code: "forbidden",
              message: "Cannot remove the last manager of this vault",
              details: { reason: "last_manager" },
            },
          },
          409,
        );
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, id), eq(vaultMembers.userId, userId)));
      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "vault.revoke",
        targetType: "vault",
        targetId: id,
        targetName: access.vault.name,
        ipHash: hashIp(getClientIp(c)),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: { revokedUserId: userId, revokedEmail: target.email, role: target.role },
      });
      await createNotification(tx, {
        userId,
        orgId: access.vault.orgId,
        type: "access.revoked",
        actorUserId: user.id,
        actorEmail: user.email,
        targetType: "vault",
        targetId: id,
        targetName: access.vault.name,
        metadata: { resourceKind: "vault" },
      });
    });

    return c.body(null, 204);
  });

export type VaultMemberRoutes = typeof vaultMemberRoutes;
