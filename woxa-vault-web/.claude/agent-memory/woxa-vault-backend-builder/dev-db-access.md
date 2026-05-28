---
name: dev-db-access
description: How to reach the dev Postgres and run SQL (no host psql; use docker exec; heredoc stdin pitfall)
metadata:
  type: project
---

Dev Postgres for woxa-vault-api lives in Docker container `woxa-vault-postgres` (postgres:16-alpine, host port 5433 -> 5432). DB `woxa_vault`, user `woxa`.

**Why:** host has no `psql` client; `DATABASE_URL=postgres://woxa:woxa_local_dev@localhost:5433/woxa_vault`.

**How to apply:**
- Run SQL via `docker exec woxa-vault-postgres psql -U woxa -d woxa_vault -c "..."`. Inside the container no password is needed.
- AVOID heredoc-into-`docker exec` for SQL — stdin is not forwarded, the command silently no-ops with no output. Use `-c "..."` (multi-statement strings work) and check the `UPDATE N` / `INSERT 0 N` line to confirm rows changed.
- App tables are in schema `public` (not a pgSchema). Org table is named `organizations` (NOT `orgs`); membership is `org_members(org_id, user_id, role, joined_at)` with PK `(org_id, user_id)` and NO `created_at` (use `joined_at`).
- Drizzle migration ledger is `drizzle.__drizzle_migrations` (schema `drizzle`), not `public`. Migrations folder is `./drizzle` (out dir), run with `npm run db:migrate` (tsx src/db/migrate.ts). See [[migration-batch-atomic]].
