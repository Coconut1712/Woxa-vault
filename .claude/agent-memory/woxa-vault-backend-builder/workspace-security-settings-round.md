---
name: workspace-security-settings-round
description: Round that expanded org settings to autoLock + SSO sub-policy and wired SSO domain/JIT enforcement into the Google callback
metadata:
  type: project
---

Workspace security-settings + SSO-enforcement round (shipped 2026-05-22). Extends the require2fa-only policy from [[require-2fa-policy]]. Verify against the files before relying on details.

**`src/lib/orgPolicy.ts` is the single owner of `organizations.settings` (jsonb) shape.** Expanded this round beyond `require2fa`:
- `autoLockMinutes` — clamp band `AUTO_LOCK_MIN=1` / `AUTO_LOCK_MAX=120` / `AUTO_LOCK_DEFAULT=15`, via `clampAutoLockMinutes()` (rounds, clamps, garbage → default).
- `sso` sub-policy `{ allowedDomains: string[], jitEnabled, requireSso }`. `normalizeAllowedDomains()` lowercases/trims/dedupes (first-wins, order preserved) + validates against `DOMAIN_RE` (basic `label.label.tld`, no scheme/path/spaces), invalid entries dropped.
- `readOrgPolicy()` is **TOTAL / fail-safe** — any parse failure degrades to safe defaults `{ require2fa:false, autoLockMinutes:15, sso:{ allowedDomains:[], jitEnabled:TRUE, requireSso:false } }`, never throws (it also feeds the require2fa enforcement guard, so a throw would take down /me + the gate). Note `sso.jitEnabled` defaults **true** (preserves prior JIT behavior); only explicit `false` disables.
- `mergeOrgSettings()` deep-merges: top-level keys overlay, `sso` merges field-by-field so a partial `sso` PATCH preserves the other `sso.*` keys; unknown/internal keys are never dropped (`.passthrough()` schemas).

**GET/PATCH `/workspace/settings` (`src/routes/workspace.ts`).** Both now return/accept the FULL envelope `{ require2fa, autoLockMinutes, sso: { allowedDomains, jitEnabled, requireSso } }`.
- GET: any member (org from caller membership, no IDOR).
- PATCH: owner+admin via `canManageOrgMembers` (`403 forbidden` otherwise); partial body (`securityPolicySchema`, exported; `allowedDomains` Zod max 100); rate-limited 20/hr/user (`429` + `Retry-After`); clamps autoLock + normalizes domains server-side; no-op writes (normalized value == current) skip the settings UPDATE **and** the audit row; always returns the full current policy.
- Audit `workspace.security_policy_updated` metadata carries ONLY changed key names + before/after for non-secret scalars (`require2fa`, `autoLockMinutes`) + `sso: ["sso.*"]` array — **domain values are never echoed**.

**SSO callback enforcement (`src/routes/sso.ts`), two stored-policy gates added after the existing env-allow-list gate.** Both helpers live in `orgPolicy.ts` and read the **union of LIVE (non-deleted) org policies keyed by email domain** — rationale: the callback runs before a brand-new user has any org membership (single-Owner onboarding lands them org-less, see [[single-owner-workspace]]), so there's no single org to consult.
- `ssoDomainAllowed(emailDomain)` — if ANY live org pins a non-empty `allowedDomains`, the domain must appear in at least one such list; empty list = open mode. Reject → `sso_domain_forbidden` (audit gate `org_policy`). This is gate 2; gate 1 is the env `GOOGLE_OAUTH_ALLOWED_DOMAIN` from [[google-sso]].
- `ssoJitAllowed(emailDomain)` — gates brand-new-user JIT provisioning: if org(s) claim the domain, allowed only if ≥1 claiming org has `jitEnabled=true`; no claiming org → defaults on. Reject → `sso_jit_disabled` (audit `reason:jit_disabled`). Re-checked INSIDE the provisioning transaction so a concurrent policy flip can't slip a user through.

**Still NOT built — AC-006.2 verified-domain `org_domains` table.** `allowedDomains` is a flat, UNVERIFIED `string[]`: no DNS/ownership proof, no domain→org binding. This is exactly why JIT auto-join stays invitation-only (the HIGH#2 cross-tenant capture fix from [[round9-workspace-sso-audit]]). Verified-domain workflow remains deferred.

State at write time: typecheck clean; 182/183 tests pass (the 1 failure is the documented pre-existing `resend.test.ts` mailer-cache quirk, unrelated). Active workspace resolution via `activeOrgForContext` — see [[active-workspace-model]].
