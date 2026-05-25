-- Migration 0007: per-session `vault_unlocked_at` for the Phase A.5 server-side
-- vault-lock enforcement (WARN-I).
--
-- Why:
--   Before this migration the 15-minute vault auto-lock was a frontend-only UX
--   gate — the backend would still decrypt items for any caller with a valid
--   session cookie. A session-thief (XSS-stolen cookie, replayed cookie from a
--   leaked log, etc.) could therefore bypass the lock by hitting the JSON APIs
--   directly with curl/devtools. The new column moves the lock check into the
--   sensitive item-read handlers: every reveal/download/send-create requires
--   `vault_unlocked_at` to be within the configured idle window for the
--   current session row.
--
-- Semantics:
--   * NULL = never unlocked in this session (treated as locked).
--   * Set to `now()` on successful POST /me/verify-password, on successful
--     POST /me/sessions/revoke-all (caller just re-proved the master password),
--     and at session creation time (login + SSO callback — the user has just
--     verified identity, so initial state is unlocked).
--   * The frontend's existing 15-minute idle timer is left in charge of
--     deciding when to re-prompt; the backend only enforces the same window.

ALTER TABLE "sessions" ADD COLUMN "vault_unlocked_at" timestamp with time zone;
--> statement-breakpoint
-- Backfill: existing sessions are old (pre-migration) and should be treated as
-- "freshly unlocked" so the rollout doesn't paper-cut every logged-in user with
-- a sudden lock screen. Using `created_at` (rather than now()) means any
-- already-stale session that hasn't done anything for >15 min stays locked,
-- which matches the desired semantics.
UPDATE "sessions" SET "vault_unlocked_at" = "created_at" WHERE "vault_unlocked_at" IS NULL;
