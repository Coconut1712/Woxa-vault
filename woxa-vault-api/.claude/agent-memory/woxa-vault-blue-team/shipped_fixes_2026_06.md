---
name: shipped-fixes-2026-06
description: Blue-team fixes shipped 2026-06-04 and the regression test guarding each (so recurrence is caught, not re-litigated)
metadata:
  type: project
---

Fixes from the 2026-06-04 audit/red-team pass. Each is guarded — do not re-litigate without checking the test still holds.

**Why:** prevents regressions and duplicate work.
**How to apply:** if one of these surfaces again, the guard test failed — fix forward, don't re-design.

- CRITICAL ZK enforcement: `items.ts` create + patch reject plaintext metadata on v2 vaults. Guard: `securityHardening.test.ts` "ZK metadata enforcement on v2 vaults". Schema: `item_versions.encryption_version` default 1→2 (migration `0032_item_version_zk_default.sql`).
- HIGH vault auto-unlock: `session.ts createSession` no longer auto-stamps `vault_unlocked_at` (now `startUnlocked` param, default false). Only `/me/verify-password` + revoke-all stamp it. Guard: "Fresh session starts LOCKED".
- HIGH sweepStaleAccessRequests race: `expirationSweeper.ts` now single atomic `UPDATE ... WHERE status='pending' RETURNING`; notify/audit off the RETURNING set only.
- HIGH destructive-delete lock gate: `requireVaultUnlocked` added to DELETE /vaults/:id, POST /trash/empty, DELETE /trash/:id, DELETE /members/:userId, DELETE vault-members + team-members. Guard: "a locked session cannot DELETE a vault".
- MEDIUM audit phase: `me.ts` vault_unlock_success metadata phase "C"→"A" (matches failure path).
- MEDIUM rekey escalation: `rekey.ts notifyVaultManagers` falls back to org owner/admins when no vault manager can be notified.
- MEDIUM deprecated authKeyHash: `/me/verify-password` rejects authKeyHash when masterAuthKeyHash exists (forces upgrade). Guard: "verify-password refuses the deprecated authKeyHash factor".

- BUG (web, 2026-06-05) v2 save "Vault is locked" after successful unlock: `lock-screen.tsx onSubmit` only derived `masterKey` inside the `if (info.requiresZk)` branch, so for accounts upgraded to `masterAuthKeyHash` (backend `requiresZk = user.authKeyHash !== null` → false) the non-ZK branch left `masterKey=null` and SKIPPED `persistPrivateKey` while still calling `markUnlocked()`. Private key never reached sessionStorage → `getVaultKey()` returned null → v2 saves threw VaultLockedError. Fix: always derive masterKey from typed Master pw + KDF salt independent of `requiresZk` (it only picks verify payload shape); persist whenever `res.keys` present; decrypt failure logged, never blocks unlock. Logic extracted to pure `src/lib/vault-lock/resolve-unlock-keys.ts`. Guard: `src/lib/vault-lock/resolve-unlock-keys.test.mjs` "non-ZK branch (requiresZk=false) WITH keys present → persists". Note: verify-password password factor checks `user.passwordHash` (Master pw), so deriving masterKey from it is correct.

- BUG (web+api, 2026-06-05) email+password login impossible for accounts with BOTH a login password AND a legacy `auth_key_hash` (e.g. test@gmail.com): frontend `provider.tsx login()` chose the auth factor by `info.requiresZk` (= `auth_key_hash !== null`, a VAULT-UNLOCK signal). For these accounts requiresZk=true → it derived a ZK authKeyHash from the typed LOGIN pw and compared to `auth_key_hash` (derived from the MASTER pw) → never matched → only Google SSO worked. Fix: backend `GET /auth/login-info` now also returns `hasLoginPassword = (login_password_hash !== null)` (kept `requiresZk` UNCHANGED — lock-screen.tsx still consumes it for the unlock verify-payload shape; redefining it would make the lock screen send the master pw plaintext = ZK regression). Frontend routes login by a new pure helper `web/src/lib/auth/select-login-factor.ts`: hasLoginPassword → plaintext password (NO masterKey derived; vault stays locked, unlock is separate); else requiresZk → authKeyHash; else password; `hasLoginPassword===undefined` falls back to requiresZk (older-backend tolerance). Guards: web `src/lib/auth/select-login-factor.test.mjs` ("hasLoginPassword=true + requiresZk=true → 'password'"); api `src/routes/authLoginInfo.test.ts` (login-info returns hasLoginPassword + plaintext login succeeds for the test@gmail.com shape). E2E-verified against real dev `test@gmail.com` (temp hash, restored after). Contract: API_CONTRACT.md gained a `GET /auth/login-info` section.

Test fixture fallout (NOT bugs — expected from the lock + ZK changes): itemTypes/itemVersions/rotation/trash/notifications/sharing.rbac/vaultRekey updated to pass `createSession(..., true)` for unlock and/or `encryptionVersion: 1` for legacy-plaintext-name vaults. Full suite: 252 pass.

Related: [[security-controls-map]], [[security-regression-test-pattern]]
