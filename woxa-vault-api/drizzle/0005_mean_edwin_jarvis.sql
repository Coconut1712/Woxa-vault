ALTER TABLE "users" ADD COLUMN "recovery_kit_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_kit_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_kit_used_at" timestamp with time zone;