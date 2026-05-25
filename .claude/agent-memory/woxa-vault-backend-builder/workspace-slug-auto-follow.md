---
name: workspace-slug-auto-follow
description: PATCH /workspace slug now auto-regenerates from the new name (server-derived, never-trusted); allocateSlug gained exclude-self param
metadata:
  type: project
---

Workspace slug AUTO-FOLLOWS the name on rename (2026-05-22, product-owner decision). Previously `PATCH /workspace` renamed only `name` and froze the slug ("slug is URL-load-bearing" comment — that comment was WRONG/stale and is removed).

**Why it's safe (verified):** slug is NOT load-bearing — not in any route path, invite/SSO/email link, or authz decision. `sso.ts` documents it as attacker-influenceable; [[round9-workspace-sso-audit]] removed slug-based auto-join. Slug stays NEVER-TRUSTED.

**Changes (`src/routes/workspace.ts`):**
- `allocateSlug(tx, base, excludeOrgId?)` — new optional 3rd param. When given, the clash check becomes `and(eq(slug, candidate), ne(organizations.id, excludeOrgId))` so the org's OWN row is excluded → a name re-resolving to the org's current slug stays suffix-free; only a DIFFERENT org holding it forces a `base-<hex>` suffix. Create-time call site (POST /workspace) passes NO exclude — unchanged. Both `allocateSlug` and `slugifyBase` are EXPORTED for unit tests.
- PATCH handler: on name change, derive `slugifyBase(name)` → `allocateSlug(tx, base, current.orgId)`, persist `{ name, slug }`, return the NEW slug in `workspace.slug` (was the stale stored slug). No-op rename stays a true no-op (no tx, no audit). Audit `workspace.renamed` metadata now `{ from, to, slugFrom, slugTo }`.
- Concurrent-rename slug race wrapped in try/catch → `isUniqueViolation(err)` ([[round9-workspace-sso-audit]] helper) maps 23505 → new `errors.workspaceSlugConflict()` = **409 `workspace_slug_conflict`** (mirrors `ownership_transfer_conflict`). Added to `src/lib/errors.ts`.

**`renameSchema` stays `{ name }` ONLY** — no client-supplied slug (avoids a second attacker-controlled-slug surface beyond what `name` already influences). Owner+admin gate (`canManageOrgMembers`) + org-from-session (no IDOR) unchanged.

**`slugifyBase` rules NOT changed** — frontend mirror `slugifyWorkspaceName` in `woxa-vault-web/src/lib/api/workspaces.ts` already documents the auto-derive-on-rename and matches exactly. If those rules EVER change, keep the mirror in sync.

**Forward-compat caveat:** if a slug-based URL is ever introduced, auto-follow WOULD break old links — none exist today; revisit then. Documented in API_CONTRACT.md (new `PATCH /workspace` section + dated footer + error-code table row).

**Tests (`workspace.test.ts`):** added `allocateSlug` block (4 tests: base-free→kept incl. exclude-self, different-org-collision→suffix, no-excludeOrgId create path, bounded-loop fallback→`base-<12hex>`). Uses a fake `tx` (`vi.fn` programming findFirst returns) — the SQL `ne(...)` clause is opaque drizzle SQL, integration-verified only; unit tests pin observable behavior. `slugifyBase` cases already existed. 17 tests in file pass. Full suite 186/187 (the 1 failure is the documented pre-existing `resend.test.ts` mailer-cache quirk — fails in isolation too, NOT this change).

Related: [[single-owner-workspace]], [[workspace-security-settings-round]], [[round9-workspace-sso-audit]].
