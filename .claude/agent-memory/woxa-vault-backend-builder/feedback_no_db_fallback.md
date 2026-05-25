---
name: feedback-no-db-fallback
description: Do not add graceful 503 handlers or embedded-postgres fallbacks for missing Postgres in dev — user wants to fix Docker, not paper over it
metadata:
  type: feedback
---

When Postgres ECONNREFUSED happens in dev, do NOT:
- Add a `service_unavailable` / 503 branch to the global error handler
- Spawn `embedded-postgres` as a fallback DB
- Introduce a downstream-connection-error detector

The contract stays at the documented codes (`validation_error`, `invalid_credentials`, `unauthorized`, `rate_limited`, `internal_error`, `forbidden`, `not_found`, `vault_not_empty`, etc.). 500 is the right answer when the DB is unreachable — the dev fix is `docker compose up -d`, not a code change.

**Why:** Past root cause turned out to be "user forgot to start Docker Desktop." Adding fallback code masks that real signal, complicates the [[api-contract]] error matrix that the web frontend depends on, and risks the embedded DB drifting from the Dockerized one (different extensions, different versions, different RLS behavior). The user explicitly reverted a prior agent's attempt to add this layer.

**How to apply:** If the dev DB is down, ask the user to check Docker Desktop / `docker compose up -d` first. Do not propose 503 helpers, fallback DB processes, or "graceful degradation" middleware unless the user explicitly asks for production resilience work — and even then, confirm scope before touching the global error handler.

Related: [[project-runtime]] (Docker setup details), [[api-contract]] (error code surface).
