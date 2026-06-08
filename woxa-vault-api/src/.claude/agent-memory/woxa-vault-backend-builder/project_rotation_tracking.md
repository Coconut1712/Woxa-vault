---
name: project-rotation-tracking
description: US-060/FR-039 password rotation tracking — schema, status compute, rotation-due endpoint, org default, email digest (Phase C Wave-2a)
metadata:
  type: project
---

Password rotation tracking (US-060 / AC-060.1-5 / FR-039), shipped Phase C Wave-2a.

**Why:** compliance (rotate stale credentials, e.g. AWS keys < 90d). Drives the dashboard "N secrets need rotation" widget + per-item badge 🟢🟡🔴.

**How to apply / where it lives:**
- Status compute is a PURE helper in `src/lib/rotation.ts` — `computeRotationStatus(passwordChangedAt, itemDays, orgDefaultDays, now?)` → `{ status: none|fresh|due|overdue, dueAt, effectiveDays }`. `DUE_SOON_DAYS=14` is the fresh→due lead window. Effective policy = `item.rotationPolicyDays ?? orgDefault`; 0/null = no override. Used by the serializer (no N+1 — all inputs on the row) AND the digest.
- Org default lives in `organizations.settings.rotationDefaultDays` (jsonb). Owned by `lib/orgPolicy.ts` (`clampRotationDays`, `ROTATION_DAYS_MIN/MAX=1/3650`, in `OrgSecurityPolicy.rotationDefaultDays`). Settable via `PATCH /workspace/settings` (owner+admin); surfaced in `GET/PATCH /workspace/settings` response.
- Per-item override = `items.rotationPolicyDays` (int nullable; migration 0028). Accepted on create + PATCH (both v1 and v2). PATCHing it is metadata-only (no version snapshot, no passwordChangedAt reset). Clamped via clampRotationDays.
- `ItemSummary` now carries `rotationPolicyDays`, `rotationStatus`, `rotationDueAt`, `passwordChangedAt`. `toSummary(item, creator, orgRotationDefaultDays)` — caller resolves org default ONCE per request via `orgRotationDefaultFor(orgId)` in items.ts (no N+1 in the list path).
- Dashboard endpoint: `GET /items/rotation-due` (items.ts, registered BEFORE `/:id` so it isn't shadowed). Active-org scoped, RBAC via `resolveItemRolesBatch` + auditor→viewer short-circuit (same pattern as `GET /search`). Returns only due/overdue, sorted overdue-first, with `counts {due,overdue,total}`. Metadata only — never a reveal, not audited.
- Email digest (AC-060.4): `src/lib/rotationDigest.ts` `runRotationDigest()` + mailer `sendRotationDigestEmail` in `lib/mailer/resend.ts`. FULLY IMPLEMENTED but NOT wired to a scheduler — see TODO at bottom of rotationDigest.ts (use BullMQ repeatable job, NOT a setInterval, because cadence is weekly + must run once cluster-wide). Recipients = org owner+admin. No secret material; v2 items shown as "(encrypted item)".

Tests: `src/lib/rotation.test.ts` (pure compute), `src/lib/orgPolicy.test.ts` (clampRotationDays + default shape), `src/routes/rotation.test.ts` (status via API, org default inherit, rotation-due RBAC, v2 version snapshot+reveal).
