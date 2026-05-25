---
name: vault-unlock-endpoint
description: POST /me/verify-password — Phase A vault auto-lock UX gate (AC-055.8), no session mutation, two-tier rate limit
metadata:
  type: project
---

`POST /me/verify-password` exists for the AC-055.8 vault auto-lock (15-min idle) unlock flow. DESIGN.md §15 Lock Model.

**Why:** In Phase A the KEK is server-side, so an unlock is not a cryptographic operation — it's a gate. Phase A.5 (WARN-I, see [[phase-a5-server-side-vault-lock]]) extended the gate to the BACKEND: on success the endpoint now stamps `sessions.vault_unlocked_at = now()` (atomic with the audit row), and `requireVaultUnlocked` enforces the same 15-min window on `GET /items/:id`, `GET /attachments/:id/download`, and `POST /sends`. Phase C will rewrite this as a real cryptographic unlock once the KEK becomes user-derived.

**How to apply:**
- Behind `requireAuth`.
- Returns `{ ok: true }` on success.
- Errors: `400 validation_error`, `401 invalid_credentials`, `401 unauthorized`, `409 password_not_set` (new code — SSO-only user with no `password_hash`), `429 rate_limited`.
- Rate limit pattern is the same two-tier shape as `/me/recovery-kit/regenerate`: soft 30/15min ticks every attempt, hard 5/15min ticks only on failure. Keys: `vault-unlock:user:{id}` + `vault-unlock-failed:user:{id}`.
- Constant-time: 409 path still burns an Argon2 verify against a baked-in `VERIFY_DUMMY_HASH` so timing does not leak SSO-only-ness.
- Always emits `Cache-Control: no-store`.
- Audit actions: `account.vault_unlock_success` + `account.vault_unlock_failed` (metadata: `{phase: "A", reason: "wrong_password" | "no_password"}`).
- `password_not_set` error code added to `errors.ts` and API_CONTRACT.md error-code table.

Related: [[recovery-kit-flow]] (regen endpoint inspired the two-tier RL pattern), [[account-self-service]] (same router file), [[api-contract]] (new error code).
