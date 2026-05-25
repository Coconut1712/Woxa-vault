---
name: sso-enforcement-phase-a
description: requireSso / jitEnabled / allowedDomains are UI-Preview-only (not enforced) until AC-006.2 verified domain binding ships
metadata:
  type: project
---

In workspace settings, only `require2fa` and `autoLockMinutes` are genuinely backend-enforced. The three SSO controls — `requireSso`, `jitEnabled`, `allowedDomains` — are deliberately rendered as inert **Preview** (no PATCH, no "Enforced" badge, "pending enforcement" copy) on the frontend, even though the API still accepts/persists those fields.

**Why:** A security audit flagged a HIGH — the UI showed a green "Enforced" badge + success toast for `requireSso` while `/auth/login` never checks it (password login still works). All three are coupled to an unbuilt verified per-org domain binding (`org_domains` table, AC-006.2) in `woxa-vault-api/src/lib/orgPolicy.ts`: `requireSso` is never checked at login; `ssoJitAllowed` returns true unless `allowedDomains` is set (so `jitEnabled` only matters with `allowedDomains`); `ssoDomainAllowed` has a cross-tenant DoS and isn't a real verified allow-list. Product owner chose UI-honesty over building enforcement now (Phase A).

**How to apply:** Do NOT re-wire any of these three to a live toggle / PATCH until AC-006.2 lands. The rule "no green Enforced-style badge unless the backend actually enforces it" governs this page — only `require2fa` qualifies (`autoLockMinutes` is a value selector, not an Enforced toggle). The API client `src/lib/api/workspace-settings.ts` legitimately still types/accepts these fields — leave it intact; the gate is purely what the UI presents as live. See [[ui-honesty-no-fake-enforced]].
