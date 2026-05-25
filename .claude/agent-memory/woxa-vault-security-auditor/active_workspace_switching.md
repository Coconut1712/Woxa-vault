---
name: active-workspace-switching
description: M-1 multi-org active-workspace model — resolveActiveOrg seam, per-session pointer, IDOR/role-bleed defenses (audited SHIPPABLE)
metadata:
  type: reference
---

**M-1 active workspace (audited 2026-05-21 — SHIPPABLE, no blockers).** Multi-org users no longer silently act on first-membership org; each session has a selected workspace.

**Core seam (single source of truth for "which org is this request acting on"):**
- `sessions.active_org_id uuid NULL` FK organizations ON DELETE SET NULL (schema.ts:192, migration 0012 — idempotent `IF NOT EXISTS` + `DO $$ EXCEPTION WHEN duplicate_object`).
- `resolveActiveOrg({userId, sessionActiveOrgId})` in `lib/orgAccess.ts:95` — RE-VALIDATES membership against a LIVE `org_members` row on EVERY call. Pointer honoured ONLY if (userId, orgId) membership exists; miss (left org / org deleted / forged id) silently falls back to `currentOrgForUser` (first membership by joinedAt). **Role ALWAYS comes from the resolved membership row, never a cached/session value.** This is the IDOR + stale-grant + cross-org privilege-escalation defense in one place.
- `activeOrgForContext(c)` in `middleware/auth.ts:214` — reads `session.activeOrgId` off the live session row (already loaded by sessionMiddleware, no extra fetch) → `resolveActiveOrg`. Returns null only when user has zero memberships.
- `currentOrgForUser` is now ONLY the internal fallback inside `resolveActiveOrg` — **no route calls it directly** (verified by grep; migration complete, no call-site left behind).

**POST /workspace/switch (workspace.ts:593):** `switchSchema = z.object({orgId: z.string().uuid()})`. IDOR gate = `getOrgMembership(orgId, user.id)` FIRST → 404 mask (not-found == forbidden, no org enumeration). Persists pointer onto caller's OWN session row keyed by `sha256(sessionToken)` (matches session.ts hashToken — per-session, switch on device A doesn't move device B). Audit `workspace.switched` (role in metadata, no secret). RL 60/min/user (cheap non-credentialed action). Does NOT rotate session / touch 2FA / master state (acceptable residual — pointer change only visible to same-cookie holder who already has full session access).

**Call-site inventory (all use active org or are correctly NOT org-scoped):**
- ACTIVE-ORG scoped (via activeOrgForContext / activeOrgIdForContext): workspace GET//settings/transfer/switch · members list/PATCH/DELETE/invite/resend/revoke · audit GET (also gates `canViewAllOrgAudit` by active role) · sends POST (tags new send orgId, nullable) · vaults GET (scope `vaultMembers.userId=me AND vaults.orgId=activeOrg`) + POST create (into active org) · me.ts buildUserPayload (role+activeOrgId from resolveActiveOrg).
- CORRECTLY per-vault, NOT active-org (org-independent IDOR gate — switch must not cut/grant item access): items/folders/attachments all gate via `loadVaultForUser(vaultId, userId)` = `vaultMembers.userId=userId` join (vaults.ts:51), org derived from `access.vault.orgId`. Plaintext paths add `requireVaultUnlocked`. vaultMembers.ts uses `getOrgMembership(access.vault.orgId, ...)`.
- CORRECTLY token/creator-scoped, NOT active-org: sends GET list (`createdBy=me`), sends DELETE (`row.createdBy!==me`), sends reveal/burn (token-scoped, `row.orgId`). invitations accept-paths use `row.orgId` from the invite itself (correct).

**RBAC no-escalation (verified):** owner-of-A switched to B (member) → `activeOrgForContext` returns role=member → `canManageWorkspace`/`canManageOrgMembers`/`outranks` all gate on the B role. transfer-ownership (canManageWorkspace), members PATCH/DELETE (canManageOrgMembers + outranks), security-policy PATCH all read `current.role` from active org. No A-role bleed into B ops.

**Tests:** `workspaceSwitch.test.ts` (7) — default fallback, switch+persist, no owner carry-over, scope to B, IDOR non-member→404 pointer-untouched, random uuid→404, org-deleted→fallback A. `members.rbac.test.ts` (6). All 13 PASS.

**Frontend:** `switchWorkspace(orgId)` (api/workspaces.ts) sends ONLY orgId (no role assertion — backend authoritative, returns role). /spaces enterWorkspace + sidebar workspace-switcher both: switch → `refresh()` (fresh /me) → `router.refresh()`/`replace("/app")` so no stale-org data shown. 404 → re-pull workspace list. No secrets in switch flow.

Related: [[rbac_org_hierarchy]] [[auth_session_patterns]] [[validation_and_ratelimit]] [[require_2fa_enforcement]]
