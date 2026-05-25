---
name: audit-events-schema
description: audit_events table shape and the pinning rule for scoping audit queries safely
metadata:
  type: reference
---

`auditEvents` table (`src/db/schema.ts` ~line 213):
- `id` uuid PK; `orgId` uuid FK->organizations (NULLABLE, onDelete cascade);
  `targetType` text; `targetId` **text, NOT unique, NO FK**; `targetName`,
  `ipHash`, `userAgent`, `success`, `metadata` jsonb, `occurredAt`.
- Indexes: (orgId, occurredAt), (actorUserId, occurredAt). No index on
  (targetType, targetId) yet.

CRITICAL pinning rule for any "scope audit to one resource" query:
`targetId` is free-text shared across ALL target types (item/vault/folder/
send/attachment/session). Different resource types can have the same UUID
string in targetId. ALWAYS pin BOTH `targetType` AND `targetId` (AND ideally
`orgId`). Do NOT rely on targetId being globally unique — it is not, despite
comments that claim otherwise.

Item-target audit writes always set `orgId: <vault.orgId>` and use
`targetType: "item"` consistently (items.ts, itemMembers.ts, trash.ts).
Metadata payloads for item events are non-secret (field key names, role names,
grantee/revoked user ids, item type) — no plaintext secrets in metadata.

Audit log is NOT yet enforced append-only at the Postgres role level (no
GRANT restriction found) — immutability is convention-only in Phase A.
