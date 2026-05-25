-- Migration 0006: case-insensitive email uniqueness + absolute session expiry.
--
-- Why:
--   * Before this migration `users_email_idx` was UNIQUE on the raw `email`
--     column. Several insert paths (notably `/invite/:token/signup-and-accept`)
--     passed through the un-normalized `invitations.email`, which let two
--     accounts coexist if one used `Alice@Corp.com` and the other
--     `alice@corp.com`. The login path lowercases input, so the second user
--     became unreachable. We rebuild the index over `lower(email)` so the
--     uniqueness constraint matches the lookup semantics.
--   * Session rows now carry an `absolute_expires_at` ceiling so a session
--     cannot be slid forward forever — see WARN-2.

-- 1) Email uniqueness — case-insensitive.
DROP INDEX IF EXISTS "users_email_idx";
--> statement-breakpoint
-- Normalize the live data BEFORE recreating the unique index so it can be
-- built without conflicts. The seed/JIT/invite paths now lowercase emails on
-- insert (round-7 fix); this backfill closes existing rows from earlier rounds.
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" (lower("email"));
--> statement-breakpoint

-- 2) Session absolute expiry — WARN-2.
ALTER TABLE "sessions" ADD COLUMN "absolute_expires_at" timestamp with time zone;
--> statement-breakpoint
-- Backfill existing rows to a 30-day ceiling measured from creation. Future
-- rows are populated explicitly by `createSession`.
UPDATE "sessions"
  SET "absolute_expires_at" = "created_at" + INTERVAL '30 days'
  WHERE "absolute_expires_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "absolute_expires_at" SET NOT NULL;
