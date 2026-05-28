CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_name" text,
	"requested_role" text NOT NULL,
	"duration_hours" integer,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approver_id" uuid,
	"approved_role" text,
	"approved_duration_hours" integer,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"access_expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_requests_org_idx" ON "access_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "access_requests_requester_idx" ON "access_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "access_requests_target_idx" ON "access_requests" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status");