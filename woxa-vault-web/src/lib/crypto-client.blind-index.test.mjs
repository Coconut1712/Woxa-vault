/**
 * Blind-index contract test (Phase C / FR-043).
 *
 * Cross-checks the client token model in `crypto-client.ts` against an
 * independent `node:crypto` reproduction of the SAME contract pinned by the
 * backend at woxa-vault-api/src/routes/searchBlind.test.ts. If the two ever
 * diverge — HKDF params, normalization, tokenization, or HMAC encoding — a
 * search would silently return nothing, so this is the canary.
 *
 * Run with the project's TS-stripping Node:
 *   node --experimental-strip-types --test src/lib/crypto-client.blind-index.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, hkdfSync } from "node:crypto";

import {
  deriveSearchKey,
  tokenizeField,
  blindToken,
  computeSearchTerms,
  computeQueryTerms,
} from "./crypto-client.ts";

/* ---- Backend reference (verbatim from searchBlind.test.ts) ------------- */

function refDeriveSearchKey(vaultKey, vaultId) {
  const info = Buffer.from(`woxa-blind-index-v1${vaultId}`, "utf8");
  return Buffer.from(hkdfSync("sha256", vaultKey, Buffer.alloc(32), info, 32));
}

function refNormalize(s) {
  return s.toLowerCase().trim();
}

function refTokenize(field) {
  const norm = refNormalize(field);
  if (!norm) return [];
  const tokens = new Set();
  for (const w of norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) tokens.add(w);
  const compact = norm.replace(/\s+/g, " ");
  for (let i = 0; i + 3 <= compact.length; i++) tokens.add(compact.slice(i, i + 3));
  return [...tokens];
}

function refHmac(searchKey, token) {
  return createHmac("sha256", searchKey).update(token, "utf8").digest("base64");
}

function refItemTerms(searchKey, fields) {
  const tokens = new Set();
  for (const f of fields) for (const t of refTokenize(f)) tokens.add(t);
  return [...tokens].map((t) => refHmac(searchKey, t));
}

/* ---- Fixtures ---------------------------------------------------------- */

const VAULT_ID = "11111111-2222-3333-4444-555555555555";
// A fixed 32-byte vault key so the vectors are deterministic.
const VAULT_KEY = new Uint8Array(32);
for (let i = 0; i < 32; i++) VAULT_KEY[i] = (i * 7 + 3) & 0xff;

/* ---- Tests ------------------------------------------------------------- */

test("deriveSearchKey matches HKDF reference", async () => {
  const got = await deriveSearchKey(VAULT_KEY, VAULT_ID);
  const ref = refDeriveSearchKey(Buffer.from(VAULT_KEY), VAULT_ID);
  assert.equal(Buffer.from(got).toString("hex"), ref.toString("hex"));
});

test("tokenizeField matches reference (words + trigrams, deduped)", () => {
  const samples = [
    "GitHub Production Token",
    "Stripe Live API Key",
    "deploy@corp.io",
    "https://dash.stripe.com/login",
    "  Mixed   CASE  spaces ",
    "a", // shorter than a trigram
    "ab",
    "", // empty
    "ZZZSecretZK Marker",
    "บัญชี ธนาคาร กสิกร", // Thai words must be preserved (Unicode \p{L})
    "東京 サーバー key", // CJK + ASCII mix
  ];
  for (const s of samples) {
    assert.deepEqual(
      [...tokenizeField(s)].sort(),
      [...refTokenize(s)].sort(),
      `tokenize mismatch for ${JSON.stringify(s)}`,
    );
  }
});

test("blindToken HMAC base64 matches reference (44 chars)", async () => {
  const searchKey = await deriveSearchKey(VAULT_KEY, VAULT_ID);
  const refKey = refDeriveSearchKey(Buffer.from(VAULT_KEY), VAULT_ID);
  for (const token of ["stripe", "git", "deploy@corp.io", "тест", "🔒"]) {
    const got = await blindToken(searchKey, token);
    assert.equal(got, refHmac(refKey, token), `hmac mismatch for ${token}`);
    assert.equal(got.length, 44);
  }
});

test("computeSearchTerms equals reference union of fields", async () => {
  const searchKey = await deriveSearchKey(VAULT_KEY, VAULT_ID);
  const refKey = refDeriveSearchKey(Buffer.from(VAULT_KEY), VAULT_ID);

  const fields = {
    name: "GitHub Production Token",
    username: "deploy@corp.io",
    url: "https://github.com",
    tags: ["prod", "infra"],
  };
  const got = (await computeSearchTerms(searchKey, fields)).sort();
  const ref = refItemTerms(refKey, [
    fields.name,
    fields.username,
    fields.url,
    ...fields.tags,
  ]).sort();
  assert.deepEqual(got, ref);
});

test("a query term is a subset of the item terms it should match", async () => {
  const searchKey = await deriveSearchKey(VAULT_KEY, VAULT_ID);
  const itemTerms = new Set(
    await computeSearchTerms(searchKey, { name: "Stripe Live API Key" }),
  );
  const queryTerms = await computeQueryTerms(searchKey, "stripe");
  assert.ok(queryTerms.length > 0);
  for (const qt of queryTerms) {
    assert.ok(itemTerms.has(qt), "query token not found in item term set");
  }
});

test("per-vault keys produce different digests for the same token", async () => {
  const keyA = await deriveSearchKey(VAULT_KEY, VAULT_ID);
  const keyB = await deriveSearchKey(VAULT_KEY, "99999999-0000-0000-0000-000000000000");
  assert.notEqual(await blindToken(keyA, "stripe"), await blindToken(keyB, "stripe"));
});
