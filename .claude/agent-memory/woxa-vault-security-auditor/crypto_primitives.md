---
name: crypto_primitives
description: Where Argon2id / DEK / KMS / MFA / item-crypto helpers live in the codebase
metadata:
  type: reference
---

API-side crypto helper locations (verify these still exist before referencing in a finding):

- **Argon2id (master password / recovery code / backup code):** `woxa-vault-api/src/lib/password.ts` — `hashPassword` / `verifyPassword`. Parameters: m=64MB, t=3, p=4 (OWASP 2024 / FR-112). Same params reused for backup codes in `lib/mfa.ts` (`ARGON_OPTS`).
- **Recovery code:** `woxa-vault-api/src/lib/recoveryKit.ts` — generate / hash / normalize. Reused by `/me/recovery-kit/regenerate` and `/auth/password/reset-with-recovery`.
- **Item DEK / KMS wrapping:** `woxa-vault-api/src/lib/itemCrypto.ts` — Phase A envelope encryption via `LOCAL_KEK_BASE64`.
- **TOTP + backup code + mfaToken:** `woxa-vault-api/src/lib/mfa.ts`. Helpers: `encryptUserSecret` / `decryptUserSecret` (AES-256-GCM, IV 12, `iv ‖ ct ‖ tag` base64), `generateTotpSecret` (20-byte CSPRNG), `verifyTotpCode` (otplib, window=1), `generateBackupCode` / `hashBackupCode` / `verifyBackupCode`, `signMfaToken` / `verifyMfaToken` (HS256 HMAC + `timingSafeEqual`, 5-min TTL, purpose check).
- **Session token:** `woxa-vault-api/src/lib/session.ts` — Lucia v3 session row + cookie helpers (`createSession`, `buildSessionCookie`). Cookie attrs `HttpOnly + SameSite=Lax + Secure (prod) + Path=/`.
- **Constant-time dummy hashes:** inline at top of route files (e.g. `routes/me.ts` `VERIFY_DUMMY_HASH`, `routes/auth.ts` `DUMMY_HASH`). Pattern: pre-computed Argon2id hash with same params so wrong-account paths spend equivalent CPU.
- **IP hashing:** `woxa-vault-api/src/lib/ipHash.ts` — used in audit metadata, never raw IPs.

Frontend:
- **Vault lock crypto:** none yet (Phase A — lock is UX-only). Future Phase C client-side KEK derivation will live in `woxa-vault-web/src/lib/vault-lock/` or similar.
- **mfaToken handling:** `woxa-vault-web/src/app/login/password/page.tsx` — held in React state only (`step.mfaToken`), never persisted to localStorage/sessionStorage/cookies. 5-min countdown lives in component state.

Related: [[validation_and_ratelimit]] [[audit_and_logging]] [[mfa_patterns]]
