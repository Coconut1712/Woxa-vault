---
name: round11-security-audit-patches
description: 5-finding audit round — notes-reveal viewer gate, recovery resets BOTH creds, temp-grant originalRole preservation, teams 2FA/guest gate, webhookUrl redact
metadata:
  type: project
---

Round-11 security audit: fixed 5 findings in woxa-vault-api. Invariants future rounds must not regress:

- **F1 (HIGH) — notes reveal gate**: GET /items/:id (items.ts ~330) now gates decrypted `notes` (Phase A) and `notesCiphertext`/`notesIv` (ZK Phase C) behind `const canReveal = canRevealItem(access.role) && !isAuditor;`. A vault `viewer` is metadata-only: keeps summary (name/tags/timestamps) but notes → null. Previously gated only on `isAuditor`, leaking notes to viewers. Pinned by sharing.rbac.test.ts (viewer → notes:null).
- **F2 (MED) — recovery reset credential**: /auth/password/reset-with-recovery (auth.ts ~544) now sets BOTH `loginPasswordHash` AND `passwordHash` = newHash. Decision: /forgot-password is the PUBLIC "can't log in" surface (frontend forwards to /login/password expecting login to work); login verifies `login_password_hash` (auth.ts:117/149), so rotating only master left users locked out. Rotate both so one fresh credential covers login + vault-unlock (no split-brain).
- **F3 (MED) — temp-grant revert**: accessRequests.ts approve branches (item + vault) compute `originalRole = existing?.originalRole ?? existing?.role ?? null`. Prevents a re-approve from promoting the baseline to an already-elevated temp role (which would make expiry/sweeper revert to the elevated role = permanent elevation). NOTE: only item + vault branches exist; no folder branch in this router.
- **F4 (LOW) — teams middleware**: teams.ts now mounts `requireAuth` + `requireTwoFactorEnrolled` + `blockGuestWrites` (mirrors vaults.ts/items.ts). 2FA gate is all-verbs (consistent w/ vaults.ts; doesn't block enroll flow which uses /me + /auth/2fa). blockGuestWrites is method-scoped so GET /teams stays readable.
- **F5 (INFO) — redact**: logger.ts REDACT_PATHS added `'*.webhookUrl'` + `'req.body.webhookUrl'` (Slack/Google integration webhook URLs carry bearer-equiv tokens).

**Pre-existing failures NOT caused by this round** (reproduce with edits stashed — other in-progress working-tree work on me.ts/orgAccess.ts/resend): `tsc` error me.ts:362 (`authKeyHash` destructure vs schema renamed to `loginAuthKeyHash`); test fails orgAccess.test.ts (assignable roles now include auditor) + resend.test.ts (not_configured→transport_failed). See [[two-password-model]] [[verify-login-error-contract]].
