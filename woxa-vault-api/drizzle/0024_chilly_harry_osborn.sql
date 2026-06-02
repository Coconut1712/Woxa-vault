-- US-017 / FR-041: pg_trgm powers the fuzzy ILIKE item search (GET /search).
-- Neon + the dev Docker Postgres both ship the extension; CREATE IF NOT EXISTS
-- is idempotent and safe to re-run.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "items_name_trgm_idx" ON "items" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "items_username_trgm_idx" ON "items" USING gin ("username" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "items_url_trgm_idx" ON "items" USING gin ("url" gin_trgm_ops);