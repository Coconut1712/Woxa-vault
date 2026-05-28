---
name: test-seed
description: Default dev seed credentials and how to reset
metadata:
  type: reference
---

Seed user (committed in `src/db/seed.ts`):
- Email: `dev@iux24.com`
- Password: `WoxaVault!Dev2026`
- Org: `Woxa Corp` (slug `woxa`)
- Org role: `owner`

Workflow:
- `npm run seed` — idempotent. Re-running updates the password but keeps the user id.
- `npm run db:migrate` — applies all SQL files in `drizzle/`.

Local Postgres runs on port 5433 (compose file at `docker-compose.yml`). The data dir is `.pgdata/` (gitignored).

For smoke testing routes, login then save the cookie jar:
```
curl -c wcj.txt -X POST http://localhost:8787/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"dev@iux24.com","password":"WoxaVault!Dev2026"}'
curl -b wcj.txt http://localhost:8787/workspace
```
