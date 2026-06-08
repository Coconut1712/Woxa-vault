---
name: kdf-salt-contract
description: Phase C crypto fix #2 — deriveMasterKey now takes a server-issued per-user salt; where each flow fetches it
metadata:
  type: project
---

`deriveMasterKey(password, salt: Uint8Array)` and `deriveAuthKeyHash(masterKey, salt: Uint8Array)` in `src/lib/crypto-client.ts` take a server-issued per-user Argon2id salt (base64 from server, `fromBase64` it), NOT the old `userId.padEnd(16,"0")`. `deriveAuthKeyHash` prefixes the same salt with utf8 `"auth:"` for domain separation (client-internal only — backend just Argon2-hashes whatever `masterAuthKeyHash` string the client sends, so format is a client concern).

**Why:** predictable userId salt allowed rainbow/precompute + related-key across same-password users. Random per-user salt closes it.

**How to apply (where each flow gets the salt):**
- Backend `/auth/login-info` does NOT return `kdfSalt` — only `/auth/kdf-salt?email=` does (`getKdfSalt(email)` in `src/lib/api/auth.ts`). So login (`auth/provider.tsx`) + unlock (`vault-lock/lock-screen.tsx`) call `getKdfSalt(email)` (with `info.kdfSalt ??` guard for a future inlined field).
- setup-password + upgrade pages use `me.kdfSalt ?? await getKdfSalt(me.email)`. `MeUser.kdfSalt` IS returned by `/me`.
- Every backend row-creation path (register auth.ts, SSO sso.ts, invite) sets `kdfSalt: generateKdfSalt()` at insert, so `me.kdfSalt` is always populated before setup-password → salt consistency setup↔unlock holds. Legacy null rows backfilled by migration 0030.

Related: [[phase-c-vault-key-wrap]].
