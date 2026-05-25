CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon_key" text,
	"color" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_time_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"org_id" uuid,
	"created_by" uuid,
	"content_ciphertext" "bytea" NOT NULL,
	"content_iv" "bytea" NOT NULL,
	"dek_ciphertext" "bytea" NOT NULL,
	"dek_iv" "bytea" NOT NULL,
	"password_hash" text,
	"max_views" integer DEFAULT 1 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"burned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_time_sends_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_sends" ADD CONSTRAINT "one_time_sends_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_sends" ADD CONSTRAINT "one_time_sends_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folders_vault_idx" ON "folders" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "folders_position_idx" ON "folders" USING btree ("vault_id","position");--> statement-breakpoint
CREATE INDEX "one_time_sends_expires_idx" ON "one_time_sends" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "one_time_sends_created_by_idx" ON "one_time_sends" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_folder_idx" ON "items" USING btree ("folder_id");