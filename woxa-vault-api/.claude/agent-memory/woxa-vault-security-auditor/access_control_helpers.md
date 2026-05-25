---
name: access-control-helpers
description: Location and semantics of item/org RBAC resolution helpers in woxa-vault-api
metadata:
  type: reference
---

Two distinct role systems, both must be checked for item-scoped surfaces:

- **Vault/item roles** (`src/lib/access.ts`): `manager > editor > user > viewer`.
  `resolveItemRole(userId, {id, vaultId, folderId})` = most-specific-wins
  (item override -> folder grant -> vault membership -> null). Org membership
  alone grants NO item access. `canRevealItem` blocks viewer from plaintext.
- **Org roles** (`src/lib/orgAccess.ts`): `owner > admin > member > guest`.
  `getOrgMembership(orgId, userId)` -> role for a SPECIFIC org (use this for
  cross-org checks, NOT activeOrgForContext). `canManageOrgMembers` =
  owner|admin. `canViewAllOrgAudit` = owner|admin (gates GET /audit).
  `resolveActiveOrg` / `activeOrgForContext(c)` -> the request's ACTIVE org,
  re-validated against a live membership row every call (IDOR/stale defence).

Cross-org IDOR rule: resolve the caller's role in the RESOURCE's org via
`getOrgMembership(item.vault.orgId, user.id)` — never the active org. The
itemActivity endpoint follows this correctly.

Validators: `src/lib/validator.ts` exports `jsonValidator`/`queryValidator`/
`paramValidator` wrapping @hono/zod-validator with the standard error envelope.
