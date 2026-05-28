---
name: shared-helpers
description: Common backend helpers and their locations — use these instead of re-implementing per-route
metadata:
  type: project
---

Helpers extracted from route files into `src/lib/` so multiple routes can import without circular deps:

- `src/lib/clientIp.ts` — `getClientIp(c)`. Reads `x-forwarded-for` / `x-real-ip`.
- `src/lib/orgAccess.ts` — `currentOrgForUser(userId)`, `getOrgMembership(orgId, userId)`, `canManageOrgMembers(role)`, `canViewAllOrgAudit(role)`, `ORG_ROLES`, `OrgRole`.
- `src/lib/ipHash.ts` — `hashIp(ip)` for audit rows (HMAC keyed off LOCAL_KEK).
- `src/lib/itemCrypto.ts` — `generateWrappedDek`, `unwrapDek`, `encryptField`, `decryptField`, `zeroize` (envelope encryption for items + sends).
- `src/lib/password.ts` — `hashPassword`, `verifyPassword` (Argon2id; used by login AND send password gate).
- `src/lib/rateLimit.ts` — `rateLimit(key, {limit, windowMs})`. In-memory; moves to Redis in Phase B.

**Why:** keeping these in `routes/` causes circular imports (e.g. `members.ts` needs `currentOrgForUser` but `vaults.ts` re-exports it).

**How to apply:** when a new route needs an org-membership check, IP hash, or rate-limit window, import from `lib/`. The `auth.ts` and `sso.ts` routes still have local `getClientIp` variants — leaving them alone keeps blast radius small; consolidate only if you touch those files for another reason.

See also [[anti-enumeration-404]] for how to combine these helpers when guarding tenant boundaries.
