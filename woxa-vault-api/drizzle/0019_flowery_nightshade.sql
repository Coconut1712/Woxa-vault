CREATE TABLE "folder_team_members" (
	"folder_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"original_role" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folder_team_members_folder_id_team_id_pk" PRIMARY KEY("folder_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "item_team_members" (
	"item_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"original_role" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_team_members_item_id_team_id_pk" PRIMARY KEY("item_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_team_members" (
	"vault_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"original_role" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_team_members_vault_id_team_id_pk" PRIMARY KEY("vault_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "folder_team_members" ADD CONSTRAINT "folder_team_members_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_team_members" ADD CONSTRAINT "folder_team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_team_members" ADD CONSTRAINT "item_team_members_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_team_members" ADD CONSTRAINT "item_team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_team_members" ADD CONSTRAINT "vault_team_members_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_team_members" ADD CONSTRAINT "vault_team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folder_team_members_team_idx" ON "folder_team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "item_team_members_team_idx" ON "item_team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_name_idx" ON "teams" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "vault_team_members_team_idx" ON "vault_team_members" USING btree ("team_id");