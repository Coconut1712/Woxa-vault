---
name: controls-that-held
description: Woxa Vault defenses confirmed BLOCKED in live red-team testing — re-test these rather than re-discovering they hold
metadata:
  type: project
---

# Controls confirmed BLOCKED (2026-06-04 engagement)

Each held under live PoC. Re-test after major refactors of the named seam; otherwise assume still solid.

- **Cross-tenant IDOR** (`/items/:id`, `/items/:id/password`, `/vaults/:id`, `/vaults/:id/items`, `/vaults/:id/members`): all 404 anti-enumeration. `loadItemForUser` re-derives role via `resolveItemRole` → null = 404; never trusts the object's stored vault/org.
- **Forged active_org_id**: even DB-tampering `sessions.active_org_id` to another org does NOT cross tenants. `resolveActiveOrg` (lib/orgAccess.ts) re-validates (userId, activeOrgId) against a live `org_members` row on EVERY request; miss → falls back to the user's own org. `/workspace/switch` to a non-member org = 404.
- **RBAC escalation**: PATCH `/members/:id {role:"owner"}` = 400 (owner excluded from `ASSIGNABLE_ORG_ROLES`). Member self-promote = 403. Admin cannot mint peer admin via PATCH or invite (double `outranks` check: target AND new role). Owner untouchable by PATCH/DELETE. member→guest downgrade works (control).
- **Guest read-only**: org-`guest`/`auditor` with even a vault-`manager` grant still 403 on create/delete (`blockGuestWrites` middleware overrides vault role); reads still work.
- **2FA**: login w/ TOTP returns `mfa_required` + NO session cookie. Valid code mints 1 session. **Replay of same TOTP = 401** (monotonic `last_totp_step` CAS in `consumeTotpStep`). Forged mfaToken = 401. Backup codes single-use (atomic UPDATE…WHERE used_at IS NULL RETURNING).
- **One-time send**: 20 parallel reveals on maxViews=1 → exactly 1 plaintext, rest 410 (atomic UPDATE…WHERE view_count<max_views AND burned_at IS NULL RETURNING). Link-preview bot-burn guard: reveal <1s after create = 425 not_ready, view NOT consumed.
- **SQLi**: `/search?q=` parameterized (Drizzle) + LIKE-wildcard escaping; injection payloads return empty, DB intact.
- **Oversized payload**: Zod caps (name 120, notes 32768, content 32768) → 400.
- **Path traversal (attachments)**: filename sanitized to basename; storage key = server `randomUUID()`; storage layer rejects `..`/NUL/root-escape (lib/storage.ts).
- **Stored XSS**: no `dangerouslySetInnerHTML` in web; React escapes item name/notes — payload renders inert.
- **Audit**: append-only (no PATCH/PUT/DELETE verbs on /audit route); cross-org isolated (admin of A never sees B's events). Org-agnostic auth events show orgId=null (expected).
- **Account lockout backstop**: 5 failed logins → `locked_until` set; correct password still refused while locked, even from a fresh spoofed IP. This is the real brute-force backstop (the per-IP RL is evadable; the DB lock is not).
- **Recovery reset**: per-email cap `pwreset:email:${email}` (3/hr) is NOT IP-keyed, so cf-ip spoofing canNOT evade it (only login's per-email key includes IP).
