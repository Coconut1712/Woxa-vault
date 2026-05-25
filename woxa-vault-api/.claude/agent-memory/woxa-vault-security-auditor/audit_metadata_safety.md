---
name: audit-metadata-safety
description: What audit metadata/targetName/targetId may safely contain, and the known integrity gap on the role_change path
metadata:
  type: reference
---

Audit-event PII/secret rules (verified across all ~85 insert sites, members
audit-detail change 2026-05-22):

- NO audit insert ever puts a secret VALUE in metadata/targetName/targetId.
  Metadata holds only: field-name lists (`item.update` → `Object.keys(body)`),
  role names, grantee/revoked user ids + emails, from→to transitions, counts,
  reasons/stages/enums, booleans (`usedBackupCode`, `hasPassword`,
  `useBackupCode`), Google `sub` (opaque id) + `emailDomain`/`hd`.
- Attachments deliberately set `targetName: null` (filename can leak secrets,
  see attachments.ts ~360 comment). Sends set `targetName: null` too.
- `member.role_change` / `member.remove` (members.ts) now log target
  displayName in targetName + `targetEmail` in metadata. These are
  `targetType: "user"` — so they CANNOT surface in the per-item activity feed,
  which pins `targetType: "item"` (itemActivity.ts ~128). Grant events
  (item/folder/vault .share/.role_change/.revoke) already log granteeEmail.

Frontend render is XSS-safe: audit-format.ts builds plain strings via
`tr()` (String.replace interpolation, translations.ts ~4719); both consumers
(audit/page.tsx, item-activity-section.tsx) render via JSX text children only.
NO dangerouslySetInnerHTML anywhere in woxa-vault-web/src. metaString getter
guards `typeof metadata === "object"` so it can't throw on malformed jsonb.

KNOWN INTEGRITY GAP (pre-existing pattern, not a regression):
`PATCH /workspace-members/:userId` (members.ts ~252-274) does the role UPDATE
and the audit INSERT as TWO separate non-transactional statements. If the
audit insert fails the role change has already committed → silent un-audited
mutation. `DELETE` (members.ts ~314) is correctly wrapped in db.transaction.
Same non-tx pattern exists in many other mutating routes (items.ts update,
me.ts profile, vaults.ts update, workspace policy). Audit is "best-effort"
by current convention, not atomic with the mutation. Flag as Low/Info, not a
new bug introduced by the members audit-detail change.
