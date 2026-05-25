---
name: account-self-service
description: Round-5 account self-service routes /me + invite-signup flow; password change preserves current session and invalidates others
metadata:
  type: project
---

Round 5 (2026-05-19) added two related capabilities:

**Invite signup flow (`POST /invite/:token/signup-and-accept`)**
- Public route — no session required. Used when `GET /invite/:token` returns `userExists: false` (new field added in the same round).
- Creates `users` row + `org_members` row + flips invitation `accepted_at` in a single transaction; issues a Lucia session cookie on the response so the caller is logged in immediately.
- 409 `user_exists` (new error code) when the invited email already has an account — frontend redirects to login then calls `/accept`.
- Rate limit 5/min per `(IP, token_hash)`; uses the same in-memory `rateLimit()` helper as `/auth/login`.
- Password policy: min 10 / max 1024 chars (matches seed strength). Argon2id via `hashPassword()` — same params as login.

**Account self-service (`/me/*`)**
- `src/routes/me.ts`. Mounted at `/me` in `src/app.ts`.
- `GET /me` returns enriched profile: `{ id, email, displayName, createdAt, lastLoginAt, twoFactorEnabled (totpEnabledAt!=null), role (from currentOrgForUser) }`.
- `PATCH /me` Phase A allows ONLY `displayName` (1..120 trim). Audit `account.profile_updated`.
- `POST /me/password` **REMOVED in round 6** (2026-05-19). Direct change-password is gone. The only path to rotate an existing password is `POST /auth/password/reset-with-recovery`. See [[recovery-kit-flow]].
- `POST /me/sessions/revoke-all` deletes all other sessions, returns `{ ok: true, revokedCount }`.

**Schema change (migration `0004_adorable_husk.sql`)**
- Added `users.password_updated_at timestamp with time zone NULL`. Set at signup-and-accept and at every password change.

**Phase A note (DO NOT FORGET when going to Phase C)**: server-side envelope encryption uses `LOCAL_KEK_BASE64`, NOT a user-derived key. Therefore changing the master password rotates the auth credential ONLY — no DEK re-wrapping happens. Audit metadata records `{ phase: "A", kekRotated: false }`. When Phase C ships zero-knowledge auth, this route must coordinate KEK rotation + DEK re-wrap with the frontend.
