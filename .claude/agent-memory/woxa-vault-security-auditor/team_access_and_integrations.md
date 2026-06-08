---
name: team-access-and-integrations
description: Team-based ACL, expiration sweeper, Slack/Google integrations, ZK schema — audit map + open findings (2026-06-02)
metadata:
  type: project
---

Audited 2026-06-02 (team-based access + integrations + expiration sweeper + ZK scaffolding round).

**Granular ACL engine** lives in `lib/access.ts`. `resolveItemRole` / `resolveFolderRole` resolve most-specific-wins: item → folder → vault, each level unions USER grant + TEAM grants (`itemTeamMembers`/`folderTeamMembers`/`vaultTeamMembers` innerJoin `teamMembers`). New 4th tier: org `auditor` role → effective `viewer` (metadata-only, `canRevealItem` blocks decrypt). `highestRole()` (access.ts:252) handles expiry on the READ path: expired grant falls back to `originalRole` (or filtered out if null) — so read access self-heals even before the sweeper runs. CLEAN.

**Team share authority is correctly capped:** all item/folder/vault team-grant POST/PATCH gate on `canGrantRole(ctx.authority, role)` / `canModifyGrant`. Team membership itself is admin-only (`canManageOrgMembers` in teams.ts) — no self-join escalation. CLEAN.

**Expiration sweeper** `lib/expirationSweeper.ts`: 60s setInterval (unref'd), single tx, reverts vault/folder/item members where `expiresAt < now` to `originalRole` (or deletes if null), notifies. NOTE: read-path already denies expired elevation, so sweeper lag is not a security gap — it's housekeeping + notifications.

**OPEN FINDINGS to re-verify next audit:**
1. HIGH — `GET /items/:id` (items.ts:287-376) decrypts and returns `notes` plaintext to ANY effective role >= viewer; only suppresses for org `auditor`, NOT for vault-role `viewer`. Violates access.ts:65 stated invariant ("viewer may NOT decrypt password/notes"). The `/password` reveal endpoint DOES gate `canRevealItem`; the notes path does NOT. ZK path (encryptionVersion===2) returns notesCiphertext to viewer too. Fix = add `canRevealItem(access.role)` gate before notes decrypt (return notes:null for viewer).
2. MEDIUM — recovery reset asymmetry: `/auth/password/reset-with-recovery` (auth.ts:544) writes `passwordHash` (MASTER) but login verifies `loginPasswordHash` (auth.ts:117/149). Recovery does NOT reset the login credential despite comment claiming "device with OLD password must re-auth". Session-nuke (auth.ts:559) is the real control & works. Confirm product intent (is forgot-password for login or master?).
3. MEDIUM — accessRequests `/:id/decide` onConflictDoUpdate (accessRequests.ts:282-290) reads `existing.role` as `originalRole`. Re-approving an already-temp-granted user captures the ELEVATED role as originalRole → on expiry sweeper reverts to elevated = permanent escalation. Fix: only set originalRole when no temp grant active, or preserve existing.originalRole.
4. LOW — teamRoutes router only mounts `requireAuth` (no `requireTwoFactorEnrolled`, no `blockGuestWrites`). Mutations are role-gated (canManageOrgMembers) so guest/auditor blocked anyway, but a require2fa-org member w/o 2FA can still manage teams. Teams grant access → defense-in-depth gap.
5. LOW/INFO — `webhookUrl` (Slack) NOT in pino redact list (logger.ts) per team rule #4. Currently no code path logs it (verified), so not exploitable, but add `*.webhookUrl` for defense-in-depth.

**Slack integration (orgIntegrations.ts + workspace.ts:1010/1095):** SSRF-SAFE. `SLACK_WEBHOOK_RE = ^https://hooks.slack.com/services/[A-Za-z0-9/_-]+$` enforced at BOTH store (slackWebhookSchema) and read (readOrgSlackIntegration). The test-fetch (workspace.ts:1135) only ever hits the stored, regex-validated URL — no user-controlled host, no SSRF pivot. Webhook never returned on GET (only `maskSlackWebhook` tail). PATCH/test owner+admin only, two-tier-ish RL (peek+consume). Google integration is DERIVED from sso.allowedDomains (no dup storage). CLEAN.

**ZK scaffolding (schema.ts:680+):** `user_keys` (X25519 pub + master-wrapped priv key, argon2id kdf), `vault_keys` (per-member wrapped vault DEK, x25519-aes256gcm). encryptionVersion col on vaults (1=server-side Phase A, 2=ZK). Items.ts already branches on encryptionVersion===2 to return ciphertext instead of plaintext. redact list HAS authKeyHash/encryptedPrivateKey/privateKeyIv/privateKeyAuthTag. Scaffolding only — not yet a live boundary.

Related: [[rbac_org_hierarchy]] [[workspace_security_settings]] [[recurring_antipatterns]] [[crypto_primitives]] [[phase_a_residuals]]
