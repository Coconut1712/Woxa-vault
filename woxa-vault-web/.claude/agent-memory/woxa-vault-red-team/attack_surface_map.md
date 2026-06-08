---
name: attack-surface-map
description: Pointers to where Woxa Vault's key security checks live — start future campaigns here
metadata:
  type: reference
---

# Attack-surface map (woxa-vault-api/src)

- **active_org resolution / IDOR seam**: `lib/orgAccess.ts:resolveActiveOrg` (re-validates membership per request) + `middleware/auth.ts:activeOrgForContext`. Every org-scoped handler MUST use this, never `currentOrgForUser` directly.
- **Item/vault ownership**: `routes/items.ts:loadItemForUser` → `lib/access.ts:resolveItemRole` (most-specific-wins: item > folder > vault). null role = 404.
- **RBAC hierarchy**: `lib/orgAccess.ts:outranks` / `ASSIGNABLE_ORG_ROLES` (owner excluded). Member mgmt: `routes/members.ts` (double outranks check). Guest read-only: `middleware/auth.ts:blockGuestWrites`.
- **2FA**: `routes/twoFactor.ts:consumeTotpStep` (monotonic CAS replay guard) + `verify-login` (only session-mint path for 2FA users). Forced-enroll gate: `middleware/auth.ts:requireTwoFactorEnrolled`.
- **Vault lock**: `middleware/auth.ts:requireVaultUnlocked` (15min idle window on `sessions.vault_unlocked_at`); mounted on reveal/download/send-create only.
- **One-time send burn**: `routes/sends.ts` POST `/s/:token/reveal` — atomic UPDATE…WHERE view_count<max_views AND burned_at IS NULL …RETURNING; `FIRST_REVEAL_GRACE_MS=1000` bot guard.
- **Rate limiter**: `lib/rateLimit.ts` (Redis Lua sliding-window, in-memory fallback). IP source: `lib/clientIp.ts` (weak — see weak_cf_ip_ratelimit). Login limits/lockout: `routes/auth.ts` (LOCK_THRESHOLD=5, LOCK_DURATION 15min).
- **Crypto / DB-leak posture**: secret values (password/notes) are AES-GCM ciphertext under LOCAL_KEK; v1 vault item name/username/url are PLAINTEXT in DB (metadata-blind is v2/Phase C only). `lib/itemCrypto.ts`.
- **Storage / path traversal**: `lib/storage.ts` (rejects `..`/NUL/root-escape) + `routes/attachments.ts:sanitizeFilename`.
- **Web XSS/CSP**: `woxa-vault-web/src/proxy.ts` — CSP is **report-only** unless `CSP_ENFORCE=1` (truthy). No `dangerouslySetInnerHTML` in src.
