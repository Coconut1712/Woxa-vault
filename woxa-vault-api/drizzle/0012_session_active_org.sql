-- Migration 0012: active workspace — sessions.active_org_id (finding M-1).
--
-- Why:
--   `currentOrgForUser()` returned the caller's FIRST org membership by
--   joined_at on every request. A user who belongs to more than one workspace
--   (e.g. nexa, in 2 orgs) therefore had every org-scoped operation —
--   member management, invites, security policy, ownership transfer, audit —
--   silently target the wrong workspace, not the one open in the UI. This
--   column records the workspace the session has selected so those operations
--   resolve against the right org.
--
-- Semantics:
--   * NULL = no explicit selection. The active-org resolver falls back to the
--     first membership by joined_at (the prior behaviour), so existing sessions
--     keep working with no backfill.
--   * Set by POST /workspace/switch after the server confirms the caller is a
--     member of the target org.
--   * Per-session (not per-user): switching workspaces on device A does NOT
--     change what device B is looking at.
--
-- Security:
--   The value is NEVER trusted on its own. `resolveActiveOrg` re-checks on
--   every request that the caller is STILL a member of this org (and that the
--   org still exists) and derives the RBAC role from THAT membership. A stale
--   pointer (user left the org) or a forged value (some other org's id) thus
--   grants nothing — the membership join fails and the resolver falls back.
--   This is defence against IDOR / stale-grant / privilege-escalation via the
--   switch.
--
-- ON DELETE SET NULL: if the referenced org is deleted, the pointer reverts to
--   NULL and the session falls back to its first remaining membership rather
--   than dangling at a dead org id.

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "active_org_id" uuid;

DO $$ BEGIN
  ALTER TABLE "sessions"
    ADD CONSTRAINT "sessions_active_org_id_organizations_id_fk"
    FOREIGN KEY ("active_org_id") REFERENCES "organizations"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
