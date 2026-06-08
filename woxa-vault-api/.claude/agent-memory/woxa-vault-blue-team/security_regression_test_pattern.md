---
name: security-regression-test-pattern
description: Vitest fixture pattern for Woxa Vault security regression tests (real DB, 2 users/2 orgs, sessions, lock state)
metadata:
  type: project
---

How to ship a security fix WITH proof fast. Model file: `src/routes/securityHardening.test.ts` (and itemTypes/trash/sharing.rbac).

**Why:** project convention is integration tests against a REAL Postgres (never mocks); a fix without a passing regression test is "not done".
**How to apply:** copy the loadDeps + makeUser/makeVault scaffolding when encoding any new attack.

- DB must be up on `localhost:5433` (Docker). If `ECONNREFUSED` → tell user to start Docker, don't touch config.
- `beforeAll` sets MFA_TOKEN_SECRET, LOCAL_KEK_BASE64, DATABASE_URL, NODE_ENV if unset.
- `loadDeps()` dynamic-imports `@/app` createApp, db/sql, schema tables, drizzle ops, and `@/lib/session` (createSession, markSessionVaultUnlocked, SESSION_COOKIE_NAME). Import `hashPassword` from `@/lib/password` when seeding ZK factors.
- Users in tests need `totpEnabledAt: new Date()` or `requireTwoFactorEnrolled` blocks them.
- Session unlock: `createSession(userId, {}, true)` to start UNLOCKED for tests that hit reveal/destructive endpoints (production default is locked). Tests that assert the lock pass `false`.
- ZK: v2 vaults need `nameCiphertext` on create. For legacy-plaintext-name tests, insert vaults with `encryptionVersion: 1`.
- Request helper: `deps.app.request(path, { headers: { Cookie, "Content-Type": "application/json" } })`.
- Assert status + `error.code` (e.g. `vault_locked`, `validation_error`, `invalid_credentials`, `forbidden`) and verify DB state (e.g. no leaked plaintext row).
- afterAll: delete vaults → users → org, then `sql.end({ timeout: 5 })`.
- Cross-tenant pattern: make 2 orgs, an admin in A, assert 404 (anti-enumeration, never 403) on B's resource ids.

Related: [[security-controls-map]], [[shipped-fixes-2026-06]]
