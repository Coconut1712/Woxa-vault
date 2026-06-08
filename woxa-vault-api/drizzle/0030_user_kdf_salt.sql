-- Phase C — crypto fix #2: per-user Argon2id KDF salt.
--
-- Replaces the predictable legacy client-side salt `userId.padEnd(16,"0")`
-- with a random, server-stored, per-user salt. The salt is NOT secret — it is
-- handed to the client pre-auth (GET /auth/kdf-salt) and in GET /me so the
-- client can re-derive the same master key it derived at setup time.
--
-- 1. Add nullable `kdf_salt` (base64 text). Nullable so we can backfill.
-- 2. Backfill EXISTING rows with the exact bytes of the legacy salt so any ZK
--    account created before this fix still derives the same key and unlocks.
--    Legacy salt = JS `userId.padEnd(16,"0")` as UTF-8 bytes. CRITICAL: JS
--    String.padEnd only ADDS padding and NEVER truncates, and a UUID's text
--    form is 36 chars (> 16), so the legacy salt is simply the full `id::text`
--    string unchanged. We base64-encode those UTF-8 bytes to match what
--    generateKdfSalt() stores. (Do NOT use rpad(id::text,16,...) — rpad
--    TRUNCATES to 16 chars, which would NOT match the JS value and would
--    orphan every legacy ZK account.)
-- 3. New rows get a random salt at the application layer (register / SSO JIT /
--    invite signup / password setup), so no DEFAULT is set here.
--
-- Idempotent (IF NOT EXISTS + WHERE NULL guard) — safe to re-run.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kdf_salt" text;--> statement-breakpoint
UPDATE "users"
   SET "kdf_salt" = encode(convert_to("id"::text, 'UTF8'), 'base64')
 WHERE "kdf_salt" IS NULL;
