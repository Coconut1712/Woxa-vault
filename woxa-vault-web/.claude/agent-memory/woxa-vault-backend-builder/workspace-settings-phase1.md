---
name: workspace-settings-phase1
description: Phase-1 workspace Settings (rename/delete/expanded policy) endpoints, policy shape, and SSO stored-config enforcement
metadata:
  type: project
---

Phase-1 workspace Settings made functional in `woxa-vault-api`. Policy lives entirely in `organizations.settings` jsonb — NO migration was needed.

**Org policy shape** (`src/lib/orgPolicy.ts`, `OrgSecurityPolicy`): `{ require2fa, autoLockMinutes (clamp 1..120, default 15), sso: { allowedDomains[], jitEnabled (default true), requireSso (default false) } }`. `readOrgPolicy` is total/fail-safe; `mergeOrgSettings` DEEP-merges the `sso` sub-object so a partial PATCH (e.g. only `sso.jitEnabled`) preserves siblings. Helpers: `clampAutoLockMinutes`, `normalizeAllowedDomains` (lowercase/trim/dedupe/shape-validate, order preserved).

**Endpoints** (`src/routes/workspace.ts`):
- `PATCH /workspace` rename (owner/admin via canManageOrgMembers), audit `workspace.renamed`, returns full workspace summary. Slug immutable.
- `DELETE /workspace` OWNER-only (canManageWorkspace) + master-password proof (verifyPassword vs `user.passwordHash`) + exact `confirmName` match. Wrong pw=401, wrong name=400, non-owner=403, no-master-pw=401. Two-tier rate limit. Purges attachment blobs first, then cascades org delete in a txn. Audit `workspace.deleted` written with `orgId: null` (surviving scope — audit FKs org ON DELETE CASCADE). 204.
- `PATCH /workspace/settings` now partial: require2fa? / autoLockMinutes? / sso{...}?. Audit metadata = `{ changed: string[], ...before/after for scalars }`, no secrets.
- `GET /workspace/settings` returns full policy shape (readable by any member).

**SSO enforcement is LIVE** (`src/routes/sso.ts` callback + `ssoDomainAllowed`/`ssoJitAllowed` in orgPolicy.ts): The callback predates membership for new users, so enforcement is keyed by EMAIL DOMAIN across ALL live orgs (union), not a single org. Gate 1 = env allow-list (unchanged). Gate 2 = if ANY live org pins non-empty `sso.allowedDomains`, the domain must be in some such list (else `sso_domain_forbidden`). JIT: a new user is blocked (`sso_jit_disabled`) only if EVERY org claiming their domain has `jitEnabled:false`; if no org claims the domain, JIT defaults on.

**DEFERRED (noted, not implemented):**
- `requireSso` is PERSISTED + returned but NOT yet enforced (blocking password login = Phase B; needs per-org membership binding the callback lacks).
- Server-side `requireVaultUnlocked` window stays a fixed 15-min `VAULT_UNLOCK_IDLE_MS` constant (middleware/auth.ts). `autoLockMinutes` is client-timer-only via GET /settings. Per-org server enforcement judged NOT low-risk (multi-org conflict + lockout risk).

Tests: `src/routes/workspaceSettings.test.ts`, `src/lib/ssoEnforcement.test.ts`, expanded `src/lib/orgPolicy.test.ts`. SSO domain/JIT tests use unique per-run domains to avoid colliding with other orgs' policy in the shared dev DB. See [[view-reveal-split]] for the audit-action naming convention.
