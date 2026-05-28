---
name: migration-batch-atomic
description: drizzle migrate() applies the whole pending batch atomically — one failing migration rolls back ALL pending ones
metadata:
  type: project
---

drizzle-orm `migrate()` (postgres-js migrator) runs the entire set of pending
migrations and a failure in a later migration rolls back the earlier pending
ones too. Observed 2026-05-21: dev DB was applied through 0007 only; running
`npm run db:migrate` to apply 0008 (user_mfa_backup_codes) + 0009
(org_members_single_owner_idx) failed at 0009 because dev data had 2 owners in
one org (unique partial index violation 23505), and 0008 did NOT land either.

**Why:** A pre-existing data invariant violation in a *later* migration blocks an
unrelated *earlier* migration in the same batch.

**How to apply:** When a `db:migrate` fails mid-batch, none of the batch landed.
Fix the blocking condition (here: resolve duplicate owners per DESIGN §3 single-owner
invariant, demote extras to admin) THEN re-run migrate. Confirm with `SELECT id,hash
FROM drizzle.__drizzle_migrations` — last applied hash must match the target file's
`shasum -a 256`. The 500 on /auth/2fa/verify-enroll was this: table from 0008 never
existed → INSERT raised relation-does-not-exist → masked by app.onError as
internal_error. Not a code bug. See [[test-seed]] (dev@iux24.com is the seed owner).

DB psql role is `woxa` (not `postgres`); db is `woxa_vault` on port 5433 (Docker
container `woxa-vault-postgres`).
