---
name: two-password-model
description: Login password (login_password_hash) is SEPARATE from master password (password_hash); /auth/register self-service signup; migration 0011
metadata:
  type: project
---

Round (2026-05-21) split login and master credentials into two distinct values, confirmed by the product owner.

**The split:**
- `users.login_password_hash` (migration 0011, nullable) = Argon2id of the LOGIN password. The ONLY field `POST /auth/login` verifies.
- `users.password_hash` = MASTER password ONLY. Subject of vault-unlock (`/me/verify-password`, `requireVaultUnlocked`, `vault_unlocked_at`) + recovery kit. Set at `POST /me/password/setup`. NEVER consulted by login. `requiresPasswordSetup = (password_hash === null)` — unchanged.
- `auth_key_hash` is still the Phase-C zero-knowledge field — untouched.

**Login change (`src/routes/auth.ts`):** verifies `user.loginPasswordHash`. The dummy-Argon2 timing branch now triggers on `!user || !user.loginPasswordHash` (was `!user.passwordHash`) so SSO-only/legacy accounts (login hash NULL) get constant-time `invalid_credentials` — no enumeration. Audit `auth.login.failed` metadata reason: `user_not_found` vs `no_login_password`.

**New `POST /auth/register`** (`src/routes/auth.ts`): body `{ email, password, displayName? }`, `password` = LOGIN password, strength min 10/max 1024 (same bar as `passwordSetupSchema`). Sets `login_password_hash`; leaves `password_hash` (master) NULL; creates Lucia session + cookie (logs in immediately); NO org membership; NO recovery kit (kit is bound to master → emitted at `/setup-password`). Rate limit 5/hour/IP key `register:ip:<ip>` + Retry-After. Pre-check on `lower(email)` + 23505 race fallback (uses `isUniqueViolation` from `lib/pgError`) → both surface `409 email_taken`. Audit `auth.register` (success) / `auth.register.failed` (email_taken / email_taken_race). `Cache-Control: no-store`.

**New error code:** `errors.emailTaken()` → `409 email_taken` (NOT constant-time — registration deliberately tells the user; rate limit is the brute-force defence). In `lib/errors.ts` + API_CONTRACT error table.

**Frontend ladder after register:** `requiresPasswordSetup=true`, `hasWorkspace=false` → existing ladder routes `/setup-password` (sets master, shows recovery kit) → `/spaces`. No frontend contract change needed beyond the new endpoint.

**Side-effects verified (no regression):**
- SSO callback (`sso.ts`) uses `passwordHash` only for `needsSetup` gating; never sets login hash. JIT users land org-less + master-less → /setup-password. Unaffected.
- `/me/verify-password`, recovery-kit setup/regenerate, reset-with-recovery all bind to `password_hash` (master). Confirmed they do NOT touch `login_password_hash`.
- Legacy/dev-SSO accounts have `login_password_hash` NULL → email+password login fails (use Google). Accepted behaviour change.

**Test:** `src/routes/authRegister.test.ts` (integration, real PG): register success (login hash set / master NULL / session + /me requiresPasswordSetup), email_taken, weak-password 400, login verifies login-hash (master password does NOT log in), SSO-only login fails. All pass.

**Invite signup aligned to two-password (2026-05-21):** `POST /invite/:token/signup-and-accept` (`src/routes/invitations.ts`) now sets the chosen password as `login_password_hash`, leaves `password_hash` (master) NULL, and NO LONGER mints/returns a recovery kit (removed `recoveryCode` from response + dropped the `account.recovery_kit_generated` audit; kept `member.invitation_accepted`). Master + recovery kit move to `/setup-password`. Fixes lockout: prior code set master + no login hash → invite-signup users couldn't sign back in after session expiry. `email_verified_at` still set (invite proves mailbox). `POST /invite/:token/accept` (existing-user) untouched — never touched passwords. Test: `src/routes/inviteSignup.test.ts` (login hash set / master NULL / recoveryKitHash NULL / no recoveryCode in body / joins org at invited role / can log in with that login pw / 409 user_exists / 400 weak). Mirror of [[account-self-service]] invite flow but now login-password-first.

See [[account-self-service]] (setup-password flow), [[recovery-kit-flow]] (master-bound kit), [[migration-history-handwritten]] (0011 hand-authored, db:migrate applied for real).
