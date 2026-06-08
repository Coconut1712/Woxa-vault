---
name: check-locations
description: File:line of Woxa Vault's key authorization/crypto/rate-limit seams for fast attack targeting
metadata:
  type: reference
---

The seams to read before attacking (verify line numbers — code moves):

- **Active-org resolution (the IDOR/stale-pointer defense):** `src/lib/orgAccess.ts` `resolveActiveOrg` (re-validates membership every call, role from resolved row). Entry point `activeOrgForContext` in `src/middleware/auth.ts`.
- **Vault ownership / role:** `src/routes/vaults.ts` `loadVaultForUser` (~:62) and `loadVaultForViewer` (~:144). Item ownership: `loadItemForUser` in items.ts. Missing-access → 404 (anti-enumeration), not 403.
- **RBAC ranks / assignable roles:** `orgAccess.ts` `ROLE_RANK`, `outranks`, `ASSIGNABLE_ORG_ROLES` (owner excluded). Org-write block for guest/auditor: `blockGuestWrites` middleware.
- **Vault-lock / 2FA gates:** `requireVaultUnlocked` (plaintext-read only) and `requireTwoFactorEnrolled` in `src/middleware/auth.ts`. `userRequiresTwoFactorEnroll` in `src/lib/orgPolicy.ts`.
- **Rate limit:** `src/lib/rateLimit.ts` (Redis sliding-window + in-memory fallback). IP resolution `src/lib/clientIp.ts` `getClientIp` (forwarding headers gated behind `TRUST_PROXY`). Login limits in `src/routes/auth.ts` (~:55 LOGIN_LIMIT=5/15min; combo key `login:${ip}:${email}`). Account lock: failed_login_count→lockedUntil in auth.ts login handler.
- **ZK item read (no server decrypt):** `src/routes/items.ts` `GET /:id/password` (~:523) returns raw ciphertext. Server-side envelope (legacy/MFA only): `src/lib/itemCrypto.ts` `getKek`/`unwrapDek`. Item create forces vault `encryptionVersion: 2` in vaults.ts (~:450).
- **Access-request auto-deny sweeper:** `src/lib/expirationSweeper.ts` `sweepStaleAccessRequests` (~:173, cutoff now-7d, status='pending' only). Decide handler `src/routes/accessRequests.ts` (~:220): owner/admin only, org-scoped, status!=pending→409.
- **Session:** `src/lib/session.ts` — session id = `sha256(token)` (hashToken ~:38). Cookie name from env `SESSION_COOKIE_NAME`.
- **Audit:** insert-only; no update/delete(auditEvents) anywhere in src/. Read gated admin/owner in `src/routes/audit.ts`.
