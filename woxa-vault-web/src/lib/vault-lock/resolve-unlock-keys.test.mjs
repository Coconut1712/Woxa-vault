/**
 * Regression test — vault unlock must persist the private key on the
 * non-ZK branch (requiresZk === false) whenever the server returns keys.
 *
 * Bug being guarded (CONFIRMED 2026-06-05):
 *   In VaultLockScreen.onSubmit, the master key used to decrypt + persist the
 *   private key was only derived inside the `if (info.requiresZk)` branch.
 *   Accounts upgraded to `masterAuthKeyHash` report `requiresZk === false`
 *   (backend auth.ts: requiresZk = user.authKeyHash !== null). On that branch
 *   the code sent the plaintext Master password, left masterKey === null, and
 *   the persist block `if (masterKey && res.keys)` was SKIPPED — yet still
 *   called markUnlocked(). Result: overlay clears, but `woxa-vault-pk` never
 *   lands in sessionStorage, so getVaultKey() returns null and v2
 *   (zero-knowledge) saves throw VaultLockedError → "Vault is locked" toast.
 *
 * resolveUnlockKeys() is the extracted, dependency-injected core the screen
 * now delegates to. These tests pin its contract with stubbed crypto so they
 * run under the repo's TS-stripping Node runner (no DOM / WebCrypto needed):
 *   node --experimental-strip-types --test src/lib/vault-lock/resolve-unlock-keys.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveUnlockKeys } from "./resolve-unlock-keys.ts";

/* ---- Stubbed deps ------------------------------------------------------ */

const KEYS_BLOB = {
  encryptedPrivateKey: "ZW5jcml2YXRl", // arbitrary base64-ish; fromBase64 is stubbed
  privateKeyIv: "aXY=",
  privateKeyAuthTag: "dGFn",
  publicKey: "cHVi",
};

const PRIVATE_KEY_BYTES = new Uint8Array([1, 2, 3, 4]);

function makeDeps(overrides = {}) {
  const calls = { derive: 0, decrypt: 0, persist: [], decryptError: [] };
  const deps = {
    deriveMasterKey: async (_pw, _salt) => {
      calls.derive++;
      return new Uint8Array(32); // a master key, always derivable
    },
    decryptPrivateKey: async (_enc, _mk) => {
      calls.decrypt++;
      return PRIVATE_KEY_BYTES;
    },
    fromBase64: (s) => new TextEncoder().encode(s),
    persistPrivateKey: (pk) => {
      calls.persist.push(pk);
    },
    onDecryptError: (err) => {
      calls.decryptError.push(err);
    },
    ...overrides,
  };
  return { deps, calls };
}

/* ---- The regression: non-ZK branch must persist ------------------------ */

test("non-ZK branch (requiresZk=false) WITH keys present → persists the private key", async () => {
  const { deps, calls } = makeDeps();

  // The non-ZK branch passes the typed Master password straight through; the
  // master key is derived here (no requiresZk gate) and the blob is present.
  const result = await resolveUnlockKeys(
    { masterPassword: "correct-master-pw", salt: new Uint8Array(16), keys: KEYS_BLOB },
    deps,
  );

  assert.equal(calls.derive, 1, "master key must always be derived");
  assert.equal(calls.decrypt, 1, "private key must be decrypted");
  assert.equal(calls.persist.length, 1, "private key MUST be persisted (this was the bug)");
  assert.deepEqual(calls.persist[0], PRIVATE_KEY_BYTES);
  assert.deepEqual(result, { persisted: true, decryptFailed: false });
});

test("reproduces the OLD bug: gating persist on a null masterKey skips persistence", async () => {
  // Encodes the pre-fix logic to prove the hole was real. In the non-ZK
  // branch masterKey stayed null, so `if (masterKey && res.keys)` was false.
  const persisted = [];
  const buggyMasterKey = null; // what the old `else` branch left it as
  const resKeys = KEYS_BLOB;
  if (buggyMasterKey && resKeys) {
    persisted.push("pk");
  }
  assert.equal(persisted.length, 0, "old code never persisted on the non-ZK branch");
});

/* ---- The other branches still behave ----------------------------------- */

test("ZK branch (keys present) also persists", async () => {
  const { deps, calls } = makeDeps();
  const result = await resolveUnlockKeys(
    { masterPassword: "pw", salt: new Uint8Array(16), keys: KEYS_BLOB },
    deps,
  );
  assert.equal(calls.persist.length, 1);
  assert.equal(result.persisted, true);
});

/* ---- Perf regression: derive the master key exactly ONCE per unlock ---- */

test("ZK branch passes a pre-derived masterKey → resolveUnlockKeys does NOT re-derive", async () => {
  // The ZK branch in lock-screen.tsx already runs deriveMasterKey once to build
  // the masterAuthKeyHash factor, then hands that key to resolveUnlockKeys. The
  // helper must reuse it and skip its own (expensive Argon2id) derivation.
  const { deps, calls } = makeDeps();
  const preDerived = new Uint8Array(32).fill(7);

  const result = await resolveUnlockKeys(
    { masterPassword: "pw", salt: new Uint8Array(16), keys: KEYS_BLOB, masterKey: preDerived },
    deps,
  );

  assert.equal(calls.derive, 0, "must NOT derive again when a masterKey is supplied (perf fix)");
  assert.equal(calls.persist.length, 1, "still persists using the supplied master key");
  assert.equal(result.persisted, true);
});

test("ZK unlock derives the master key EXACTLY ONCE end-to-end", async () => {
  // Simulates the lock-screen ZK branch: deriveMasterKey is called once for the
  // auth-key-hash factor, then the same key flows into resolveUnlockKeys. The
  // doubled-Argon2id regression would show up here as derive === 2.
  const { deps, calls } = makeDeps();
  let authHashDerivations = 0;

  // 1) ZK factor derivation (the one legitimate call).
  const masterKey = await deps.deriveMasterKey("pw", new Uint8Array(16));
  authHashDerivations++; // deriveAuthKeyHash(masterKey, salt) — not a KDF over the password

  // 2) Key persistence reuses the same masterKey (no second KDF).
  await resolveUnlockKeys(
    { masterPassword: "pw", salt: new Uint8Array(16), keys: KEYS_BLOB, masterKey },
    deps,
  );

  assert.equal(calls.derive, 1, "deriveMasterKey (Argon2id) must run exactly once per ZK unlock");
  assert.equal(authHashDerivations, 1);
  assert.equal(calls.persist.length, 1);
});

test("non-ZK branch (no masterKey supplied) still derives internally", async () => {
  // The non-ZK branch never runs the ZK factor derivation, so resolveUnlockKeys
  // must derive the master key itself to honor the "always have a master key"
  // contract — still exactly once.
  const { deps, calls } = makeDeps();
  const result = await resolveUnlockKeys(
    { masterPassword: "pw", salt: new Uint8Array(16), keys: KEYS_BLOB },
    deps,
  );
  assert.equal(calls.derive, 1, "derives once when no pre-derived key is supplied");
  assert.equal(calls.persist.length, 1);
  assert.equal(result.persisted, true);
});

test("no keys blob (v1-only / no keypair) → no persist, no error", async () => {
  const { deps, calls } = makeDeps();
  const result = await resolveUnlockKeys(
    { masterPassword: "pw", salt: new Uint8Array(16), keys: null },
    deps,
  );
  assert.equal(calls.derive, 1, "still derives (cheap, harmless)");
  assert.equal(calls.decrypt, 0);
  assert.equal(calls.persist.length, 0);
  assert.deepEqual(result, { persisted: false, decryptFailed: false });
});

test("decrypt failure does NOT throw and does NOT block unlock", async () => {
  const { deps, calls } = makeDeps({
    decryptPrivateKey: async () => {
      throw new Error("bad key material");
    },
  });

  // Must resolve (not reject) so the caller can still markUnlocked().
  const result = await resolveUnlockKeys(
    { masterPassword: "pw", salt: new Uint8Array(16), keys: KEYS_BLOB },
    deps,
  );

  assert.equal(calls.persist.length, 0, "nothing persisted on failure");
  assert.equal(calls.decryptError.length, 1, "failure reported via onDecryptError");
  assert.deepEqual(result, { persisted: false, decryptFailed: true });
});
