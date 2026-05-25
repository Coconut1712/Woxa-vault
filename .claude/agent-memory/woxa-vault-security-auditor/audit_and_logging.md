---
name: audit_and_logging
description: Pino redact list location + audit_events insert convention
metadata:
  type: reference
---

**Pino redact:** `woxa-vault-api/src/lib/logger.ts` — `REDACT_PATHS` array. Current entries cover: `password`, `currentPassword`, `newPassword`, `master_password`, `master_auth_hash`, `dek`, `dek_plaintext`, `recovery_phrase`, `recoveryCode`, `recovery_code`, `session_token`, `sessionToken`, `refresh_token`, `refreshToken`, `invitationToken`, `invitation_token`, `token`, `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]`.

When auditing: any new sensitive field name introduced by a feature MUST be added to this list. Grep `logger.info|warn|error` near new secret fields to check.

**Audit events table:** `woxa-vault-api/src/db/schema.ts` → `auditEvents`. Insert pattern:
```ts
await db.insert(auditEvents).values({
  actorUserId, actorEmail, action, targetType, targetId,
  ipHash: hashIp(getClientIp(c)),
  userAgent: c.req.header("user-agent") ?? null,
  success: true | false,
  metadata: { ...non-secret context },
});
```
- `metadata` JSON must never contain plaintext password/hash/token. Common safe fields: `{ phase: "A", reason: "wrong_password" }`, `{ revokedCount }`, `{ provider, sub }`.
- Audit inserts that pair with rate-limit consume on the failure path SHOULD be inside `db.transaction(...)` — see `me.ts:recovery-kit/regenerate` line 489-507 for the canonical pattern.
- Append-only enforcement at the DB role level is a Phase B deliverable; currently rely on app-layer discipline. Verified 2026-05-22: no REVOKE/trigger/RLS on audit_events, RLS isRLSEnabled=false on all tables, no update/delete(auditEvents) calls in code.

**Account-level events use orgId = null** (login/logout/failed, 2FA, vault-unlock, recovery-kit, sessions-revoke) — written from `auth.ts`, `me.ts`, `twoFactor.ts`, `sso.ts`, `middleware/auth.ts`. Org-scoped events carry orgId.

**GET /audit scope** (owner directive 2026-05-21, in `audit.ts`): `orgId = current.orgId` OR (`orgId IS NULL` AND `actorUserId IN (subquery: members of current.orgId)`). The OR is ONE element AND-ed with actor/action/from/to/cursor filters — precedence correct. Account events surface to the actor's org admins by design (multi-org member: shown in each org). `canViewAllOrgAudit` gate (owner/admin) runs BEFORE scope — null-org branch can't bypass it.
- Cross-org safety: null-org rows only match when actorUserId is a CURRENT member of caller's org. `auth.login.failed` for unknown user has actorUserId=null (won't match) but actorEmail=attacker-supplied — watch CSV export (FR-074) for formula-injection escaping.
- `GET /items/:id/activity` stays pinned to targetType='item' AND targetId AND orgId — account events (targetType session/user) cannot leak into per-item view.

Related: [[validation_and_ratelimit]] [[recurring_antipatterns]] [[project_phase]] [[active_workspace_switching]]
