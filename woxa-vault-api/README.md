# Woxa Vault API

Backend for **Woxa Secret Vault**.
Source-of-truth specs: [`../secret-vault/REQUIREMENTS.md`](../secret-vault/REQUIREMENTS.md) and [`../secret-vault/DESIGN.md`](../secret-vault/DESIGN.md).

## Stack (Phase A subset)

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Hono + TypeScript strict |
| DB | PostgreSQL 16 |
| ORM | Drizzle ORM |
| Sessions | Cookie-based, SHA-256 hashed in DB (Lucia v3 pattern) |
| Password hashing | Argon2id (t=3, m=64MB, p=4) per FR-112 |
| Validation | Zod via `@hono/zod-validator` |
| Logging | pino with redact list |

Endpoints, encryption hierarchy, and audit-log schema follow DESIGN.md §6–§9. KMS envelope encryption (DESIGN.md §6), vaults, items, sends, and audit-wiring across every endpoint are Phase B+ work.

## Quick start (Docker — default path)

Requires Node.js 20+ and Docker Desktop (Compose v2).

```bash
cp .env.example .env             # adjust LOCAL_KEK_BASE64 if you want
npm install
docker compose up -d             # starts Postgres 16 on host port 5433
npm run db:migrate
npm run seed
npm run dev
```

API listens on `http://localhost:8787`. Postgres on `localhost:5433`
(container internal port still 5432; pgcrypto + citext extensions
auto-loaded via `scripts/init-extensions.sql`).

To stop the DB without losing data:

```bash
docker compose stop              # keeps the named volume
# or, to wipe data entirely:
docker compose down -v
```

### Fallback — Embedded Postgres (no Docker)

If Docker is unavailable on this machine, an embedded Postgres 18 binary
is bundled as a fallback. **Use only when Docker is not an option.**

```bash
cp .env.example .env
npm install
# Terminal 1 — start Postgres locally on port 5433
npm run dev:pg
# Terminal 2 — apply schema + seed user
npm run db:migrate
npm run seed
# Terminal 2 — run the API
npm run dev
```

Data persists under `./.pgdata` (gitignored). The embedded binary uses
the same DATABASE_URL as Docker, so `.env` requires no changes when
switching between the two paths — just stop one before starting the
other so port 5433 is free.

## Seed credentials (dev only)

```
email:    nexa@woxacorp.com
password: WoxaVault!Dev2026
```

Override via `SEED_EMAIL`, `SEED_PASSWORD` env vars before running `npm run seed`.

## Project layout

```
woxa-vault-api/
├── docker-compose.yml          # Postgres 16 on host port 5433
├── drizzle.config.ts           # drizzle-kit config
├── drizzle/                    # generated migrations (committed)
├── scripts/
│   ├── dev-pg.ts               # embedded Postgres dev runner
│   └── init-extensions.sql     # pgcrypto / citext bootstrap for Docker
└── src/
    ├── server.ts               # @hono/node-server bootstrap
    ├── app.ts                  # Hono app factory + middleware + error handler
    ├── config/env.ts           # zod-validated env
    ├── db/
    │   ├── client.ts           # drizzle + postgres-js pool
    │   ├── schema.ts           # Phase A tables (users, sessions, ...)
    │   ├── migrate.ts          # `npm run db:migrate`
    │   └── seed.ts             # `npm run seed`
    ├── lib/
    │   ├── logger.ts           # pino w/ redact list
    │   ├── password.ts         # argon2id helpers
    │   ├── session.ts          # token gen / validation / cookie builders
    │   ├── ipHash.ts           # HMAC IP for audit (DESIGN §7.5)
    │   ├── rateLimit.ts        # in-memory sliding window (Phase A)
    │   └── errors.ts           # ApiError + standard error shape
    ├── middleware/
    │   └── auth.ts             # sessionMiddleware + requireAuth
    └── routes/
        ├── auth.ts             # /auth/login /logout /me
        └── health.ts           # /health /health/db
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start API in watch mode on port 8787 |
| `npm run dev:pg` | Start embedded Postgres on port 5433 (fallback — Docker is the default) |
| `npm run db:generate` | drizzle-kit generate (after schema changes) |
| `npm run db:migrate` | Apply migrations to DB |
| `npm run seed` | Insert dev org + seed user |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | vitest |
| `npm run build` | Type-only build to `dist/` |

## API contract

See [`../API_CONTRACT.md`](../API_CONTRACT.md) for the live contract shared with the web frontend.

## Google Workspace SSO setup (dev)

1. Open Google Cloud Console → **APIs & Services** → **Credentials**.
2. **Create credentials** → **OAuth client ID** → application type **Web application**.
3. **Authorized JavaScript origins**:
   - `http://localhost:3000` (dev frontend)
   - `https://vault.iux24.com` (prod frontend, when ready)
4. **Authorized redirect URIs**:
   - `http://localhost:8787/auth/sso/google/callback` (dev API)
   - `https://api.iux24.com/auth/sso/google/callback` (prod API, when ready)
5. Copy the generated **Client ID** and **Client secret** into your `.env`:
   ```bash
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8787/auth/sso/google/callback
   GOOGLE_OAUTH_ALLOWED_DOMAIN=iux24.com
   ```
6. Restart `npm run dev`. The "Sign in with Google" button on the web app
   navigates to `/auth/sso/google/start?next=/app` and the browser is
   redirected back through the callback with the session cookie set.

Leave `GOOGLE_OAUTH_CLIENT_ID` blank to disable SSO entirely (the endpoint
returns a 500 `internal_error` at request time). Leave
`GOOGLE_OAUTH_ALLOWED_DOMAIN` blank to accept any verified Google account
in dev (a warning is logged on every successful sign-in).

## What's not done yet

- AWS KMS envelope encryption (using a local KEK placeholder — see `.env.example`).
- Google Workspace SSO, 2FA, magic links, recovery (US-001/003/004).
- Vaults / items / sends / audit-log wiring.
- Redis-backed rate limit (in-memory only).
- Audit-event emission across non-auth endpoints.
- Row-Level Security policies.
- Vitest test suite (scaffold present, no tests yet).

These are Phase A2+/B work per [`../secret-vault/PHASES.md`](../secret-vault/PHASES.md).
