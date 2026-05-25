---
name: require-2fa-enforcement
description: Workspace "Require 2FA" policy — storage, server-side enforcement guard map, and the multi-org currentOrgForUser asymmetry
metadata:
  type: project
---

The workspace "Require 2FA" policy (toggle that forces members to enroll TOTP before touching secrets). Audited 2026-05-21 — shippable, no critical/high blockers found.

**Architecture (verify paths still exist before recommending):**
- Policy stored in `organizations.settings` jsonb. Single owner of shape = `src/lib/orgPolicy.ts`. `readOrgPolicy` is fail-safe (malformed/legacy → require2fa:false, never throws). `mergeOrgSettings` preserves unrelated jsonb keys.
- Account-level signal: `userRequiresTwoFactorEnroll(userId)` = `totpEnabledAt IS NULL && any membership org has require2fa`. One TOTP enrollment clears the gate everywhere.
- Server guard: `requireTwoFactorEnrolled` middleware (`src/middleware/auth.ts`), mounted AFTER requireAuth, queries DB fresh each request (no caching → policy flips + 2FA-disable take effect on next request).
- Gated secret-bearing routers: vaults, vaultItem, vaultFolder, vaultMember, items, itemAttachment, attachments, sends (authenticated). NOT gated (correct): /me, /me/workspaces, /workspace/settings, enroll/verify-enroll/disable, logout, public-send reveal (/s), invite accept, members, audit. Remediation paths reachable = no lockout.
- PATCH /workspace/settings authz = `canManageOrgMembers` (owner+admin); org resolved from caller membership (no client orgId → no IDOR).

**KEY GAP — multi-org currentOrgForUser asymmetry:**
`currentOrgForUser` returns the FIRST org by joinedAt; there is NO active-org switch on backend (no X-Org header, no activeOrgId param). But invitations CAN make a user multi-org (`invitations.ts` inserts orgMembers). So:
- ENFORCEMENT scans ALL orgs (`anyMembershipRequiresTwoFactor`) — correct, can't be evaded.
- But settings GET/PATCH + `me.role` only ever target the FIRST org. A member who is owner/admin of a SECOND org cannot toggle that org's policy via this UI, and `me.role` misrepresents non-first orgs.
- Today this is latent (no workspace switcher wired), but flag it the moment active-org switching lands — settings/authz must resolve the SELECTED org, not first-by-joinedAt.

**How to apply:** On re-audit, re-grep that no new secret-decrypting router was added without `requireTwoFactorEnrolled` (grep `decryptField|decryptBytes|unwrapDek` in routes, cross-check guard). If a workspace switcher appears, re-audit settings/authz org resolution immediately.
