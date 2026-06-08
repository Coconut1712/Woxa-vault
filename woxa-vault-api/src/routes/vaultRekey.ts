import { Hono } from "hono";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  itemSearchTerms,
  items,
  orgMembers,
  teamMembers,
  userKeys,
  vaultKeys,
  vaultMembers,
  vaultTeamMembers,
  vaults,
} from "@/db/schema";
import { ApiError, errors } from "@/lib/errors";
import { clientIpAuditFields } from "@/lib/ipHash";
import { getClientIp } from "@/lib/clientIp";
import { jsonValidator, paramValidator } from "@/lib/validator";
import {
  blockGuestWrites,
  requireAuth,
  requireTwoFactorEnrolled,
  type AuthVariables,
} from "@/middleware/auth";
import { loadVaultForUser } from "@/routes/vaults";

// ---------------------------------------------------------------------------
// Threat model — client-driven vault re-key (AC-024.5, FR-043)
//
// Assets: the vault key (wraps every item DEK) + every item's ciphertext +
//   the blind-index search terms. In ZK mode the SERVER never holds the vault
//   key, the search key, or any plaintext — it cannot re-encrypt or re-wrap on
//   its own. All re-encryption happens in an authorized member's browser; the
//   server only PERSISTS the result atomically.
//
// Adversaries & mitigations:
//   * Stale-key reader (a revoked member who cached the old vault key) — the
//     POINT of re-key: rotating the key + re-encrypting every item makes the
//     cached key useless for future reads. Server-side access is cut the moment
//     they are revoked (vault_keys row deleted). RESIDUAL: until the admin runs
//     the rekey, the revoked member can still locally decrypt ciphertext they
//     already pulled. Inherent to client-side E2E; documented in the report.
//   * Half-applied rotation (some items on the new key, some on the old) —
//     prevented by a SINGLE atomic transaction + a completeness check (the
//     payload MUST cover every live item) + a SELECT … FOR UPDATE row lock.
//   * Concurrent rekeys racing — optimistic concurrency: the payload carries the
//     keyVersion it computed against; mismatch → 409 rekey_conflict, no write.
//   * Smuggling a key for a non-member / cross-org user — every wrappedKeys
//     entry is validated to be (a) a current vault member and (b) an org member.
//   * Privilege: rekey = vault manager.
//
// Residual: a malicious authorized client could send junk ciphertext (it holds
// the key anyway — it can already read/destroy). Integrity of client crypto is
// out of the server's trust boundary, same as every other ZK write path.
//
// TODO (review #15 — deferred): the client drives a rekey by reading EVERY item
// (GET /items/:id + reveal) to re-encrypt it, which emits an item.view/
// item.reveal audit row PER item — a rekey of a large vault floods the audit
// log. Add an internal/system read path (or a "rekey" audit reason) that
// fetches ciphertext for re-encryption WITHOUT logging per-item reveals.
// ---------------------------------------------------------------------------

const uuidParam = z.object({ id: z.string().uuid() });

// 32-byte HMAC blind-index token, base64 (mirrors items.ts zBase64Hash).
const HMAC_B64_LEN = Math.ceil(32 / 3) * 4; // 44
const zBase64Hash = z
  .string()
  .length(HMAC_B64_LEN)
  .regex(/^[A-Za-z0-9+/]{43}=$/, "term must be a base64 HMAC-SHA256 digest");

// A single item's re-encrypted v2 payload. Every secret/metadata field is a
// client blob; the server stores it verbatim. `null` clears the field.
const reItemSchema = z.object({
  id: z.string().uuid(),
  nameCiphertext: z.string(), // base64 — required (name cannot be cleared)
  nameIv: z.string(),
  usernameCiphertext: z.string().nullable().optional(),
  usernameIv: z.string().nullable().optional(),
  urlCiphertext: z.string().nullable().optional(),
  urlIv: z.string().nullable().optional(),
  passwordCiphertext: z.string().nullable().optional(),
  passwordIv: z.string().nullable().optional(),
  notesCiphertext: z.string().nullable().optional(),
  notesIv: z.string().nullable().optional(),
  searchTerms: z.array(zBase64Hash).max(2000).default([]),
});

const wrappedKeySchema = z.object({
  userId: z.string().uuid(),
  wrappedKey: z.string(), // base64 — vault key wrapped to the member's pubkey
});

const rekeySchema = z.object({
  // The version the client computed this payload against (the CURRENT row
  // version). Optimistic-concurrency guard.
  expectedKeyVersion: z.number().int().positive(),
  // Must equal expectedKeyVersion + 1 (a single monotonic bump).
  newKeyVersion: z.number().int().positive(),
  wrappedKeys: z.array(wrappedKeySchema).min(1),
  items: z.array(reItemSchema),
});

// Decode + de-dupe base64 search tokens to 32-byte buffers (mirrors items.ts).
function decodeSearchTerms(terms: string[]): Buffer[] {
  const seen = new Set<string>();
  const out: Buffer[] = [];
  for (const t of terms) {
    if (seen.has(t)) continue;
    seen.add(t);
    const buf = Buffer.from(t, "base64");
    if (buf.length === 32) out.push(buf);
  }
  return out;
}

function b64ToBufOrNull(v: string | null | undefined): Buffer | null {
  if (v === undefined || v === null) return null;
  return Buffer.from(v, "base64");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Replace an item's whole blind-index term set inside the caller's tx.
async function replaceSearchTerms(tx: Tx, itemId: string, terms: Buffer[]): Promise<void> {
  await tx.delete(itemSearchTerms).where(eq(itemSearchTerms.itemId, itemId));
  if (terms.length === 0) return;
  await tx
    .insert(itemSearchTerms)
    .values(terms.map((termHash) => ({ itemId, termHash })))
    .onConflictDoNothing();
}

// Resolve the EFFECTIVE re-key roster for a vault: every user who can decrypt
// it = direct vault_members ∪ team-derived (vault_team_members → team_members),
// deduped by userId. This MUST match GET /vaults/:id/member-keys exactly — that
// endpoint is what the client iterates to build wrappedKeys, so the validation
// roster and the published roster have to be the same set, or a team member the
// client correctly wrapped a key for gets rejected (rekey stalls), or — worse —
// silently loses access after a rotation. Runs inside the caller's tx so the
// snapshot is taken under the vault's FOR UPDATE lock (no concurrent add/remove
// can break the completeness invariant mid-rotation).
async function resolveVaultRoster(
  tx: Tx,
  vaultId: string,
): Promise<Array<{ userId: string; publicKey: string | null }>> {
  const directRows = await tx
    .select({ userId: vaultMembers.userId, publicKey: userKeys.publicKey })
    .from(vaultMembers)
    .leftJoin(userKeys, eq(userKeys.userId, vaultMembers.userId))
    .where(eq(vaultMembers.vaultId, vaultId));

  const teamRows = await tx
    .select({ userId: teamMembers.userId, publicKey: userKeys.publicKey })
    .from(vaultTeamMembers)
    .innerJoin(teamMembers, eq(teamMembers.teamId, vaultTeamMembers.teamId))
    .leftJoin(userKeys, eq(userKeys.userId, teamMembers.userId))
    .where(eq(vaultTeamMembers.vaultId, vaultId));

  const byUser = new Map<string, { userId: string; publicKey: string | null }>();
  for (const r of [...directRows, ...teamRows]) {
    if (byUser.has(r.userId)) continue;
    byUser.set(r.userId, { userId: r.userId, publicKey: r.publicKey ? r.publicKey.toString("base64") : null });
  }
  return [...byUser.values()];
}

// Validate that every wrappedKeys entry is a member of the owning org (no
// cross-tenant smuggling) and a CURRENT member of the EFFECTIVE vault roster
// (direct ∪ team-derived) WHO HAS ENROLLED ZK (publicKey != null). The set must
// cover EXACTLY the ZK-enrolled roster — a member with publicKey=null is
// EXCLUDED from both sides: not required (we can't wrap to a missing pubkey) and
// not accepted (a key "for" them would be junk → silent lockout). Runs inside
// the lock-holding tx so membership is read under FOR UPDATE. Returns the
// validated userId set. Throws on any violation.
async function validateWrappedKeys(
  tx: Tx,
  vaultId: string,
  orgId: string,
  wrappedKeys: { userId: string }[],
): Promise<Set<string>> {
  const roster = await resolveVaultRoster(tx, vaultId);
  // Members who can actually receive a wrapped key (enrolled ZK).
  const enrolledSet = new Set(roster.filter((r) => r.publicKey !== null).map((r) => r.userId));
  // Full membership (incl. not-yet-enrolled) — used to distinguish "non-member"
  // (validation error) from "member but no pubkey" (excluded, not an error).
  const rosterSet = new Set(roster.map((r) => r.userId));

  const orgRows = await tx
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId));
  const orgSet = new Set(orgRows.map((r) => r.userId));

  const payloadSet = new Set<string>();
  for (const wk of wrappedKeys) {
    if (payloadSet.has(wk.userId)) {
      throw errors.validation("Duplicate userId in wrappedKeys", { userId: wk.userId });
    }
    payloadSet.add(wk.userId);
    if (!orgSet.has(wk.userId)) {
      throw errors.forbidden("wrappedKeys references a user outside the workspace");
    }
    if (!rosterSet.has(wk.userId)) {
      throw errors.validation("wrappedKeys references a non-member of this vault", {
        userId: wk.userId,
      });
    }
    if (!enrolledSet.has(wk.userId)) {
      // Member is on the roster but has no X25519 public key → any wrap "for"
      // them is junk. Reject the entry rather than persisting a key they can
      // never unwrap.
      throw errors.validation("wrappedKeys references a member who has not enrolled ZK", {
        userId: wk.userId,
      });
    }
  }

  // Every ZK-ENROLLED member must receive a key (else they'd lose access
  // silently). Not-yet-enrolled members are intentionally NOT required.
  for (const m of enrolledSet) {
    if (!payloadSet.has(m)) {
      throw new ApiError(
        409,
        "rekey_incomplete_members",
        "wrappedKeys must cover every ZK-enrolled vault member",
        { missingUserId: m },
      );
    }
  }
  return payloadSet;
}

// Assert the payload's item set EXACTLY matches the vault's live (non-deleted)
// items — no item left on the old key, none foreign to the vault. Returns the
// live item-id set.
function assertItemCompleteness(liveIds: string[], payloadIds: string[]): void {
  const live = new Set(liveIds);
  const payload = new Set<string>();
  for (const id of payloadIds) {
    if (payload.has(id)) {
      throw errors.validation("Duplicate item id in payload", { itemId: id });
    }
    payload.add(id);
    if (!live.has(id)) {
      throw errors.validation("Payload references an item not in this vault", { itemId: id });
    }
  }
  for (const id of live) {
    if (!payload.has(id)) {
      throw new ApiError(
        409,
        "rekey_incomplete_items",
        "Re-key payload must cover every item in the vault",
        { missingItemId: id },
      );
    }
  }
}

// Apply a re-encrypted item: write all v2 ciphertext columns, scrub plaintext
// metadata (name="" / username,url=NULL), null the v1 envelope DEK, and replace
// the blind-index terms.
async function applyReItem(
  tx: Tx,
  item: z.infer<typeof reItemSchema>,
): Promise<void> {
  await tx
    .update(items)
    .set({
      name: "",
      username: null,
      url: null,
      nameCiphertext: Buffer.from(item.nameCiphertext, "base64"),
      nameIv: Buffer.from(item.nameIv, "base64"),
      usernameCiphertext: b64ToBufOrNull(item.usernameCiphertext),
      usernameIv: b64ToBufOrNull(item.usernameIv),
      urlCiphertext: b64ToBufOrNull(item.urlCiphertext),
      urlIv: b64ToBufOrNull(item.urlIv),
      passwordCiphertext: b64ToBufOrNull(item.passwordCiphertext),
      passwordIv: b64ToBufOrNull(item.passwordIv),
      notesCiphertext: b64ToBufOrNull(item.notesCiphertext),
      notesIv: b64ToBufOrNull(item.notesIv),
      // ZK mode: the per-item server-wrapped DEK is gone — the key hierarchy
      // lives client-side under the vault key.
      dekCiphertext: null,
      dekIv: null,
      updatedAt: new Date(),
    })
    .where(eq(items.id, item.id));
  await replaceSearchTerms(tx, item.id, decodeSearchTerms(item.searchTerms));
}

export const vaultRekeyRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .use("*", requireTwoFactorEnrolled)
  .use("*", blockGuestWrites)

  // ------------------------------------------------------------------
  // POST /vaults/:id/rekey — unified client-driven vault re-key.
  // Used after a revoke (AC-024.5) to rotate the v2 vault key and re-encrypt
  // every item. Requires vault MANAGER. Atomic.
  // ------------------------------------------------------------------
  .post("/:id/rekey", paramValidator(uuidParam), jsonValidator(rekeySchema), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const access = await loadVaultForUser(id, user.id);
    if (!access) throw errors.notFound("Vault not found");
    if (access.role !== "manager") {
      throw errors.forbidden("Only a vault manager can re-key this vault");
    }
    if (access.vault.encryptionVersion !== 2) {
      throw new ApiError(409, "rekey_not_zk", "Re-key only applies to zero-knowledge (v2) vaults");
    }
    if (body.newKeyVersion !== body.expectedKeyVersion + 1) {
      throw errors.validation("newKeyVersion must be expectedKeyVersion + 1");
    }

    await db.transaction(async (tx) => {
      // Row lock + re-read the live key version under the lock (concurrency).
      const [locked] = await tx
        .select({ keyVersion: vaults.keyVersion, encryptionVersion: vaults.encryptionVersion })
        .from(vaults)
        .where(and(eq(vaults.id, id), isNull(vaults.deletedAt)))
        .for("update");
      if (!locked) throw errors.notFound("Vault not found");
      if (locked.encryptionVersion !== 2) {
        throw new ApiError(409, "rekey_not_zk", "Vault is not zero-knowledge");
      }
      if (locked.keyVersion !== body.expectedKeyVersion) {
        throw new ApiError(
          409,
          "rekey_conflict",
          "Vault key version changed since you started — reload and retry",
          { currentKeyVersion: locked.keyVersion },
        );
      }

      // Membership snapshot is read UNDER the FOR UPDATE lock so a concurrent
      // add/remove can't break the roster-completeness invariant mid-rotation.
      const validatedKeyUsers = await validateWrappedKeys(tx, id, access.vault.orgId, body.wrappedKeys);

      // Completeness: payload must cover every live item.
      const liveItems = await tx
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.vaultId, id), isNull(items.deletedAt)));
      assertItemCompleteness(liveItems.map((r) => r.id), body.items.map((i) => i.id));

      // 1. Replace ALL vault keys (delete + insert the new wrapped set).
      await tx.delete(vaultKeys).where(eq(vaultKeys.vaultId, id));
      if (body.wrappedKeys.length > 0) {
        await tx.insert(vaultKeys).values(
          body.wrappedKeys.map((wk) => ({
            vaultId: id,
            userId: wk.userId,
            wrappedKey: Buffer.from(wk.wrappedKey, "base64"),
            wrapAlgo: "x25519-aes256gcm",
          })),
        );
      }

      // 2. Re-encrypt every item + replace its search terms.
      for (const item of body.items) {
        await applyReItem(tx, item);
      }

      // 3. Bump version, clear the pending flag.
      await tx
        .update(vaults)
        .set({ keyVersion: body.newKeyVersion, rekeyPending: false, updatedAt: new Date() })
        .where(eq(vaults.id, id));

      await tx.insert(auditEvents).values({
        orgId: access.vault.orgId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "vault.rekey",
        targetType: "vault",
        targetId: id,
        targetName: access.vault.name,
        ...clientIpAuditFields(c),
        userAgent: c.req.header("user-agent") ?? null,
        success: true,
        metadata: {
          fromKeyVersion: body.expectedKeyVersion,
          toKeyVersion: body.newKeyVersion,
          itemCount: body.items.length,
          memberCount: validatedKeyUsers.size,
        },
      });
    });

    return c.json({ keyVersion: body.newKeyVersion, rekeyPending: false, itemCount: body.items.length });
  });

export type VaultRekeyRoutes = typeof vaultRekeyRoutes;
