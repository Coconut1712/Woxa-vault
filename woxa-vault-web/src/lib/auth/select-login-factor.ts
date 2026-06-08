/**
 * selectLoginFactor — pure, dependency-injected core of the LOGIN factor
 * decision (extracted from AuthProvider.login so the branch can be unit-tested
 * without a React/crypto harness; mirrors `resolve-unlock-keys.ts`).
 *
 * The historical bug (CONFIRMED 2026-06-05): `login()` chose the auth factor by
 * `info.requiresZk`. But `requiresZk = (auth_key_hash !== null)` describes the
 * VAULT-UNLOCK master factor, NOT how to log in. An account with BOTH a login
 * password AND a legacy `auth_key_hash` (e.g. test@gmail.com) reported
 * `requiresZk === true`, so login derived a ZK `authKeyHash` from the typed
 * LOGIN password and compared it to `auth_key_hash` — which was derived from
 * the MASTER password. They never match → email+password login was impossible
 * (only Google SSO worked). This violated the "login password ≠ master
 * password" separation: login must authenticate against `login_password_hash`,
 * and the master/ZK factor is for vault unlock only.
 *
 * Contract this module pins:
 *   1. If a LOGIN password exists (`hasLoginPassword === true`), send the
 *      plaintext login password — regardless of `requiresZk`. Do NOT derive a
 *      master key (vault stays locked after login; unlock happens separately).
 *   2. Else if `requiresZk === true` (legacy ZK-only account with no login
 *      password, e.g. developer@iux24.com), derive the ZK authKeyHash.
 *   3. Else send the plaintext password (fallback).
 *   4. Rollout tolerance: `hasLoginPassword === undefined` (older backend that
 *      predates the field) falls back to the pre-fix `requiresZk`-based
 *      behaviour so nothing breaks mid-deploy.
 */

export type LoginFactorKind = "password" | "zk";

/**
 * Decide which login factor to use. Inputs are exactly the two signals from
 * GET /auth/login-info that matter for sign-in.
 */
export function selectLoginFactor(info: {
  hasLoginPassword?: boolean;
  requiresZk?: boolean;
}): LoginFactorKind {
  // (1) A login password takes precedence — this is the normal sign-in path,
  // and it must win even when a legacy auth_key_hash makes requiresZk true.
  if (info.hasLoginPassword === true) {
    return "password";
  }

  // (4) Older backend without the field → fall back to requiresZk-based
  // behaviour: when hasLoginPassword is undefined and requiresZk is true,
  // preserve the legacy ZK derivation.
  if (info.hasLoginPassword === undefined && info.requiresZk === true) {
    return "zk";
  }

  // (2) Legacy ZK-only account (no login password) → derive the authKeyHash.
  if (info.hasLoginPassword === false && info.requiresZk === true) {
    return "zk";
  }

  // (3) Fallback: plaintext password.
  return "password";
}
