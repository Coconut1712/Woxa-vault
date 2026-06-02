-- Backfill for migration 0024 (pg_trgm + GIN trigram indexes powering GET /search,
-- US-017 / FR-041). 0024 was silently skipped on already-migrated databases because
-- the drizzle journal `when` timestamps were non-monotonic: 0016-0019 had been hand-set
-- to future values, leaving 0024's realistic timestamp BELOW the high-water mark the
-- migrator gates on (MAX(created_at)). The journal has been renumbered monotonic, but
-- renumbering alone cannot re-trigger an already-passed migration.
--
-- This migration re-applies 0024's effect idempotently so it lands on:
--   * dev/prod DBs that skipped 0024 (indexes missing → created here), AND
--   * fresh DBs that ran 0024 first (indexes present → IF NOT EXISTS is a no-op).
-- Index names/columns mirror 0024 exactly so a fresh DB does not end up with duplicates.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_name_trgm_idx" ON "items" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_username_trgm_idx" ON "items" USING gin ("username" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_url_trgm_idx" ON "items" USING gin ("url" gin_trgm_ops);
