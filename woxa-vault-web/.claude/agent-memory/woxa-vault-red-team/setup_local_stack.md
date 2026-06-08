---
name: setup-local-stack
description: How to bring up the local Woxa Vault stack and provision throwaway 2-user/2-org fixtures for cross-tenant red-team tests
metadata:
  type: reference
---

# Local stack + red-team fixtures

## Ports / services (NOT 3001 as task prompts sometimes claim)
- API: `http://127.0.0.1:8787` (env `PORT=8787`). Health: `GET /health` → `{ok:true}`. Root `/` is 404 (no index route).
- Web: `http://127.0.0.1:3000` (Next.js).
- Postgres: docker container `woxa-vault-postgres`, host port **5433** (`postgres://woxa:woxa_local_dev@localhost:5433/woxa_vault`).
- Redis: usually NOT running locally → rate limiter falls back to in-memory (per-process, resets on API restart). `REDIS_URL` unset.
- `TRUST_PROXY` defaults false; `NODE_ENV=development`; `CSP_ENFORCE` unset (web CSP is report-only).
- DB shell: `docker exec woxa-vault-postgres psql -U woxa -d woxa_vault -c "..."`.

## Cookie gotcha
curl's `-c`/`-b` cookie jar does NOT reliably persist the `woxa_session` cookie (HttpOnly/SameSite). Instead capture the token from the `Set-Cookie` response header and send it explicitly:
`TOK=$(curl -s -D - -o /dev/null -X POST .../auth/login ... | grep -i '^set-cookie' | sed -E 's/.*woxa_session=([^;]+);.*/\1/I')` then `-H "Cookie: woxa_session=$TOK"`.
Session cookie name = `woxa_session`. Session id = `sha256(token)` (hex) — matches `sessions.id`.

## Minimal fixture flow (2 tenants, copy-paste)
1. `POST /auth/register {email,password>=10}` → login-password user, returns session cookie.
2. `POST /me/password/setup {password}` → sets master password, returns recoveryCode + seeds keys.
3. `POST /auth/login {email,password}` to (re)capture a usable session token.
4. `POST /workspace {name}` → creates org, caller = owner, auto-seeds "Shared" + "{User}'s Personal" vaults (encryption_version=1, server-side enc).
5. `GET /vaults` → list vaults (use `/vaults`, NOT `/workspace/vaults` which was empty).
6. `POST /me/verify-password {password}` to UNLOCK (required before writes / send-create — `requireVaultUnlocked`).
7. `POST /vaults/:id/items {type:"login",name,username,password,notes}` → v1 item; server encrypts password/notes, name/username stored PLAINTEXT.

Shortcut for RBAC tests: insert `org_members(org_id,user_id,role)` directly to add user B to org A as member/admin/guest, and `vault_members(vault_id,user_id,role)` to grant a vault role — skips the invite-acceptance dance.

## Rate-limit hazard during a session
The login per-IP bucket `login:ip:127.0.0.1` saturates fast (5/15min) because ALL local curl shares the socket IP. Once saturated, fresh logins 429. Evade by sending a unique `cf-connecting-ip:` header per request (honored unconditionally — see weak_cf_ip_ratelimit). Use this to keep capturing fresh session tokens mid-engagement.

## Cleanup
`delete from organizations where id in (...)` (cascades vaults/items/audit) + `delete from users where email like 'rt-%@redteam.local'`. Pre-existing real users (dev@iux24.com, *@woxacorp.com, test@gmail.com, etc.) — do NOT touch.
