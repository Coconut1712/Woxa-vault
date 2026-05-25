---
name: phase-a5-server-side-vault-lock
description: Migration 0007 vault_unlocked_at + requireVaultUnlocked middleware; 401 vault_locked error code; WARN-I/J/K/L round
metadata:
  type: project
---

Phase A.5 closes the WARN-I "session-thief bypass" hole — the 15-minute vault auto-lock used to be frontend-only, so a stolen cookie could hit the JSON API directly and bypass the lock screen. Round delivered:

**Schema**: migration 0007 adds `sessions.vault_unlocked_at timestamp with time zone NULL`. Backfilled to `created_at` for legacy rows. Stamped on session creation (`createSession` in `src/lib/session.ts`), on a successful `/me/verify-password`, and on a successful `/me/sessions/revoke-all`. NULL = treated as locked.

**Middleware**: `requireVaultUnlocked` in `src/middleware/auth.ts`. Reads `c.var.session.vaultUnlockedAt`, returns `401 vault_locked` if older than `VAULT_UNLOCK_IDLE_MS = 15 * 60 * 1000`. Best-effort audit `vault.access_denied_locked` on trip. Session row is now exposed on `AuthVariables` via `sessionMiddleware` (set alongside `user` + `sessionToken`).

**Where applied** (plaintext-emitting endpoints only):
- `GET /items/:id` (the reveal handler)
- `GET /attachments/:id/download`
- `POST /sends` (create — accepts plaintext from caller)

**Where NOT applied** (intentional):
- List/metadata routes: `GET /vaults`, `GET /vaults/:id/items`, `GET /items/:id/attachments`, `GET /sends`
- All `/me/*`, all `/auth/*`, all public preview routes (`/s/:token/*`, `/invite/:token/*`)
- `PATCH /items/:id` and `DELETE /items/:id` (no plaintext returned)

**Error code**: `vault_locked` (401), in `errors.ts` as `errors.vaultLocked()`. Distinct from `unauthorized` so the frontend can branch.

**WARN-J fix**: `/me/verify-password` now sets `Cache-Control: no-store` BEFORE the rate-limit check, so 429 and 401 responses also carry the header.

**WARN-K fix**: failure-path audit inserts in `/me/verify-password` are wrapped in try/catch (`auditFailure` helper). An audit-write failure logs at warn level but does NOT skip `consumeRateLimit` or the thrown response. The SUCCESS path uses a transaction (update sessions + insert audit row atomically).

**WARN-L fix**: `verifyPasswordSchema` accepts an optional `lockReason: "idle" | "manual" | "restart" | "sleep"`. Pass-through tag on the audit row — backend does not branch on it.

**Phase C plan**: master password becomes the KEK KDF input. `requireVaultUnlocked` graduates from "UX gate enforced server-side" to a real cryptographic gate (no DEK unwrap possible without the unlock).

Related: [[vault-unlock-endpoint]] (the verify-password endpoint), [[round7-security-hardening]] (sessions.absolute_expires_at column added in 0006), [[api-contract]] (vault_locked error code).
