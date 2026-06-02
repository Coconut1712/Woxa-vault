# Woxa Vault — API Contract

This file is the source of truth for the contract between `woxa-vault-web` (Next.js frontend) and `woxa-vault-api` (backend). Any proposed change MUST be edited here first and confirmed by both agents before code changes land.

## Conventions

- **Base URL (dev)**: `http://localhost:8787`
- **Frontend env var**: `NEXT_PUBLIC_API_BASE_URL` (no trailing slash) — frontend will fall back to `http://localhost:8787` if unset. In the Next dev rewrite path the value is `/api`.
- **Auth**: HttpOnly cookie session. Frontend issues every fetch with `credentials: "include"`.
- **CORS** (backend): must echo the frontend origin (default `http://localhost:3000`) AND set `Access-Control-Allow-Credentials: true`. Cookie must use `SameSite=Lax` and `Secure` only when serving over HTTPS.
- **Content-Type**: `application/json` for both request body and response, except for `204 No Content`.
- **Error envelope** (uniform shape for all non-2xx):
  ```json
  { "error": { "code": "string", "message": "human readable" } }
  ```
  Frontend `ApiError` exposes `code`, `message`, and HTTP `status`.

## Error codes

| Code | Meaning | Typical status |
| --- | --- | --- |
| `invalid_credentials` | `POST /auth/login`: the **login** password did not match, the user is unknown, OR the account has no login password (SSO-only/legacy → use Google). Constant-time across all three so the response cannot enumerate accounts. | 401 |
| `email_taken` | `POST /auth/register`: an account already exists for this email. NOT constant-time (signup deliberately tells the user); rate-limited per IP. Frontend routes to login. | 409 |
| `unauthorized` | no/expired session | 401 |
| `rate_limited` | too many attempts (sets `Retry-After` header; `details.retryAfterSec`) | 429 |
| `validation_error` | malformed request (Zod failure; `details.fieldErrors`) | 400 |
| `internal_error` | server-side failure | 500 |
| `forbidden` | authenticated but lacks permission on the resource | 403 |
| `not_found` | route or resource missing (also returned for resources the user cannot see, to prevent enumeration) | 404 |
| `vault_not_empty` | DELETE refused because vault still has items | 409 |
| `send_expired` | one-time send has passed its `expires_at` | 410 |
| `send_burned` | one-time send is already burned (max_views hit or manually burned) | 410 |
| `send_password_required` | reveal called without a password on a password-protected send | 401 |
| `send_password_invalid` | reveal called with the wrong password | 401 |
| `send_not_ready` | reveal happened within 1s of creation — likely a link-preview bot (AC-032.4). Returns `Retry-After` and the recipient is expected to retry after a short delay | 425 |
| ~~`last_owner`~~ | **DEPRECATED (single-Owner model).** The Owner can no longer be demoted/removed via `/members` at all — those return `403 forbidden`. Ownership changes only via `POST /workspace/transfer-ownership`. No endpoint emits `last_owner` anymore. | — |
| `ownership_transfer_conflict` | two concurrent `POST /workspace/transfer-ownership` calls raced on the single-owner index; the invariant held but one request lost. Retryable. | 409 |
| `workspace_slug_conflict` | two concurrent `PATCH /workspace` renames raced for the same auto-derived slug on the `organizations.slug` unique constraint; one request lost. Retryable. | 409 |
| `two_factor_required` | a workspace has the `require2fa` security policy on and the caller has not enrolled 2FA; secret-bearing routes are blocked until enrollment. Remediation routes (`/auth/2fa/enroll`, `/auth/2fa/verify-enroll`, `GET /me`, `GET /workspace/settings`, logout) stay open. | 403 |
| `member_conflict` | tried to add a user who is already a member | 409 |
| `already_member` | invite refused — target email is already a member of this org | 409 |
| `invitation_already_accepted` | resend/revoke/accept refused — invite was already accepted | 409 |
| `invitation_revoked` | resend/accept/preview refused — invite was already revoked | 410 on preview/accept, 409 on resend |
| `invitation_expired` | accept/preview refused — `expires_at` has passed | 410 |
| `invitation_email_mismatch` | accept refused — caller's session email differs from the invited email | 403 |
| `invitation_not_found` | accept/preview refused — token doesn't exist (returned as `not_found`) | 404 |
| `user_exists` | invite signup refused — an account for the invited email already exists; caller must log in then call `POST /invite/:token/accept` | 409 |
| `attachment_too_large` | upload exceeded `ATTACHMENT_MAX_BYTES` (per-file cap) | 413 |
| `attachment_item_quota_exceeded` | upload would exceed the per-item aggregate quota | 413 |
| `attachment_mime_not_allowed` | MIME type not in the allow-list | 415 |
| `password_already_set` | `POST /me/password/setup` called when `password_hash` is already set; caller must use the recovery-kit flow to rotate | 409 |
| `recovery_kit_invalid` | recovery code did not match (or kit already invalidated by single-use semantics). Returned by `POST /auth/password/reset-with-recovery`. Constant-time response — also returned for unknown email | 401 |
| `recovery_kit_not_set` | reserved — emitted when an endpoint needs a recovery kit but the user has none. Not raised by current routes; future admin-reset flow will use it | 409 |
| `password_not_set` | `POST /me/verify-password` called on an SSO-only account with no `password_hash` on file. Frontend should route the caller through `POST /me/password/setup` instead of looping on the unlock prompt | 409 |
| `vault_locked` | **Phase A.5 server-side vault lock (WARN-I).** Session is valid but the 15-minute master-password unlock window has elapsed on this session. Returned by sensitive item-read endpoints (`GET /items/:id`, `GET /attachments/:id/download`, `POST /sends`). Frontend should prompt for the master password, call `POST /me/verify-password`, then retry the original request. Distinct from `unauthorized` so the frontend can branch on "locked vault" vs "logged out" | 401 |

> The frontend treats unknown codes as `internal_error` and shows the generic error string.
> Backend may include an optional `details` field on the same error object — frontend should ignore unknown fields.

### Redirect-only error codes (SSO browser flow)

Carried as `?error=<code>` on the frontend landing URL, NOT in a JSON envelope.

| Code | Meaning |
| --- | --- |
| `sso_state_mismatch` | OAuth state cookie missing or did not match callback `state` |
| `sso_domain_forbidden` | Email's `hd` claim/domain not in the **env** allow-list (`GOOGLE_OAUTH_ALLOWED_DOMAIN`, gate 1), **or** not permitted by any restricting org's **stored** `sso.allowedDomains` (gate 2) |
| `sso_jit_disabled` | Brand-new SSO user whose domain is claimed by org(s) that all have `sso.jitEnabled = false` — auto-provisioning refused; the user must be invited first |
| `sso_email_unverified` | Google `email_verified` claim was false |
| `sso_provider_error` | Token exchange or userinfo fetch failed |
| `sso_internal_error` | Unhandled backend error inside callback |

## Endpoints — Auth (password)

> **Two-password model.** Woxa Vault uses TWO distinct credentials:
> - **Login password** (`login_password_hash`) — the email+password sign-in
>   credential. `POST /auth/login` verifies ONLY this. Set at `POST /auth/register`.
> - **Master password** (`password_hash`) — used ONLY to unlock the vault
>   (`POST /me/verify-password`) and as the subject of the recovery kit. NEVER
>   accepted at `POST /auth/login`. Set at `POST /me/password/setup`.
>
> A freshly registered user has a login password but NO master password yet, so
> `GET /me` returns `requiresPasswordSetup: true`. The frontend ladder routes
> them through `/setup-password` (sets master + shows recovery kit) → `/spaces`.

### `POST /auth/register`
Self-service email + **login password** signup. Logs the user in immediately
(sets the session cookie). Does NOT create a workspace and does NOT set a master
password or emit a recovery kit (those happen at `/setup-password`).

Request:
```json
{ "email": "user@example.com", "password": "login-password", "displayName": "Optional Name" }
```
- `email` — trimmed, lowercased, RFC email format, ≤ 254 chars.
- `password` — the **login** password. Strength policy identical to master
  setup: **min 10, max 1024** chars.
- `displayName` — optional, trimmed, 1–120 chars.

Response 200 (sets HttpOnly session cookie):
```json
{ "status": "ok", "user": { "id": "usr_...", "email": "user@example.com", "displayName": "Optional Name" } }
```
- No `recoveryCode` in the response — the kit is bound to the master password,
  emitted later by `POST /me/password/setup`.
- After this, call `GET /me`: it returns `requiresPasswordSetup: true` and
  `hasWorkspace: false`. Route: `/setup-password` → `/spaces`.

Errors:
- `400 validation_error` — bad email or password < 10 chars.
- `409 email_taken` — an account for this email already exists.
- `429 rate_limited` — more than 5 signups/hour from this IP (`Retry-After`).

### `POST /auth/login`
Verifies the **login** password (`login_password_hash`) — never the master
password. An account with no login password (SSO-only / legacy) cannot sign in
here and must use Google; the response is `invalid_credentials` (constant-time,
no enumeration).

Request:
```json
{ "email": "user@example.com", "password": "login-password" }
```
Response 200 (sets HttpOnly session cookie):
```json
{ "status": "ok", "user": { "id": "usr_...", "email": "user@example.com", "displayName": "Optional Name" } }
```
When 2FA is enabled, returns `{ "status": "mfa_required", "mfaToken": "..." }` (200, no cookie) instead — redeem via `POST /auth/2fa/verify-login`.
Response 401 → `invalid_credentials`.
Response 429 → `rate_limited`.

### `POST /auth/logout`
- No body. Clears the session cookie.
- Response: `200 { "ok": true }` (backend) — frontend treats `2xx` as success.
- Safe to call when already logged out (idempotent; still returns 200).

### `GET /auth/me`
Response 200:
```json
{ "user": { "id": "usr_...", "email": "user@example.com", "displayName": "Optional Name" } }
```
Response 401 → `unauthorized` (frontend treats as "not signed in").

### `GET /health`
Response 200:
```json
{ "ok": true, "service": "woxa-vault-api", "ts": "ISO-8601" }
```

### `GET /health/db` (optional)
Pings the database. Response 200 `{ "ok": true }` or 503 with error envelope.

## Endpoints — Auth (Google Workspace SSO)

The Google flow uses two browser top-level navigations: the frontend hands off to `/auth/sso/google/start`, Google redirects back to `/auth/sso/google/callback`, and the backend finally redirects the browser to a frontend URL with the session cookie already set.

### `GET /auth/sso/google/start`
Top-level redirect (NOT XHR). Frontend uses `window.location.href`.

Query params (all optional):
- `email` — passed to Google as `login_hint`
- `next` — relative path to land on after success (default `/app`). Backend validates `next` starts with `/`, does not start with `//`, and contains no scheme/host — to prevent open-redirect.

Behavior:
- 302 → `https://accounts.google.com/o/oauth2/v2/auth?...` with these params:
  - `client_id=<GOOGLE_OAUTH_CLIENT_ID>`
  - `redirect_uri=<GOOGLE_OAUTH_REDIRECT_URI>`
  - `response_type=code`
  - `scope=openid email profile`
  - `state=<opaque>` — also stored in a short-lived `woxa_oauth_state` cookie (`HttpOnly`, `SameSite=Lax`, `Max-Age=600`) along with the desired `next` path.
  - `nonce=<opaque>`
  - `access_type=online`
  - `prompt=select_account`
  - `login_hint=<email>` (only when `email` query passed)
  - `hd=<GOOGLE_OAUTH_ALLOWED_DOMAIN>` — Google enforces this in the consent UI; for comma-lists the backend passes the first entry, and the callback still cross-checks every entry.

Rate-limited at 10 starts / minute / IP. Exceeding returns a JSON `rate_limited` envelope (NOT a redirect), so abusive automation sees the error directly.

### `GET /auth/sso/google/callback`
Top-level redirect target for Google.

Query params (from Google): `code`, `state`. Optionally Google may return `error=access_denied` etc. — backend converts that to `sso_provider_error`.

Behavior on success:
- Exchanges `code` for tokens, fetches `userinfo`.
- Verifies `email_verified === true`. Fail → `/?error=sso_email_unverified`.
- **Gate 1 — env allow-list (deployment-level).** Verifies the `hd` claim AND email domain are both in `GOOGLE_OAUTH_ALLOWED_DOMAIN` (when set). Fail → `/?error=sso_domain_forbidden` (audit `auth.sso.login.failed`, `metadata.gate = "env"`). Empty allow-list = dev only; backend logs a `warn`.
- **Gate 2 — stored org-policy allow-list (`sso.allowedDomains`).** This is what makes the per-workspace SSO config actually enforce. If **any live (non-deleted) org** pins a **non-empty** `sso.allowedDomains` list, the signing-in email domain MUST appear in at least one such list. An org with an empty list imposes no restriction (open / dev mode). Fail → `/?error=sso_domain_forbidden` (audit `auth.sso.login.failed`, `metadata.gate = "org_policy"`). **Why cross-org:** the callback runs before a brand-new user has any org membership (single-Owner onboarding lands new SSO users org-less), so there is no single "the org" to read the allow-list from — the backend enforces the **union** of stored policies keyed by email domain. An admin who pins `allowedDomains` is asserting "only these domains may SSO into a Woxa workspace", so an attacker from an unlisted domain is rejected even if no org has claimed their domain. The check reads only org policy (no per-caller input beyond the verified domain), so the SSO subject learns nothing about which orgs exist — a rejection is a generic redirect.
- Looks up the user by `sso_subject = <google sub>` first, then by `email`. If found, links `sso_subject` and updates `display_name` when blank.
- If not found, JIT-provisions the **user only** — NO org membership is created (HIGH#2 fix), **subject to the stored JIT gate**:
  - **JIT gate (`sso.jitEnabled`).** If one or more live orgs **claim** the email domain (their `allowedDomains` contains it), the new user is auto-provisioned only when at least one of those claiming orgs has `jitEnabled = true`. If **every** claiming org has `jitEnabled = false`, the new-user provisioning is **rejected** → `/?error=sso_jit_disabled` (audit `auth.sso.login.failed`, `metadata.reason = "jit_disabled"`) — the admin must invite the user first. When **no** org claims the domain, there is no domain→org binding to gate against, so JIT falls back to **enabled** (prior behavior). The gate is re-checked **inside the provisioning transaction** (just before the insert) so a concurrent policy flip cannot slip a user through.
  1. Insert `users` row (`password_hash = NULL`, `email_verified_at = now()`, `sso_subject = <sub>`).
  2. The user lands **org-less**. `GET /me` returns `hasWorkspace: false` and the frontend routes to `/spaces` to create a workspace (becoming Owner) or accept a pending invite.
  - **No slug-based auto-join.** Previously a brand-new SSO user was auto-joined to whatever org had `slug === <email-domain-label>`. Because `slug` is derived from the (attacker-chosen) workspace name, this allowed a cross-tenant capture: pre-register a workspace whose slug matched a target domain's first label and silently absorb every future SSO sign-in from that domain. The only trusted join path is now an explicit invitation.
  - **Follow-up (AC-006.2):** a verified `org_domains` mapping table will re-enable safe domain-based JIT auto-join in a later round.
- **App-level 2FA gate (AC-003.5):** if the resolved user has TOTP enabled (`totp_enabled_at` set), the callback issues **NO session**. Instead it:
  1. Sets a short-lived **`mfa_pending`** cookie (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=300`, `Secure` in prod) carrying the same HMAC `mfaToken` the password flow returns in JSON.
  2. 302 → `<web_origin>/login/mfa` (with `?next=<sanitized-path>` when `next` ≠ `/app`). **The token is NEVER placed in the URL** (avoids history/Referer/access-log leak).
  - A brand-new JIT user (no TOTP yet) is unaffected — normal session issuance applies.
- Otherwise (no 2FA): issues a session cookie identical to password login.
- 302 → `<web_origin><next-or-/app>`. Frontend's `/app` calls `GET /auth/me` to confirm.

Behavior on failure:
- 302 → `/?error=<code>` (codes listed under "Redirect-only error codes").

### `/login/mfa` (frontend page — SSO 2FA challenge)
After an SSO callback for a 2FA-enabled user, the browser lands here with the `mfa_pending` cookie already set (HttpOnly — **page JS cannot read it**). The page collects the user's TOTP / backup code and POSTs to `/auth/2fa/verify-login` (see below) sending **only `code`** — the browser re-attaches the cookie automatically. On a 200 the session cookie is set and `mfa_pending` is cleared; route the user to `next` (or `/app`). On `401 mfa_session_expired` (expired/invalid token), send the user back to start a fresh SSO sign-in; on `401 invalid_credentials` (wrong code) keep them on the prompt to retry.

### `POST /auth/2fa/verify-login`
Public (caller is mid-login). Redeems the `mfaToken` + second factor and mints the session cookie. Used by BOTH login paths:

Request body:
```jsonc
{
  "mfaToken": "<token>",   // password flow: required (returned by POST /auth/login as `mfa_required`)
                           // SSO flow:      OMIT — the token rides the HttpOnly `mfa_pending` cookie
  "code": "123456",        // TOTP digits, or a backup code when useBackupCode=true
  "useBackupCode": false    // optional
}
```

Token resolution order: **body `mfaToken` first** (backward compatible), then the **`mfa_pending` cookie**. Either source is fully verified (HMAC + 5-min expiry + bound to `user.id`) before it is trusted — the cookie grants no implicit trust.

Response 200:
```jsonc
{ "status": "ok", "user": { "id": "...", "email": "...", "displayName": "..." }, "mfaSatisfied": true }
```
Sets the session cookie. When the token came from the cookie, also clears `mfa_pending` (`Max-Age=0`). `Cache-Control: no-store` not required (no secret in body).

Errors:

| Status / code | When | Frontend UX |
| --- | --- | --- |
| `429 rate_limited` | Too many attempts (30/min/IP, 10/min/IP+user). `Retry-After` header set. | "Too many attempts, try again shortly." |
| `401 mfa_session_expired` | The `mfaToken` (body) or `mfa_pending` cookie is **missing / malformed / expired** (5-min TTL). Terminal for this in-flight login. | Terminal message — "Sign-in session timed out, start a new login." Send the user back to the login / SSO start screen. |
| `401 invalid_credentials` | **Wrong 2FA code** — also returned for a **replayed TOTP**. Replay and wrong-code are deliberately byte-for-byte identical (same status, code AND message) so a replayed code is not an oracle for code validity. | Inline, retryable — "Code is incorrect, try again." Keep the user on the 2FA prompt. |

Do not branch the UI on replay vs wrong-code — the backend never distinguishes them at the HTTP layer (no oracle). On a bad token that arrived via cookie, the `mfa_pending` cookie is also expired so a stale cookie can't keep failing.

### Notes for the frontend
- The "Sign in with Google" button is a plain anchor to `/auth/sso/google/start?next=/app` (relative in dev so the Next rewrite forwards it transparently).
- Do NOT `fetch()` the start endpoint — Google denies non-browser contexts.
- After landing on `/?error=<code>`, render the appropriate toast based on the code table above.

## Endpoints — Vaults

All vault endpoints require a session. The user must also be a member of the org owning the vault. `forbidden` is returned for non-members of the *vault* who are members of the *org*; `not_found` is returned when the vault id doesn't exist OR the caller has no membership row (to prevent enumeration).

### Vault role matrix
Roles (matching frontend's existing union): `manager | editor | user | viewer`.

| Role | List | Read | Create/edit item | Delete item | Update vault | Delete vault | Manage members |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `manager` | yes | yes | yes | yes | yes | yes | yes |
| `editor` | yes | yes | yes | yes | no | no | no |
| `user` | yes | yes | yes | yes (own items only) | no | no | no |
| `viewer` | yes | yes | no | no | no | no | no |

The vault creator is automatically inserted into `vault_members` with role `manager`.

Phase A note: round 2 ships `manager`, `editor`, `viewer` only. `user` is reserved — backend accepts it on input but treats it equivalent to `editor` for now. This keeps the UI's existing role badges working without a contract churn later.

### Canonical shapes

```ts
type VaultColor =
  | "violet" | "blue" | "emerald" | "amber"
  | "rose"   | "fuchsia" | "cyan"   | "indigo";

interface VaultSummary {
  id: string;                    // bare UUID (no prefix)
  name: string;
  description: string | null;
  iconKey: string | null;        // free-form short string; null = default
  color: VaultColor | null;      // null = default color
  itemCount: number;
  memberCount: number;
  encryptionVersion: number;     // bumped when re-key happens; round 2 = 1
  role: "manager" | "editor" | "user" | "viewer";  // caller's role
  createdAt: string;             // ISO-8601
  updatedAt: string;
}

interface Vault extends VaultSummary {
  createdBy: string;             // user id
}

interface VaultMember {
  userId: string;
  email: string;
  displayName: string;
  role: "manager" | "editor" | "user" | "viewer";
}
```

### `GET /vaults`
Response 200:
```json
{ "vaults": [VaultSummary, ...] }
```
Only returns vaults the caller is a member of **in the active workspace** (M-1; scoped by `vaults.orgId` = active org). After `POST /workspace/switch` the list reflects the new workspace. Returns `{ "vaults": [] }` (not 404) when the caller has no membership. Sorted by `updatedAt DESC`.

### `POST /vaults`
Creates the vault in the caller's **active** workspace. Request:
```json
{ "name": "Marketing", "description": "Optional", "iconKey": "megaphone", "color": "fuchsia" }
```
- `name`: 1–80 chars, trimmed, required.
- `description`: 0–500 chars, optional, nullable.
- `iconKey`: 0–60 chars, optional, nullable.
- `color`: optional. Backend validates against `VaultColor` enum; invalid values → 400 `validation_error`. Frontend falls back to the default color when null.
Response 201:
```json
{ "vault": Vault }
```

### `GET /vaults/:id`
Response 200:
```json
{ "vault": Vault, "members": [VaultMember, ...] }
```
Response 404 → `not_found` (also when the caller is not a member, to prevent enumeration).

### `PATCH /vaults/:id`
- Only `manager` may update.
- Request: any subset of `{ "name", "description", "iconKey", "color" }`.
Response 200:
```json
{ "vault": Vault }
```
Response 403 → `forbidden`.

### `DELETE /vaults/:id`
- Only `manager` may delete.
- 409 → `vault_not_empty` when the vault still has items (force-delete the items first).
Response 204 (no body).
Response 403 → `forbidden`.

### Vault membership

`VaultMember` reuses the shape declared above. Membership lookups never return the SHA-256 hash of the email; clients identify a member by `userId`.

Authorization rules:
- `GET` allowed for any vault member (manager / editor / user / viewer).
- `POST`, `PATCH`, `DELETE` require the caller to be a vault `manager`.
- The target user MUST already be a member of the same organization. Otherwise the response is `404 not_found` (anti-enumeration — we do not confirm the user exists outside the org).
- A manager may demote themselves but the API refuses to remove or demote the **last manager** of a vault → `409 forbidden` with code `forbidden` and `details.reason = "last_manager"`.

### `GET /vaults/:id/members`
Response 200:
```json
{ "members": [VaultMember, ...] }
```

### `POST /vaults/:id/members`
Request: `{ "userId": "uuid", "role": "manager|editor|user|viewer" }`.
Response 201:
```json
{ "member": VaultMember }
```
Response 409 → `member_conflict` if the user is already a member of this vault.

### `PATCH /vaults/:id/members/:userId`
Request: `{ "role": "manager|editor|user|viewer" }`.
Response 200:
```json
{ "member": VaultMember }
```

### `DELETE /vaults/:id/members/:userId`
Response 204 (no body).

## Endpoints — Items

Items live inside a single vault. Authorization mirrors the vault matrix above.

### Canonical shapes

```ts
type ItemType = "login" | "note";   // api_key | ssh | card | identity reserved

interface ItemSummary {
  id: string;                       // bare UUID
  vaultId: string;
  folderId: null;                   // reserved; always null in round 2
  type: ItemType;
  name: string;
  username: string | null;          // null for note
  url: string | null;               // null for note
  tags: string[];                   // empty array in round 2
  favorite: boolean;                // false in round 2 (no toggle endpoint yet)
  hasPassword: boolean;             // server-derived: true iff ciphertext present
  hasNotes: boolean;
  hasTotp: boolean;                 // false in round 2
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  createdBy: { id: string; displayName: string };
}

// Round 2 uses inline secret fields (no nested `secret:` object).
// AES-GCM ciphertext lives in dedicated bytea columns server-side; the
// inline shape on the wire keeps the TypeScript types flat for the UI.
interface ItemFull extends ItemSummary {
  password: string | null;          // decrypted; null when hasPassword=false
  notes: string | null;             // decrypted; null when hasNotes=false
  totpSecret: null;                 // reserved
  customFields: [];                 // reserved
}
```

The list endpoint NEVER returns decrypted fields. Only `GET /items/:id` decrypts and audit-logs an `item.reveal` event.

### `GET /vaults/:vaultId/items`
Response 200:
```json
{ "items": [ItemSummary, ...] }
```
Sorted by `updatedAt DESC`. Returns `not_found` if the vault is invisible.

### `POST /vaults/:vaultId/items`
Request:
```json
{
  "type": "login",
  "name": "Production DB",
  "username": "postgres",
  "password": "hunter2",
  "url": "postgres://db.iux24.com",
  "notes": "rotate every 90 days"
}
```
- `type` required, one of `"login" | "note"`.
- `name` required, 1–120 chars.
- `username`, `url`, `password`, `notes` all optional; server encrypts `password` and `notes` if present.
- For `type=note`, `username` / `url` / `password` may be omitted.
- Reserved fields (`folderId`, `tags`, `favorite`, `totpSecret`, `customFields`) are accepted on input but ignored in round 2.
Response 201:
```json
{ "item": ItemSummary }
```
Caller needs role `manager`, `editor`, or `user`.

### `GET /items/:id`
Response 200:
```json
{ "item": ItemFull }
```
Decrypts `password` and `notes` server-side and returns them inline.
Audit event `item.reveal` is recorded with `target_id` = item id.

### `PATCH /items/:id`
Request: any subset of `{ "name", "username", "url", "password", "notes" }`.
- Sending `"password": null` or `"notes": null` clears the field.
- Sending the key with a string value re-encrypts.
- Omitting the key leaves the existing ciphertext untouched.
Response 200:
```json
{ "item": ItemSummary }
```
Caller needs role `manager`, `editor`, or `user`.

### `DELETE /items/:id`
Response 204 (no body). Caller needs role `manager`, `editor`, or `user`.

### `POST /items/bulk`
Batch operation over up to 100 items. Authorization is evaluated **per item** — a caller without rights on a given item has that item SKIPPED (reported in `failed`), never failing the whole batch (US-052 / AC-052.5 partial success).

```ts
type BulkAction = "delete" | "move" | "share";

interface BulkRequest {
  action: BulkAction;
  itemIds: string[];            // 1..100 uuids
  payload?: {
    // action="move"
    folderId?: string | null;   // target folder in the SAME vault, or null = root
    // action="share" (US-052 bulk share)
    role?: "manager" | "editor" | "user" | "viewer";   // REQUIRED for share
    userId?: string;            // share to a user — EXACTLY ONE of userId/teamId
    teamId?: string;            // share to a team — EXACTLY ONE of userId/teamId
  };
}

interface BulkResponse {
  success: string[];                              // item ids that succeeded
  failed: { id: string; reason: string }[];       // skipped/failed items
}
```

Response 200 with `BulkResponse` (even on partial/total failure — inspect `failed`). Schema-level rejects return 400:
- `share` with no `payload.role` → 400.
- `share` with neither or BOTH of `userId`/`teamId` → 400 (must be exactly one).

Per-item `failed.reason` values:
- `not_found` — item missing or caller has no access at all (anti-enumeration).
- `forbidden` — `delete`/`move`: caller lacks `manager`/`editor`/`user` on the item. `share`: caller lacks share authority on THAT item, or the requested `role` exceeds the caller's authority (no escalation — same cap as single-share `POST /items/:id/members`).
- `folder_not_found` — (`move`) target folder is not in the item's vault.
- `user_not_in_workspace` / `team_not_in_workspace` — (`share`) the grantee principal does not belong to that item's org.

**Share semantics** mirror single-share (`POST /items/:id/members`): a plain **permanent** grant (no expiry), idempotent upsert keyed on `(itemId, principal)` — re-sharing updates the role only and never disturbs an existing temp grant's `originalRole` baseline. Each successful share writes an `item.share` (user) / `item.team_share` (team) audit event with `metadata.bulk: true` and emits a `share.received` notification. No secret values are ever logged.

## User shape (canonical)

```ts
interface User {
  id: string;            // opaque server id
  email: string;
  displayName?: string;  // optional
}
```

Future fields (NOT required round 1): `avatarUrl`, `workspaces`, `mfaEnrolled`.

## Endpoints — Workspace

`Workspace` summarizes the caller's **active** organization (the workspace the session is currently switched to). A user may belong to several workspaces; the session tracks which one is active via `sessions.active_org_id`, set by `POST /workspace/switch`. When no explicit selection is set (or the selected org was deleted / the caller left it), the active org falls back to the caller's **first** membership by `joinedAt`. Every org-scoped operation — member management, invites, security policy, ownership transfer, audit, vault list/create — resolves against this active org and re-validates the caller's membership on each request (so a stale/forged pointer grants nothing and never escalates privileges).

```ts
interface Workspace {
  id: string;
  name: string;
  slug: string;
  memberCount: number;     // count of org_members rows
  vaultCount: number;      // vaults not soft-deleted in this org
  role: "owner" | "admin" | "member" | "guest";   // caller's org role
  createdAt: string;
}
```

### `GET /workspace`
Returns the caller's **active** workspace summary (see active-org semantics above). `role` is the caller's role in the active org.
Response 200:
```json
{ "workspace": Workspace }
```
Response 404 → `not_found` if the user has no org membership (should never happen for a seeded user; surfaced for JIT-broken states).

### `POST /workspace/switch`
Set the active workspace for the **current session**. The caller must already be a member of the target org.
Request: `{ "orgId": "uuid" }`.
- **IDOR-guarded**: if the caller is not a member of `orgId` (or it doesn't exist), returns `404 not_found` with no leak of whether the org exists. The active-org pointer is left **unchanged** on a failed switch.
- Persists `sessions.active_org_id = orgId` on the caller's own session row (keyed by the session cookie). Per-session: switching on one device does not affect another.
- Rate-limited 60/min/user (`429 rate_limited` + `Retry-After`).
- Audited as `workspace.switched`.

Response 200:
```json
{ "workspace": { "id": "uuid", "name": "Acme", "slug": "acme", "role": "owner|admin|member|guest" } }
```
`role` is the caller's role **in the org just switched to** — it never carries over a higher role from the previously-active workspace.

## Endpoints — Workspace members

Org membership lives in `org_members`. The role hierarchy is `owner > admin > member > guest`.

| Role | View members | Change roles | Remove members |
| --- | --- | --- | --- |
| `owner` | yes | yes | yes |
| `admin` | yes | yes (except cannot demote/remove the last `owner`) | yes (same caveat) |
| `member` | yes (basic profile only) | no | no |
| `guest` | no | no | no |

```ts
interface OrgMember {
  userId: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "member" | "guest";
  joinedAt: string;
  status: "active" | "disabled";
}
```

### `GET /members`
Lists members of the caller's **active** workspace (see active-org semantics above). After `POST /workspace/switch`, this returns the new workspace's members.
Response 200:
```json
{ "members": [OrgMember, ...] }
```
Sorted by `joinedAt ASC` (oldest first).

### `PATCH /members/:userId`
Request: `{ "role": "admin|member|guest" }` — **`owner` is rejected** (`400 validation_error`). Ownership moves only via `POST /workspace/transfer-ownership`.
Caller must be `owner` or `admin` AND must **strictly outrank** the target (Owner > Admin > Member > Guest). An admin therefore cannot change another admin (peer) or the owner. Attempting to change the Owner's role → `403 forbidden`.
Response 200:
```json
{ "member": OrgMember }
```

### `DELETE /members/:userId`
Caller must be `owner` or `admin` AND must **strictly outrank** the target. The **Owner can never be removed here** (`403 forbidden`) — transfer ownership or delete the workspace first. The underlying `users` row is NOT deleted — only the `org_members` link.
Response 204 (no body).

### Workspace lifecycle (single-Owner model)

`GET /me` now includes: `hasWorkspace: boolean`, `workspaceCount: number`, `activeOrgId: string | null` (alongside the existing `role`, `requiresPasswordSetup`, …). Use these to route a freshly-signed-in user to `/spaces` when `hasWorkspace` is false.
- **`activeOrgId`** = the session's **active** workspace (the org set by `POST /workspace/switch`, falling back to the first membership when unset/deleted). It is NOT simply "the first org" anymore.
- **`role`** = the caller's role **in that active org**. Switching workspaces flips this value, so the frontend should re-read `GET /me` (or use the `POST /workspace/switch` response) after a switch to refresh role-gated UI.
- `workspaceCount` / `hasWorkspace` count **all** memberships and are unaffected by the active selection.

`GET /me/workspaces` → every org the caller belongs to (empty array, never 404). This is the **workspace-switcher list**: render it, and call `POST /workspace/switch` with the chosen `id` to change the active workspace.
```ts
{ workspaces: { id: string; name: string; slug: string; role: "owner"|"admin"|"member"|"guest"; memberCount: number; joinedAt: string }[] }
```

`POST /workspace` — create a workspace; the creator becomes **Owner**. Body `{ "name": string (1-80) }`. Seeds default "Shared" + "{User}'s Personal" vaults (creator = manager). Rate-limited 5/hour/user (`429 rate_limited` + `Retry-After`). Response `201`:
```json
{ "id": "uuid", "name": "Acme", "slug": "acme", "role": "owner" }
```

`POST /workspace/transfer-ownership` — **Owner-only** (`403 forbidden` otherwise). Body `{ "targetUserId": "uuid", "password": string }`.
- **`password` is REQUIRED** (proof-of-possession, HIGH#1) — the caller re-proves their master password so a stolen session alone cannot give ownership away. `401 invalid_credentials` on a wrong password; `401 invalid_credentials` ("Password is required…") if the caller is SSO-only with no `password_hash`.
- `targetUserId` must be a current member (`404 not_found` if not) and must differ from the caller (`400 validation_error`).
- Atomic: previous Owner → Admin, target → Owner.
- Rate-limited two-tier: soft 20/hour/user (every attempt) + hard 5/hour/user (failed-password attempts only) → `429 rate_limited` + `Retry-After`.
- `409 ownership_transfer_conflict` if two transfers race on the single-owner index — retry.

Response `200`:
```json
{ "ok": true, "orgId": "uuid", "ownerUserId": "uuid" }
```

### `PATCH /workspace`
Rename the caller's **active** workspace. **Owner or admin only** (`canManageOrgMembers`); a member/guest → `403 forbidden`. Org is resolved from the caller's own membership (no client org id → no IDOR).

Body is **`{ "name": string (1-80) }` ONLY** — there is **no client-supplied `slug` field**. The slug is **server-derived** from the new name (auto-follow model) and remains **never-trusted** (it is not in any route path, invite/SSO/email link, or authz decision).

- **The slug auto-regenerates from the new name.** The server runs `slugifyBase(name)` (lowercase → NFKD → non-alphanumerics→`-` → collapse/trim `-` → max 40 → fallback `"workspace"`) and allocates a free slug. The uniqueness check **excludes the org's own row**, so:
  - if the new name's base resolves to the org's **current** slug, the slug stays unchanged (no needless suffix);
  - only a **different** org already holding that slug forces a short random suffix (`base-<hex>`).
- The **response now returns the NEW slug** in `workspace.slug` (previously it returned the stale stored slug — a behavior change for callers that read `slug` back after a rename).
- A **no-op rename** (name unchanged) is a true no-op: no DB write, no audit row; the response carries the current name + slug.
- Audited as `workspace.renamed` with metadata `{ from, to, slugFrom, slugTo }` (slug is not secret).
- `409 workspace_slug_conflict` (new) if two concurrent renames race for the same derived slug on the `organizations.slug` unique constraint — retryable, mirrors `ownership_transfer_conflict`.

Response 200:
```json
{ "workspace": Workspace }
```

> **Forward-compat caveat:** there are **no slug-based URLs today** (verified — slug is purely cosmetic). IF a slug-based URL is ever introduced, auto-following the name on rename WOULD break old links; revisit this trade-off at that point. The web frontend mirrors `slugifyBase` exactly as `slugifyWorkspaceName` (in `woxa-vault-web/src/lib/api/workspaces.ts`) for a live slug preview — keep the two in sync if the rules ever change.

### Workspace security policy (`Require 2FA` + auto-lock + SSO)

The workspace security policy lives in `organizations.settings` (jsonb). The API
exposes a **narrowed, fully-defaulted view** of that blob — never the raw settings
object (which may carry unrelated/internal keys). The server reads the blob with a
**total / fail-safe parser**: any missing, legacy, or malformed value degrades to a
safe default rather than throwing (e.g. `require2fa` reads `true` only on an
explicit `true`).

```ts
interface WorkspaceSettings {
  require2fa: boolean;       // when true, every member must enroll 2FA before
                            // accessing secrets (server-side enforced)
  autoLockMinutes: number;  // vault idle auto-lock window; server-clamped to
                            // [1, 120], default 15
  sso: {
    allowedDomains: string[]; // email/`hd` domains permitted to SSO; server-
                              // normalized (lowercase/trim/dedupe + shape-
                              // validated, invalid entries dropped); [] = no
                              // domain restriction
    jitEnabled: boolean;      // when false, a brand-new SSO user from a domain
                              // this org claims is NOT auto-provisioned; default true
    requireSso: boolean;      // (Phase B) when true, members must log in via SSO;
                              // default false
  };
}
```

**Field semantics**
- `autoLockMinutes` — integer minutes, **server-clamped to `[1, 120]`** (default `15`). Non-integer / out-of-range values are rounded then clamped; garbage degrades to the default. The client uses it to drive its idle auto-lock overlay; it is also the candidate server-side unlock window.
- `sso.allowedDomains` — `string[]`, **max 100** entries (Zod). The server **normalizes** every PATCH: lowercases + trims, drops empties and shape-invalid entries (must match a basic `label.label.tld` domain — no scheme/path/spaces), and dedupes (first occurrence wins, order preserved). What you GET back is the canonical normalized list, which may be shorter than what you PATCHed.
- `sso.jitEnabled` — defaults **true** (preserves current JIT auto-provisioning); only an explicit `false` disables it for the claiming org.
- `sso.requireSso` — defaults **false**; enabling it is opt-in (Phase B login enforcement; not yet enforced at login).

#### `GET /workspace/settings`
Auth required. Returns the policy for the caller's **own** workspace (org resolved
from the caller's membership — no client-supplied org id, so no IDOR). Readable by
**every member** (any role) so the frontend can render the policy state + the
forced-enrollment banner.
```json
{
  "settings": {
    "require2fa": false,
    "autoLockMinutes": 15,
    "sso": { "allowedDomains": [], "jitEnabled": true, "requireSso": false }
  }
}
```
`404 not_found` if the caller has no workspace membership.

#### `PATCH /workspace/settings`
**Owner + admin only** (`403 forbidden` otherwise). Rate-limited 20/hour/user
(`429 rate_limited` + `Retry-After`). Zod-validated **partial** body — any subset of
the policy fields; absent fields are left untouched:
```json
{
  "require2fa": true,
  "autoLockMinutes": 30,
  "sso": { "allowedDomains": ["IUX24.com", "iux24.com", "bad domain"], "jitEnabled": false }
}
```
- **Partial deep-merge.** Top-level fields merge into the existing settings jsonb (unrelated/internal policy keys are preserved). The `sso` object is **merged field-by-field**, so PATCHing only `sso.jitEnabled` leaves `sso.allowedDomains` and `sso.requireSso` intact.
- **Server canonicalization.** `autoLockMinutes` is clamped to `[1, 120]`; `sso.allowedDomains` is normalized (the example above stores `["iux24.com"]` — uppercased dupe collapsed, `"bad domain"` dropped).
- **No-op detection.** A field whose normalized value equals the current value is **not** treated as a change. If nothing actually changed, the endpoint returns `200` with the current policy and writes **no audit row** (and no settings UPDATE).
- **Audit.** A real change emits `workspace.security_policy_updated` with `metadata` carrying only the **changed key names** plus before/after for the **non-secret scalars** — never secret material or the domain values themselves:
  ```json
  {
    "changed": ["require2fa", "autoLockMinutes", "sso.jitEnabled"],
    "require2fa": { "from": false, "to": true },
    "autoLockMinutes": { "from": 15, "to": 30 },
    "sso": ["sso.jitEnabled"]
  }
  ```
  (`require2fa` / `autoLockMinutes` before/after blocks appear only when those keys changed; the `sso` array lists which `sso.*` keys changed — `allowedDomains` values are never echoed into the audit metadata.)

Always returns the **full, current** policy (same envelope as `GET /workspace/settings`) so the client can re-sync without a second round-trip:
```json
{
  "settings": {
    "require2fa": true,
    "autoLockMinutes": 30,
    "sso": { "allowedDomains": ["iux24.com"], "jitEnabled": false, "requireSso": false }
  }
}
```

#### Server-side enforcement — `two_factor_required` (403)

When `require2fa` is on, a member who has **not** enrolled verified 2FA is blocked
on every **secret-bearing** route with `403 two_factor_required`:

| Blocked (gated) | Always allowed (remediation path) |
| --- | --- |
| `GET/POST/PATCH/DELETE /vaults/*` | `GET /me`, `GET /me/workspaces` |
| `GET/POST/PATCH/DELETE /items/*` (incl. `/vaults/:id/items`) | `GET /workspace/settings` |
| `/folders/*` (incl. `/vaults/:id/folders`) | `POST /auth/2fa/enroll`, `POST /auth/2fa/verify-enroll` |
| `/vaults/:id/members/*` | `POST /auth/logout` |
| `/sends/*` (authenticated create/list) | the public reveal flow `GET /s/:token`, `POST /s/:token/reveal` |
| `/items/:id/attachments/*`, `/attachments/*` | |

This is **defense-in-depth** — the frontend MUST also gate (forced `/setup-2fa`
screen) but the backend is the real boundary: hitting the JSON APIs directly still
returns `403 two_factor_required` until the user finishes enrollment.

#### `GET /me` — new signal `requiresTwoFactorEnroll`

`GET /me` now includes `requiresTwoFactorEnroll: boolean` alongside the existing
2FA fields. It is **account-level**:

```
requiresTwoFactorEnroll = (totpEnabledAt == null)
                          && (at least one membership org has require2fa == true)
```

2FA is an account credential — a single enrollment satisfies **every** workspace
the user belongs to, so this flag flips to `false` everywhere the moment the user
enrolls. The frontend keys off it to force the `/setup-2fa` screen.

| Error code | When | HTTP |
| --- | --- | --- |
| `two_factor_required` | a require2fa workspace gates an un-enrolled member from a secret-bearing route | 403 |

### Workspace integrations

Catalog of third-party connectors for the **active** workspace. Google Workspace status is **derived** from the existing `sso.allowedDomains` policy (configure domains via `PATCH /workspace/settings`, not a separate Google PATCH). Slack is the only connector with a persisted credential today (incoming webhook URL stored in `organizations.settings.integrations.slack`).

```ts
type WorkspaceIntegrationId =
  | "google_workspace"
  | "slack"
  | "github"
  | "microsoft_entra"
  | "datadog"
  | "pagerduty";

type WorkspaceIntegrationStatus =
  | "connected"      // ready / configured for this workspace
  | "available"      // can be configured now
  | "coming_soon"    // catalog entry only — no connect flow yet
  | "unavailable";   // platform prerequisite missing (e.g. Google OAuth env)

interface WorkspaceIntegration {
  id: WorkspaceIntegrationId;
  status: WorkspaceIntegrationStatus;
  summary: string | null;   // non-secret hint (domain count, masked webhook tail)
  connectedAt: string | null;
}
```

Status rules:
- **google_workspace** — `unavailable` when the deployment has no Google OAuth env (`GOOGLE_OAUTH_CLIENT_ID` + secret + redirect URI). Otherwise `connected` when this workspace's `sso.allowedDomains` is non-empty, else `available`. `summary` echoes the allowed-domain count when connected.
- **slack** — `connected` when a valid incoming webhook is stored; `available` otherwise. `summary` is a masked tail (`••••` + last 8 chars) — the full URL is **never** returned.
- **github / microsoft_entra / datadog / pagerduty** — always `coming_soon`.

#### `GET /workspace/integrations`
Auth required. Readable by **any member** (same visibility as `GET /workspace/settings`). Org resolved from the active workspace — no client org id.
```json
{
  "integrations": WorkspaceIntegration[],
  "platform": { "googleSsoConfigured": true }
}
```
`404 not_found` if the caller has no workspace membership.

#### `PATCH /workspace/integrations/slack`
**Owner + admin only** (`403 forbidden` otherwise). Rate-limited 20/hour/user (`429 rate_limited` + `Retry-After`). Audited as `workspace.integration_updated` with `metadata: { integration: "slack", connected: boolean }` (webhook URL never echoed).

Connect:
```json
{ "webhookUrl": "https://hooks.slack.com/services/T000/B000/XXXXXXXX" }
```
- Must match `^https://hooks\.slack\.com/services/…` (Zod). Stored with `connectedAt` (ISO timestamp).

Disconnect:
```json
{ "disconnect": true }
```

Response 200 — same envelope as `GET /workspace/integrations` (full re-sync).

#### `POST /workspace/integrations/slack/test`
**Owner + admin only**. Sends a one-line test message to the stored webhook. Rate-limited 20/hour/user. Audited as `workspace.integration_tested`.

- `400 validation_error` — Slack not connected, invalid stored webhook, or Slack API rejected the POST (`details.fieldErrors`).
- Response 200: `{ "ok": true }`

**Google Workspace actions (frontend-only, no new PATCH):**
- **Configure** → navigate the admin to the SSO settings tab and edit `sso.allowedDomains` via `PATCH /workspace/settings`.
- **Test sign-in** → top-level redirect to `GET /auth/sso/google/start` (see Auth SSO section).

### `GET /members` (extended)
The response object now also carries `invitations` for `owner`/`admin` callers:
```ts
interface MembersResponse {
  members: OrgMember[];
  invitations: Invitation[];  // empty for non-admin callers
}

interface Invitation {
  id: string;
  email: string;
  role: "admin" | "member" | "guest";   // owner never granted at invite time
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
  lastSentAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}
```
Only `status === "pending"` rows are returned by the list (accepted/revoked/expired are filtered server-side).

### `POST /members/invite`
Auth: `owner` or `admin`.
Request:
```json
{ "email": "newhire@example.com", "role": "admin|member|guest" }
```
- `email`: lowercased, trimmed, RFC-ish; 1–254 chars.
- `role`: cannot be `owner` (use `PATCH /members/:userId` after the invitee accepts and signs in).

Behavior:
- If an active member with this email already exists in the org → `409 already_member`.
- If a pending invite for the same email exists → the existing row is updated (new token + new 7-day expiry) and returned. This makes repeated POSTs idempotent.

Response 201:
```json
{ "invitation": Invitation, "acceptUrl": "https://vault.iux24.com/invite/<token>" }
```
- `acceptUrl` is the link the recipient must open. Phase A has no email transport — the frontend should expose this link via "Copy invite link". Phase B will send via Resend and stop returning `acceptUrl` in the response body.

Audit: `member.invite`, target = invitation id.

### `POST /members/invite/:id/resend`
Auth: `owner` or `admin`. Rotates the token and resets `expires_at` to 7 days from now.
- `409 invitation_already_accepted` if already accepted.
- `409 invitation_revoked` if already revoked.

Response 200:
```json
{ "invitation": Invitation, "acceptUrl": "..." }
```
Audit: `member.invite_resent`.

### `DELETE /members/invite/:id`
Auth: `owner` or `admin`. Marks the invitation `revoked_at = now()`. Idempotent for already-revoked rows? **No** — already-accepted rows return `409 invitation_already_accepted`; revoking an already-revoked row is allowed (idempotent 204).
Response 204.
Audit: `member.invite_revoked`.

### `GET /invite/:token`
Public — no session required. Used by the frontend's `/invite/:token` page to render the invitation preview before the recipient signs in.

Token format: base32 lowercase, no padding, 8–64 chars (current generation produces ~39 chars).

Response 200:
```json
{
  "invitation": {
    "email": "newhire@example.com",
    "role": "admin|member|guest",
    "orgName": "Woxa Corp",
    "invitedByName": "Nexa Woxa",
    "expiresAt": "2026-05-26T03:14:15.926Z",
    "userExists": false
  }
}
```
- `invitedByName` is null when the inviter user row was deleted, otherwise falls back through `displayName → name → email`.
- `userExists` is `true` when a `users` row already exists with `email == invitation.email` (case-insensitive). The frontend uses this to choose between the "Sign in to accept" path (`true`) and the "Set a password and join" signup path (`false`).

Errors:
- `404 not_found` — token doesn't match any invitation row.
- `400 validation_error` — token failed the regex/length check.
- `409 invitation_already_accepted` — invitation was previously accepted.
- `410 invitation_revoked` — invitation was revoked by an admin.
- `410 invitation_expired` — `expires_at` has passed.

### `POST /invite/:token/accept`
**Auth required.** The caller must already be signed in via password or SSO. Frontend is expected to redirect to login when the session is missing (`401 unauthorized` here is final — backend will not create an account).

Behavior:
- Looks up the invitation by SHA-256(token), validates status + expiry.
- Compares the invitation email (lowercased) to the session user's email; mismatch → `403 invitation_email_mismatch`.
- If the user is already a member of the target org, the invitation is closed (`accepted_at = now()`) and a `member.invitation_accepted` audit event is written with `metadata.alreadyMember = true`, then a `409 already_member` is returned. The existing membership role is **never** overwritten.
- Otherwise, in a single transaction, inserts an `org_members` row with the invitation's role, sets `invitations.accepted_at = now()`, and writes a `member.invitation_accepted` audit event.

Response 200:
```json
{
  "membership": {
    "orgId": "uuid",
    "role": "admin|member|guest",
    "joinedAt": "2026-05-19T07:42:11.000Z"
  }
}
```
Errors:
- `401 unauthorized` — no session cookie.
- `403 invitation_email_mismatch` — invitation was sent to a different email.
- `404 not_found` — token doesn't match any invitation.
- `409 already_member` — caller is already in this org.
- `409 invitation_already_accepted` — already accepted.
- `410 invitation_revoked` — revoked by admin.
- `410 invitation_expired` — expired.

Audit: `member.invitation_accepted`, target = invitation id.

### `POST /invite/:token/signup-and-accept`
**Public — no session required.** Creates a new `users` row for the invited email AND inserts the corresponding `org_members` row in a single transaction, then issues a session cookie so the caller is logged in on the response.

Used by the frontend when `GET /invite/:token` returns `userExists === false` — the invited email has no account yet and Phase A does not expose self-signup outside the invite flow.

**Two-password model:** the `password` here is the **login password** (`login_password_hash` — the field `POST /auth/login` verifies). The **master password** (`password_hash`) is left NULL and is set later by the user at `/setup-password`, which is also where the master-bound recovery kit is minted. This avoids the lockout where an invite-signup account held a master hash but no login hash and could never sign back in.

Token format: same regex/length as `GET /invite/:token` (base32 lowercase, 8–64 chars).

Request:
```json
{
  "password": "min 10 chars",
  "displayName": "Optional Name"
}
```
- `password`: 10–1024 chars — this is the **login password**. Frontend should layer its own complexity rules on top.
- `displayName`: optional; 1–120 chars after trim. Falls back to the invitation email when omitted.

Rate limit: 5 attempts / minute keyed by `(IP, token_hash)`. Excess returns `429 rate_limited` with `Retry-After`.

Response 200 (sets HttpOnly session cookie):
```json
{
  "user": { "id": "usr_...", "email": "newhire@example.com", "displayName": "Newhire" },
  "membership": {
    "orgId": "uuid",
    "role": "admin|member|guest",
    "joinedAt": "2026-05-19T07:42:11.000Z"
  }
}
```
- **No `recoveryCode`** in the response — the recovery kit is bound to the master password, which this endpoint does NOT set. The kit is generated later at `/setup-password`.
- `email_verified_at` is set on the new user: holding the invite token proves control of the invited mailbox.
- After signup the caller is logged in but has no master password. `GET /me` returns `requiresPasswordSetup: true` + `hasWorkspace: true`, so the frontend's SessionGuard routes: `/setup-password` (sets master + shows recovery kit) → (if the workspace requires 2FA) `/setup-2fa` → `/app`.

Errors:
- `400 validation_error` — bad token format OR password fails policy.
- `404 not_found` — token does not match any invitation.
- `409 user_exists` — an account already exists for the invited email; the frontend should redirect to login then call `POST /invite/:token/accept`.
- `409 invitation_already_accepted` — invitation was previously accepted.
- `410 invitation_revoked` — invitation was revoked by an admin.
- `410 invitation_expired` — `expires_at` has passed.
- `429 rate_limited` — too many attempts.

Audit: `member.invitation_accepted` with `metadata.viaSignup = true`. (No `account.recovery_kit_generated` here — the kit moves to the `/setup-password` step.)

## Endpoints — Account self-service

All `/me` routes require an active session. The single-org-per-user model from `/workspace` applies — `role` on the returned payload is the caller's role inside their (only) workspace.

```ts
interface MeUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;            // false in Phase A (TOTP wired but no enrolment endpoint yet)
  role: "owner" | "admin" | "member" | "guest" | null;

  // Zero-knowledge-aligned account state. `requiresPasswordSetup` is `true`
  // for SSO JIT users who have never set a master password; the frontend
  // should route them through `POST /me/password/setup` before exposing
  // password-only affordances (e.g. recovery-kit regenerate). After a
  // successful recovery reset, `hasRecoveryKit` flips back to false until
  // the user regenerates one — the frontend MUST prompt for regeneration
  // on the next login in that state.
  requiresPasswordSetup: boolean;
  hasRecoveryKit: boolean;
  recoveryKitCreatedAt: string | null;
}
```

### `GET /me`
Response 200:
```json
{ "user": MeUser }
```

### `PATCH /me`
Updates the caller's profile. Phase A allows changing `displayName` only — email changes will require a separate verification flow.

Request:
```json
{ "displayName": "Nexa Woxa" }
```
- `displayName`: 1–120 chars after trim. Required.

Response 200:
```json
{ "user": MeUser }
```
Errors:
- `400 validation_error` — empty/oversized display name.

Audit: `account.profile_updated`.

### `POST /me/password/setup`
**First-time** master password setup. Used by SSO JIT users who want to enable password login, and by users mid-flow after a recovery reset (which invalidates the previous kit).

Direct master-password change (rotating an existing password while you still know it) is intentionally NOT supported — the only path to rotate an existing password is the recovery-kit reset flow (`POST /auth/password/reset-with-recovery`). This keeps the recovery kit as the single, audit-friendly mechanism for credential rotation and aligns with the zero-knowledge security model.

Request:
```json
{ "password": "string (>=10 chars)" }
```
- `password`: 10–1024 chars. Same Argon2id parameters as `/auth/login` (`t=3, m=64MB, p=4`).

Response 200:
```json
{ "ok": true, "recoveryCode": "xxxx-xxxx-...-xxxx" }
```
- `recoveryCode` is base32 lowercase grouped into **14** dashed 4-char blocks (256-bit body + 4-char checksum, round-7). The checksum is a deterministic prefix of `SHA-256(body)` and lets the server reject a typo *before* spending Argon2 cost. **Shown ONCE** — the server stores only an Argon2id hash over the body (the checksum is never hashed). The frontend MUST prompt the user to save/print this immediately and confirm they did before navigating away. Responses carry `Cache-Control: no-store` so caches won't retain the code.

Errors:
- `400 validation_error` — password too short.
- `401 unauthorized` — no session.
- `409 password_already_set` — a `password_hash` is already on file. Use the recovery flow to rotate.

Audit: `account.password_setup` + `account.recovery_kit_generated` (single transaction).

### `POST /me/verify-password`
Verifies the caller's current master password without mutating session state. Backs the **vault auto-lock unlock** flow (AC-055.8 — 15-minute idle auto-lock; DESIGN.md §15 Lock Model).

**Phase A.5 (server-side lock, WARN-I):** the backend now enforces the lock too — sensitive item-read endpoints (`GET /items/:id`, `GET /attachments/:id/download`, `POST /sends`) are gated by a `requireVaultUnlocked` middleware that checks `sessions.vault_unlocked_at` is within the 15-minute idle window. A successful `verify-password` stamps the current session's `vault_unlocked_at = now()`, lifting the gate for the next 15 min. A session-thief with a stolen cookie therefore cannot bypass the frontend lock by hitting the JSON API directly. List/metadata routes stay open so the locked UI can still navigate.

**Phase A note (unchanged):** the backend KEK is still server-side, so the unlock is a **gate** rather than a cryptographic operation. Phase C will move KEK derivation client-side and this endpoint will become a real cryptographic check.

Request:
```json
{ "password": "string", "lockReason": "idle" }
```
- `password`: 1–1024 chars. No minimum policy length here — a user whose stored password predates a policy bump must still be able to unlock.
- `lockReason` *(optional, WARN-L)*: one of `"idle" | "manual" | "restart" | "sleep"`. Pass-through audit tag — the backend stores it on the audit row but does NOT branch on it. Lets the security team correlate unlock cadence with user behaviour.

Rate limits (two-tier, keyed by `user_id`):
- Soft: 30 attempts / 15min — ticks on every request (caps Argon2 cost).
- Hard: 5 attempts / 15min — ticks **only on failure** so a session-thief cannot lock out the legit user by spamming wrong guesses between their own successful unlocks.

Server-side effects on success (Phase A.5, WARN-I):
- Sets `sessions.vault_unlocked_at = now()` on the **current session row only** (per-session, so unlocking on device A does NOT unlock device B).
- Atomic with the audit insert — the timestamp + the audit row land in one transaction.
- No cookie set, no session rotation, no `passwordUpdatedAt` bump.

Response 200:
```json
{ "ok": true }
```

Errors:
- `400 validation_error` — body shape wrong.
- `401 unauthorized` — no session.
- `401 invalid_credentials` — password is wrong.
- `409 password_not_set` — caller's account has no `password_hash` (SSO-only JIT user who hasn't run `/me/password/setup`). Frontend should route to setup.
- `429 rate_limited` — soft or hard cap hit; `Retry-After` set.

Response headers: always `Cache-Control: no-store` (WARN-J — applied **before** the rate-limit check so 429/401 responses also carry the header).

Audit:
- `account.vault_unlock_success` (`metadata = { phase: "A", lockReason? }`) on success.
- `account.vault_unlock_failed` (`metadata = { phase: "A", reason: "wrong_password" | "no_password", lockReason? }`) on every miss. The 409 path also burns a constant-time dummy Argon2 verify so timing cannot leak SSO-only vs password-enabled accounts.
- Audit insert failures are caught and logged at `warn` level — the rate-limit consume + the thrown response are NOT skipped if the audit write fails (WARN-K).

### `POST /me/recovery-kit/regenerate`
Rotates the recovery code. Requires the **current password** as proof-of-possession so a session-only attacker can't silently replace the recovery secret.

Request:
```json
{ "password": "current password" }
```

Rate limit: 3 attempts / hour keyed by `user_id`.

Response 200:
```json
{ "recoveryCode": "xxxx-xxxx-...-xxxx" }
```
- Same shape as setup; **shown ONCE**.

Errors:
- `401 invalid_credentials` — wrong current password, or account has no password set.
- `401 unauthorized` — no session.
- `429 rate_limited` — too many attempts.

Audit: `account.recovery_kit_regenerated` on success, `account.recovery_kit_regenerate_failed` on wrong password.

### `POST /me/sessions/revoke-all`
Invalidates every other active session for the caller (keeps the current one). Useful for the "log out other devices" affordance on the account page.

**Re-authentication required (WARN-1, round 7):** the caller must include their current master password as proof-of-possession so a cookie-only attacker can't lock the legit user out of their other devices. Rate-limited to 3 attempts / hour / user; wrong passwords also trip the `account.sessions_revoke_failed` audit.

Request:
```json
{ "password": "string" }
```

Response 200:
```json
{ "ok": true, "revokedCount": 3 }
```

Errors:
- `400 validation_error` — missing `password`.
- `401 invalid_credentials` — wrong password (or SSO-only account with no password set).
- `429 rate_limited` — too many wrong-password attempts.

Audit: `account.sessions_revoked` on success, `account.sessions_revoke_failed` on wrong password.

Phase A.5 side-effect (WARN-I): a successful revoke-all also refreshes `sessions.vault_unlocked_at = now()` on the **current session** — the caller has just re-proved the master password, so they should not be bounced into an unlock prompt seconds later.

### `POST /auth/password/reset-with-recovery`
**Public — no session required.** Forgotten-password reset using a recovery code captured at setup/regenerate time. The recovery code IS the auth factor for this endpoint — there is no other credential.

Request:
```json
{
  "email": "user@example.com",
  "recoveryCode": "xxxx-xxxx-...-xxxx",
  "newPassword": "string (>=10 chars)"
}
```
- `email`: lowercased, trimmed.
- `recoveryCode`: case-insensitive, dashes and whitespace ignored (`xxxx-xxxx-xxxx` and `xxxxxxxxxxxx` both accepted). The normalized form is `body (52 chars) + checksum (4 chars)`. A mismatched checksum is rejected as `recovery_kit_invalid` without burning an Argon2 verify (WARN-7).
- `newPassword`: 10–1024 chars; must NOT equal the recovery code itself.

Rate limit: 5 attempts / hour / IP **and** 3 attempts / hour / email (the tighter wins).

Response 200:
```json
{ "ok": true, "requiresNewRecoveryKit": true }
```
- Server-side effects: rotates `password_hash`, clears `recovery_kit_hash` (single-use), sets `recovery_kit_used_at = now`, and **deletes every active session** for the user (recovery is treated as a sign-of-compromise). Caller must log in fresh.
- `requiresNewRecoveryKit: true` is a hint to the frontend: after the user logs in with the new password, prompt them to regenerate a kit via `POST /me/recovery-kit/regenerate`.

Errors:
- `400 validation_error` — bad email, recoveryCode shape, or newPassword too short / equal to recovery code.
- `401 recovery_kit_invalid` — recovery code did not match. Constant-time response — also returned for unknown email so the endpoint does not leak user existence.
- `429 rate_limited` — too many attempts.

Audit: `account.password_reset_via_recovery` on success, `account.password_reset_failed` on every miss (metadata distinguishes `unknown_email`, `no_kit`, `wrong_code` for ops review).

Phase A note: server-side envelope encryption (`LOCAL_KEK_BASE64`) is unaffected by a password change — the password is only the auth credential. Phase B (zero-knowledge) will require coordinated DEK re-wrapping with the frontend on this path.

## Endpoints — Attachments

Per-item file attachments (FR-038, DESIGN.md §7.3). Phase A storage is server-side envelope-encrypted on the local filesystem; the contract is unchanged when storage moves to R2 in Phase B.

```ts
interface Attachment {
  id: string;
  itemId: string;
  filename: string;          // sanitized; 1..200 chars
  mimeType: string;
  sizeBytes: number;         // plaintext size
  createdAt: string;
  createdBy: string | null;
}
```

Authorization:
- Any vault member who can see the parent item may list + download attachments.
- Uploading + deleting requires `manager`, `editor`, or `user` on the vault (mirrors item write permission).

### `GET /items/:id/attachments`
Response 200:
```json
{ "attachments": Attachment[] }
```

### `POST /items/:id/attachments`
Multipart form. Single field `file` with the binary body. Max per-file size = `ATTACHMENT_MAX_BYTES` (25 MB default). Aggregate cap per item = `ATTACHMENT_ITEM_MAX_BYTES` (100 MB default).

MIME allow-list (round 2): `application/pdf`, `text/plain`, `text/csv`, `text/markdown`, `application/json`, `application/xml`, `text/xml`, `image/{png,jpeg,gif,webp,svg+xml}`, `application/zip`, `application/x-7z-compressed`, `application/x-pem-file`, `application/pkcs8`, `application/pkix-cert`, MS Word / Excel mimes, `application/octet-stream`.

Response 201:
```json
{ "attachment": Attachment }
```
Errors:
- `413 attachment_too_large` — single file over the cap.
- `413 attachment_item_quota_exceeded` — would exceed the per-item total.
- `415 attachment_mime_not_allowed` — MIME outside the allow-list.

Audit: `attachment.uploaded`, metadata includes `{ itemId, sizeBytes, mimeType }` (no filename — may leak secrets).

### `GET /attachments/:id/download`
Streams the **decrypted** file body.
Headers: `Content-Type`, `Content-Length`, `Content-Disposition: attachment; filename="..."; filename*=UTF-8''...`, `Cache-Control: private, no-store, max-age=0`.
404 when the caller cannot see the parent item.

Audit: `attachment.downloaded`.

### `DELETE /attachments/:id`
Hard-deletes the row and removes the storage blob. Response 204.
Audit: `attachment.deleted`.

## Endpoints — Folders

Folders are flat per-vault containers. Items reference a folder via `folderId` (nullable). Round 2.x ships a single level — `parent_id` is NOT exposed on the wire. (DESIGN.md §7.3 allows up to 3 nested levels; we'll widen in a later round.)

```ts
interface Folder {
  id: string;
  vaultId: string;
  name: string;
  iconKey: string | null;
  color: VaultColor | null;
  position: number;        // app-managed sort key, integer
  createdAt: string;
  updatedAt: string;
}
```

Authorization: any vault member may list folders. Create / update / delete requires `manager`, `editor`, or `user` role on the vault (same as items).

### `GET /vaults/:id/folders`
Response 200:
```json
{ "folders": [Folder, ...] }
```

### `POST /vaults/:id/folders`
Request:
```json
{ "name": "Production", "iconKey": "lock", "color": "blue" }
```
- `name`: 1–80 chars, trimmed, required.
- `iconKey`: 0–60 chars, optional, nullable.
- `color`: optional, validated against `VaultColor`.
- `position`: optional integer; defaults to `(max(position) + 1)` of existing folders in the vault.
Response 201:
```json
{ "folder": Folder }
```

### `PATCH /folders/:id`
Request: any subset of `{ "name", "iconKey", "color", "position" }`.
Response 200:
```json
{ "folder": Folder }
```

### `DELETE /folders/:id`
Response 204. Existing items keep their row — their `folderId` is `SET NULL` automatically by the FK.

### Items × folders

- `POST /vaults/:vaultId/items` accepts an additional optional field `folderId: string | null`. When the folder is not in this vault → `404 not_found`.
- `PATCH /items/:id` accepts `folderId: string | null` to move/clear.
- `ItemSummary.folderId` becomes `string | null` (previously the contract said `null` only).

## Endpoints — Audit log

```ts
interface AuditEvent {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;                     // e.g. "item.create"
  targetType: string | null;          // "item" | "vault" | "folder" | "send" | "user" | ...
  targetId: string | null;
  targetName: string | null;
  ipHash: string | null;
  userAgent: string | null;
  success: boolean;
  metadata: Record<string, unknown>;
  occurredAt: string;
}
```

### `GET /audit`
Query params (all optional):
- `cursor` — opaque cursor returned by the previous page; encodes `(occurred_at, id)` keyset. Omit on the first page.
- `limit` — 1–200, default 50.
- `actor` — actor user id.
- `action` — exact action string (e.g. `item.reveal`).
- `from` — ISO-8601 lower bound (inclusive) on `occurred_at`.
- `to` — ISO-8601 upper bound (exclusive) on `occurred_at`.

Response 200:
```json
{ "events": [AuditEvent, ...], "nextCursor": "string|null" }
```

Authorization:
- Org `owner` / `admin` see every event for their org.
- Anyone else (`member`, vault `manager`/`editor`/`user`/`viewer`) sees only events where `actor_user_id = <self>`. The richer "events on vaults I belong to" filter is deferred until we add a join column on audit rows — flagged as a TODO in the route file.

`nextCursor` is `null` when the last page has been returned.

## Endpoints — One-time sends

A send is server-encrypted in round 2.x (`Phase A`). The plaintext is wrapped by a per-send DEK that is itself wrapped under `LOCAL_KEK_BASE64`. The fully zero-knowledge flow (key in URL fragment, server cannot decrypt) is flagged as a TODO and tracked in DESIGN.md §6.3.

```ts
interface SendMetadata {
  token: string;            // base32, ~26 chars; appears in /s/:token URL
  hasPassword: boolean;
  expiresAt: string;
  maxViews: number;
  viewsRemaining: number;
  burned: boolean;          // true when burned (max_views hit, manual burn, or expired)
  createdAt: string;
}

interface SendCreatedResponse {
  id: string;
  token: string;
  viewUrl: string;          // absolute URL hosted at web origin: <WEB_BASE_URL>/s/<token>
  expiresAt: string;
}
```

### `GET /sends`
Authenticated. Returns the caller's own sends, newest first, up to 200 rows.

```ts
interface SendListItem {
  id: string;
  tokenHashPreview: string;     // first 12 hex chars of SHA-256(token); display-only, NOT the share URL
  hasPassword: boolean;
  maxViews: number;
  viewCount: number;
  expiresAt: string;
  createdAt: string;
  burnedAt: string | null;
  status: "active" | "burned" | "expired";   // derived server-side from burned_at / expires_at / view_count
}
```

Response 200:
```json
{ "sends": SendListItem[] }
```
Notes:
- The raw token is **not** stored, so this list cannot rebuild a working share URL. Recipients must use the URL captured at creation time (returned by `POST /sends`).
- `status === "burned"` means either max_views was hit, the sender called `DELETE /sends/:id`, or `expires_at` passed.

### `POST /sends`
Authenticated. Caller is the `created_by` (sender).

Request:
```json
{
  "content": "the secret string",
  "expiresInMinutes": 60,
  "maxViews": 1,
  "password": "optional"
}
```
- `content`: 1–32768 chars, required.
- `expiresInMinutes`: 1–10080 (max 7 days), required.
- `maxViews`: 1–100, optional (default 1).
- `password`: 6–256 chars, optional. When provided, the reveal endpoint requires the same value.

Rate limit: 10 / minute / user.

Response 201:
```json
{ "send": SendCreatedResponse }
```

### `GET /s/:token`
Public — no session required.

Response 200:
```json
{ "send": SendMetadata }
```
Response 404 → `not_found` (unknown token; never reveals burned/expired distinction in this preview path).
Response 410 → `send_expired` or `send_burned` (after the first view is consumed — see reveal flow below — for clarity to the recipient UI).

### `POST /s/:token/reveal`
Public — no session required. Atomically increments `view_count`. If `view_count + 1 >= max_views`, the row is burned in the same transaction.

Request:
```json
{ "password": "optional, required when hasPassword=true" }
```

Rate limit: **10 / minute / IP per token**.

Response 200:
```json
{ "content": "the secret", "viewsRemaining": 0, "burned": true }
```
Response 401 → `send_password_required` or `send_password_invalid`.
Response 410 → `send_expired` or `send_burned`.
Response 425 → `send_not_ready` (AC-032.4 burn-guard; reveal hit the endpoint within ~1s of creation — almost certainly a link-preview bot. The recipient should retry after the `Retry-After` window). The view is **not** consumed.

### `DELETE /sends/:id`
Authenticated. Only the original sender may burn their own send early. Idempotent: burning an already-burned send returns 204 without error.
Response 204 (no body).

## Pending / future rounds

Items below are NOT implemented yet. Frontend stays on mock data until each lands here.

- ~~Self-signup endpoint~~ — landed 2026-05-19 as `POST /invite/:token/signup-and-accept`. General-purpose self-signup outside the invite flow is still deferred.
- Email transport via Resend (currently `acceptUrl` is returned in the response body and logged for ops; OK for dev).
- Tags, favorite toggle, TOTP secret support, custom fields
- Item type expansion (`api_key`, `ssh`, `card`, `identity` — see §"Item type expansion" below)
- Multi-level folder nesting (parent_id; current API exposes a flat folder list per vault)
- Audit log "events on vaults I belong to" filter for non-admin members
- Zero-knowledge sends (URL fragment key, server cannot decrypt)

### Item type expansion (round 2.2)

Today the wire-level `ItemType` is `"login" | "note"`. The frontend's "Create new item" dialog already renders the full set users saw in the mock UI but locks the unsupported entries behind a "Coming soon" badge — they cannot be POSTed. To unlock them the backend needs to:

1. Widen the `ItemType` enum (in `/API_CONTRACT.md` AND the route validator) to:
   ```ts
   type ItemType = "login" | "note" | "api_key" | "ssh" | "card" | "identity";
   ```
   The DB column `items.type` is already plain `text`, so no migration is needed on that single column — only the Zod enum changes.

2. Add encrypted storage for the new shapes. Recommended approach: one generic `extra_fields_ciphertext` / `extra_fields_iv` `bytea` column pair on `items`, holding an envelope-encrypted JSON blob keyed by field name. This avoids per-type schema churn and keeps every new secret on the same DEK + zeroize path the round 2 fields use.

   | Type | Plaintext meta fields | Encrypted blob fields |
   | --- | --- | --- |
   | `api_key` | `name` (existing) | `key` (string), optional `customFields[]` for publishable key / webhook secret / scopes |
   | `ssh` | `name` (existing) | `privateKey` (string), optional `publicKey`, optional `passphrase` |
   | `card` | `name`, `cardholder` (consider adding `cardholder text` column for list views) | `cardNumber`, `cvv`, `expiry` |
   | `identity` | `name` | `address`, `dob`, `idNumber`, `phone` |

   Alternative: dedicated `card_ciphertext` / `ssh_ciphertext` columns. Slightly cleaner reads but multiplies the IV/ciphertext column count — not recommended.

3. `POST /vaults/:vaultId/items` and `PATCH /items/:id` accept a new optional `extraFields` object on the wire whose shape depends on `type`. `GET /items/:id` decrypts it inline alongside `password` / `notes`. List endpoint still NEVER includes any ciphertext.

4. Server still derives `hasPassword` / `hasNotes`; new boolean `hasExtraFields` (or per-type `hasKey`, `hasPrivateKey`, etc.) is added so list views can render the correct affordance.

5. `file` type from the original mockup is intentionally out of scope here — it needs blob storage (S3 or equivalent) and is a separate Phase B item.

Until points 1–4 ship, the frontend will keep the picker disabled for the four pending types and ignore any attempt to submit them.

## Behavior notes (backend implementation)

- **Session cookie**: `woxa_session=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` (Secure when `SESSION_COOKIE_SECURE=true`).
- **Sliding session**: when more than half the TTL has elapsed, `GET /auth/me` refreshes the cookie automatically — frontend should accept new `Set-Cookie` on any authenticated response.
- **User id format**: UUID v4 (`gen_random_uuid()`). Frontend stores it as opaque string — do NOT assume any prefix. **Ids are bare UUIDs in round 2** (no `vlt_` / `itm_` / `usr_` prefixes).
- **Rate limit on /auth/login**: 5 attempts / 15 min, keyed by IP **and** by IP+email. Failed-attempt counter on the user row also locks the account for 15 minutes after 5 consecutive failures (AC-002.3).
- **Rate limit on /auth/sso/google/start**: 10 starts / 1 min / IP.
- **Argon2id** parameters: `t=3, m=64MB, p=4` (FR-112). First-login latency is intentionally ~200ms.
- **Item encryption (Phase A)**: per-item DEK (AES-256-GCM, 12-byte IV) wrapped by `LOCAL_KEK_BASE64`. DEK plaintext lives only in request-scoped memory and is zeroized after use. AWS KMS path is Phase B.
- **`next` sanitization**: backend accepts only `^\/[^\/]` (single leading slash, not protocol-relative) for SSO `next` query, capped at 256 chars. No path allow-list — relative path discipline is enough for round 2.

## Resolved questions (history)

1. **Vault/item id prefix** — bare UUIDs. Frontend treats as opaque.
2. **Color / icon validation** — backend Zod-validates the 8 `VaultColor` strings; rejects unknown. `iconKey` accepted as any 0–60 char string; frontend falls back to default on unknown values.
3. **`role` semantics** — `manager | editor | user | viewer`. Round 2 only differentiates manager vs editor vs viewer; `user` accepted on input, treated as editor.
4. **SSO `next` sanitization** — single leading slash, length ≤ 256, no `//` prefix. No path allow-list.
5. **Item secret column shape** — inline (no nested `secret:` object). Backend stores ciphertext in dedicated bytea columns but the wire shape stays flat.

## Open questions

(none — fill in if either agent needs to propose a deviation)

---
Last updated: 2026-05-19 by woxa-vault-backend-builder agent — **REMOVED** `POST /me/password` (direct master-password change). Added recovery-kit flow: `POST /me/password/setup` (first-time setup, returns plaintext recoveryCode once), `POST /me/recovery-kit/regenerate` (rotate kit, password-gated), `POST /auth/password/reset-with-recovery` (public forgotten-password flow, single-use, sessions cleared on success). Extended `MeUser` with `requiresPasswordSetup`, `hasRecoveryKit`, `recoveryKitCreatedAt`. `POST /invite/:token/signup-and-accept` now also returns `recoveryCode`. New error codes: `password_already_set` (409), `recovery_kit_invalid` (401), `recovery_kit_not_set` (409, reserved).

**Invite signup → two-password alignment (2026-05-21):** `POST /invite/:token/signup-and-accept` now sets the chosen password as the **login password** (`login_password_hash`), leaves the master (`password_hash`) NULL, and **no longer returns `recoveryCode`** nor emits the `account.recovery_kit_generated` audit. The master password + recovery kit are minted later at `/setup-password`. Fixes the lockout where invite-signup users got a master hash but no login hash and could not sign back in after session expiry. Flow after accept: session issued → `GET /me` `requiresPasswordSetup=true` + `hasWorkspace=true` → SessionGuard → `/setup-password` → `/app`. `email_verified_at` is set (invite proves mailbox ownership). `POST /invite/:token/accept` (existing-user path) is unchanged and still touches no password fields.

**Round-7 security hardening (2026-05-19):**
- **TRUST_PROXY env** — backend no longer trusts `X-Forwarded-For`/`X-Real-IP` by default. Honors `cf-connecting-ip` and `fly-client-ip` always; falls back to socket peer. Prod MUST set `TRUST_PROXY=true` ONLY when fronted by a proxy chain that strips/normalizes the headers (Cloudflare, Fly.io, AWS ALB). Otherwise rate-limit IP buckets are derived from the actual TCP peer.
- **Email uniqueness is case-insensitive** — DB unique index migrated to `lower(email)` (migration 0006). All insert paths normalize at the boundary; all lookup paths use `lower(email) = $1`.
- **Reset endpoint hardening (CRITICAL-1)** — `POST /auth/password/reset-with-recovery` now scopes the lookup to `status = 'active' AND deleted_at IS NULL`. Disabled / soft-deleted users return `401 recovery_kit_invalid` after the dummy Argon2 verify (constant-time path preserved).
- **TOCTOU lock-takeover fix (CRITICAL-2)** — `POST /me/password/setup` performs a conditional `UPDATE ... WHERE password_hash IS NULL` and 409s the loser of a concurrent setup race. On success it now rotates all sessions and issues a fresh session cookie (WARN-13).
- **Recovery-kit code format (WARN-7)** — recovery codes now ship 14 dashed 4-char blocks (52-char base32 body + 4-hex checksum). The reset endpoint validates the checksum BEFORE running Argon2 verify so typos do not burn rate-limit budget. The hash and the body are decoupled from the checksum, so the wire shape is the only externally visible change.
- **Recovery-regenerate rate limit (CRITICAL-5)** — two-tier: soft 20/hr/user ticks on every attempt, hard 3/hr/user ticks ONLY on a failed password verify. A legitimate user with the correct password is never locked out by an attacker's wrong guesses on a stolen session.
- **Logger redact (CRITICAL-6)** — pino redact list extended to cover `*.recoveryCode`, `*.recovery_code`, `*.token`, `*.newPassword`, `*.currentPassword`, plus `req.body.recoveryCode` paths. All endpoints returning a plaintext recoveryCode now set `Cache-Control: no-store`.
- **HSTS + Permissions-Policy (WARN-3)** — `strict-transport-security: max-age=63072000; includeSubDomains; preload` and `permissions-policy: camera=(), microphone=(), geolocation=(), payment=()` on every response.
- **Origin CSRF defense (WARN-4)** — every POST/PUT/PATCH/DELETE must carry an `Origin` (or `Referer`) header matching the CORS allow-list. Cross-origin forgeries hit 403 before the session middleware even runs.
- **Revoke-all requires password (WARN-1)** — `POST /me/sessions/revoke-all` now takes `{ password }` and rate-limits 3/hr/user on failed verifies.
- **Session absolute expiry (WARN-2)** — new column `sessions.absolute_expires_at`; sliding-refresh is clamped to that ceiling. A stolen session token cannot ride forever — it dies at most 30 days after creation regardless of polling.
- **Production rate-limit note** — the in-memory sliding-window limiter is process-local. Before scaling out (multi-instance Fly.io or Workers) it MUST migrate to Redis per DESIGN.md §10.

**Phase A.5 server-side vault lock (2026-05-19, WARN-I/J/K/L):**
- **`sessions.vault_unlocked_at`** — new nullable timestamp column (migration 0007). Stamped to `now()` on session creation (login + SSO callback) and on a successful `POST /me/verify-password` / `POST /me/sessions/revoke-all`. Null = treated as locked.
- **`requireVaultUnlocked` middleware** — gates `GET /items/:id` (reveal), `GET /attachments/:id/download`, and `POST /sends` (create). Past the 15-minute idle window the endpoint returns `401 vault_locked` instead of plaintext. List/metadata endpoints are intentionally NOT gated so a locked UI can still navigate. `/me/*`, `/auth/*`, and public preview routes (`/s/:token`, `/invite/:token`) are NOT gated.
- **`vault_locked` error code (401)** — new error envelope. Distinct from `unauthorized` so the frontend can branch on "locked vault" vs "logged out".
- **`verify-password` lockReason (WARN-L)** — request body accepts an optional `lockReason: "idle" | "manual" | "restart" | "sleep"`. Pass-through tag on the audit row; backend does NOT branch on it.
- **`Cache-Control: no-store` is set BEFORE the rate-limit check (WARN-J)** — so 429 / 401 responses on `/me/verify-password` also carry the header.
- **Audit-insert resilience (WARN-K)** — the verify-password failure path's audit insert is wrapped in try/catch, so a transient audit-write failure does not skip the rate-limit consume. Audit failures are logged at warn level.
- **`vault.access_denied_locked` audit** — written best-effort when a sensitive endpoint trips the lock. Failure to write the audit row does not change the gate response.

**Workspace/SSO security audit follow-ups (2026-05-21):**
- **CONTRACT CHANGE — `POST /workspace/transfer-ownership` now requires `password` (HIGH#1).** Body is `{ "targetUserId": "uuid", "password": string }`. The owner re-proves their master password before ownership is handed away, so a stolen session alone can no longer transfer ownership (which demotes the original owner to admin). Wrong password → `401 invalid_credentials`; SSO-only owner with no `password_hash` → `401 invalid_credentials`. Rate limit upgraded to two-tier (soft 20/hr/user every attempt + hard 5/hr/user on failed verifies). **Frontend must add the password field to the transfer-ownership form.**
- **`ownership_transfer_conflict` (409, new)** — concurrent transfers race on the single-owner index; the loser now gets a clean retryable 409 instead of a raw 500 (MEDIUM).
- **SSO JIT no longer auto-joins by slug (HIGH#2).** A brand-new SSO user is provisioned with NO org membership and lands org-less (`hasWorkspace:false` → `/spaces`). The previous slug-based auto-join was a cross-tenant capture vector (slug is attacker-influenceable, not a verified domain mapping). Trusted join path is invitation only. Verified-domain auto-join deferred to AC-006.2 (`org_domains` table).
- **Follow-up flagged:** session rotation for the demoted ex-owner after a successful transfer is NOT yet implemented (their session keeps only admin rights, which is correct, but cached elevated assumptions persist until expiry). Tracked separately.

**Workspace security settings + SSO enforcement (2026-05-22):**
- **CONTRACT CHANGE — `GET`/`PATCH /workspace/settings` now carry the FULL policy.** The settings envelope grew from `{ require2fa }` to `{ require2fa, autoLockMinutes, sso: { allowedDomains, jitEnabled, requireSso } }`. The RBAC, rate limit (20/hr/user), and no-op-skips-audit behavior are unchanged; the audit `metadata` shape now lists the **changed key names** + before/after for the non-secret scalars (`require2fa`, `autoLockMinutes`) and a `sso: ["sso.*"]` array — domain values are never echoed. **Frontend may add auto-lock + SSO-domain/JIT controls to the security-settings screen.**
- **`autoLockMinutes`** — integer, **server-clamped to `[1, 120]`**, default `15`. Drives the client idle auto-lock overlay.
- **`sso.allowedDomains`** — `string[]` (Zod max 100), **server-normalized** on write (lowercase/trim/dedupe + shape-validated, invalid entries dropped). What you GET back is canonical and may be shorter than what you PATCHed.
- **PATCH is a partial deep-merge** — top-level fields merge into the settings jsonb; the `sso` object merges field-by-field, so a partial `sso` PATCH preserves the other `sso.*` keys. The blob is read by a **total / fail-safe parser**: malformed/legacy values degrade to safe defaults, never throw (important — the same parser feeds the `require2fa` enforcement guard).
- **SSO callback now enforces stored org policy (two new gates).**
  - **Domain gate (`ssoDomainAllowed`)** — if any live org pins a non-empty `sso.allowedDomains`, the signing-in domain must be in at least one such list, else `/?error=sso_domain_forbidden` (gate `org_policy`). Enforced cross-org (union by domain) because new SSO users land org-less and there is no single org to consult.
  - **JIT gate (`ssoJitAllowed`)** — a brand-new user from a domain claimed only by `jitEnabled=false` org(s) is refused → `/?error=sso_jit_disabled`; admin must invite first. No org claims the domain → JIT defaults on. Re-checked inside the provisioning transaction.
- **Still NOT built (AC-006.2):** there is no verified `org_domains` table — `sso.allowedDomains` is a flat, **unverified** `string[]`. An admin can list any domain; there is no DNS/ownership proof and no domain→org binding, which is exactly why JIT auto-join stays invitation-only (see HIGH#2). The verified-domain workflow remains a deferred follow-up.

**Workspace integrations (2026-05-25):**
- **NEW — `GET /workspace/integrations`** — catalog + per-workspace connection status. Google Workspace status is derived from `sso.allowedDomains` (configure via existing `PATCH /workspace/settings`). Slack stores an incoming webhook in `organizations.settings.integrations.slack` (URL never returned on GET — masked `summary` only).
- **NEW — `PATCH /workspace/integrations/slack`** — connect (`{ webhookUrl }`) or disconnect (`{ disconnect: true }`). Owner+admin only; audited as `workspace.integration_updated`.
- **NEW — `POST /workspace/integrations/slack/test`** — sends a one-line test message. Owner+admin only; audited as `workspace.integration_tested`.
- **github / microsoft_entra / datadog / pagerduty** — catalog entries with `coming_soon` status only (no PATCH yet).

**Workspace slug auto-follows name on rename (2026-05-22):**
- **CONTRACT CHANGE — `PATCH /workspace` now regenerates the `slug` from the new name.** Previously the rename touched only `name` and left the slug frozen; now the slug is **server-derived** (`slugifyBase`) on every name change and the **response returns the NEW slug** (was the stale stored value). Body stays `{ name }` only — **no client-supplied slug** (server-derived, never-trusted; no new attacker-controlled-slug surface). Owner+admin gate + org-from-session (no IDOR) unchanged.
- **Exclude-self uniqueness:** the slug allocator excludes the org's own row from the clash check, so a name resolving to the org's current slug keeps it suffix-free; only a *different* org holding the slug forces a `base-<hex>` suffix.
- **Audit `workspace.renamed` metadata** extended to `{ from, to, slugFrom, slugTo }` (slug is not secret).
- **`workspace_slug_conflict` (409, new):** a concurrent rename racing for the same derived slug on the `organizations.slug` unique constraint now maps to a retryable 409 (mirrors `ownership_transfer_conflict`) instead of a raw 500.
- **Safe because slug is NOT load-bearing today** (not in any route path, invite/SSO/email link, or authz decision; round 9 removed slug-based auto-join). **Forward-compat caveat:** if a slug-based URL is ever added, auto-follow WOULD break old links — revisit then. The web preview (`slugifyWorkspaceName`) mirrors `slugifyBase`; keep in sync.
