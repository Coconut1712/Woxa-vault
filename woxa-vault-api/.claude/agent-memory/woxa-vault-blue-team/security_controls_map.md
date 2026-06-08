---
name: security-controls-map
description: Where each Woxa Vault server-side security control lives + conventions for adding one
metadata:
  type: project
---

Map of the defensive controls in woxa-vault-api and how to extend them.

**Why:** so a future fix targets the right layer (root cause) and reuses helpers instead of re-rolling.
**How to apply:** consult before implementing any authz/lock/ZK fix.

- Auth middleware: `src/middleware/auth.ts`
  - `requireAuth` — 401 if no `c.var.user`. `sessionMiddleware` populates `user`/`sessionToken`/`session` (live row) for every request.
  - `requireVaultUnlocked` — gates endpoints that emit plaintext OR are destructive. Checks per-session `vault_unlocked_at` within `VAULT_UNLOCK_IDLE_MS` (15min); else throws `errors.vaultLocked()` (401 `vault_locked`). Mount per-route, AFTER requireAuth. Now mounted on: item reveal/`:id`/version-reveal (items.ts), `DELETE /vaults/:id`, `POST /trash/empty`, `DELETE /trash/:id`, `DELETE /members/:userId`, `DELETE /vault-members .../members/:userId` + `.../team-members/:teamId`.
  - `requireTwoFactorEnrolled` — 403 `two_factor_required`. NOT mounted on self-remedy routers (auth 2fa enroll/verify, /me, /workspace settings GET).
  - `blockGuestWrites` — guest/auditor read-only on non-GET. Role from `activeOrgForContext` (re-validated, never cached).
  - `activeOrgForContext(c)` — THE seam for org scoping; calls `resolveActiveOrg` which re-validates membership + derives role from the active org (never trusts session pointer blindly).
- Vault unlock stamping: `src/lib/session.ts` `markSessionVaultUnlocked(token)`. ONLY `POST /me/verify-password` and `POST /me/sessions/revoke-all` stamp it. `createSession(userId, meta, startUnlocked=false)` — production NEVER passes startUnlocked; sessions start LOCKED.
- ZK enforcement: `src/routes/items.ts` create + patch — v2 vault (`encryptionVersion===2`) requires `nameCiphertext`; patch rejects non-null plaintext name/username/url. Vaults default v2; legacy v1 still allows plaintext.
- RBAC helpers: `src/lib/access.ts` (item/folder effective role, canRevealItem, canGrantRole, shareAuthorityForItem), `src/lib/orgAccess.ts` (outranks, canManageOrgMembers, ASSIGNABLE_ORG_ROLES — owner excluded), `src/routes/vaults.ts` (loadVaultForUser/Viewer, canEditVault=manager-only, canManageItem=manager|editor).
- Rate limit: `src/lib/rateLimit.ts` — `rateLimit` (consume), `peekRateLimit` (no consume), `consumeRateLimit`. Pattern: soft cap consumed every attempt + hard cap consumed only on failure (verify-password, recovery-kit regenerate).
- Audit: append-only `auditEvents`. Failure + success paths must use the SAME `phase` tag (vault_unlock now phase "A" both sides). Never log plaintext/tokens/URL fragments.
- Atomic mutation convention: prefer single `UPDATE ... WHERE <guard> RETURNING` over SELECT-then-loop-UPDATE (race-free). Applied in `expirationSweeper.sweepStaleAccessRequests` and the one-time-send max-views decrement.
- Migrations are HANDWRITTEN: add `drizzle/NNNN_name.sql` + a `_journal.json` entry (idx, version "7", when, tag, breakpoints). Snapshots are sparse — not required per migration. Apply via `npm run db:migrate`.

Related: [[shipped-fixes-2026-06]], [[security-regression-test-pattern]]
