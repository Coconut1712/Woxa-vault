---
name: stack-and-fixtures
description: How to bring up the local Woxa stack and create cross-tenant test fixtures fast (mint sessions via DB seed)
metadata:
  type: reference
---

API runs at `http://127.0.0.1:8787` (no `/api/v1` prefix — routes mount at root: `/auth/login`, `/me`, `/vaults`, `/items`, `/members`, `/audit`, `/access-requests`, `/notifications`). Health at `/health`. Session cookie name: `woxa_session`.

Postgres in docker container `woxa-vault-postgres` (host port 5433). No host `psql` — use `docker exec woxa-vault-postgres psql -U woxa -d woxa_vault -c "..."`. Redis usually NOT configured in dev (`REDIS_URL` unset) → in-memory rate limiter. `TRUST_PROXY` unset in `.env` (forwarding headers ignored — central to the round-1 fix).

**Fastest cross-tenant fixture: seed two tenants + mint sessions directly in DB.**
- Session id = `sha256(raw_token)` (hex). Insert a `sessions` row with `id = printf '%s' "$TOK" | shasum -a 256 | cut -d' ' -f1`, then send `-b "woxa_session=$TOK"`. Gives an authentic session without the full ZK onboarding.
- `sessions` needs: `id,user_id,expires_at,absolute_expires_at,active_org_id,vault_unlocked_at`. Set `vault_unlocked_at=now()` to pass `requireVaultUnlocked` for reveal endpoints.
- Minimal tenant: `users` (email/login_password_hash/password_hash/master_auth_key_hash/kdf_salt can be junk like 'x'/'c2FsdA==') → `organizations` (slug) → `org_members` (role owner) → `vaults` (encryption_version forced to 2) → `vault_members` (role manager) → `vault_keys` (wrapped_key bytea) → `items` (name_ciphertext/name_iv/password_ciphertext as `\xDEADBEEF` hex literals).
- Item CREATE path is `POST /vaults/:id/items` (vaultItemRoutes mounted at `/vaults`), NOT `/items`. Item reveal is `GET /items/:id/password`.
- GOTCHA: psql heredoc via stdin sometimes silently aborts the whole txn (no output). Run cleanup/seed as explicit `-c "..."` statements with correct FK order, and verify with a SELECT.
- ZK refine: item needs EITHER `name` OR `nameCiphertext`, never both, never neither (400).

Always namespace fixtures (`rt2-…@redteam.local`, slug `rt2-…`) and clean up after (delete in FK order: access_requests, notifications, audit_events, sessions, vault_keys, vault_members, items, vaults, org_members, organizations, users). Never store real tokens/cookies in memory.
