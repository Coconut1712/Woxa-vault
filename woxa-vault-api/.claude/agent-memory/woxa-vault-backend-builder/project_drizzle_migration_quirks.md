---
name: drizzle-migration-quirks
description: drizzle/meta snapshot chain was broken before 0013; how to make drizzle-kit generate work + the journal `when` ordering trap that silently skips migrations
metadata:
  type: project
---

The `drizzle/meta` snapshot chain in woxa-vault-api was partially hand-maintained, which breaks `drizzle-kit generate`.

**What was broken (as of generating migration 0013):**
- Migrations 0006-0012 were hand-written SQL. Their meta snapshots were NOT regenerated: `0006_snapshot.json` was a byte-copy of `0005` (same `id`+`prevId` → drizzle-kit errors "pointing to a parent snapshot ... collision"), and snapshots `0007`-`0012` did not exist at all.
- The hand-written journal entries used fake round-number `when` values (e.g. 0012 = `1779800000000`, far in the future).

**Why:** earlier migrations were authored by hand without running the generator (the dominant generator convention is plain `CREATE TABLE`; only 0008 used `IF NOT EXISTS`).

**How to apply — to make `drizzle-kit generate` produce a clean incremental migration:**
1. The generator only diffs `schema.ts` against the LATEST snapshot, but it validates the whole `prevId` chain first. Repair the chain so every journal tag has a snapshot with a correct `prevId`. Practical fix used: regenerate a full snapshot of the *current live DB schema* (temporarily strip the new tables from schema.ts, run generate into a temp `out` dir via a project-local temp drizzle config, capture that snapshot), then rewrite `drizzle/meta/0006..0012_snapshot.json` as copies of that snapshot with fresh `id`s chained off `0005`'s id.
2. Restore schema.ts, run the normal `drizzle-kit generate` → it emits only the new tables.
3. **Journal `when` TRAP:** the runtime migrator (`drizzle-orm/postgres-js/migrator`) applies entries where `journal.when > last_applied_created_at`. The generator stamps the NEW entry with the real clock (a smaller number than the fake future `when`s), so the new migration's `when` ends up LESS than 0012's → the migrator silently reports "migrations complete" and applies NOTHING. Fix: bump the new entry's `when` in `drizzle/meta/_journal.json` to be greater than the previous max (followed the round-number pattern, e.g. `1779900000000`).
4. `drizzle-kit check` returns "Everything's fine" once the chain is valid — use it to confirm.

Never edit committed migration SQL; only the meta snapshots/journal were touched to repair the chain. See [[single-owner-invariant]] for another DB invariant in this repo.
