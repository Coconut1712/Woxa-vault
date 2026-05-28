---
name: slug-never-trusted
description: organizations.slug is attacker-influenceable and must NEVER key an authz/SSO/routing/lookup decision; it now auto-follows the name on rename
metadata:
  type: project
---

`organizations.slug` is derived from the workspace NAME (`slugifyBase`), so it is an ATTACKER-INFLUENCEABLE string, not a verified mapping. It is a NEVER-TRUSTED value across the codebase.

**Why:** Round-9 (DESIGN.md §5 note line ~180, REQUIREMENTS AC-005.8) removed slug-based SSO auto-join — a member could pre-register a workspace whose slug matched a target email domain's first label and silently capture every future SSO sign-in from that domain into their org (cross-tenant capture). Verified-domain auto-join is DEFERRED to AC-006.2 (needs an `org_domains` table).

**How to apply:** On any audit, grep every `.slug` consumer. It is safe ONLY as: (1) a response payload field for display/URL handle (`me.ts /workspaces`, `workspace.ts` responses), (2) `allocateSlug`'s own uniqueness check, (3) non-secret audit metadata. It is a FINDING if slug ever appears in: a route path param, an authz/RBAC decision, an SSO/JIT join key, an invite/email link target, or any DB lookup `WHERE slug = ...` outside collision allocation. As of 2026-05-22 slug AUTO-FOLLOWS the name on `PATCH /workspace` rename (previously immutable) — so any code that *cached* or keyed on a slug expecting stability would now break. The only trusted lookup key is `organizations.id` (uuid).

Slug exclusion semantics: `allocateSlug(tx, base, excludeOrgId)` — `excludeOrgId` is hardcoded to the caller's OWN `current.orgId` (from session, never client-supplied). Exclusion only relaxes the clash check against the caller's own row; a slug held by a DIFFERENT org always forces a random suffix. The `slug` UNIQUE constraint (schema.ts) is the final guard; a concurrent-rename 23505 maps to 409 `workspace_slug_conflict`. No squat/hijack path.

Related: [[notifications-feature]] (recipient computed server-side, same never-trust-the-client principle).
