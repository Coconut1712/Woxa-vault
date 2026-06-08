---
name: gotcha-sql-rpad-vs-js-padend
description: Postgres rpad TRUNCATES, JS String.padEnd does NOT — do not use rpad to replicate a padEnd value in a backfill
metadata:
  type: feedback
---

When backfilling a column whose value must byte-match a JS-computed string, do
NOT translate JS `String.padEnd(n, ch)` into SQL `rpad(text, n, ch)`.

**Why:** `rpad(s, 16, '0')` TRUNCATES `s` to 16 chars when `s` is longer. JS
`s.padEnd(16,"0")` only PADS and NEVER truncates. A UUID's text form is 36 chars,
so the legacy salt `userId.padEnd(16,"0")` is just the full UUID unchanged — but
`rpad(id::text,16,'0')` produced a 16-char prefix. First version of migration
0030 used rpad and would have orphaned every legacy ZK account (different salt →
different derived master key → cannot unlock). Caught by computing the JS value
in node and diffing against the DB. Correct backfill:
`encode(convert_to(id::text,'UTF8'),'base64')`.

**How to apply:** any time a migration must reproduce a value the app computed in
JS/TS, compute the JS value for a real sample and diff it against the SQL output
BEFORE trusting the migration. Especially for pad/substring/case ops where SQL
and JS semantics diverge. If the migration already ran (non-NULL rows skip the
`WHERE x IS NULL` guard on re-run), repair the rows with a targeted UPDATE keyed
on the wrong-value pattern. See [[per-user-kdf-salt]].
