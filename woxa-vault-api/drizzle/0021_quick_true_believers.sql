CREATE TABLE "item_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "item_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"item_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"encrypted_data" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"modified_by" uuid,
	"modified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_summary" text
);
--> statement-breakpoint
CREATE TABLE "user_keys" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"public_key" "bytea" NOT NULL,
	"encrypted_private_key" "bytea" NOT NULL,
	"private_key_iv" "bytea" NOT NULL,
	"private_key_auth_tag" "bytea" NOT NULL,
	"kdf_algorithm" text DEFAULT 'argon2id' NOT NULL,
	"kdf_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_keys" (
	"vault_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wrapped_key" "bytea" NOT NULL,
	"wrap_algo" text DEFAULT 'x25519-aes256gcm' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_keys_vault_id_user_id_pk" PRIMARY KEY("vault_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "item_versions" ADD CONSTRAINT "item_versions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_versions" ADD CONSTRAINT "item_versions_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keys" ADD CONSTRAINT "user_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_keys" ADD CONSTRAINT "vault_keys_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_keys" ADD CONSTRAINT "vault_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_versions_item_num_idx" ON "item_versions" USING btree ("item_id","version_number");