/**
 * Regression test — LOGIN factor selection must prefer the LOGIN password.
 *
 * Bug being guarded (CONFIRMED 2026-06-05):
 *   AuthProvider.login() chose the auth factor by `info.requiresZk`. Since the
 *   backend defines `requiresZk = (auth_key_hash !== null)` (a VAULT-UNLOCK
 *   signal, not a login signal), an account with BOTH a login password AND a
 *   legacy auth_key_hash (test@gmail.com) reported requiresZk === true. login()
 *   then derived a ZK authKeyHash from the typed LOGIN password and compared it
 *   to auth_key_hash (which was derived from the MASTER password) → never
 *   matched → email+password login was impossible. The fix routes login by
 *   `hasLoginPassword`, which the backend now returns from /auth/login-info.
 *
 * Run: node --experimental-strip-types --test src/lib/auth/select-login-factor.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { selectLoginFactor } from "./select-login-factor.ts";

/* ---- The regression: login password wins even when requiresZk is true --- */

test("hasLoginPassword=true + requiresZk=true → 'password' (THE BUG: was 'zk')", () => {
  // The test@gmail.com shape: login_password_hash set AND auth_key_hash set.
  // Must send the plaintext login password, NOT derive a ZK authKeyHash.
  assert.equal(selectLoginFactor({ hasLoginPassword: true, requiresZk: true }), "password");
});

test("hasLoginPassword=true + requiresZk=false → 'password' (normal modern account)", () => {
  // dev@iux24.com shape: login set, master_auth_key_hash set, auth_key_hash null.
  assert.equal(selectLoginFactor({ hasLoginPassword: true, requiresZk: false }), "password");
});

/* ---- Legacy ZK-only accounts still derive the authKeyHash -------------- */

test("hasLoginPassword=false + requiresZk=true → 'zk' (legacy ZK-only, no login password)", () => {
  // developer@iux24.com shape: only auth_key_hash, no login password.
  assert.equal(selectLoginFactor({ hasLoginPassword: false, requiresZk: true }), "zk");
});

test("hasLoginPassword=false + requiresZk=false → 'password' (fallback)", () => {
  assert.equal(selectLoginFactor({ hasLoginPassword: false, requiresZk: false }), "password");
});

/* ---- Rollout tolerance: older backend without hasLoginPassword --------- */

test("hasLoginPassword=undefined + requiresZk=true → 'zk' (older backend fallback)", () => {
  // Field absent (pre-fix backend) → preserve the legacy requiresZk behaviour.
  assert.equal(selectLoginFactor({ requiresZk: true }), "zk");
});

test("hasLoginPassword=undefined + requiresZk=false → 'password' (older backend fallback)", () => {
  assert.equal(selectLoginFactor({ requiresZk: false }), "password");
});

test("hasLoginPassword=undefined + requiresZk=undefined → 'password' (defensive default)", () => {
  assert.equal(selectLoginFactor({}), "password");
});

/* ---- Reproduce the OLD bug to prove the hole was real ------------------ */

test("reproduces the OLD bug: branching on requiresZk alone routes test@gmail.com through ZK", () => {
  const info = { hasLoginPassword: true, requiresZk: true };
  // Pre-fix logic: `if (info.requiresZk) { ...derive ZK... }`.
  const oldFactor = info.requiresZk ? "zk" : "password";
  assert.equal(oldFactor, "zk", "old code derived a ZK hash from the login password — login impossible");
  // New logic flips this to the correct factor.
  assert.equal(selectLoginFactor(info), "password");
});
