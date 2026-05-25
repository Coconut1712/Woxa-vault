-- Migration 0009: single-Owner invariant for `org_members` (DESIGN.md §3).
--
-- Why:
--   The Owner role now carries org-level superpowers (delete workspace,
--   transfer ownership, billing) and the product model is exactly ONE Owner
--   per workspace. The transfer-ownership endpoint enforces this at the app
--   layer with an atomic demote+promote transaction, but a partial unique
--   index is the defense-in-depth guarantee: even a race or a buggy future
--   code path can never leave two `owner` rows in the same org.
--
-- Semantics:
--   * The index covers ONLY rows where role = 'owner', so admins/members/
--     guests can co-exist freely (a full UNIQUE(org_id) would be wrong).
--   * Inserting/updating a second owner row for an org raises a unique
--     violation, which the transfer transaction relies on as a backstop.
--
-- Pre-flight: the CREATE will FAIL if any org already has >1 owner. That data
-- should not exist (the JIT path only ever set `member`, and seed/owner inserts
-- are 1-per-org), but if a future ad-hoc edit created duplicates this migration
-- will surface it loudly rather than silently. Resolve duplicates first, then
-- re-run.

CREATE UNIQUE INDEX IF NOT EXISTS "org_members_single_owner_idx"
  ON "org_members" ("org_id")
  WHERE "role" = 'owner';
