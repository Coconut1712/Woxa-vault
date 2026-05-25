---
name: workspace-security-settings
description: Workspace security-settings + SSO-enforcement feature — orgPolicy shape, enforcement gaps, the requireSso phantom-control finding
metadata:
  type: project
---

Workspace security-settings + SSO-enforcement feature. Audited 2026-05-22. Verdict: shippable ONLY after the requireSso UI fix (one HIGH security-UX finding); crypto/IDOR/validation all clean.

**Where the shape lives:** `woxa-vault-api/src/lib/orgPolicy.ts` is the single owner of `organizations.settings` jsonb. `readOrgPolicy` is total/fail-safe (verified: malformed/null/garbage → SAFE_DEFAULT, require2fa only true on literal `true`, never throws — tests in orgPolicy.test.ts cover null/garbage/string-true/number coercion). `clampAutoLockMinutes` band [1,120], default 15. `normalizeAllowedDomains` lowercase/trim/dedupe + DOMAIN_RE. `mergeOrgSettings` deep-merges sso field-by-field, preserves unknown top-level keys.

**DOMAIN_RE is ReDoS-SAFE** (re-verified empirically 2026-05-22): `/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/`. The `(?=.{1,253}$)` length anchor short-circuits — 305K-char adversarial input matches in ~38µs (linear). Array capped at `z.array(z.string()).max(100)`. No smuggling, no DoS.

**HIGH (security-UX) — `requireSso` is a PHANTOM control.** Stored in policy, returned by GET, accepted by PATCH, but NEVER enforced in `routes/auth.ts` /login (password sign-in always succeeds with a valid login_password_hash regardless of requireSso). The CONTRACT is honest (API_CONTRACT.md:608/618 say "(Phase B) … not yet enforced at login"). But the FRONTEND lies: `app/app/settings/page.tsx` renders requireSso via `LivePolicyRow` (same component as the genuinely-enforced require2fa) → shows green "Enforced" badge when true; i18n copy "Disable password sign-in. Everyone must come through Google Workspace." + toast "SSO is now required for all members." An admin is told credential-phishing is mitigated when it is not. Fix = render requireSso as `PreviewPolicyRow` (inert + Preview badge) until backend enforces it, OR enforce it in auth.ts /login (block password login when caller's email domain is claimed by a requireSso org). Until then it MUST NOT show "Enforced".

**Cross-tenant DoS (MEDIUM) in `ssoDomainAllowed`:** union enforcement across ALL live orgs — if ANY single org pins a non-empty allowedDomains, EVERY domain not in some org's list is rejected at the SSO callback (gate runs at sso.ts:287 BEFORE user resolve, so it hits EXISTING SSO users too, not just JIT). One tenant unilaterally enabling a domain allow-list can break SSO sign-in for all other tenants whose domain nobody listed. Documented + tested behavior (ssoEnforcement.test.ts:85). Bounded: password login still works; only the SSO path. Real fix needs verified org_domains binding (AC-006.2, not built) so a domain list scopes to its OWN org. Flag every audit until org_domains lands.

**Verified CLEAN:**
- IDOR: GET/PATCH /workspace/settings resolve org via `activeOrgForContext` (no client orgId). PATCH gated `canManageOrgMembers` (owner+admin); member/guest → 403. See [[active-workspace-switching]] for the resolveActiveOrg seam (role always from live membership).
- SSO callback enforces ssoDomainAllowed (sso.ts:287) + ssoJitAllowed (sso.ts:337, INSIDE the provision tx) before insert; new SSO user still lands org-less (no round-9 slug-auto-join regression). require_2fa app-level gate intact (sso.ts:406).
- Audit metadata carries only changed key NAMES + before/after for non-secret scalars (require2fa/autoLockMinutes); allowedDomains VALUES never echoed. No new secret field → redact list untouched (correct).
- FE: no console.*, no dangerouslySetInnerHTML, no localStorage, no secrets in URL. Mock SSO block (provider/group/events/default-JIT-role) is inert — `pointer-events-none select-none aria-hidden`, no onClick→API, mock/sso.ts is plain data arrays. RBAC is UX-only (canViewWorkspaceSettings) with 403 revert in the `patch` controller (reverts optimistic state + toast). allowedDomains sent as plain strings, server normalizes.
- Contract MATCHES code (requireSso "not yet enforced" stated; org_domains "still NOT built", allowedDomains called "flat unverified string[]"). AllowedDomains.tsx explicitly avoids fake "verified" badges (AC-006.2 not built).

Related: [[require_2fa_enforcement]] [[active-workspace-switching]] [[rbac_org_hierarchy]] [[sso_2fa_handoff]] [[recurring_antipatterns]] [[phase_a_residuals]]
