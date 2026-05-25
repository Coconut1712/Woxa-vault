---
name: invitations-feature
description: Round-3 member invitation flow — invitations table, token hashing, no email transport yet, acceptUrl returned in response
metadata:
  type: project
---

Round 3 added the **member invite** flow on `/members/invite*`. Round 4 (2026-05-19) wired the **acceptance** flow at `/invite/:token` (preview) and `/invite/:token/accept` (auth required).

Key implementation facts:
- Migration `0003_special_human_robot.sql` adds an `invitations` table (`org_id`, `email`, `role`, `token_hash`, `expires_at`, `accepted_at`, `revoked_at`, `last_sent_at`).
- Schema lives in `src/db/schema.ts` next to `org_members`; types `Invitation` / `NewInvitation` exported.
- Token: 24 random bytes → base32 lowercase, no padding (same encoding as send tokens). DB stores SHA-256 hex of the token only (`hashInviteToken`).
- TTL = 7 days (matches DESIGN.md §3 "signed invite link, exp 7d").
- Endpoints (all in `src/routes/members.ts`):
  - `POST /members/invite` — admin/owner only; cannot invite at role `owner`; idempotent (re-invite same email refreshes token + expiry instead of duplicating row).
  - `POST /members/invite/:id/resend` — rotates token, resets expiry.
  - `DELETE /members/invite/:id` — sets `revoked_at`.
  - `GET /members` now ALSO returns `invitations: Invitation[]` (admin/owner only; filtered to `status === "pending"`).
- No email transport in Phase A: `acceptUrl` is returned in the response body AND logged at info level. Plan: wire Resend in Phase B and stop returning `acceptUrl`.
- Audit actions: `member.invite`, `member.invite_resent`, `member.invite_revoked`, `member.invitation_accepted`.
- Error codes (in API_CONTRACT.md): `already_member`, `invitation_already_accepted`, `invitation_revoked`, `invitation_expired`, `invitation_email_mismatch`.

Acceptance flow (Round 4):
- New route file `src/routes/invitations.ts`. Mounted at `/invite` in `src/app.ts`. Self-applies `sessionMiddleware`; `requireAuth` only on the POST handler so the GET preview stays public.
- Token validator: base32 lowercase regex, 8..64 chars (current generation is ~39 chars). Reject anything else as `validation_error` 400.
- GET preview joins `organizations` (for `orgName`) + `users` (for `invitedByName`, fallback chain displayName → name → email → null).
- Accept does email-match case-insensitive; mismatch → 403 `invitation_email_mismatch`. Already-member path closes the invite (sets accepted_at + audits) BUT returns 409 `already_member` — never overwrites existing role. Phase A has no signup, so unauthenticated callers get a flat 401; frontend handles redirect-to-login.

Open items / future rounds:
- Self-signup so invited emails without an account can accept directly.
- Email transport (Resend).
- Bulk invite (paste multiple emails — REQUIREMENTS.md AC-006.4).
