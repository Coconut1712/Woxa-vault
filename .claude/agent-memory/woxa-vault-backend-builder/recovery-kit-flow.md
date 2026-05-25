---
name: recovery-kit-flow
description: Round-6 recovery-kit replaces direct change-password; setup + regenerate + public reset flow, single-use, sessions cleared on reset
metadata:
  type: project
---

Round 6 (2026-05-19) replaced the master-password change flow with a recovery-kit-driven model to align with the zero-knowledge security model.

**Removed:** `POST /me/password` (direct change while authenticated). Calling it now returns `404 not_found`.

**New routes:**
- `POST /me/password/setup` — first-time master password setup. Refuses with `409 password_already_set` if `users.password_hash` is non-null. Always emits + returns a fresh `recoveryCode` so the account is never left without a recovery path.
- `POST /me/recovery-kit/regenerate` — rotates recovery code; requires current password as proof-of-possession (defeats session-only attacker). Rate limit 3/hour/user. Returns `{ recoveryCode }` plaintext-once.
- `POST /auth/password/reset-with-recovery` — public forgotten-password flow. Verifies recovery code via Argon2 against `recovery_kit_hash`. Always runs a dummy Argon2 verify when the email is unknown so timing doesn't leak user existence. Single-use: success clears `recovery_kit_hash`, sets `recovery_kit_used_at = now`, deletes ALL sessions (recovery = sign-of-compromise). Rate limit 5/hour/IP + 3/hour/email (email cap is the tighter one).
- `POST /invite/:token/signup-and-accept` now also generates + returns a `recoveryCode` so the account is born with a recovery path.

**Recovery-code format:** 256-bit (32 byte) random → base32 lowercase no padding → 52 chars → grouped into 13 dashed 4-char blocks. Normalize (strip dashes/spaces, lowercase) before Argon2 verify so users can re-type with their own grouping/casing. Helper in `src/lib/recoveryKit.ts`.

**Argon2 params:** identical to password hashing (`t=3, m=64MB, p=4`). Recovery code is hashed the same way as a password — same `hashPassword`/`verifyPassword` underneath via `recoveryKit.ts` wrappers.

**Schema (migration `0005_mean_edwin_jarvis.sql`):**
- `users.recovery_kit_hash text NULL`
- `users.recovery_kit_created_at timestamptz NULL`
- `users.recovery_kit_used_at timestamptz NULL`

**`GET /me` payload (additive):** `requiresPasswordSetup: boolean` (true iff `password_hash IS NULL`), `hasRecoveryKit: boolean` (true iff `recovery_kit_hash IS NOT NULL`), `recoveryKitCreatedAt: string|null`.

**Frontend wiring TODO:**
- Show "Set master password" affordance when `requiresPasswordSetup === true`.
- After `POST /me/password/setup`, gate navigation behind a "I saved the recovery code" confirmation modal.
- After successful `POST /auth/password/reset-with-recovery` (response `requiresNewRecoveryKit: true`), the next login MUST land on a "Save your new recovery kit" screen that calls `POST /me/recovery-kit/regenerate`.
- Replace old `POST /me/password` UI with "Reset via recovery code" entry point linking to a public reset page.

**Phase A note:** `LOCAL_KEK_BASE64` is unchanged by any of these flows — server-side envelope encryption is independent of the user's master password. Audit metadata records `{ phase: "A", kekRotated: false }`. Phase C must coordinate DEK re-wrap with the frontend on setup/regenerate/reset paths.

See [[account-self-service]] for the prior round-5 state.
