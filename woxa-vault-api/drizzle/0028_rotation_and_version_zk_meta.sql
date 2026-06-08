-- Wave 2a — password rotation tracking (US-060 / FR-039) + close the v2
-- version-snapshot metadata gap.
--
-- 1. items.rotation_policy_days: per-item rotation window in days. NULL = inherit
--    the org default (organizations.settings.rotationDefaultDays, a jsonb key —
--    no column needed). A positive value overrides; 0/negative is normalized to
--    NULL at the route layer. The effective status (fresh/due/overdue/none) is
--    computed in the serializer, never stored.
--
-- 2. item_versions {name,username,url}_ciphertext + _iv: Wave 1 added these
--    ciphertext-metadata columns to `items` (v2 ZK) but NOT to item_versions, so
--    a v2 snapshot captured name="" with no way to show/restore the real
--    (encrypted) metadata. Mirror the columns here (nullable) and have the PATCH
--    snapshot copy them. NULL for v1 + legacy v2 snapshots.
--
-- All statements idempotent (ADD COLUMN IF NOT EXISTS) so the migration is safe
-- to re-run and on fresh DBs alike.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "rotation_policy_days" integer;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN IF NOT EXISTS "name_ciphertext" bytea;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN IF NOT EXISTS "name_iv" bytea;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN IF NOT EXISTS "username_ciphertext" bytea;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN IF NOT EXISTS "username_iv" bytea;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN IF NOT EXISTS "url_ciphertext" bytea;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN IF NOT EXISTS "url_iv" bytea;
