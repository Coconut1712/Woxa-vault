ALTER TABLE "item_versions" ALTER COLUMN "encrypted_data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "item_versions" ALTER COLUMN "iv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "item_versions" ALTER COLUMN "auth_tag" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "password_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "password_iv" "bytea";--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "notes_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "notes_iv" "bytea";--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "dek_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "dek_iv" "bytea";--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "encryption_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_versions" ADD COLUMN "modified_by_email" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "password_changed_at" timestamp with time zone;