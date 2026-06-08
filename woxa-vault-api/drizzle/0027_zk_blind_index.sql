-- Phase C ZK metadata encryption + blind index (FR-043 / AC-017.2 / NFR-032).
--
-- 1. Adds nullable per-field ciphertext+IV columns to `items` so v2 (zero-
--    knowledge) items can store name/username/url as client-encrypted blobs
--    instead of plaintext. v1 items leave these NULL and keep using the
--    plaintext columns. Written idempotently (ADD COLUMN IF NOT EXISTS) so it
--    is safe on DBs that may already carry the columns and on fresh DBs alike.
--
-- 2. Creates `item_search_terms`: one row per opaque HMAC search token of a v2
--    item (blind index). The server stores only the hash and never sees the
--    plaintext, the per-vault search key, or the query tokens' preimages.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "name_ciphertext" bytea;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "name_iv" bytea;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "username_ciphertext" bytea;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "username_iv" bytea;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "url_ciphertext" bytea;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "url_iv" bytea;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_search_terms" (
	"item_id" uuid NOT NULL,
	"term_hash" bytea NOT NULL,
	CONSTRAINT "item_search_terms_item_id_term_hash_pk" PRIMARY KEY("item_id","term_hash")
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_search_terms" ADD CONSTRAINT "item_search_terms_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_search_terms_hash_idx" ON "item_search_terms" USING btree ("term_hash");
