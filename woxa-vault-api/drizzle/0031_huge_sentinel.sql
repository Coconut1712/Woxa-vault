ALTER TABLE "vault_migration_backups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "vault_migration_backups" CASCADE;--> statement-breakpoint
ALTER TABLE "vaults" ALTER COLUMN "encryption_version" SET DEFAULT 2;