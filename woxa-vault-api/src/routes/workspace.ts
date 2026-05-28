import { Hono } from "hono";
import { z } from "zod";
import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db/client";
import {
  attachments,
  auditEvents,
  folderMembers,
  folders,
  itemMembers,
  items,
  organizations,
  orgMembers,
  sessions,
  users,
  vaultMembers,
  vaults,
} from "@/db/schema";
import { errors } from "@/lib/errors";
import { hashIp } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { logger } from "@/lib/logger";
import {
  canManageOrgMembers,
  canManageWorkspace,
  getOrgMembership,
  orgsForUser,
} from "@/lib/orgAccess";
import {
  AUTO_LOCK_MAX,
  AUTO_LOCK_MIN,
  clampAutoLockMinutes,
  mergeOrgSettings,
  normalizeAllowedDomains,
  readOrgPolicy,
  type OrgSettings,
} from "@/lib/orgPolicy";
import { getStorage } from "@/lib/storage";
import { consumeRateLimit, peekRateLimit, rateLimit } from "@/lib/rateLimit";
import { verifyPassword } from "@/lib/password";
import { isUniqueViolation } from "@/lib/pgError";
import { jsonValidator } from "@/lib/validator";
import { activeOrgForContext, requireAuth, type AuthVariables } from "@/middleware/auth";
import { createHash } from "node:crypto";
import { env } from "@/config/env";
import {
  buildIntegrationCatalog,
  mergeSlackIntegration,
  readOrgSlackIntegration,
  slackWebhookSchema,
} from "@/lib/orgIntegrations";

// ---------------------------------------------------------------------------
// Threat model — workspace lifecycle (creation + ownership transfer)
//
// Assets:
//   * `organizations` rows + the `owner` membership that carries delete /
//     billing / transfer rights.
//   * The single-owner invariant: exactly one `owner` per org. Violating it
//     in either direction is a problem — two owners means split control of
//     billing/delete; zero owners means the workspace is un-administrable.
//
// Adversaries:
//   * A member who tries to seize ownership of a workspace they didn't create
//     (privilege escalation) — gated by `canManageWorkspace` (owner-only).
//   * A stolen-cookie attacker who IS the owner's session and tries to give
//     ownership away (or to themselves on a phished co-owner account). The
//     session alone is not enough: transfer re-verifies the caller's master
//     password (HIGH#1, proof-of-possession), mirroring revoke-all-sessions.
//   * A race between two concurrent transfer calls that could momentarily
//     create two owners — gated by an atomic transaction AND the partial
//     unique index `org_members_single_owner_idx` (defense in depth). The
//     loser is mapped to a retryable 409 instead of a raw 500 (MEDIUM).
//   * Automated workspace-spam (DoS / slug exhaustion) — gated by a per-user
//     create rate limit.
//   * Cross-tenant IDOR: a caller acting on an org they're not a member of —
//     impossible here because every handler resolves the org from the
//     caller's OWN membership, never from a client-supplied org id.
//
// Mitigations:
//   * Create: single transaction inserts org + owner membership (+ default
//     vaults). Slug is server-generated and collision-checked in a loop.
//   * Transfer: owner-only; caller re-proves the master password under a
//     two-tier rate limit (soft consume-always + hard consume-on-failure, so
//     a wrong-password attacker can't lock the real owner out); target must
//     already be a member; the demote + promote happen in ONE transaction so
//     the invariant is never observably violated. The unique index is the
//     last-line guarantee and its violation maps to a 409.
//
// Residual risk (transfer):
//   * Session rotation after a successful transfer is NOT yet implemented —
//     the demoted ex-owner keeps their existing session (now carrying only
//     admin rights, which is correct, but any cached elevated assumptions
//     live until natural expiry). Flagged as a follow-up; see the handler.
//
// Residual risk:
//   * Phase A does not seed wrapped vault keys (no zero-knowledge crypto yet),
//     so default vault creation does NOT touch any DEK — confirmed safe.
//   * Slug is derived from the org name and is enumerable; this is acceptable
//     (org slugs are not secrets — they appear in URLs).
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const transferSchema = z.object({
  targetUserId: z.string().uuid(),
  // HIGH#1 — proof-of-possession. Transferring ownership demotes the current
  // owner to admin, so a stolen-cookie attacker must not be able to do it with
  // the session alone. We re-verify the caller's master password, matching the
  // convention used by /me/sessions/revoke-all and /me/recovery-kit/regenerate.
  password: z.string().min(1).max(1024),
});

// Workspace rename body. `name` ONLY — the slug is server-DERIVED from the new
// name (auto-follow model), never client-supplied. Accepting a client slug
// would add a second attacker-controlled-slug surface beyond what `name`
// already influences; slug stays NEVER-trusted (not in any route path, invite/
// SSO/email link, or authz decision).
export const renameSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

// Workspace delete body — destructive, owner-only. Requires BOTH a typed
// confirmation of the exact workspace name AND the caller's master password as
// proof-of-possession (mirrors transfer-ownership; a stolen cookie alone must
// not be able to destroy the org).
export const deleteWorkspaceSchema = z.object({
  confirmName: z.string().min(1).max(80),
  password: z.string().min(1).max(1024),
});

// Security-policy patch body. ALL fields optional (partial PATCH merges into
// `organizations.settings` without dropping other policy keys):
//   * require2fa     — workspace-wide forced-2FA flag.
//   * autoLockMinutes — vault idle auto-lock window; clamped server-side to
//                       [AUTO_LOCK_MIN, AUTO_LOCK_MAX].
//   * sso            — allowedDomains / jitEnabled / requireSso (each optional).
// At least one field is recommended but an empty body is accepted as a no-op.
export const securityPolicySchema = z.object({
  require2fa: z.boolean().optional(),
  autoLockMinutes: z.number().int().optional(),
  sso: z
    .object({
      allowedDomains: z.array(z.string()).max(100).optional(),
      jitEnabled: z.boolean().optional(),
      requireSso: z.boolean().optional(),
    })
    .optional(),
});

// Active-workspace switch body (M-1). `orgId` is the workspace the caller wants
// this session to act on. Validated server-side against the caller's OWN
// memberships before we persist it — a non-member orgId is refused (IDOR).
export const switchSchema = z.object({
  orgId: z.string().uuid(),
});

// Per-user create rate limit. Loose enough for legitimate "create a couple of
// workspaces" usage, tight enough that a compromised session can't spam the
// org table. Window resets on process restart (Phase A in-memory limiter).
const CREATE_RL_LIMIT = 5;
const CREATE_RL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
// Security-policy change is a sensitive admin action — bound it per-user so a
// stolen admin session can't flap the policy. Loose enough for legit toggling.
const POLICY_RL_LIMIT = 20;
const POLICY_RL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
// Transfer is now a password-verifying endpoint (HIGH#1), so it uses the same
// two-tier limiter as /me/sessions/revoke-all:
//   * soft (consumed on EVERY attempt) — caps total Argon2 verifies/hour so an
//     attacker can't grind passwords; loose enough a legit owner won't hit it.
//   * hard (consumed ONLY on a failed verify) — a wrong-password attacker on a
//     stolen cookie can't burn the real owner's allowance with bad guesses.
const TRANSFER_SOFT_LIMIT = 20;
const TRANSFER_HARD_LIMIT = 5;
const TRANSFER_RL_WINDOW_MS = 60 * 60 * 1000;
// Delete is the most destructive workspace action and re-verifies the master
// password. Use the same two-tier shape as transfer: a soft bucket caps total
// Argon2 verifies/hour (anti-grind), a hard bucket charges ONLY on a failed
// verify so a wrong-password attacker on a stolen cookie can't lock the real
// owner out of their own delete endpoint.
const DELETE_SOFT_LIMIT = 10;
const DELETE_HARD_LIMIT = 5;
const DELETE_RL_WINDOW_MS = 60 * 60 * 1000;
// Switch is a cheap, non-credentialed action (just flips a session pointer the
// user already has rights to). A light per-user cap keeps a buggy/abusive
// client from hammering the session UPDATE without getting in a real user's
// way — switchers click a few times, not hundreds, per minute.
const SWITCH_RL_LIMIT = 60;
const SWITCH_RL_WINDOW_MS = 60 * 1000; // 1 minute
const INTEGRATION_RL_LIMIT = 20;
const INTEGRATION_RL_WINDOW_MS = 60 * 60 * 1000;

function isGoogleSsoConfigured(): boolean {
  return Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

export const slackIntegrationSchema = z
  .object({
    webhookUrl: slackWebhookSchema.optional(),
    disconnect: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.disconnect === true) return;
    if (!body.webhookUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "webhookUrl is required unless disconnect is true",
        path: ["webhookUrl"],
      });
    }
  });

// Slugify the org name: lowercase, ASCII alphanum + hyphen, collapse runs,
// trim leading/trailing hyphens, cap length. Empty result falls back to
// "workspace" so we always have a non-empty base before adding a suffix.
export function slugifyBase(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "workspace";
}

// Find a free slug, starting from the base and appending a short random
// suffix on collision. Runs inside the create/rename transaction so the
// uniqueness check + write can't race another creator (the `slug` unique
// constraint is the final guard regardless). We bound the loop so a
// pathological collision storm can't spin forever.
//
// `excludeOrgId` (rename path) excludes the org's OWN row from the clash check
// so that re-deriving the base from a new name that resolves to the org's
// CURRENT slug keeps it unchanged (no needless suffix) — only a DIFFERENT org
// holding the slug forces a suffix. The create-time call site omits it.
export async function allocateSlug(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  base: string,
  excludeOrgId?: string,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate =
      attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    const clash = await tx.query.organizations.findFirst({
      where: excludeOrgId
        ? and(eq(organizations.slug, candidate), ne(organizations.id, excludeOrgId))
        : eq(organizations.slug, candidate),
    });
    if (!clash) return candidate;
  }
  // Extremely unlikely fallback — fully random slug.
  return `${base}-${randomBytes(6).toString("hex")}`;
}

interface WorkspaceListItem {
  id: string;
  name: string;
  slug: string;
  role: string;
  memberCount: number;
  joinedAt: string;
}

export const workspaceRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)

  // ------------------------------------------------------------------
  // GET /workspace — the caller's CURRENT (first) org summary.
  //
  // Kept for backwards-compat with the single-workspace UI. The multi-
  // workspace switcher uses GET /me/workspaces instead.
  // ------------------------------------------------------------------
  .get("/", async (c) => {
    const user = c.get("user")!;

    // Active workspace (M-1): the session's selected org, validated against a
    // live membership; falls back to the first membership when unset.
    const current = await activeOrgForContext(c);
    if (!current) {
      // User exists but has no org membership — fresh signup awaiting
      // workspace creation/join. Surface 404 so the UI routes to /spaces.
      throw errors.notFound("No workspace found for the current user");
    }

    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, current.orgId),
    });
    if (!orgRow) throw errors.notFound("Workspace not found");

    const [memberCountRow] = await db
      .select({ value: count() })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, current.orgId));
    const [vaultCountRow] = await db
      .select({ value: count() })
      .from(vaults)
      .where(and(eq(vaults.orgId, current.orgId), isNull(vaults.deletedAt)));

    return c.json({
      workspace: {
        id: orgRow.id,
        name: orgRow.name,
        slug: orgRow.slug,
        memberCount: Number(memberCountRow?.value ?? 0),
        vaultCount: Number(vaultCountRow?.value ?? 0),
        role: current.role,
        createdAt: orgRow.createdAt.toISOString(),
      },
    });
  })

  // ------------------------------------------------------------------
  // PATCH /workspace — rename the active workspace (owner/admin only).
  //
  // Threat model:
  //   Asset: the workspace display `name` (appears in the UI, audit, emails)
  //     and the `slug`, which now AUTO-FOLLOWS the name on rename (product
  //     decision). Slug is server-DERIVED via `slugifyBase` — it is NOT
  //     accepted from the client, so the rename adds no new attacker-controlled
  //     surface beyond what `name` already influences. Slug remains
  //     NEVER-TRUSTED: investigation confirmed it is not in any route path,
  //     invite/SSO/email link, or authz decision (sso.ts documents it as
  //     attacker-influenceable; round 9 removed slug-based auto-join), so
  //     regenerating it on rename is safe and breaks nothing today.
  //   Adversary: a non-admin member trying to rename the workspace (cosmetic
  //     privilege escalation) — gated by `canManageOrgMembers` (owner+admin).
  //     A caller trying to inject an arbitrary slug — impossible: the body is
  //     `{ name }` only, slug is derived server-side.
  //   Mitigation: org resolved from the caller's OWN membership (no client org
  //     id → no IDOR); Zod-validated 1..80 name; slug derived + uniqueness-
  //     checked EXCLUDING the org's own row (so a name re-resolving to the
  //     org's current slug keeps it suffix-free); audit row with from/to +
  //     slugFrom/slugTo (slug is not secret). A concurrent-rename collision on
  //     the `slug` unique constraint maps to a friendly conflict (mirrors the
  //     transfer-ownership 23505→409 pattern) instead of a raw 500.
  //   Residual risk: forward-compat — IF a slug-based URL is EVER introduced,
  //     auto-following the name WOULD break old links. None exist today; flag
  //     this caveat in API_CONTRACT.md so the trade-off is revisited if that
  //     changes.
  // ------------------------------------------------------------------
  .patch("/", jsonValidator(renameSchema), async (c) => {
    const user = c.get("user")!;
    const { name } = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace found for the current user");
    if (!canManageOrgMembers(current.role)) {
      throw errors.forbidden("Only workspace owners and admins can rename the workspace");
    }

    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, current.orgId),
    });
    if (!orgRow) throw errors.notFound("Workspace not found");

    const fromName = orgRow.name;
    let nextName = fromName;
    // No-op rename (name unchanged) stays a no-op: keep the current slug, skip
    // the transaction + audit entirely.
    let nextSlug = orgRow.slug;
    if (fromName !== name) {
      nextName = name;
      try {
        nextSlug = await db.transaction(async (tx) => {
          // Re-derive the slug from the NEW name. Exclude this org's own row
          // from the uniqueness check so a base resolving to the current slug
          // stays unchanged; only a DIFFERENT org holding it forces a suffix.
          const slug = await allocateSlug(tx, slugifyBase(name), current.orgId);

          await tx
            .update(organizations)
            .set({ name, slug })
            .where(eq(organizations.id, current.orgId));

          await tx.insert(auditEvents).values({
            orgId: current.orgId,
            actorUserId: user.id,
            actorEmail: user.email,
            action: "workspace.renamed",
            targetType: "organization",
            targetId: current.orgId,
            targetName: name,
            ipHash,
            userAgent,
            success: true,
            metadata: {
              from: fromName,
              to: name,
              slugFrom: orgRow.slug,
              slugTo: slug,
            },
          });

          return slug;
        });
      } catch (err) {
        // A concurrent rename could grab the slug between allocateSlug's check
        // and our UPDATE; the `slug` unique constraint is the final guard and
        // throws a 23505. Map it to a clean retryable conflict instead of a
        // raw 500 (mirrors the transfer-ownership 23505→409 pattern).
        if (isUniqueViolation(err)) {
          logger.warn(
            { orgId: current.orgId, actorUserId: user.id },
            "workspace rename lost a concurrent slug race (unique constraint)",
          );
          throw errors.workspaceSlugConflict();
        }
        throw err;
      }
      logger.info(
        { orgId: current.orgId, actorUserId: user.id },
        "workspace renamed",
      );
    }

    const [memberCountRow] = await db
      .select({ value: count() })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, current.orgId));
    const [vaultCountRow] = await db
      .select({ value: count() })
      .from(vaults)
      .where(and(eq(vaults.orgId, current.orgId), isNull(vaults.deletedAt)));

    return c.json({
      workspace: {
        id: orgRow.id,
        name: nextName,
        slug: nextSlug,
        memberCount: Number(memberCountRow?.value ?? 0),
        vaultCount: Number(vaultCountRow?.value ?? 0),
        role: current.role,
        createdAt: orgRow.createdAt.toISOString(),
      },
    });
  })

  // ------------------------------------------------------------------
  // DELETE /workspace — permanently delete the active workspace. OWNER ONLY.
  //
  // Threat model:
  //   Asset: the ENTIRE workspace — every vault, item (encrypted secrets),
  //     folder, attachment blob, membership, invitation and the org row itself.
  //     This is the single most destructive action in the product; recovery is
  //     impossible (no soft-delete here — the org and all its data are dropped).
  //   Adversaries:
  //     * A non-owner (admin/member/guest) trying to nuke the workspace —
  //       gated hard by `canManageWorkspace` (role === "owner").
  //     * A stolen-cookie attacker who IS the owner's session — the session
  //       alone is insufficient: we re-verify the owner's MASTER password
  //       (proof-of-possession, mirrors transfer-ownership) AND require the
  //       exact workspace name typed back as `confirmName` (anti-fat-finger +
  //       anti-CSRF-replay: a blind forged request can't know the org name).
  //     * Brute-forcing the password via this endpoint — two-tier rate limit
  //       (soft anti-grind + hard on-failure) like transfer-ownership.
  //   Mitigations: owner-only + master-password proof + exact-name confirm +
  //     rate limit. The cascade runs in ONE transaction; attachment BLOBS are
  //     purged from storage FIRST (FK cascade only removes attachment ROWS).
  //     The `workspace.deleted` audit row is written to a SURVIVING scope
  //     (orgId = NULL — the org is about to be dropped, and audit rows FK to the
  //     org with ON DELETE CASCADE, so an in-org row would be deleted with it).
  //   Residual risk:
  //     * SSO-only owners (no `password_hash`) cannot delete via this endpoint
  //       (no factor to prove) — they must set a master password first. Phase B
  //       can add recovery-code as an alternate factor.
  //     * Best-effort blob deletion: a failed storage delete is swallowed (a GC
  //       sweep reconciles orphans) — the DB cascade still proceeds.
  // ------------------------------------------------------------------
  .delete("/", jsonValidator(deleteWorkspaceSchema), async (c) => {
    const user = c.get("user")!;
    const { confirmName, password } = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    // Two-tier rate limit (mirrors transfer-ownership).
    const SOFT_KEY = `workspace-delete-soft:${user.id}`;
    const HARD_KEY = `workspace-delete-fail:${user.id}`;
    const SOFT_OPTS = { limit: DELETE_SOFT_LIMIT, windowMs: DELETE_RL_WINDOW_MS };
    const HARD_OPTS = { limit: DELETE_HARD_LIMIT, windowMs: DELETE_RL_WINDOW_MS };

    const soft = rateLimit(SOFT_KEY, SOFT_OPTS);
    const hardPeek = peekRateLimit(HARD_KEY, HARD_OPTS);
    if (!soft.allowed || !hardPeek.allowed) {
      const retry = Math.ceil(Math.max(soft.resetMs, hardPeek.resetMs) / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited(
        "Too many workspace-delete attempts. Please try again later.",
        retry,
      );
    }

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace found for the current user");
    if (!canManageWorkspace(current.role)) {
      throw errors.forbidden("Only the workspace owner can delete the workspace");
    }

    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, current.orgId),
    });
    if (!orgRow) throw errors.notFound("Workspace not found");

    // Proof-of-possession: re-verify the owner's MASTER password. SSO-only
    // owners with no password are refused rather than bypassing the proof.
    if (!user.passwordHash) {
      throw errors.invalidCredentials("Password is required to delete the workspace");
    }
    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      consumeRateLimit(HARD_KEY, { windowMs: HARD_OPTS.windowMs });
      await db.insert(auditEvents).values({
        orgId: current.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "workspace.delete_failed",
        targetType: "organization",
        targetId: current.orgId,
        targetName: orgRow.name,
        ipHash,
        userAgent,
        success: false,
        metadata: { reason: "wrong_password" },
      });
      throw errors.invalidCredentials("Current password is incorrect");
    }

    // Exact-name confirmation (anti-fat-finger + anti-blind-CSRF). Mismatch is a
    // 400 validation error, distinct from the 401 wrong-password above.
    if (confirmName !== orgRow.name) {
      throw errors.validation("Workspace name confirmation does not match", {
        fieldErrors: { confirmName: ["Type the exact workspace name to confirm"] },
      });
    }

    // Purge attachment blobs for EVERY item in EVERY vault of this org BEFORE
    // the cascade drops the rows (FK cascade removes rows, never storage bytes).
    const blobRows = await db
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .innerJoin(items, eq(items.id, attachments.itemId))
      .innerJoin(vaults, eq(vaults.id, items.vaultId))
      .where(eq(vaults.orgId, current.orgId));
    if (blobRows.length > 0) {
      const storage = getStorage();
      for (const r of blobRows) {
        try {
          await storage.delete(r.storageKey);
        } catch {
          // Best-effort — a GC sweep reconciles any orphan blob.
        }
      }
    }

    await db.transaction(async (tx) => {
      // Audit FIRST, to a SURVIVING scope (orgId = NULL). audit_events.org_id
      // FKs the org with ON DELETE CASCADE, so an in-org audit row would be
      // deleted along with the org — write it org-less so the deletion is
      // permanently recorded against the actor.
      await tx.insert(auditEvents).values({
        orgId: null,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "workspace.deleted",
        targetType: "organization",
        targetId: current.orgId,
        targetName: orgRow.name,
        ipHash,
        userAgent,
        success: true,
        metadata: { slug: orgRow.slug },
      });

      // Dropping the org cascades to org_members, vaults (→ items → attachments
      // rows / folders / *_members), invitations and one_time_sends per their
      // FK ON DELETE rules. sessions.active_org_id is ON DELETE SET NULL, so any
      // session pointing here (including the caller's) reverts to the default-
      // org resolver on its next request — no manual session invalidation needed.
      await tx.delete(organizations).where(eq(organizations.id, current.orgId));
    });

    logger.info(
      { orgId: current.orgId, actorUserId: user.id },
      "workspace deleted",
    );

    return c.body(null, 204);
  })

  // ------------------------------------------------------------------
  // POST /workspace — create a workspace; creator becomes the Owner.
  // ------------------------------------------------------------------
  .post("/", jsonValidator(createSchema), async (c) => {
    const user = c.get("user")!;
    const { name } = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    const RL_KEY = `workspace-create:${user.id}`;
    const peek = peekRateLimit(RL_KEY, {
      limit: CREATE_RL_LIMIT,
      windowMs: CREATE_RL_WINDOW_MS,
    });
    if (!peek.allowed) {
      const retry = Math.ceil(peek.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited(
        "Too many workspace creation attempts. Please try again later.",
        retry,
      );
    }
    consumeRateLimit(RL_KEY, { windowMs: CREATE_RL_WINDOW_MS });

    const creatorName = user.displayName ?? user.name ?? user.email.split("@")[0]!;

    const created = await db.transaction(async (tx) => {
      const slug = await allocateSlug(tx, slugifyBase(name));

      const [orgRow] = await tx
        .insert(organizations)
        .values({ name, slug })
        .returning();
      if (!orgRow) throw new Error("organization insert returned no row");

      // Creator is the Owner — single-owner invariant established at birth.
      await tx.insert(orgMembers).values({
        orgId: orgRow.id,
        userId: user.id,
        role: "owner",
      });

      // AC-010.5: seed default "Shared" + "{User}'s Personal" vaults. Phase A
      // has no wrapped vault keys, so this touches NO DEK/secret material.
      // The creator becomes `manager` of each so they immediately have access.
      const defaultVaultNames = ["Shared", `${creatorName}'s Personal`];
      for (const vaultName of defaultVaultNames) {
        const [vaultRow] = await tx
          .insert(vaults)
          .values({ orgId: orgRow.id, name: vaultName, createdBy: user.id })
          .returning();
        if (!vaultRow) throw new Error("default vault insert returned no row");
        await tx.insert(vaultMembers).values({
          vaultId: vaultRow.id,
          userId: user.id,
          role: "manager",
        });
      }

      await tx.insert(auditEvents).values({
        orgId: orgRow.id,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "workspace.created",
        targetType: "organization",
        targetId: orgRow.id,
        targetName: orgRow.name,
        ipHash,
        userAgent,
        success: true,
        metadata: { slug: orgRow.slug, defaultVaults: defaultVaultNames.length },
      });

      return orgRow;
    });

    logger.info({ userId: user.id, orgId: created.id }, "workspace created");

    return c.json(
      { id: created.id, name: created.name, slug: created.slug, role: "owner" },
      201,
    );
  })

  // ------------------------------------------------------------------
  // GET /workspace/vaults — the workspace VAULT INVENTORY (owner/admin only).
  //
  // Lets an owner/admin SEE which vaults exist in the workspace that they are
  // NOT a member of — METADATA ONLY (name/icon/color/counts). It deliberately
  // grants NO access to the items inside: `GET /vaults/:id` + item routes stay
  // membership-gated and still 404 for these vaults. So an admin can audit the
  // vault inventory without being able to read other teams' secrets.
  //
  // Scope: the active org only. Returns the "rest" — org vaults the caller has
  // no membership AND no folder/item grant in (their own appear in GET /vaults).
  // ------------------------------------------------------------------
  .get("/vaults", async (c) => {
    const user = c.get("user")!;
    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace found for the current user");
    if (!canManageOrgMembers(current.role)) {
      throw errors.forbidden(
        "Only workspace owners and admins can view the vault inventory",
      );
    }

    // Vault ids the caller already has access to (member or sub-grant) — these
    // belong in their own GET /vaults, so exclude them here.
    const [memberRows, folderGrantRows, itemGrantRows] = await Promise.all([
      db
        .select({ vaultId: vaultMembers.vaultId })
        .from(vaultMembers)
        .where(eq(vaultMembers.userId, user.id)),
      db
        .select({ vaultId: folders.vaultId })
        .from(folderMembers)
        .innerJoin(folders, eq(folders.id, folderMembers.folderId))
        .where(eq(folderMembers.userId, user.id)),
      db
        .select({ vaultId: items.vaultId })
        .from(itemMembers)
        .innerJoin(items, eq(items.id, itemMembers.itemId))
        .where(eq(itemMembers.userId, user.id)),
    ]);
    const ownVaultIds = new Set<string>([
      ...memberRows.map((r) => r.vaultId),
      ...folderGrantRows.map((r) => r.vaultId),
      ...itemGrantRows.map((r) => r.vaultId),
    ]);

    const allVaults = await db
      .select()
      .from(vaults)
      .where(and(eq(vaults.orgId, current.orgId), isNull(vaults.deletedAt)))
      .orderBy(asc(vaults.name));

    const otherVaults = allVaults.filter((v) => !ownVaultIds.has(v.id));
    if (otherVaults.length === 0) return c.json({ vaults: [] });

    const vaultIds = otherVaults.map((v) => v.id);
    const itemCounts = await db
      .select({ vaultId: items.vaultId, c: count() })
      .from(items)
      .where(and(inArray(items.vaultId, vaultIds), isNull(items.deletedAt)))
      .groupBy(items.vaultId);
    const memberCounts = await db
      .select({ vaultId: vaultMembers.vaultId, c: count() })
      .from(vaultMembers)
      .where(inArray(vaultMembers.vaultId, vaultIds))
      .groupBy(vaultMembers.vaultId);
    const itemCountMap = new Map(itemCounts.map((r) => [r.vaultId, Number(r.c)]));
    const memberCountMap = new Map(
      memberCounts.map((r) => [r.vaultId, Number(r.c)]),
    );

    return c.json({
      vaults: otherVaults.map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description,
        iconKey: v.iconKey,
        color: v.color,
        itemCount: itemCountMap.get(v.id) ?? 0,
        memberCount: memberCountMap.get(v.id) ?? 0,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
    });
  })

  // ------------------------------------------------------------------
  // GET /workspace/settings — the caller's current workspace security policy.
  //
  // Readable by EVERY member (any role) so the frontend can render the policy
  // status + the forced-enrollment banner. The org is resolved from the
  // caller's OWN membership — no client-supplied org id, so there is no IDOR
  // surface. We only surface the policy flags the contract exposes (require2fa),
  // never the raw settings blob (which may hold unrelated/internal keys).
  // ------------------------------------------------------------------
  .get("/settings", async (c) => {
    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace found for the current user");

    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, current.orgId),
    });
    if (!orgRow) throw errors.notFound("Workspace not found");

    const policy = readOrgPolicy(orgRow.settings);
    return c.json({
      settings: {
        require2fa: policy.require2fa,
        autoLockMinutes: policy.autoLockMinutes,
        sso: {
          allowedDomains: policy.sso.allowedDomains,
          jitEnabled: policy.sso.jitEnabled,
          requireSso: policy.sso.requireSso,
        },
      },
    });
  })

  // ------------------------------------------------------------------
  // PATCH /workspace/settings — update the workspace security policy.
  //
  // Accepts a PARTIAL body; any subset of:
  //   require2fa?, autoLockMinutes?, sso?: { allowedDomains?, jitEnabled?,
  //   requireSso? }. Each present field is merged into `organizations.settings`
  //   (deep-merge for `sso`) so an absent field is left untouched.
  //
  // Threat model:
  //   Assets: the workspace-wide security controls —
  //     * require2fa: turning ON forces un-enrolled members to enroll before
  //       touching secrets.
  //     * autoLockMinutes: the idle window the client uses for its auto-lock
  //       overlay (and a candidate for the server unlock window).
  //     * sso.allowedDomains: who may SSO into a Woxa workspace.
  //     * sso.jitEnabled: whether a brand-new SSO user is auto-provisioned.
  //     * sso.requireSso: (Phase B) whether members must use SSO to log in.
  //   Adversary: a non-admin member flipping any of these (privilege
  //     escalation) — gated by `canManageOrgMembers` (owner+admin). A stolen
  //     admin session flapping policy — bounded by a per-user rate limit. A
  //     PATCH stomping unrelated/other policy keys — prevented by deep-merge.
  //   Mitigation: org resolved from caller membership (no client org id);
  //     owner+admin only; Zod-validated body; autoLockMinutes clamped + domains
  //     normalized server-side; merge into existing jsonb; audit row lists
  //     ONLY the changed key NAMES (+ before/after for the non-secret scalars),
  //     never secrets.
  //   Residual risk: members already mid-session keep their cookie; the 2FA
  //     gate is enforced on the NEXT secret-bearing request via
  //     requireTwoFactorEnrolled, not by force-revoking sessions.
  // ------------------------------------------------------------------
  .patch("/settings", jsonValidator(securityPolicySchema), async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    const RL_KEY = `workspace-policy:${user.id}`;
    const peek = peekRateLimit(RL_KEY, {
      limit: POLICY_RL_LIMIT,
      windowMs: POLICY_RL_WINDOW_MS,
    });
    if (!peek.allowed) {
      const retry = Math.ceil(peek.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited(
        "Too many security-policy changes. Please try again later.",
        retry,
      );
    }
    consumeRateLimit(RL_KEY, { windowMs: POLICY_RL_WINDOW_MS });

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace found for the current user");
    if (!canManageOrgMembers(current.role)) {
      throw errors.forbidden(
        "Only workspace owners and admins can change the security policy",
      );
    }

    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, current.orgId),
    });
    if (!orgRow) throw errors.notFound("Workspace not found");

    const before = readOrgPolicy(orgRow.settings);

    // Build the normalized patch from ONLY the fields the caller supplied. We
    // normalize here (clamp / dedupe) so the stored blob is always canonical and
    // a no-op detection below is meaningful.
    const patch: Partial<OrgSettings> = {};
    const changedKeys: string[] = [];

    if (body.require2fa !== undefined && body.require2fa !== before.require2fa) {
      patch.require2fa = body.require2fa;
      changedKeys.push("require2fa");
    }

    if (body.autoLockMinutes !== undefined) {
      const clamped = clampAutoLockMinutes(body.autoLockMinutes);
      if (clamped !== before.autoLockMinutes) {
        patch.autoLockMinutes = clamped;
        changedKeys.push("autoLockMinutes");
      }
    }

    if (body.sso) {
      const ssoPatch: { allowedDomains?: string[]; jitEnabled?: boolean; requireSso?: boolean } = {};
      if (body.sso.allowedDomains !== undefined) {
        const normalized = normalizeAllowedDomains(body.sso.allowedDomains);
        const changed =
          normalized.length !== before.sso.allowedDomains.length ||
          normalized.some((d, i) => d !== before.sso.allowedDomains[i]);
        if (changed) {
          ssoPatch.allowedDomains = normalized;
          changedKeys.push("sso.allowedDomains");
        }
      }
      if (
        body.sso.jitEnabled !== undefined &&
        body.sso.jitEnabled !== before.sso.jitEnabled
      ) {
        ssoPatch.jitEnabled = body.sso.jitEnabled;
        changedKeys.push("sso.jitEnabled");
      }
      if (
        body.sso.requireSso !== undefined &&
        body.sso.requireSso !== before.sso.requireSso
      ) {
        ssoPatch.requireSso = body.sso.requireSso;
        changedKeys.push("sso.requireSso");
      }
      if (Object.keys(ssoPatch).length > 0) {
        patch.sso = ssoPatch;
      }
    }

    // Persist + audit only when something actually changed (idempotent no-op
    // otherwise). The audit metadata carries the CHANGED KEY NAMES plus
    // before/after for the non-secret scalars — never raw secret material.
    if (changedKeys.length > 0) {
      const nextSettings = mergeOrgSettings(orgRow.settings, patch);
      await db.transaction(async (tx) => {
        await tx
          .update(organizations)
          .set({ settings: nextSettings })
          .where(eq(organizations.id, current.orgId));

        await tx.insert(auditEvents).values({
          orgId: current.orgId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: "workspace.security_policy_updated",
          targetType: "organization",
          targetId: current.orgId,
          targetName: orgRow.name,
          ipHash,
          userAgent,
          success: true,
          metadata: {
            changed: changedKeys,
            ...(patch.require2fa !== undefined
              ? { require2fa: { from: before.require2fa, to: patch.require2fa } }
              : {}),
            ...(patch.autoLockMinutes !== undefined
              ? {
                  autoLockMinutes: {
                    from: before.autoLockMinutes,
                    to: patch.autoLockMinutes,
                  },
                }
              : {}),
            ...(changedKeys.some((k) => k.startsWith("sso."))
              ? { sso: changedKeys.filter((k) => k.startsWith("sso.")) }
              : {}),
          },
        });
      });
      logger.info(
        { orgId: current.orgId, actorUserId: user.id, changed: changedKeys },
        "workspace security policy updated",
      );
    }

    // Always return the FULL, current policy (the same shape as GET /settings)
    // so the client can re-sync without a second round-trip.
    const after = readOrgPolicy(
      changedKeys.length > 0 ? mergeOrgSettings(orgRow.settings, patch) : orgRow.settings,
    );
    return c.json({
      settings: {
        require2fa: after.require2fa,
        autoLockMinutes: after.autoLockMinutes,
        sso: {
          allowedDomains: after.sso.allowedDomains,
          jitEnabled: after.sso.jitEnabled,
          requireSso: after.sso.requireSso,
        },
      },
    });
  })

  // ------------------------------------------------------------------
  // GET /workspace/integrations — catalog + connection status for the
  // active workspace. Readable by any member (mirrors GET /settings).
  // ------------------------------------------------------------------
  .get("/integrations", async (c) => {
    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace found for the current user");

    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, current.orgId),
    });
    if (!orgRow) throw errors.notFound("Workspace not found");

    const googleSsoConfigured = isGoogleSsoConfigured();
    return c.json({
      integrations: buildIntegrationCatalog({
        settings: orgRow.settings,
        googleSsoConfigured,
      }),
      platform: { googleSsoConfigured },
    });
  })

  // ------------------------------------------------------------------
  // PATCH /workspace/integrations/slack — connect or disconnect Slack.
  // Owner + admin only. Webhook URL is stored server-side and NEVER
  // returned on GET (only a masked summary).
  // ------------------------------------------------------------------
  .patch("/integrations/slack", jsonValidator(slackIntegrationSchema), async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    const RL_KEY = `workspace-integration:${user.id}`;
    const peek = peekRateLimit(RL_KEY, {
      limit: INTEGRATION_RL_LIMIT,
      windowMs: INTEGRATION_RL_WINDOW_MS,
    });
    if (!peek.allowed) {
      const retry = Math.ceil(peek.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited(
        "Too many integration changes. Please try again later.",
        retry,
      );
    }
    consumeRateLimit(RL_KEY, { windowMs: INTEGRATION_RL_WINDOW_MS });

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace found for the current user");
    if (!canManageOrgMembers(current.role)) {
      throw errors.forbidden(
        "Only workspace owners and admins can manage integrations",
      );
    }

    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, current.orgId),
    });
    if (!orgRow) throw errors.notFound("Workspace not found");

    const disconnect = body.disconnect === true;
    const nextSlack = disconnect
      ? null
      : {
          webhookUrl: body.webhookUrl!,
          connectedAt: new Date().toISOString(),
        };

    const nextSettings = mergeSlackIntegration(orgRow.settings, nextSlack);
    await db.transaction(async (tx) => {
      await tx
        .update(organizations)
        .set({ settings: nextSettings })
        .where(eq(organizations.id, current.orgId));

      await tx.insert(auditEvents).values({
        orgId: current.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "workspace.integration_updated",
        targetType: "organization",
        targetId: current.orgId,
        targetName: orgRow.name,
        ipHash,
        userAgent,
        success: true,
        metadata: {
          integration: "slack",
          connected: !disconnect,
        },
      });
    });

    logger.info(
      { orgId: current.orgId, actorUserId: user.id, integration: "slack", disconnect },
      "workspace integration updated",
    );

    return c.json({
      integrations: buildIntegrationCatalog({
        settings: nextSettings,
        googleSsoConfigured: isGoogleSsoConfigured(),
      }),
      platform: { googleSsoConfigured: isGoogleSsoConfigured() },
    });
  })

  // ------------------------------------------------------------------
  // POST /workspace/integrations/slack/test — send a test message to the
  // stored webhook. Owner + admin only; Slack must already be connected.
  // ------------------------------------------------------------------
  .post("/integrations/slack/test", async (c) => {
    const user = c.get("user")!;
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    const RL_KEY = `workspace-integration-test:${user.id}`;
    const peek = peekRateLimit(RL_KEY, {
      limit: INTEGRATION_RL_LIMIT,
      windowMs: INTEGRATION_RL_WINDOW_MS,
    });
    if (!peek.allowed) {
      const retry = Math.ceil(peek.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited(
        "Too many integration test attempts. Please try again later.",
        retry,
      );
    }
    consumeRateLimit(RL_KEY, { windowMs: INTEGRATION_RL_WINDOW_MS });

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace found for the current user");
    if (!canManageOrgMembers(current.role)) {
      throw errors.forbidden(
        "Only workspace owners and admins can test integrations",
      );
    }

    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, current.orgId),
    });
    if (!orgRow) throw errors.notFound("Workspace not found");

    const slack = readOrgSlackIntegration(orgRow.settings);
    if (!slack) {
      throw errors.validation("Slack is not connected for this workspace", {
        fieldErrors: { slack: ["Connect a Slack webhook first"] },
      });
    }

    const res = await fetch(slack.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Woxa Vault test notification — your Slack integration is working.",
      }),
    });

    if (!res.ok) {
      logger.warn(
        { orgId: current.orgId, status: res.status },
        "slack integration test failed",
      );
      throw errors.validation("Slack rejected the test message", {
        fieldErrors: { webhookUrl: ["Check the webhook URL and channel permissions"] },
      });
    }

    await db.insert(auditEvents).values({
      orgId: current.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "workspace.integration_tested",
      targetType: "organization",
      targetId: current.orgId,
      targetName: orgRow.name,
      ipHash,
      userAgent,
      success: true,
      metadata: { integration: "slack" },
    });

    return c.json({ ok: true });
  })

  // ------------------------------------------------------------------
  // POST /workspace/transfer-ownership — hand the Owner role to another
  // existing member. Owner-only. Atomic: previous owner → admin, target →
  // owner, preserving the single-owner invariant at all times.
  // ------------------------------------------------------------------
  .post("/transfer-ownership", jsonValidator(transferSchema), async (c) => {
    const user = c.get("user")!;
    const { targetUserId, password } = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    // HIGH#1: two-tier rate limit (mirrors /me/sessions/revoke-all).
    //  * soft bucket is consumed on EVERY attempt so an attacker can't grind
    //    Argon2 verifies; it's loose enough a legit owner won't hit it.
    //  * hard bucket is consumed ONLY on a failed verify (below) so a
    //    wrong-password attacker on a stolen cookie can't lock the real owner
    //    out of their own transfer endpoint.
    const SOFT_KEY = `workspace-transfer-soft:${user.id}`;
    const HARD_KEY = `workspace-transfer-fail:${user.id}`;
    const SOFT_OPTS = { limit: TRANSFER_SOFT_LIMIT, windowMs: TRANSFER_RL_WINDOW_MS };
    const HARD_OPTS = { limit: TRANSFER_HARD_LIMIT, windowMs: TRANSFER_RL_WINDOW_MS };

    const soft = rateLimit(SOFT_KEY, SOFT_OPTS);
    const hardPeek = peekRateLimit(HARD_KEY, HARD_OPTS);
    if (!soft.allowed || !hardPeek.allowed) {
      const retry = Math.ceil(Math.max(soft.resetMs, hardPeek.resetMs) / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited(
        "Too many ownership-transfer attempts. Please try again later.",
        retry,
      );
    }

    const current = await activeOrgForContext(c);
    if (!current) throw errors.notFound("No workspace");
    if (!canManageWorkspace(current.role)) {
      throw errors.forbidden("Only the workspace owner can transfer ownership");
    }

    // HIGH#1: proof-of-possession. The owner must re-prove the master password
    // before we hand the role away. SSO-only owners (no password_hash) are
    // refused rather than bypassing the proof — Phase B can add recovery-code
    // as an alternate factor.
    if (!user.passwordHash) {
      throw errors.invalidCredentials(
        "Password is required to transfer ownership",
      );
    }
    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      // Charge the hard quota only on failure (constant w.r.t. the legit user).
      consumeRateLimit(HARD_KEY, { windowMs: HARD_OPTS.windowMs });
      await db.insert(auditEvents).values({
        orgId: current.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "workspace.ownership_transfer_failed",
        targetType: "user",
        targetId: targetUserId,
        ipHash,
        userAgent,
        success: false,
        metadata: { reason: "wrong_password", to: targetUserId },
      });
      throw errors.invalidCredentials("Current password is incorrect");
    }

    // A no-op self-transfer would demote the only owner to admin and leave
    // zero owners after the same row is re-promoted — reject explicitly so
    // the invariant logic never has to reason about it.
    if (targetUserId === user.id) {
      throw errors.validation("Cannot transfer ownership to yourself", {
        fieldErrors: { targetUserId: ["Target must be a different member"] },
      });
    }

    const target = await getOrgMembership(current.orgId, targetUserId);
    if (!target) {
      // Target is not a member of THIS org. 404 keeps cross-org user ids from
      // being probed for existence via this endpoint.
      throw errors.notFound("Target user is not a member of this workspace");
    }

    try {
      await db.transaction(async (tx) => {
        // Demote the current owner FIRST so the partial unique index is free
        // before we promote the target — avoids a transient two-owner state
        // that the index would reject.
        await tx
          .update(orgMembers)
          .set({ role: "admin" })
          .where(and(eq(orgMembers.orgId, current.orgId), eq(orgMembers.userId, user.id)));

        const promoted = await tx
          .update(orgMembers)
          .set({ role: "owner" })
          .where(
            and(eq(orgMembers.orgId, current.orgId), eq(orgMembers.userId, targetUserId)),
          )
          .returning({ userId: orgMembers.userId });
        if (promoted.length === 0) {
          // Target row vanished between the membership check and the update
          // (concurrent removal). Roll the whole tx back so we don't leave the
          // org ownerless.
          throw errors.notFound("Target user is no longer a member of this workspace");
        }

        await tx.insert(auditEvents).values({
          orgId: current.orgId,
          actorUserId: user.id,
          actorEmail: user.email,
          action: "workspace.ownership_transferred",
          targetType: "user",
          targetId: targetUserId,
          ipHash,
          userAgent,
          success: true,
          metadata: { from: user.id, to: targetUserId, previousRole: target.role },
        });
      });
    } catch (err) {
      // MEDIUM: two concurrent transfers race on the partial unique index
      // `org_members_single_owner_idx`. The invariant holds (one owner wins),
      // but the loser's transaction throws a raw unique violation that would
      // otherwise fall through to `app.onError` as a generic 500. Map it to a
      // retryable 409 so the caller gets a clear, actionable signal.
      if (isUniqueViolation(err, "org_members_single_owner_idx")) {
        logger.warn(
          { orgId: current.orgId, from: user.id, to: targetUserId },
          "ownership transfer lost a concurrent race (single-owner index)",
        );
        throw errors.ownershipTransferConflict();
      }
      throw err;
    }

    // FOLLOW-UP (session rotation): the demoted ex-owner keeps their current
    // session, which now carries only admin rights — correct, but any cached
    // elevated assumptions persist until the session expires. We do NOT rotate
    // here because session state is keyed per-token and the demoted user is
    // typically a DIFFERENT principal than the request actor only in the
    // self-demote case (always the actor here). A targeted "invalidate the
    // actor's session on privilege drop" pass is tracked separately so we don't
    // accidentally log the owner out mid-transfer in a way the FE can't handle.
    logger.info(
      { orgId: current.orgId, from: user.id, to: targetUserId },
      "workspace ownership transferred",
    );

    return c.json({ ok: true, orgId: current.orgId, ownerUserId: targetUserId });
  })

  // ------------------------------------------------------------------
  // POST /workspace/switch — set the active workspace for THIS session.
  //
  // Threat model:
  //   Asset: the active-org pointer that drives every org-scoped operation's
  //     RBAC. Pointing it at an org the caller is not a member of would be a
  //     cross-tenant IDOR.
  //   Adversary: a caller supplying an arbitrary `orgId` (another tenant's id,
  //     or an org they were removed from) to act on a workspace they shouldn't.
  //   Mitigation: we look up the (caller, orgId) membership FIRST and refuse
  //     with 404 if it doesn't exist — same not-found-vs-forbidden masking the
  //     rest of the workspace surface uses, so the endpoint cannot be probed
  //     for org existence. Only after the membership check do we persist the
  //     pointer onto the caller's OWN session row (keyed by the hashed session
  //     token, never a client-supplied session id).
  //   Defence in depth: even if a forged pointer were somehow persisted,
  //     `resolveActiveOrg` re-validates membership on every request and would
  //     ignore it — so this endpoint is the gate, not the only check.
  //   Residual risk: switching does not rotate the session token; the pointer
  //     change is observable only to a holder of the same cookie (who already
  //     has full session access). Acceptable.
  // ------------------------------------------------------------------
  .post("/switch", jsonValidator(switchSchema), async (c) => {
    const user = c.get("user")!;
    const sessionToken = c.get("sessionToken");
    const { orgId } = c.req.valid("json");
    const ipHash = hashIp(getClientIp(c));
    const userAgent = c.req.header("user-agent") ?? null;

    const RL_KEY = `workspace-switch:${user.id}`;
    const rl = rateLimit(RL_KEY, { limit: SWITCH_RL_LIMIT, windowMs: SWITCH_RL_WINDOW_MS });
    if (!rl.allowed) {
      const retry = Math.ceil(rl.resetMs / 1000);
      c.header("Retry-After", String(retry));
      throw errors.rateLimited("Too many workspace switches. Slow down.", retry);
    }

    // IDOR gate: the caller must already be a member of the target org. A
    // non-membership (wrong org / removed / forged id) is masked as 404 so the
    // endpoint can't enumerate orgs the caller doesn't belong to.
    const membership = await getOrgMembership(orgId, user.id);
    if (!membership) {
      throw errors.notFound("Workspace not found");
    }

    if (!sessionToken) {
      // Defensive — requireAuth populates sessionToken alongside user.
      throw errors.unauthorized();
    }
    const sessionId = createHash("sha256").update(sessionToken).digest("hex");

    const orgRow = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!orgRow) throw errors.notFound("Workspace not found");

    await db.transaction(async (tx) => {
      await tx
        .update(sessions)
        .set({ activeOrgId: orgId })
        .where(eq(sessions.id, sessionId));

      await tx.insert(auditEvents).values({
        orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "workspace.switched",
        targetType: "organization",
        targetId: orgId,
        targetName: orgRow.name,
        ipHash,
        userAgent,
        success: true,
        metadata: { role: membership.role },
      });
    });

    logger.info({ userId: user.id, orgId }, "active workspace switched");

    return c.json({
      workspace: {
        id: orgRow.id,
        name: orgRow.name,
        slug: orgRow.slug,
        role: membership.role,
      },
    });
  });

export type WorkspaceRoutes = typeof workspaceRoutes;
