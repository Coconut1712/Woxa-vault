---
name: gotcha-drizzle-migration-when-gate
description: drizzle postgres-js migrator gates on MAX(created_at); non-monotonic journal `when` silently skips migrations
metadata:
  type: project
---

The drizzle `postgres-js` migrator applies a journal entry only if its `when` (recorded as `created_at` in `drizzle.__drizzle_migrations`) is GREATER than the current MAX(created_at) in the DB. It does NOT track applied migrations by tag/hash for the apply decision — only the high-water timestamp.

**Why:** migration 0024 (trgm GIN indexes, US-017/FR-041) was silently skipped on the dev DB. Root cause: 0016-0019 had hand-set FUTURE `when` values (1.7802e12–1.7805e12), then 0020-0024 reverted to realistic timestamps (1.7798e12–1.78037e12) BELOW that high-water mark. 0025 had been bumped to 1.7806e12 (future) so it alone passed the gate; 0024 never applied → `items_*_trgm_idx` missing in `pg_indexes` even though `__drizzle_migrations` showed 0025.

**How to apply:**
- Keep `_journal.json` `when` STRICTLY INCREASING by idx. Hand-authored migrations (drizzle-kit generate is broken here — see [[migration-history-handwritten]]) must pick a `when` greater than the previous entry's.
- Renumbering an already-applied migration does NOT re-run it. To re-apply a skipped migration's effect, write a NEW idempotent migration (CREATE EXTENSION/INDEX IF NOT EXISTS) whose `when` EXCEEDS the stuck DB high-water mark, or it will be skipped too. 0026_trgm_index_backfill.sql does exactly this (`when`=1780600000001, just above the stuck 1780600000000).
- Verify on dev DB: `docker exec woxa-vault-postgres psql -U woxa -d woxa_vault -c "SELECT indexname FROM pg_indexes WHERE tablename='items' AND indexname LIKE '%trgm%';"` (no psql on host; go through the container). Verify fresh-DB apply by migrating a throwaway DB with all `IF NOT EXISTS` no-ops.
