import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { items, users, vaults, type Item } from "@/db/schema";
import { queryValidator } from "@/lib/validator";
import {
  requireAuth,
  requireTwoFactorEnrolled,
  activeOrgForContext,
  type AuthVariables,
} from "@/middleware/auth";
import { resolveItemRolesBatch, type Role as AccessRole } from "@/lib/access";
import { rateLimit } from "@/lib/rateLimit";
import { errors } from "@/lib/errors";

// ---------------------------------------------------------------------------
// US-017 / AC-017.2/.3/.5 · FR-041/042 — Cmd+K item search.
//
// Phase A is SERVER-SIDE search over PLAINTEXT metadata only (name, username,
// url, type). Secret fields (password/notes ciphertext + everything inside the
// encrypted `__WOXA_META__` notes blob: tags, totp, card, etc.) are NEVER
// searched — the server can't see them and decrypting every row to search
// would be slow and would defeat the envelope-encryption model. Phase C will
// replace this with a client-built blind index.
//
// RBAC: results are scoped to the caller's ACTIVE org and filtered to items the
// caller can access at >= view_metadata via the SAME most-specific-wins engine
// used by GET /vaults/:id/items (resolveItemRole → item override / folder grant
// / vault membership / team grants, with temp-grant expiry). A null role means
// no access → the item is omitted (anti-enumeration: never leaks existence of
// items in other orgs or behind a permission the caller lacks).
//
// Audit: search is read-only metadata browsing and runs on every keystroke, so
// it is NOT audited per-query (would flood audit_events) and the query string
// is NEVER logged (it may echo secret-adjacent text the user is hunting for).
// Revealing a found item still goes through GET /items/:id(/password), which
// audits as item.view / item.reveal.
// ---------------------------------------------------------------------------

const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Over-fetch factor: pull more candidates than `limit` so that rows the caller
// can't access (filtered out below) don't starve the result set, while keeping
// the per-row resolveItemRole calls bounded. Hard-capped at 100.
const CANDIDATE_CAP = 100;

interface SearchResult {
  id: string;
  vaultId: string;
  vaultName: string;
  folderId: string | null;
  type: string;
  name: string;
  username: string | null;
  url: string | null;
  hasPassword: boolean;
  hasNotes: boolean;
  lastUsedAt: string | null;
  updatedAt: string;
  effectiveRole: AccessRole;
}

export const searchRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)

  // GET /search?q=&limit=
  .get("/", queryValidator(searchSchema), async (c) => {
    const user = c.get("user")!;
    const { q, limit } = c.req.valid("query");

    // Rate limit per user: search runs server-side over every keystroke and each
    // call resolves up to CANDIDATE_CAP rows, so an authenticated client could
    // otherwise hammer the DB (authenticated DoS). 120/min/user comfortably
    // covers fast typing + debounced UIs while capping abuse. Keyed by user (not
    // IP) so one tenant can't starve another behind a shared NAT.
    const rl = await rateLimit(`search:${user.id}`, { limit: 120, windowMs: 60_000 });
    if (!rl.allowed) {
      throw errors.rateLimited("Too many searches, slow down", Math.ceil(rl.resetMs / 1000));
    }

    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) return c.json({ results: [] });
    const { orgId, role: orgRole } = activeOrg;

    // ILIKE pattern. Escape LIKE wildcards in user input so a query of "%" or
    // "_" matches those literal characters rather than acting as a wildcard.
    const escaped = q.replace(/([%_\\])/g, "\\$1");
    const pattern = `%${escaped}%`;

    // Candidate fetch: org-scoped, live (not soft-deleted), text-matched on
    // PLAINTEXT columns only, joined to the vault for the org filter + name.
    // Ordered by AC-017.3 priority:
    //   1. exact name match (case-insensitive) first
    //   2. recently used (last_used_at desc, NULLs last)
    //   3. alphabetical by name
    const exactName = sql<boolean>`lower(${items.name}) = lower(${q})`;
    const candidates = await db
      .select({
        item: items,
        vaultName: vaults.name,
        isExact: exactName,
      })
      .from(items)
      .innerJoin(vaults, eq(vaults.id, items.vaultId))
      .where(
        and(
          eq(vaults.orgId, orgId),
          isNull(items.deletedAt),
          isNull(vaults.deletedAt),
          or(
            ilike(items.name, pattern),
            ilike(items.username, pattern),
            ilike(items.url, pattern),
            ilike(items.type, pattern),
          ),
        ),
      )
      .orderBy(
        desc(exactName),
        sql`${items.lastUsedAt} desc nulls last`,
        items.name,
      )
      .limit(CANDIDATE_CAP);

    // Resolve the caller's EFFECTIVE role per candidate (most-specific-wins).
    // Auditor is org-wide read-only → surfaces everything in the org as viewer
    // without per-grant resolution (mirrors GET /vaults auditor branch). All
    // other callers go through ONE batched resolution (bounded query count)
    // rather than a per-row sequential resolveItemRole (the old N+1 / DoS path).
    const results: SearchResult[] = [];
    if (orgRole === "auditor") {
      for (const row of candidates) {
        if (results.length >= limit) break;
        results.push(toResult(row.item, row.vaultName, "viewer"));
      }
    } else {
      const roleMap = await resolveItemRolesBatch(
        user.id,
        candidates.map((row) => ({
          id: row.item.id,
          vaultId: row.item.vaultId,
          folderId: row.item.folderId,
        })),
      );
      for (const row of candidates) {
        if (results.length >= limit) break;
        const role = roleMap.get(row.item.id) ?? null;
        if (!role) continue; // no access at any level → omit (anti-enumeration)
        results.push(toResult(row.item, row.vaultName, role));
      }
    }

    return c.json({ results });
  });

function toResult(it: Item, vaultName: string, role: AccessRole): SearchResult {
  return {
    id: it.id,
    vaultId: it.vaultId,
    vaultName,
    folderId: it.folderId,
    type: it.type,
    name: it.name,
    username: it.username,
    url: it.url,
    hasPassword: it.passwordCiphertext !== null,
    hasNotes: it.notesCiphertext !== null,
    lastUsedAt: it.lastUsedAt ? it.lastUsedAt.toISOString() : null,
    updatedAt: it.updatedAt.toISOString(),
    effectiveRole: role,
  };
}

export type SearchRoutes = typeof searchRoutes;
