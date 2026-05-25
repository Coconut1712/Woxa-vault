---
name: require-2fa-policy
description: Where the workspace Require-2FA security policy + server-side enforcement lives in the API
metadata:
  type: project
---

Workspace "Require 2FA" security policy is implemented in the API (verify paths before relying on them). NOTE: a later round expanded `orgPolicy.ts` / `/workspace/settings` well beyond require2fa (autoLock + SSO sub-policy + cross-org SSO enforcement) — see [[workspace-security-settings-round]] for the current full shape.

- Policy stored in existing `organizations.settings` jsonb (no migration). Parser/merger/helpers in `src/lib/orgPolicy.ts`: `readOrgPolicy` (fail-safe, never throws, non-boolean → false), `mergeOrgSettings`, `anyMembershipRequiresTwoFactor`, `userRequiresTwoFactorEnroll`. Zod `securityPolicySchema` is in `src/routes/workspace.ts`.
- Endpoints in `src/routes/workspace.ts`: `GET /workspace/settings` (any member reads), `PATCH /workspace/settings` (owner+admin via `canManageOrgMembers`, rate-limited 20/hr/user, audit `workspace.security_policy_updated`).
- `/me` payload field `requiresTwoFactorEnroll` (account-level: `totpEnabledAt==null && any membership org require2fa`). One enrollment satisfies all workspaces.
- Enforcement middleware `requireTwoFactorEnrolled` in `src/middleware/auth.ts`, mounted as `.use("*", ...)` after `requireAuth` on the 6 secret-bearing routers (vaults, items[2 routers], folders[2], vaultMembers, sends, attachments[2]). Returns 403 `two_factor_required` (error in `src/lib/errors.ts`).
- NOT gated (avoids lockout): /auth/2fa/enroll, verify-enroll, GET /me, GET /workspace/settings, logout, public /s/:token reveal.

**Why account-level not per-workspace:** 2FA is an account credential — enrolling once clears the flag everywhere. Admin who enables policy while lacking 2FA gates themselves too (consistent).

Tests: `src/lib/orgPolicy.test.ts` (pure, fail-safe defaults) + `src/routes/requireTwoFactor.test.ts` (integration, real Postgres on 5433, mirrors [[sso-2fa-handoff-contract]] pattern: dynamic import deps, createSession → cookie, app.request). Covers PATCH owner/admin/member RBAC, /me signal both states, 403 block on GET /vaults, no-lockout on /me + /auth/2fa/enroll.
