---
name: project-single-owner-invariant
description: org_members has a partial unique index (org_members_single_owner_idx) allowing only ONE owner row per org — trips integration tests that mint two owners
metadata:
  type: project
---

The `org_members` table enforces a single-owner-per-org invariant via a Postgres
partial unique index `org_members_single_owner_idx`. Inserting a second row with
role `owner` for the same org fails with a duplicate-key error.

**Why:** ownership is single-owner by design (DESIGN.md §3); ownership only moves
via `POST /workspace/transfer-ownership`, which atomically demotes the old owner.

**How to apply:** In integration tests (real Postgres, `app.request` harness like
`src/routes/requireTwoFactor.test.ts`), create exactly ONE owner per org and reuse
that session cookie across owner-path assertions. Do not loop `makeMember(org, "owner")`.
Related: [[project-resend-test-pre-existing-failure]].
