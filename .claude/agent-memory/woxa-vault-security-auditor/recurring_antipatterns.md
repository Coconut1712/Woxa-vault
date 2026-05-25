---
name: recurring_antipatterns
description: Patterns the team has introduced before — grep for these first in every new audit
metadata:
  type: feedback
---

When starting a new audit on Woxa Vault, run these greps before reading code in detail. They catch the team's most common regressions and let you focus the deep-read on novel surface area.

**Why:** These are real regressions caught in past audits (CRITICAL-5, CRITICAL-6, CRITICAL-7, WARN-10/12/13). The team learns quickly but novel sub-features sometimes re-introduce the same shape.

**How to apply (grep targets):**

1. **Missing constant-time dummy verify on enumeration-prone endpoints:**
   `grep -rn "passwordHash" routes/ | grep -v "DUMMY\|dummy"` — every `!user.passwordHash` branch should run `verifyPassword(DUMMY_HASH, ...)` on the wrong-path to keep timing flat.

2. **Single-tier rate limit on password-verifying endpoints:**
   `grep -n "rateLimit\|peekRateLimit\|consumeRateLimit" src/routes/*.ts` — any endpoint that runs Argon2 verify SHOULD have the two-tier (soft consumes-always + hard consumes-on-failure) pattern. Single `rateLimit()` only is a smell.

3. **Missing `Cache-Control: no-store` on responses that return secrets:**
   Endpoints returning `recoveryCode`, plaintext `decryptedField`, or any sensitive one-time body must set this header. Grep `recoveryCode\|plaintext` in routes/ and verify each handler sets it.

4. **`req.body.<newSecretField>` not in pino redact list:**
   Every new secret-bearing schema field needs an entry in `lib/logger.ts:REDACT_PATHS`. Cross-check schema files vs the redact list.

5. **Audit insert without `success` or `metadata`:**
   `grep -n "auditEvents).values" src/routes/*.ts | grep -v "success:\|metadata:"` — both fields are mandatory for forensic completeness.

6. **Password in URL query string:**
   `grep -rn "email=\${\|\?email=" woxa-vault-web/src` — past CRITICAL-7: forgot-password pre-fill must use sessionStorage, never URL query (Referer leak). Standard key: `FORGOT_EMAIL_STORAGE_KEY = "woxa-forgot-email"`.

7. **`status === "authenticated"` while `me === null`:**
   `grep -n "status.*authenticated" woxa-vault-web/src` — past WARN-12: AuthProvider must fail-closed when `/me` errors. Don't flip status until both `/auth/me` AND `/me` resolve.

8. **TOCTOU on first-write columns (e.g. `password_hash IS NULL`):**
   Any "set this once" UPDATE must be conditional: `WHERE column IS NULL` + check `RETURNING` row count. Past CRITICAL-2 was in `/me/password/setup`.

9. **Session-thief bypass — endpoints that mutate critical state without re-verify:**
   Recovery-kit regenerate, revoke-all sessions, password setup — all require proof-of-possession (current password in body). Any new "session-only is enough" mutation = high finding.

10. **Privilege change without session rotation:**
   Password setup, password reset, MFA enable — must `DELETE FROM sessions WHERE user_id = ...` then issue a fresh cookie. Past WARN-13 in setup-password.

11. **`localStorage` for anything secret-adjacent:**
    `grep -rn "localStorage" woxa-vault-web/src` — should be empty or only for non-secret UX state (theme, language). Vault lock timestamp uses sessionStorage by policy.

12. **Frontend secrets retained in React state after use:**
    `grep -rn "useState.*\"\"" woxa-vault-web/src/app/login woxa-vault-web/src/components/vault-lock woxa-vault-web/src/app/setup-password` — password fields should be cleared (setPassword("")) on success path, not just on error.

Related: [[validation_and_ratelimit]] [[auth_session_patterns]] [[audit_and_logging]]
