---
name: project-runtime
description: Where the API lives, how Postgres is provisioned without Docker, key ports
metadata:
  type: project
---

- API project root: `/Users/woxa/Projects/Woxa-vault/woxa-vault-api/`
- Web project root: `/Users/woxa/Projects/Woxa-vault/woxa-vault-web/` (Next.js 16, port 3000)
- API port: **8787** (locked — frontend hardcodes default)
- Postgres port: **5433** (host) — chosen to avoid colliding with any system Postgres on 5432
- Package manager: **npm** (the web project uses `package-lock.json`; do NOT switch to pnpm here without checking with the user)

**Postgres provisioning (Phase A dev):**
- **Default (since 2026-05-18):** `docker compose up -d` using `woxa-vault-api/docker-compose.yml`. Container `woxa-vault-postgres`, image `postgres:16-alpine`, named volume `woxa-vault-postgres-data`. Extensions `pgcrypto` + `citext` auto-loaded from `scripts/init-extensions.sql` mounted at `/docker-entrypoint-initdb.d/00-extensions.sql`.
- Fallback when Docker not installed: `npm run dev:pg` (uses `embedded-postgres` v18 — see `scripts/dev-pg.ts`). Data dir = `.pgdata/`, gitignored. Same `DATABASE_URL` works either way. Do NOT remove this script — keep as fallback for laptops without Docker.

**Why:** Docker is now installed on the dev laptop (2026-05-18). Embedded path stayed as fallback because some future contributor laptops may not have Docker, and the seed/migrate/curl E2E suite must work either way.

**How to apply:**
- README's "Quick start" section now leads with Docker; embedded is documented as "Fallback".
- Only one of the two can run at a time — both bind host port 5433. Stop the other before switching.
- `docker compose stop` keeps data; `docker compose down -v` wipes the named volume (use when migrations are out of sync after schema rewrites).
- Old `version: "3.9"` field was removed from `docker-compose.yml` — Compose v2 warns it as obsolete.

**Seed credentials (dev only, override via env):**
- `nexa@woxacorp.com` / `WoxaVault!Dev2026`
- Org `Woxa Corp` (slug `woxa`), role `owner`

**Do not auto-failover to embedded on Docker outage.** The embedded path is a manual setup option for contributors without Docker — NOT a runtime fallback the API or error handler should trigger. See [[feedback-no-db-fallback]] for the rule and history.
