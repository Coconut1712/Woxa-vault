import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { itemSearchTerms, items, vaults, type Item } from "@/db/schema";
import { jsonValidator } from "@/lib/validator";
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
// US-017 / AC-017.2/.3/.5 · FR-041/042/043 — Cmd+K item search.
//
// All vaults are zero-knowledge (encryption_version = 2), so search is a single
// blind-index mode:
//
//   POST /search/blind — Phase C (encryption_version = 2, FR-043) vaults.
//     The client derives a per-vault search key (HKDF of the vault key the
//     server never sees), tokenizes its query the SAME way it tokenized items
//     at write time (normalize → words + 3-grams), HMACs each token, and sends
//     the opaque digests as `terms[]`. The server matches item_search_terms by
//     hash equality, ranks by match count, and returns the item's CIPHERTEXT
//     metadata (name/username/url) for the client to decrypt. The server never
//     sees the query plaintext, the search key, or any metadata plaintext.
//
// RBAC: results are scoped to the caller's ACTIVE org and filtered
// to items the caller can reach at >= view_metadata via the same most-specific-
// wins batch resolver used by GET /vaults/:id/items. A null role → the item is
// omitted (anti-enumeration: never leaks existence of items in other orgs or
// behind a permission the caller lacks). Blind mode never reveals that a term
// MATCHED an inaccessible item — those rows are dropped before the response is
// shaped.
//
// Audit: search is read-only metadata browsing on every keystroke, so it is NOT
// audited per-query (would flood audit_events). The HMAC tokens are NEVER logged
// (opaque but still vault-correlatable). Revealing a found item still goes
// through GET /items/:id(/password), which audits.
// ---------------------------------------------------------------------------

// Blind-index token: base64 HMAC-SHA256 digest (32 bytes → 44 chars). Same wire
// shape the write path (routes/items.ts) accepts for searchTerms.
const zBlindToken = z
  .string()
  .length(44)
  .regex(/^[A-Za-z0-9+/]{43}=$/, "term must be a base64 HMAC-SHA256 digest");

const blindSearchSchema = z.object({
  // The query's HMAC tokens. Capped to bound the IN(...) set. An empty array is
  // rejected (min 1) — a blank search returns nothing client-side instead.
  terms: z.array(zBlindToken).min(1).max(200),
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
  // Always "" / null for ZK items (real value is in the *Ciphertext fields).
  name: string;
  username: string | null;
  url: string | null;
  // ZK metadata (base64). Frontend decrypts with the vault key.
  nameCiphertext: string | null;
  nameIv: string | null;
  usernameCiphertext: string | null;
  usernameIv: string | null;
  urlCiphertext: string | null;
  urlIv: string | null;
  hasPassword: boolean;
  hasNotes: boolean;
  lastUsedAt: string | null;
  updatedAt: string;
  effectiveRole: AccessRole;
}

// Shared RBAC filter: given org-scoped candidate rows, resolve the caller's
// effective role per item (batched / auditor short-circuit) and emit only the
// reachable ones, preserving candidate order, up to `limit`. Identical to the
// original v1 logic so both modes leak nothing across org / permission lines.
async function filterByAccess(
  userId: string,
  orgRole: string,
  candidates: { item: Item; vaultName: string }[],
  limit: number,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  if (orgRole === "auditor") {
    for (const row of candidates) {
      if (results.length >= limit) break;
      results.push(toResult(row.item, row.vaultName, "viewer"));
    }
    return results;
  }
  const roleMap = await resolveItemRolesBatch(
    userId,
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
  return results;
}

export const searchRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)

  // POST /search/blind — Phase C (v2) zero-knowledge blind-index search (FR-043).
  // Body: { terms: base64-HMAC[], limit }. The server matches opaque hashes; it
  // never sees the query plaintext or the search key.
  .post("/blind", jsonValidator(blindSearchSchema), async (c) => {
    const user = c.get("user")!;
    const { terms, limit } = c.req.valid("json");

    const rl = await rateLimit(`search:${user.id}`, { limit: 120, windowMs: 60_000 });
    if (!rl.allowed) {
      throw errors.rateLimited("Too many searches, slow down", Math.ceil(rl.resetMs / 1000));
    }

    const activeOrg = await activeOrgForContext(c);
    if (!activeOrg) return c.json({ results: [] });
    const { orgId, role: orgRole } = activeOrg;

    const termHashes = terms.map((t) => Buffer.from(t, "base64"));

    // Match items whose blind-index set contains ANY of the query tokens, scoped
    // to live v2 vaults in the active org. `matchCount` = how many distinct
    // query tokens an item matched — used to rank (more tokens matched = more
    // relevant, e.g. all words of a multi-word query). The DB sees only opaque
    // hashes; it cannot tell name from username from a trigram.
    const matchCount = sql<number>`count(distinct ${itemSearchTerms.termHash})`;
    const matchRows = await db
      .select({ item: items, vaultName: vaults.name, matches: matchCount })
      .from(itemSearchTerms)
      .innerJoin(items, eq(items.id, itemSearchTerms.itemId))
      .innerJoin(vaults, eq(vaults.id, items.vaultId))
      .where(
        and(
          inArray(itemSearchTerms.termHash, termHashes),
          eq(vaults.orgId, orgId),
          eq(vaults.encryptionVersion, 2),
          isNull(items.deletedAt),
          isNull(vaults.deletedAt),
        ),
      )
      .groupBy(items.id, vaults.name)
      // Rank: most query-tokens matched first, then recently used, then most
      // recently updated (name is encrypted, so no alphabetical tiebreak).
      .orderBy(
        desc(matchCount),
        sql`${items.lastUsedAt} desc nulls last`,
        desc(items.updatedAt),
      )
      .limit(CANDIDATE_CAP);

    const results = await filterByAccess(
      user.id,
      orgRole,
      matchRows.map((r) => ({ item: r.item, vaultName: r.vaultName })),
      limit,
    );
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
    nameCiphertext: it.nameCiphertext?.toString("base64") ?? null,
    nameIv: it.nameIv?.toString("base64") ?? null,
    usernameCiphertext: it.usernameCiphertext?.toString("base64") ?? null,
    usernameIv: it.usernameIv?.toString("base64") ?? null,
    urlCiphertext: it.urlCiphertext?.toString("base64") ?? null,
    urlIv: it.urlIv?.toString("base64") ?? null,
    hasPassword: it.passwordCiphertext !== null,
    hasNotes: it.notesCiphertext !== null,
    lastUsedAt: it.lastUsedAt ? it.lastUsedAt.toISOString() : null,
    updatedAt: it.updatedAt.toISOString(),
    effectiveRole: role,
  };
}

export type SearchRoutes = typeof searchRoutes;
