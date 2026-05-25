---
name: rbac-org-hierarchy
description: Single-owner org RBAC model — outranks(), transfer-ownership invariant, where the gates live
metadata:
  type: reference
---

**Single-Owner org model (DESIGN.md §3, Phase A).** Owner > Admin > Member > Guest.

**Hierarchy helpers:** `woxa-vault-api/src/lib/orgAccess.ts`
- `ROLE_RANK` numeric map; `outranks(actor, target)` = strict `>` (peers return false — correct, no off-by-one).
- `ASSIGNABLE_ORG_ROLES = [admin, member, guest]` — `owner` excluded by design. `roleSchema = z.enum(ASSIGNABLE_ORG_ROLES)` in members.ts rejects `role:"owner"` at validation (400). Owner moves ONLY via transfer-ownership.
- `canManageWorkspace(role)` = owner-only (delete ws / transfer / billing). `canManageOrgMembers` = owner|admin.
- `currentOrgForUser` returns FIRST membership by `joinedAt` (single-workspace model). `orgsForUser` returns all (switcher).

**Single-owner invariant — TWO layers (both verified correct):**
1. App: `POST /workspace/transfer-ownership` (routes/workspace.ts) — owner-only, atomic tx: demote old owner→admin THEN promote target→owner, rejects self-transfer + non-member target, rolls back if promote affects 0 rows (target vanished) so never 0 owners.
2. DB: partial unique index `org_members_single_owner_idx ON org_members(org_id) WHERE role='owner'` (schema.ts + migration 0009). Catches concurrent-transfer races → unique violation → tx rollback → generic 500 (acceptable; no DB internals leak via app.onError scrub). Migration is correct.

**Contract change:** last-owner removal is `403 forbidden` (generic), NOT `409 last_owner`. Backend emits no `last_owner` code. FE `mapMemberError` dead `case "last_owner"` removed; `case "forbidden"` → `members.error.owner_forbidden`.

**RESOLVED (verified closed 2026-05-21, re-verify round):**
- HIGH#1 transfer-ownership now re-verifies master password. `transferSchema.password` (workspace.ts:90) required; `verifyPassword` (330) Argon2 constant-time; SSO-only (no passwordHash) → 401; two-tier RL (soft 20/hr consume-always + hard 5/hr consume-on-failure, mirrors revoke-all); owner-check BEFORE verify so non-owner can't grind password oracle; audit success+fail no secret leak.
- HIGH#2 SSO JIT no longer slug-auto-joins. New SSO user lands ORG-LESS (sso.ts:320-331 inserts users row only). `/me` returns hasWorkspace:false → FE /spaces. All currentOrgForUser callers fail-closed on null (members/audit/workspace → notFound; vaults POST → forbidden; vaults GET → []; sends.ts:208 orgId nullable `?? null`, schema org_id nullable onDelete:set null). No 500/leak on org-less.
- MEDIUM concurrent-transfer → 409. `isUniqueViolation(err,"org_members_single_owner_idx")` (pgError.ts) checks 23505 + exact constraint; name matches schema.ts:123 + migration 0009 + workspace.ts:408. Narrow catch, non-match re-throws to scrubbed onError.
- MEDIUM FE members page: `MemberRowMenu.assignable=["admin","member","guest"]` (owner removed, page.tsx:750); owner row guard `m.role!=="owner"` (576); API client narrows `InviteRole=Exclude<OrgRole,"owner">`. UX-only gate; real gate backend.

**Role-edit hierarchy fix (audited 2026-05-21, focused round — SHIPPABLE):** PATCH `/members/:userId` (members.ts:235+245) AND POST `/members/invite` (members.ts:353) now enforce TWO guards: `outranks(current.role, target.role)` (which row I may edit) AND `outranks(current.role, role)` (which rank I may grant). The NEW-role guard is the fix — without it an admin (rank2) could mint a peer admin (rank2→2). Both guards throw BEFORE any audit insert, so denials never log success; success audit carries `{from,to}`. Test `members.rbac.test.ts` = 6 cases, ALL PASS (admin→admin 403, admin→guest 200, owner→admin 200, for both PATCH+invite). FE mirrors exactly: `outranks`/`assignableRoles` (page.tsx:89/100), row-menu shown only when `outranks(currentRole,m.role)` (page.tsx:619-622), invite dialog uses same `assignable` — UX gate, backend is source of truth (documented).
**COMPLETE org-role write-path inventory (all guarded or safe):** members.ts:250 PATCH (✓ both guards) · members.ts invite POST (✓ grant guard, schema enum excludes owner) · workspace.ts:246 create→always `owner` to creator (✓ new org, no escalation) · workspace.ts:493/498 transfer (✓ owner-only + atomic + pw re-verify) · invitations.ts:269 accept-insert + :460 signup-accept-insert (write `row.role` verbatim — NO outrank re-check at accept; gate is at invite-CREATION time) · seed.ts:61 (not user-reachable). me.ts/vaults.ts only READ orgMembers.
**Residual (acceptable, deferred):** (1) accept-invite copies `invitations.role` verbatim, no re-check — a *pre-existing* pending admin-invite (only an owner could have minted one, since invite POST now blocks admin-from-admin) still grants admin on accept. NOT a new escalation; defense-in-depth follow-up = re-validate role vs inviter's CURRENT rank at accept, or null stale admin invites if inviter demoted. (2) transfer does NOT rotate demoted ex-owner's session (workspace.ts:418). (3) workspace-create + member role-change still no master-password re-verify (lower-risk than transfer; not flagged).
**Unrelated test failure CONFIRMED pre-existing:** `lib/mailer/resend.test.ts` "falls back to console.log when RESEND_API_KEY not configured" expects `not_configured` but gets `transport_failed`. Cause = test env HAS a real RESEND_API_KEY so getClient() returns live client, email actually dispatches, Resend returns validation_error→transport_failed (resend.ts:279/285). Mailer module has ZERO refs to orgMembers/outranks/role — not touched by RBAC change. Test isolation bug (env leak), not RBAC.

Related: [[validation_and_ratelimit]] [[audit_and_logging]] [[recurring_antipatterns]] [[auth_session_patterns]]
