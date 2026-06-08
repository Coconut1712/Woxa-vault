-- Phase C Wave-2b — unified vault re-key (AC-024.5) + reversible v1→v2 migration.
--
-- 1. vaults.key_version: monotonic vault-key generation counter. Bumped on every
--    client-driven rekey (POST /vaults/:id/rekey) and on the v1→v2 migration.
--    Backs OPTIMISTIC CONCURRENCY — a rekey/migrate payload carries the version
--    the client computed against and is rejected if a concurrent rotation won.
--
-- 2. vaults.rekey_pending: flips true when a member is revoked from a v2 vault
--    (their vault_keys row is deleted, cutting server-side access). Signals an
--    admin must run a client-driven rekey to rotate the key + re-encrypt items.
--    Cleared when a rekey completes.
--
-- 3. vault_migration_backups: per-item snapshot of a vault's v1 state taken
--    BEFORE a v1→v2 migration so the migration is reversible within the 30-day
--    retention window. Snapshot is the v1 envelope (ciphertext/IV + LOCAL_KEK-
--    wrapped DEK) + plaintext metadata the server already held — no v2 key, no
--    plaintext secret (zero-knowledge preserved). Purged after retention.
--
-- All statements idempotent (IF NOT EXISTS / duplicate_object guard) so the
-- migration is safe to re-run and on fresh DBs alike (matches 0027/0028 style).
ALTER TABLE "vaults" ADD COLUMN IF NOT EXISTS "key_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "vaults" ADD COLUMN IF NOT EXISTS "rekey_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vault_migration_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vault_migration_backups" ADD CONSTRAINT "vault_migration_backups_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vault_migration_backups" ADD CONSTRAINT "vault_migration_backups_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_migration_backups_vault_idx" ON "vault_migration_backups" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vault_migration_backups_created_idx" ON "vault_migration_backups" USING btree ("created_at");
