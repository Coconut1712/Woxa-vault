---
name: project-item-search
description: GET /search (US-017 Cmd+K) — server-side fuzzy ILIKE on plaintext item metadata, per-result RBAC via resolveItemRole, pg_trgm GIN indexes
metadata:
  type: project
---

`GET /search?q=&limit=` (route file `src/routes/search.ts`, mounted at `/search` in app.ts before `/sends`). Phase A server-side fuzzy search; Phase C will replace with a client blind index.

- Searches PLAINTEXT only: `name/username/url/type` via `ILIKE '%q%'` (LIKE wildcards in `q` are escaped). Never ciphertext or the encrypted notes meta blob.
- RBAC: over-fetch up to CANDIDATE_CAP=100 candidates ordered by AC-017.3 sort (exact-name-first → lastUsedAt desc nulls last → name), then `resolveItemRolesBatch` (lib/access.ts) resolves ALL candidates in a bounded query count (NOT the old per-row `resolveItemRole` N+1 — that was an authenticated-DoS finding). Same most-specific-wins semantics + temp-grant expiry. Filters to effective ≥ view_metadata, trimmed to `limit` (default 20, max 50). Auditor org-role short-circuits to viewer (separate branch, skips the batch). Null role → omitted (anti-enumeration). Scoped to active org via `activeOrgForContext`.
- Rate limit: `rateLimit("search:<userId>", {limit:120, windowMs:60_000})` — per-user (not IP, so shared-NAT tenants don't starve each other), 120/min covers fast typing.
- NOT audited per-query; query string never logged.
- Indexes: `items_{name,username,url}_trgm_idx` GIN trigram. Originally `drizzle/0024_chilly_harry_osborn.sql` (CREATE EXTENSION + CREATE INDEX, no IF NOT EXISTS) but 0024 was silently skipped on already-migrated DBs (see [[gotcha-drizzle-migration-when-gate]]). Re-applied idempotently by `drizzle/0026_trgm_index_backfill.sql` (all IF NOT EXISTS). Dev Docker PG + Neon both support pg_trgm.

**Gotcha:** the shared `queryValidator` already exists in `lib/validator.ts` (targets "query") — use it, don't roll a local one. Tests: `src/routes/search.test.ts`. See [[project-item-meta-overlay]].
