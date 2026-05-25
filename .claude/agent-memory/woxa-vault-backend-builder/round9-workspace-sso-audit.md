---
name: round9-workspace-sso-audit
description: Round-9 security audit fixes — transfer-ownership password proof, SSO JIT no auto-join, concurrent-transfer 409, isUniqueViolation helper
metadata:
  type: project
---

Round 9 (2026-05-21) — security-audit blockers on the Single-Owner workspace + SSO JIT work. See [[single-owner-workspace]] and [[google-sso]] for the baselines that were hardened.

**HIGH#1 — `POST /workspace/transfer-ownership` now requires `password` (CONTRACT CHANGE).**
- `transferSchema` (now EXPORTED from `src/routes/workspace.ts` for unit tests) gained `password: z.string().min(1).max(1024)`.
- Re-verifies caller's master password via `verifyPassword(user.passwordHash, password)`; SSO-only owner (no `passwordHash`) → `401 invalid_credentials`. Mirrors `/me/sessions/revoke-all` + `/me/recovery-kit/regenerate` proof-of-possession convention.
- Two-tier rate limit replaced the old single bucket: soft 20/hr/user (consume every attempt via `rateLimit`) + hard 5/hr/user (`peekRateLimit` up front, `consumeRateLimit` ONLY on failed verify). Keys `workspace-transfer-soft:` / `workspace-transfer-fail:`.
- New audit action `workspace.ownership_transfer_failed` (success:false, metadata.reason="wrong_password") on bad password.
- `password` already covered by pino redact (`*.password` + `req.body.password`) — verified, no logger change needed.

**HIGH#2 — SSO JIT no longer auto-joins by slug.** `src/routes/sso.ts` JIT branch: provisions the USER row ONLY, creates NO `org_members`. Removed the `organizations.slug === emailDomain.split('.')[0]` lookup (slug is derived from attacker-chosen workspace name → cross-tenant capture). New SSO user lands org-less → frontend `/spaces`. Removed now-unused `organizations`/`orgMembers` imports from sso.ts. Verified-domain auto-join deferred to **AC-006.2** (`org_domains` table — NOT built this round).

**MEDIUM — concurrent transfer race → 409 not 500.** Wrapped the transfer tx in try/catch; `isUniqueViolation(err, "org_members_single_owner_idx")` maps the 23505 to new error `errors.ownershipTransferConflict()` → `409 ownership_transfer_conflict`.

**New helper `src/lib/pgError.ts` — `isUniqueViolation(err, constraint?)`.** Duck-types the `postgres-js` PostgresError (`.code === "23505"`, optional `.constraint_name` match). First reusable PG-error helper in the codebase; use it for any future unique-violation→friendly-error mapping. Unit tests in `pgError.test.ts`.

**Follow-up flagged (NOT done):** session rotation for the demoted ex-owner after a successful transfer. Their session correctly carries only admin rights but cached elevated assumptions persist until expiry. Inline FOLLOW-UP comment in the transfer handler.

**Tests:** all pure-unit (no DB harness exists). Added `pgError.test.ts` (5) + `transferSchema` block in `workspace.test.ts` (4). 34/34 pass. The password-verify + tx flow itself is integration-only and untested.

**Docs updated:** API_CONTRACT.md (transfer endpoint body, error table `ownership_transfer_conflict`, SSO JIT section, new round footer block), REQUIREMENTS.md AC-005.8 + AC-006.2, DESIGN.md JIT note (line ~175).
