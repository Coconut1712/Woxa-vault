ALTER TABLE "access_requests" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "approved_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "folder_members" ADD COLUMN "original_role" text;--> statement-breakpoint
ALTER TABLE "folder_members" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "item_members" ADD COLUMN "original_role" text;--> statement-breakpoint
ALTER TABLE "item_members" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vault_members" ADD COLUMN "original_role" text;--> statement-breakpoint
ALTER TABLE "vault_members" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_requests" DROP COLUMN "duration_hours";--> statement-breakpoint
ALTER TABLE "access_requests" DROP COLUMN "approved_duration_hours";