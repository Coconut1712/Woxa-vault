-- Migration 0008: TOTP backup codes for 2FA (REQUIREMENTS US-003 / FR-007).
--
-- Why:
--   The Phase A login gate now supports TOTP enrollment / verification on top
--   of the master password. The existing `users.totp_secret_encrypted` +
--   `users.totp_enabled_at` columns cover the rotating-OTP factor, but FR-007
--   also mandates 10 single-use backup codes per user so a lost authenticator
--   can't lock the user out. We store each code as an Argon2id hash (same
--   parameters as the master password) — plaintext is shown to the user
--   exactly once at generation time and discarded.
--
-- Semantics:
--   * One row per code; (user_id, used_at IS NULL) is the set of currently
--     spendable codes.
--   * On use, `used_at` is stamped via UPDATE … WHERE used_at IS NULL so a
--     concurrent retry with the same code can't double-spend it.
--   * On disable / regenerate the entire row set for the user is deleted.
--
-- Threat model:
--   Asset: ability to bypass the TOTP factor at login. Backup codes are
--     post-password — they only matter after the user has typed the right
--     master password. Argon2 hash + 10-char base32 entropy (50 bits per
--     code) + 10/min/IP+user rate limit on /auth/2fa/verify-login defeats
--     online brute-force.
--   Adversary: stolen-device attacker who has skimmed an unused backup code
--     from a printout. The first-use marker invalidates it everywhere; the
--     legit user notices on their next login when their saved list shows
--     one fewer remaining (GET /me exposes `backupCodesRemaining`).

CREATE TABLE IF NOT EXISTS "user_mfa_backup_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "user_mfa_backup_codes_user_idx" ON "user_mfa_backup_codes" ("user_id");
