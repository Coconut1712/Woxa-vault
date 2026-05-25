# 📋 Woxa Secret Vault — Requirements Specification

> **Single source of truth สำหรับทีมพัฒนา**
> Version 1.0 · 2026-05-12 · Owner: ching@iux24.com
> Companion: [DESIGN.md](./DESIGN.md) · [PHASES.md](./PHASES.md) · [PRP.md](./PRP.md)

---

## 0. Document Conventions

| Prefix | Meaning |
|---|---|
| `FR-XXX` | Functional Requirement (what the system DOES) |
| `NFR-XXX` | Non-Functional Requirement (how WELL the system performs) |
| `US-XXX` | User Story |
| `AC-XXX` | Acceptance Criterion |
| `OOS-XXX` | Out of Scope item (explicitly NOT building) |

**Priority levels:**
- 🔴 **P0** — Must have for first release (blocker)
- 🟠 **P1** — Should have (major feature)
- 🟡 **P2** — Could have (improvement)
- 🟢 **P3** — Won't have this time (future)

**Phase mapping (when to implement):**
- `[A]` Phase A · `[B]` Phase B · `[C]` Phase C · `[D]` Phase D

---

## 1. Product Overview

### 1.1 Problem Statement
ทีม iux24 share password/API key/SSH key/secure note ผ่าน Slack DM, LINE, email, Google Doc — ไม่ปลอดภัย, ไม่มี audit, ไม่มี expiration, ไม่มี access control

### 1.2 Solution Summary
Web-based encrypted vault สำหรับเก็บและแชร์ secret ภายในทีม + one-time send สำหรับ external party · Google Workspace SSO · Audit log · Zero-knowledge encryption (Phase C+)

### 1.3 Success Criteria (Phase A end / Week 7)

| Metric | Target | Measurement |
|---|---|---|
| Internal user signup | 20+ active users | DB `users` count |
| Items stored | 100+ items | DB `items` count |
| Daily active users | 80% of org | Login audit log |
| Search latency P95 | < 500ms | APM metrics |
| Login latency P95 | < 1s | APM metrics |
| Slack secret-sharing | ↓ 90% | Manual Slack audit |
| Critical/High security issues | 0 | Internal review |

---

## 2. User Personas

### Persona 1: Owner / Founder (Ching)
- **Goals:** Set up workspace, manage org policy, see usage
- **Pain:** Spending time approving access requests
- **Frequency:** Daily check, weekly admin tasks
- **Tech literacy:** High

### Persona 2: Engineer (DevOps Lead)
- **Goals:** Quickly retrieve credentials, share with team, integrate with CI/CD
- **Pain:** Hunting password in 4 different places
- **Frequency:** Multiple times per day
- **Tech literacy:** Very high

### Persona 3: Non-technical Staff (Marketing/Finance)
- **Goals:** Look up Mailchimp/social media passwords, share with new hires
- **Pain:** Doesn't trust "password apps", forgets master password
- **Frequency:** Weekly
- **Tech literacy:** Medium

### Persona 4: External Contractor / Vendor
- **Goals:** Receive one-time secret to do contracted work
- **Pain:** Confused by unfamiliar tools, on shared computer
- **Frequency:** Rare (project-based)
- **Tech literacy:** Variable

### Persona 5: External Auditor
- **Goals:** Verify access controls, generate compliance reports
- **Pain:** Limited time window, must not modify anything
- **Frequency:** Quarterly
- **Tech literacy:** Medium-high

---

## 3. User Stories

### Epic 1: Authentication & Onboarding

#### US-001 [P0, A] Sign in with Google Workspace
**As an** iux24 employee
**I want to** sign in using my @iux24.com Google account
**So that** I don't need to remember another password

**Acceptance:**
- AC-001.1: Sign-in page shows prominent "Continue with Google Workspace" button
- AC-001.2: After clicking, user redirects to Google OAuth with `hd=iux24.com` parameter
- AC-001.3: User with valid @iux24.com email logs in successfully
- AC-001.4: User with @gmail.com or other domain is rejected with clear error
- AC-001.5: First-time login auto-creates user (JIT) with default role "member"
- AC-001.6: Server verifies `hd` claim from ID token (defense in depth)

#### US-002 [P0, A] Sign in with Login Password (Fallback)
**As a** user without Google Workspace access
**I want to** sign in with email + login password
**So that** SSO outage doesn't lock me out

> **Two-password model (confirmed):** the **login password** (the credential
> entered on the login page) is a SEPARATE value from the **master password**
> (used to unlock the vault + back the recovery kit). `POST /auth/login`
> verifies ONLY the login password (`login_password_hash`); the master password
> is never accepted at login.

**Acceptance:**
- AC-002.1: Email + password (login password) fields on login page
- AC-002.2: Both login & master passwords hashed with Argon2id (t=3, m=64MB, p=4)
- AC-002.3: 5 failed attempts → account locked for 15 minutes
- AC-002.4: Admin can disable password login via org setting `require_sso`
- AC-002.5: `POST /auth/login` verifies `login_password_hash` only; an account with no login password (SSO-only/legacy) cannot sign in here (use Google) — response is constant-time `invalid_credentials` (no enumeration)

#### US-002b [P0, A] Self-service email + password signup
**As a** new user without an invite or Google Workspace account
**I want to** create an account with my email + a login password
**So that** I can onboard myself

**Acceptance:**
- AC-002b.1: `POST /auth/register` with `{ email, password, displayName? }` creates a user and logs them in (session cookie)
- AC-002b.2: `password` is the LOGIN password; strength policy = min 10 chars (same bar as master setup), Argon2id-hashed
- AC-002b.3: master password is NOT set at register → `GET /me.requiresPasswordSetup = true`; user is routed to `/setup-password` (sets master + recovery kit) then `/spaces`
- AC-002b.4: duplicate email → `409 email_taken`; rate-limited 5/hour/IP
- AC-002b.5: no workspace and no recovery kit are created at register (org-less; kit is bound to the master password)
- AC-002b.6 (residual, deferred): no email verification this round — account-squatting is accepted; invite acceptance stays token + session-email gated

#### US-003 [P0, A] Enable 2FA
**As a** user
**I want to** enable two-factor authentication
**So that** my account is protected even if password leaks

**Acceptance:**
- AC-003.1: Settings → Security → "Enable 2FA" shows QR code + secret
- AC-003.2: User scans with Authenticator app, enters 6-digit code to verify
- AC-003.3: After verification, system generates 10 single-use backup codes
- AC-003.4: User must download/save backup codes before continuing
- AC-003.5: All subsequent logins require TOTP code — **on EVERY login path, including Google SSO**. SSO does not exempt a user from the second factor: after Google verifies the first factor, a 2FA-enabled user is redirected to `/login/mfa` and must clear TOTP/backup code before a session is issued. (See API_CONTRACT.md → SSO callback `mfa_pending` cookie + `POST /auth/2fa/verify-login`.)
- AC-003.6: **Workspace "Require 2FA" security policy.** An owner/admin can turn on a workspace-level `require2fa` flag (`PATCH /workspace/settings`; stored in `organizations.settings` jsonb; audited as `workspace.security_policy_updated`). While on, **every member who has not enrolled verified 2FA — invited-new and existing alike — is forced to enroll before they can access secrets.** Enforcement is **server-side** (not frontend-only): secret-bearing routes (vaults / items / folders / vault-members / sends / attachments) return `403 two_factor_required` until the user enrolls; the enrollment path (`/auth/2fa/enroll`, `verify-enroll`, `GET /me`, `GET /workspace/settings`, logout) is never gated so the user can self-remedy without lockout. The policy is **account-level**: one enrollment satisfies every workspace the user belongs to. `GET /me` surfaces `requiresTwoFactorEnroll` for the forced `/setup-2fa` redirect. (See API_CONTRACT.md → Workspace security policy; DESIGN.md §12.2.)

#### US-004 [P0, A] Enable Passkey (WebAuthn)
**As a** security-conscious user
**I want to** use a Passkey instead of password
**So that** I'm immune to phishing

**Acceptance:**
- AC-004.1: Settings → Security → "Add Passkey"
- AC-004.2: Browser prompts for platform authenticator (TouchID/Windows Hello/security key)
- AC-004.3: After registration, Passkey appears as login option
- AC-004.4: Login with Passkey works without master password (Phase C+: still need pw to decrypt vault)

#### US-005 [P0, A] Set up Workspace (First Owner)
**As an** initial signup
**I want to** create a workspace
**So that** my team can join

**Acceptance:**
- AC-005.1: 4-step wizard: org info → connect Google Workspace → verify domains → invite policy
- AC-005.2: Domain verification via TXT record (`woxa-verify=<token>`)
- AC-005.3: TXT record verification polls every 30s for 10 min, then manual retry
- AC-005.4: Can add multiple domains (e.g., `iux24.com` + `iux24.co.th`)
- AC-005.5: Choose JIT policy: auto-allow all `@verified-domain.com` OR send invite each time
- AC-005.6: **The user who creates a workspace becomes its Owner** (single-Owner model — exactly one Owner per workspace, enforced at app + DB layer)
- AC-005.7: Post-auth **create-or-join** screen at `/spaces`: a freshly-signed-in user with no workspace either **creates** a new one (→ Owner) or **picks** a workspace they already belong to. `GET /me` surfaces `hasWorkspace` / `workspaceCount` / `activeOrgId` for the redirect; `GET /me/workspaces` lists the user's memberships
- AC-005.8: SSO JIT provisions the **user only** and creates **NO** org membership. It no longer auto-joins by slug (the slug-based join was a cross-tenant capture risk — slug is attacker-influenceable, not a verified domain mapping). A brand-new SSO user always lands org-less (`hasWorkspace:false`) and is routed to `/spaces`; the only trusted join path is an explicit invitation. (Slug-based / domain-based auto-join deferred to AC-006.2 with a verified `org_domains` table.)
- AC-005.9: **Active workspace + switcher (finding M-1).** A user in multiple workspaces has one **active** workspace per session, tracked in `sessions.active_org_id` and set via `POST /workspace/switch` (validates the caller is a member of the target org → `404 not_found` otherwise, masking org existence to prevent IDOR). **Every** org-scoped operation (members, invites, security policy, ownership transfer, audit, vault list/create) resolves against the active workspace and **re-validates membership on each request** — a stale/forged/deleted-org pointer grants nothing and falls back to the first membership; the RBAC role is always taken from the active-org membership so switching never escalates privileges. `GET /me` returns `activeOrgId` + the active-org `role`; `GET /me/workspaces` is the switcher list. (See API_CONTRACT.md → `POST /workspace/switch`; DESIGN.md §7.6 → Active workspace model.)

#### US-005b [P0, A] Transfer Workspace Ownership
**As an** owner
**I want to** hand ownership to a trusted teammate
**So that** the workspace survives my departure

**Acceptance:**
- AC-005b.1: Only the current Owner can transfer ownership (`POST /workspace/transfer-ownership`)
- AC-005b.2: Transfer is atomic: target becomes Owner, previous Owner is demoted to Admin — never two Owners and never zero Owners
- AC-005b.3: Target must already be a member of the workspace
- AC-005b.4: Admins can NOT demote, remove, or change the role of the Owner; only Owner may delete the workspace / transfer ownership / manage billing
- AC-005b.5: `PATCH /members/:id` cannot set role=`owner` (validation reject — ownership moves only via transfer); a caller must strictly outrank the target to change/remove them

#### US-006 [P0, A] Invite Team Member
**As an** admin
**I want to** invite a colleague
**So that** they can access shared vaults

**Acceptance:**
- AC-006.1: `/members` → "+ Invite" → enter email + role + assigned vaults/teams
- AC-006.2: If recipient @iux24.com → JIT auto-provisioned, no email sent. **DEFERRED — requires a verified `org_domains` mapping table.** Until then, even verified-domain users join only via explicit invitation (see AC-005.8); slug-based auto-join was removed as a cross-tenant risk.
- AC-006.3: If external domain → signed invite link sent (7-day expiry)
- AC-006.4: Bulk invite: paste multiple emails separated by newline
- AC-006.5: Status visible: Pending / Active / Locked

---

### Epic 2: Vault Management

#### US-010 [P0, A] Create Vault
**As an** admin or member with permission
**I want to** create a new vault
**So that** I can organize secrets by purpose

**Acceptance:**
- AC-010.1: Sidebar → "+ New Vault" or `/vaults/new`
- AC-010.2: Required fields: name (1-50 chars), color, icon
- AC-010.3: Optional: description, default access
- AC-010.4: On creation: creator becomes Manager of the vault
- AC-010.5: Default vaults auto-created on org creation: "Shared" + "{User}'s Personal"

#### US-011 [P0, A] Create Folder
**As a** vault Manager or Editor
**I want to** create folders within a vault
**So that** I can group related items

**Acceptance:**
- AC-011.1: Inside a vault → "+ New Folder"
- AC-011.2: Nestable up to 3 levels deep
- AC-011.3: Folder inherits vault access unless overridden
- AC-011.4: Can drag-drop folders to reorganize (Phase B)

#### US-012 [P0, A] Create Item (Login Type)
**As a** vault Editor/Manager
**I want to** create a new login item
**So that** I can store a credential

**Acceptance:**
- AC-012.1: "+ New Item" → choose type "Login"
- AC-012.2: Form fields: name (req), username, password (with generator), URL, TOTP secret, notes, tags, folder
- AC-012.3: Password generator: configurable length (8-128), include uppercase/lowercase/numbers/symbols
- AC-012.4: Password strength meter (zxcvbn)
- AC-012.5: On save: data encrypted with vault DEK before transmission (Phase C: client-side; Phase A-B: server-side envelope)
- AC-012.6: Item appears in vault's item list immediately

#### US-013 [P0, A] View Item Detail
**As a** user with `view_password` permission
**I want to** open an item to see its details
**So that** I can use the credentials

**Acceptance:**
- AC-013.1: Click item in list → detail page/modal
- AC-013.2: Username, URL, notes always visible
- AC-013.3: Password shown as `••••••••` by default, click 👁 to reveal
- AC-013.4: Revealed password auto-hides after 5 seconds
- AC-013.5: TOTP code visible if set, refreshes every 30s with countdown ring
- AC-013.6: Last accessed updates `last_used_at`
- AC-013.7: Audit log entry: `item.view`

#### US-014 [P0, A] Copy Password to Clipboard
**As a** user
**I want to** copy password with one click
**So that** I don't see/paste manually

**Acceptance:**
- AC-014.1: 📋 button next to password field
- AC-014.2: Toast "Copied · clears in 30 seconds"
- AC-014.3: Clipboard auto-clears after 30s (or 60s configurable)
- AC-014.4: Audit log entry: `item.copy_password`
- AC-014.5: Same for username, URL, TOTP code (separate buttons)

#### US-015 [P0, A] Edit Item
**As a** user with `edit_password` or `edit_metadata` permission
**I want to** update an item
**So that** I can rotate password / fix info

**Acceptance:**
- AC-015.1: "Edit" button → form pre-filled
- AC-015.2: Save creates new entry in `item_versions` (encrypted backup)
- AC-015.3: If password changed, `password_changed_at` set to now
- AC-015.4: Audit log: `item.update` with field-level diff (field names only, NOT values)

#### US-016 [P0, A] Delete & Restore Item
**As a** user with `delete` permission
**I want to** delete items
**So that** I can clean up obsolete credentials

**Acceptance:**
- AC-016.1: "Delete" button → confirmation modal
- AC-016.2: Soft delete: moved to Trash for 30 days
- AC-016.3: Trash view shows all soft-deleted items
- AC-016.4: "Restore" returns item to original folder
- AC-016.5: After 30 days, automatically purged
- AC-016.6: Audit log: `item.delete` and `item.restore`

#### US-017 [P0, A] Search Items
**As a** user
**I want to** find items by name/url/username
**So that** I don't navigate menus

**Acceptance:**
- AC-017.1: `Cmd+K` (or `Ctrl+K`) opens search modal from anywhere
- AC-017.2: Fuzzy match across name, URL, username, tags
- AC-017.3: Results sorted by: exact match > recently used > alphabetical
- AC-017.4: Up/down arrows navigate, Enter selects
- AC-017.5: Search latency < 100ms for up to 1000 items (P95)
- AC-017.6: ESC closes modal

#### US-018 [P0, A] Favorites & Recently Used
**As a** power user
**I want to** quickly access frequent items
**So that** I save clicks

**Acceptance:**
- AC-018.1: ⭐ button on item detail toggles favorite
- AC-018.2: "Favorites" view in sidebar shows starred items
- AC-018.3: "Recently used" view shows items sorted by `last_used_at` desc

---

### Epic 3: Sharing & Access Control

#### US-020 [P0, A] Share Item with User (Inside Org)
**As an** item Manager
**I want to** grant another user access
**So that** they can use the credential

**Acceptance:**
- AC-020.1: Item detail → "Share" button → modal
- AC-020.2: Search for user by email (autocomplete from org members)
- AC-020.3: Choose role: Viewer / User / Editor / Manager
- AC-020.4: Optional: set expiration (7d / 30d / 90d / never)
- AC-020.5: After save: recipient sees item next login (or via WebSocket push in Phase B)
- AC-020.6: Audit log: `item.share`

#### US-021 [P1, B] Share with Team
**As a** vault Manager
**I want to** grant access to an entire team
**So that** I don't add members individually

**Acceptance:**
- AC-021.1: Share modal supports principal = team (alongside user)
- AC-021.2: Role assigned to team applies to all members
- AC-021.3: Adding member to team → they auto-gain team's access
- AC-021.4: Audit shows team-level grant

#### US-022 [P1, B] Folder-Level Access
**As a** Manager
**I want to** override access at folder level
**So that** sensitive folders are restricted

**Acceptance:**
- AC-022.1: Folder settings → "Customize permissions" toggle
- AC-022.2: Add/remove principals with roles
- AC-022.3: Override is more restrictive than vault (e.g., vault=Editor, folder=Viewer)
- AC-022.4: Items inside folder inherit folder ACL

#### US-023 [P1, B] Item-Level Override
**As a** Manager
**I want to** restrict a specific item
**So that** high-risk items have tighter control

**Acceptance:**
- AC-023.1: Item share modal → "Override default permissions"
- AC-023.2: Can set per-principal permissions atomically (see FR-031)
- AC-023.3: Item shows "Custom permissions" badge if overridden

#### US-024 [P0, A] Revoke User Access
**As an** admin
**I want to** remove a user from org
**So that** they can no longer access secrets

**Acceptance:**
- AC-024.1: Members page → user → "Remove from workspace"
- AC-024.2: Confirmation: "This will revoke all access. Continue?"
- AC-024.3: User immediately logged out from all sessions
- AC-024.4: Phase A-B: access revoked via DB (user can't authenticate)
- AC-024.5: Phase C+: vault keys rotated, all items re-encrypted (background job)
- AC-024.6: Audit log: `member.remove` + `vault.rotate_keys` per affected vault

---

### Epic 4: One-Time Send

#### US-030 [P0, A] Send One-Time Secret from Item
**As an** item owner
**I want to** send a secret to external email
**So that** they can use it without an account

**Acceptance:**
- AC-030.1: Item detail → "📤 Send one-time copy"
- AC-030.2: Modal: recipient email (optional lock), TTL (5min/1h/1d/7d), max views (1-5), passphrase (optional)
- AC-030.3: Choose which fields to send (password / username / TOTP / notes — at least one required)
- AC-030.4: System generates URL: `https://vault.iux24.com/s/{token}#{key}`
- AC-030.5: Key in URL fragment is NOT sent to server (verified)
- AC-030.6: Optional: notify sender when viewed (email)

#### US-031 [P0, A] Receive & View One-Time Secret
**As an** external recipient
**I want to** open the URL and see the secret
**So that** I can use it

**Acceptance:**
- AC-031.1: Open `/s/{token}` → page shows sender, expiration info, warning, "Reveal Secret" button
- AC-031.2: Click "Reveal" → fetch ciphertext (auth: email if locked, passphrase if set)
- AC-031.3: Decrypt locally → display secret in copy-friendly format
- AC-031.4: Server marks as viewed; on max_views reached → burned (deleted)
- AC-031.5: URL fragment stripped from history (`history.replaceState`)
- AC-031.6: After 2 minutes idle on revealed page → secret cleared from DOM

#### US-032 [P0, A] Reveal Guard Against Bots
**As a** sender
**I want to** prevent link-preview bots from burning my one-time secret
**So that** the recipient actually gets to see it

**Acceptance:**
- AC-032.1: Initial `/s/{token}` page shows generic info only (no ciphertext fetch)
- AC-032.2: Ciphertext fetched ONLY after explicit user click on "Reveal Secret"
- AC-032.3: Slack/LINE/Discord link preview bots do NOT trigger burn (verified manually)
- AC-032.4: First request from same IP within 1s of `link-share` activity gets non-burn variant (heuristic)

#### US-033 [P1, B] Manage Active Sends
**As a** sender
**I want to** see and revoke my active sends
**So that** I can burn early if I made mistake

**Acceptance:**
- AC-033.1: `/sends` page lists my active sends
- AC-033.2: Each row: recipient, item source, TTL remaining, views left, status
- AC-033.3: "Burn now" button → immediate deletion + audit

---

### Epic 5: Audit & Compliance

#### US-040 [P0, A] View Audit Log
**As an** admin
**I want to** see all actions taken in the workspace
**So that** I can investigate incidents

**Acceptance:**
- AC-040.1: `/audit` page (admin only)
- AC-040.2: Table columns: time, actor, action, target, IP (hashed)
- AC-040.3: Filter by: actor, action type, date range, target type
- AC-040.4: Pagination (50 events per page)
- AC-040.5: Export to CSV (UTF-8 with BOM for Excel/Thai chars)
- AC-040.6: Retention: 1 year Phase A, 3 years Phase B+

#### US-041 [P1, B] User Sees Own Activity
**As a** user
**I want to** see my own login & action history
**So that** I can spot unauthorized access

**Acceptance:**
- AC-041.1: Settings → "My Activity"
- AC-041.2: Shows last 90 days of own logins + items accessed
- AC-041.3: "Was this you?" prompt on unrecognized devices

---

### Epic 6: Power User Features

#### US-050 [P0, A] Import from 1Password
**As a** new user migrating
**I want to** import my 1Password vault
**So that** I don't manually re-enter 200 credentials

**Acceptance:**
- AC-050.1: `/import` wizard supports `.1pux` upload
- AC-050.2: Field mapping auto-detected from 1Password schema
- AC-050.3: Preview shows first 50 items before commit
- AC-050.4: Choose target vault/folder + conflict policy (skip / overwrite / append "(2)")
- AC-050.5: Progress bar during import
- AC-050.6: Result: N created, M skipped, E errors with downloadable error report

#### US-051 [P0, A] Import from CSV
**As a** user from LastPass/Chrome
**I want to** import via CSV
**So that** I'm not locked to specific tools

**Acceptance:**
- AC-051.1: Upload generic CSV
- AC-051.2: User maps CSV columns to vault fields
- AC-051.3: Preview + commit same as 1Password import
- AC-051.4: Supports Chrome export, LastPass export, custom CSV

#### US-052 [P0, A] Bulk Share
**As an** admin onboarding a new team member
**I want to** share 50 items at once
**So that** I save 49 clicks

**Acceptance:**
- AC-052.1: Item list → checkbox column
- AC-052.2: Select All / Select Page / Select Filtered options
- AC-052.3: Floating action bar: "X selected · [Share] [Move] [Tag] [Delete]"
- AC-052.4: Bulk share opens single modal, applies to all
- AC-052.5: Operation atomic; reports skipped count if some lacked permission

#### US-053 [P0, B] Use CLI to Retrieve Secret
**As a** developer in CI/CD
**I want to** fetch secret from terminal
**So that** I don't hardcode in `.env`

**Acceptance:**
- AC-053.1: Install: `brew install woxa-cli` or `curl https://woxa.iux24.com/install.sh | sh`
- AC-053.2: `woxa login` → OAuth device flow → token stored in OS keychain
- AC-053.3: `woxa get production/stripe-key` → prints password to stdout
- AC-053.4: `woxa get NAME --field totp` for specific field
- AC-053.5: `woxa get NAME --format json` for structured output
- AC-053.6: Service tokens supported via `WOXA_TOKEN` env var

#### US-054 [P0, B] Create Service Token for CI
**As an** admin
**I want to** create a non-human credential
**So that** GitHub Actions can read secrets without user auth

**Acceptance:**
- AC-054.1: Settings → Service Tokens → "+ New"
- AC-054.2: Name, scope (items/vault path/tag), permissions (read only v1), IP allowlist, expiration
- AC-054.3: Token shown ONCE after creation (copy-only)
- AC-054.4: Format: `woxa_<env>_<base62-36>` (env=live/test)
- AC-054.5: Usage chart (calls/day, last IP, last seen)
- AC-054.6: Rotate button → zero-downtime overlap window (7 days)
- AC-054.7: Revoke immediately invalidates

#### US-055 [P0, B] Use Browser Extension to Autofill
**As a** user
**I want to** click in password field and have it auto-filled
**So that** I never type passwords manually

**Acceptance:**
- AC-055.1: Install Woxa Vault from Chrome Web Store / Firefox Add-ons
- AC-055.2: Sign in inside extension (uses same OAuth as web)
- AC-055.3: When visiting site, extension matches by URL
- AC-055.4: Floating dropdown appears on password field with matched items
- AC-055.5: Click match → username + password filled
- AC-055.6: `Cmd+Shift+L` triggers fill manually
- AC-055.7: `Cmd+Shift+F` opens quick search popup
- AC-055.8: Auto-lock after 15 minutes idle

---

### Epic 7: Lifecycle & Governance (Phase C+)

#### US-060 [P1, C] Track Password Rotation
**As an** admin
**I want to** know which credentials are stale
**So that** we meet compliance (AWS keys < 90d)

**Acceptance:**
- AC-060.1: Item edit form has "Rotation policy: every N days" (org default applies)
- AC-060.2: Dashboard widget: "12 secrets need rotation"
- AC-060.3: Each item shows badge: 🟢 Fresh / 🟡 Due in N days / 🔴 Overdue
- AC-060.4: Weekly email digest of overdue items to owners
- AC-060.5: Editing password resets `password_changed_at`

#### US-061 [P1, C] Request Access to Item
**As a** junior dev
**I want to** request access to AWS Prod credentials
**So that** I don't message senior in Slack

**Acceptance:**
- AC-061.1: User sees item name (metadata) without view_password permission
- AC-061.2: "Request Access" button → modal: requested role, duration, reason
- AC-061.3: Notification to vault Managers
- AC-061.4: Approver UI: Approve / Deny / Counter-offer / Ask Clarification
- AC-061.5: Auto-deny after 7 days pending
- AC-061.6: Granted access auto-expires per duration

#### US-062 [P1, D] Invite External Auditor
**As an** admin during SOC 2 audit
**I want to** invite external auditor with metadata-only access
**So that** they verify controls without seeing secrets

**Acceptance:**
- AC-062.1: Members → Invite → Role: "Auditor"
- AC-062.2: Access window: max 30 days (configurable)
- AC-062.3: Auditor sees: item names, vault structure, who-can-access, audit log
- AC-062.4: Auditor blocked from viewing item passwords (server-side enforced)
- AC-062.5: All auditor views logged separately

#### US-063 [P1, D] Generate Compliance Report
**As an** admin preparing for audit
**I want to** export an access matrix
**So that** I show auditor "who has access to what"

**Acceptance:**
- AC-063.1: Reports page → choose template (SOC 2 Access Matrix / SOC 2 Change Log / PDPA / Custom)
- AC-063.2: Date range + filters
- AC-063.3: Generate PDF with org branding, signed
- AC-063.4: Download or email

#### US-064 [P1, D] Designate Emergency Contacts
**As an** owner
**I want to** appoint 2-3 trusted users
**So that** access can be recovered if I'm unavailable

**Acceptance:**
- AC-064.1: Settings → Security → Emergency Access
- AC-064.2: Add up to 3 contacts, threshold M of N (default 2 of 3)
- AC-064.3: Cooldown configurable (default 48h)
- AC-064.4: Contacts receive notification of designation
- AC-064.5: Original owner can revoke designation anytime

---

## 4. Functional Requirements

### 4.1 Authentication

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-001 | System SHALL support Google Workspace OAuth 2.0 sign-in | 🔴 P0 | A |
| FR-002 | OAuth flow SHALL include `hd=<domain>` parameter for hosted domain restriction | 🔴 P0 | A |
| FR-003 | System SHALL verify `hd` claim from ID token server-side | 🔴 P0 | A |
| FR-004 | System SHALL support email + master password fallback (Argon2id) | 🔴 P0 | A |
| FR-005 | System SHALL support TOTP 2FA (RFC 6238) | 🔴 P0 | A |
| FR-006 | System SHALL support WebAuthn / Passkey | 🟠 P1 | A |
| FR-007 | System SHALL generate 10 single-use backup codes when 2FA enabled | 🔴 P0 | A |
| FR-008 | System SHALL lock account after 5 failed login attempts for 15 minutes | 🔴 P0 | A |
| FR-009 | System SHALL force 2FA enrollment when org policy `require_2fa` enabled | 🟠 P1 | A |
| FR-010 | System SHALL send login alert email on new device fingerprint | 🟠 P1 | A |

### 4.2 Workspace & Organization

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-020 | First user signup SHALL trigger workspace setup wizard | 🔴 P0 | A |
| FR-021 | System SHALL support multiple allowed domains per workspace | 🔴 P0 | A |
| FR-022 | Domain verification SHALL use TXT record method | 🔴 P0 | A |
| FR-023 | System SHALL support JIT user provisioning for verified domains | 🔴 P0 | A |
| FR-024 | System SHALL support manual invitation with signed link (7-day expiry) | 🔴 P0 | A |
| FR-025 | Users SHALL be able to belong to multiple workspaces | 🟠 P1 | A |
| FR-026 | System SHALL sync Google Groups → Woxa Teams every 15 minutes | 🟠 P1 | B |

### 4.3 Vault & Items

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-030 | System SHALL support 6 item types: Login, API Key, SSH Key, Secure Note, Card, Identity | 🔴 P0 | A (Login), B (rest) |
| FR-031 | System SHALL support granular permission atoms: view_metadata, view_password, copy_password, view_totp, edit_metadata, edit_password, share, delete, manage_access, export | 🟠 P1 | B |
| FR-032 | System SHALL support folders nested up to 3 levels | 🔴 P0 | A |
| FR-033 | Item data SHALL be encrypted with AES-256-GCM | 🔴 P0 | A |
| FR-034 | Phase A-B: server-side envelope encryption with KMS-wrapped DEK | 🔴 P0 | A |
| FR-035 | Phase C+: client-side zero-knowledge encryption | 🟠 P1 | C |
| FR-036 | Soft delete SHALL retain item in Trash for 30 days | 🔴 P0 | A |
| FR-037 | System SHALL maintain item version history (last 10 versions) | 🟠 P1 | B |
| FR-038 | System SHALL support file attachments encrypted, max 25MB | 🟠 P1 | B |
| FR-039 | System SHALL track `password_changed_at` and rotation policy per item | 🟠 P1 | C |

### 4.4 Search & Discovery

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-040 | System SHALL provide universal search via Cmd+K (Ctrl+K on Windows/Linux) | 🔴 P0 | A |
| FR-041 | Search SHALL match across: name, URL, username, tags (fuzzy) | 🔴 P0 | A |
| FR-042 | Search results SHALL return in <100ms for 1000 items (P95) | 🔴 P0 | A |
| FR-043 | Phase C+: Search SHALL use blind index (HMAC) in zero-knowledge mode | 🟠 P1 | C |

### 4.5 Sharing & Access Control

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-050 | Access SHALL be assignable at: org, team, vault, folder, item level | 🔴 P0 | A (org, vault), B (team, folder, item) |
| FR-051 | Access resolution: item override > folder > vault > team > org (most specific wins) | 🟠 P1 | B |
| FR-052 | Sharing SHALL support optional expiration | 🟠 P1 | A |
| FR-053 | System SHALL show "Who can access" with reasoning trace | 🟠 P1 | B |

### 4.6 One-Time Send

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-060 | Send SHALL be created from item OR standalone | 🔴 P0 | A |
| FR-061 | Send SHALL support: TTL (5min-7d), max views (1-5), optional passphrase, optional email lock | 🔴 P0 | A |
| FR-062 | Encryption key SHALL be in URL fragment (not sent to server) | 🔴 P0 | A |
| FR-063 | Recipient view SHALL have "Reveal" guard against bots | 🔴 P0 | A |
| FR-064 | Server SHALL atomically decrement view count and burn on last view | 🔴 P0 | A |
| FR-065 | Sender SHALL be notified on view (if enabled) | 🟠 P1 | B |

### 4.7 Audit & Logging

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-070 | System SHALL log all events: auth, item.*, vault.*, send.*, member.*, sso.*, service_token.* | 🔴 P0 | A |
| FR-071 | Audit log SHALL NEVER contain decrypted content | 🔴 P0 | A |
| FR-072 | Audit log SHALL include: timestamp, actor, action, target, IP hash, user agent | 🔴 P0 | A |
| FR-073 | Admin SHALL be able to filter audit log by actor, action, date | 🔴 P0 | A |
| FR-074 | System SHALL support CSV export of audit log | 🔴 P0 | A |
| FR-075 | Audit retention SHALL be: 1 year (Phase A), 3 years (Phase B+) | 🔴 P0 | A |
| FR-076 | System SHALL stream audit events to SIEM (Phase D) | 🟡 P2 | D |

### 4.8 Import & Export

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-080 | System SHALL import from: 1Password (1pux), Bitwarden (JSON), LastPass (CSV), Chrome (CSV), generic CSV | 🔴 P0 | A |
| FR-081 | Import SHALL support dry-run preview before commit | 🔴 P0 | A |
| FR-082 | Import SHALL support conflict policy: skip, overwrite, append "(2)" | 🔴 P0 | A |
| FR-083 | System SHALL export to: Encrypted JSON (Woxa native), 1Password-compatible, Bitwarden JSON | 🟠 P1 | B |
| FR-084 | Export SHALL require master password re-authentication | 🔴 P0 | B |
| FR-085 | Export SHALL notify all admins with 5-minute delay window for cancel | 🟠 P1 | B |

### 4.9 Service Tokens & CLI

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-090 | System SHALL support service tokens for non-human auth | 🔴 P0 | B |
| FR-091 | Token SHALL be scopable to: specific items, vault+folder pattern, tag | 🔴 P0 | B |
| FR-092 | Token SHALL support IP allowlist (CIDR) | 🟠 P1 | B |
| FR-093 | Token SHALL have mandatory expiration (max 1 year, default 90 days) | 🔴 P0 | B |
| FR-094 | Token SHALL support zero-downtime rotation with 7-day overlap | 🟠 P1 | B |
| FR-095 | CLI SHALL support: login, logout, list, get, send, env get | 🔴 P0 | B |
| FR-096 | CLI SHALL store refresh token in OS keychain | 🔴 P0 | B |

### 4.10 Browser Extension

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-100 | Extension SHALL support Chrome, Firefox, Edge (Manifest V3) | 🔴 P0 | B |
| FR-101 | Extension SHALL detect login forms automatically | 🔴 P0 | B |
| FR-102 | Extension SHALL match items by URL domain | 🔴 P0 | B |
| FR-103 | Extension SHALL auto-lock after 15 minutes idle | 🔴 P0 | B |
| FR-104 | Extension SHALL support shortcut Cmd+Shift+L (fill), Cmd+Shift+F (search) | 🟠 P1 | B |
| FR-105 | Phase D: Extension SHALL offer to save new credentials | 🟡 P2 | D |
| FR-106 | Phase D: Extension SHALL include password generator | 🟡 P2 | D |

### 4.11 Encryption & Security

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-110 | System SHALL use AES-256-GCM for symmetric encryption | 🔴 P0 | A |
| FR-111 | System SHALL use X25519 for key exchange (Phase C+) | 🔴 P0 | C |
| FR-112 | System SHALL use Argon2id for password-based KDF (params: t=3, m=64MB, p=4) | 🔴 P0 | A |
| FR-113 | System SHALL use Web Crypto API (no JS crypto library) | 🔴 P0 | A |
| FR-114 | TLS 1.3 only; older versions rejected | 🔴 P0 | A |
| FR-115 | HSTS preload enabled | 🔴 P0 | A |
| FR-116 | Strict CSP, no inline scripts | 🔴 P0 | A |
| FR-117 | Phase C+: master password NEVER transmitted to server | 🔴 P0 | C |

### 4.12 Anomaly Detection (Phase D)

| ID | Requirement | Priority | Phase |
|---|---|---|---|
| FR-120 | System SHALL compute user behavior baseline (30-day rolling) | 🟡 P2 | D |
| FR-121 | System SHALL alert on: 10× normal volume, new geo, off-hours, failed 2FA spike | 🟡 P2 | D |
| FR-122 | System SHALL auto-lock account on critical anomalies | 🟡 P2 | D |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement | Target | Measurement |
|---|---|---|---|
| NFR-001 | Login latency | < 1 second P95 | APM (Datadog/Grafana) |
| NFR-002 | Search latency | < 100ms P95 for 1000 items | Browser timing |
| NFR-003 | Item detail load | < 300ms P95 | APM |
| NFR-004 | Encrypt/decrypt 1MB | < 100ms on mid-range laptop | Benchmark |
| NFR-005 | Cold start (first item) | < 2 seconds | Lighthouse |
| NFR-006 | Time to interactive | < 3 seconds on 3G | Lighthouse |
| NFR-007 | API throughput | 1000 req/s/instance | Load test (k6) |

### 5.2 Scalability

| ID | Requirement | Target |
|---|---|---|
| NFR-010 | Support orgs with up to 10,000 users | DB indexes + query optimization |
| NFR-011 | Support vaults with up to 10,000 items | Cursor pagination, no offset |
| NFR-012 | Support 100 concurrent logins per org | Redis rate limit |
| NFR-013 | Background jobs scale horizontally | BullMQ + multiple workers |

### 5.3 Availability

| ID | Requirement | Target |
|---|---|---|
| NFR-020 | Uptime SLA | 99.9% (43min/month downtime budget) |
| NFR-021 | Disaster recovery RPO | 1 hour (hourly Postgres snapshot) |
| NFR-022 | Disaster recovery RTO | 4 hours |
| NFR-023 | Backup retention | 30 days hourly, 1 year daily |
| NFR-024 | Multi-region failover (Enterprise tier, Phase D) | < 5 min |

### 5.4 Security

| ID | Requirement |
|---|---|
| NFR-030 | OWASP Top 10 compliance |
| NFR-031 | All data encrypted in transit (TLS 1.3) and at rest (DB encryption + KMS) |
| NFR-032 | Zero-knowledge architecture by Phase C (audit-verifiable) |
| NFR-033 | External penetration test before public launch |
| NFR-034 | Dependency scanning (Snyk/Dependabot) blocks PRs with high vulns |
| NFR-035 | Secret scanning (gitleaks) in CI |
| NFR-036 | SOC 2 Type I audit started by end of Phase D |

### 5.5 Privacy

| ID | Requirement |
|---|---|
| NFR-040 | PDPA compliance (Thai users) |
| NFR-041 | GDPR compliance (if EU users) |
| NFR-042 | Right to erasure: user delete → crypto-shred user keys |
| NFR-043 | Data residency option: deploy in Thai or Singapore region |
| NFR-044 | Sub-processor list maintained and DPA in place |

### 5.6 Usability

| ID | Requirement | Target |
|---|---|---|
| NFR-050 | WCAG 2.1 AA compliance | Axe scan in CI |
| NFR-051 | Keyboard navigation for all primary flows | Manual QA |
| NFR-052 | Mobile responsive: 320px to 4K | Visual regression test |
| NFR-053 | Browser support: Chrome 100+, Firefox 100+, Safari 15+, Edge 100+ | Browserslist config |
| NFR-054 | Language support: English + Thai | i18n with English fallback |
| NFR-055 | Onboarding time-to-first-item | < 5 minutes |

### 5.7 Maintainability

| ID | Requirement |
|---|---|
| NFR-060 | Code coverage > 70% for backend, > 60% for frontend |
| NFR-061 | TypeScript strict mode |
| NFR-062 | ESLint + Prettier enforced |
| NFR-063 | Architecture Decision Records (ADRs) for major decisions |
| NFR-064 | Migration up + down for every DB change |
| NFR-065 | All public functions have JSDoc / type hints |

### 5.8 Observability

| ID | Requirement |
|---|---|
| NFR-070 | Structured logging (JSON) with correlation IDs |
| NFR-071 | Error tracking (Sentry) with source maps |
| NFR-072 | APM (Datadog or Grafana Tempo) for traces |
| NFR-073 | Custom metrics: items_per_org, logins_per_day, encrypts_per_min |
| NFR-074 | Status page (Better Stack) public |
| NFR-075 | PagerDuty on-call rotation |

---

## 6. Data Model Summary

> 📐 **Full schema in [DESIGN.md §7](./DESIGN.md#7-database-schema)**

### Core Entities
- `organizations` — workspace tenant
- `users` — global user identity
- `org_members` — junction with role
- `teams`, `team_members`
- `vaults`, `folders`, `items`
- `item_versions`, `attachments`
- `vault_access`, `item_access_overrides`
- `one_time_sends`
- `audit_logs`
- `sessions`, `service_tokens`
- `invitations`, `access_requests` (Phase C)
- `emergency_contacts` (Phase D)
- `user_behavior_baseline` (Phase D)

### Key Relationships
```
organizations 1—N org_members N—1 users
organizations 1—N vaults 1—N folders 1—N items
items 1—N item_versions
vaults 1—N vault_access N—1 (users | teams | domains)
items 1—N item_access_overrides
items 1—N one_time_sends
users 1—N sessions
```

---

## 7. API Contracts

> 📐 **Full endpoint list in [DESIGN.md §9](./DESIGN.md#9-api-design-high-level)**

### REST Conventions
- Base path: `/api/v1`
- Auth: `Authorization: Bearer <jwt>` OR `Authorization: ServiceToken <token>`
- Content-Type: `application/json`
- Errors: RFC 7807 Problem Details
  ```json
  {
    "type": "https://woxa.iux24.com/errors/insufficient-permission",
    "title": "Insufficient permission",
    "status": 403,
    "detail": "You need 'view_password' on item X",
    "instance": "/api/v1/items/uuid"
  }
  ```
- Pagination: cursor-based with `?cursor=&limit=`
- Timestamps: ISO 8601 with timezone
- IDs: UUID v4 lowercased

### Rate Limits

| Endpoint | Limit | Window |
|---|---|---|
| `/auth/login` | 5 per IP | 15 min |
| `/auth/google/callback` | 10 per IP | 15 min |
| `/items` GET | 1000 per user | 1 hour |
| `/items` POST | 100 per user | 1 hour |
| `/s/:token` GET | 10 per IP+token | 5 min |
| `/sends` POST | 50 per user | 1 hour |
| Service token requests | 10,000 per token | 1 hour |
| Other | 600 per user | 1 hour |

### Sample Endpoints

```
POST   /api/v1/auth/google          { code, state }
GET    /api/v1/auth/google/callback?code=&state=
POST   /api/v1/auth/refresh         (cookie-based)
POST   /api/v1/auth/logout

GET    /api/v1/me
GET    /api/v1/me/orgs
GET    /api/v1/me/sessions
DELETE /api/v1/me/sessions/:id

POST   /api/v1/organizations
PATCH  /api/v1/organizations/:id/settings
POST   /api/v1/organizations/:id/domains
POST   /api/v1/organizations/:id/domains/:domain/verify

GET    /api/v1/vaults
POST   /api/v1/vaults
GET    /api/v1/vaults/:id
PATCH  /api/v1/vaults/:id
DELETE /api/v1/vaults/:id

GET    /api/v1/vaults/:id/items?folder=&search=&type=&cursor=
POST   /api/v1/vaults/:id/items
GET    /api/v1/items/:id
PATCH  /api/v1/items/:id
DELETE /api/v1/items/:id
POST   /api/v1/items/:id/restore
GET    /api/v1/items/:id/versions
POST   /api/v1/items/:id/audit     { action }

POST   /api/v1/items/bulk          { action, item_ids[], payload }

POST   /api/v1/sends
GET    /api/v1/sends
DELETE /api/v1/sends/:id

GET    /api/v1/s/:token            (public)
POST   /api/v1/s/:token/burn       (public)

GET    /api/v1/audit?actor=&action=&from=&to=&cursor=
GET    /api/v1/audit/export        → CSV

GET    /api/v1/members
POST   /api/v1/invitations
DELETE /api/v1/members/:user_id

POST   /api/v1/service-tokens
GET    /api/v1/service-tokens
DELETE /api/v1/service-tokens/:id
POST   /api/v1/service-tokens/:id/rotate

POST   /api/v1/imports
GET    /api/v1/imports/:job_id

POST   /api/v1/access-requests
GET    /api/v1/access-requests?status=
POST   /api/v1/access-requests/:id/approve
POST   /api/v1/access-requests/:id/deny
```

---

## 8. UI/UX Requirements

### 8.1 Pages (must exist by Phase A end)

| Path | Role Required | Description |
|---|---|---|
| `/` | any logged in | Dashboard (item list) |
| `/welcome` | none | Email-first workspace discovery |
| `/login` | none | Sign-in page |
| `/auth/callback` | none | OAuth callback handler |
| `/setup-password` | authenticated, no password | Set master password + recovery kit (SSO JIT) |
| `/spaces` | authenticated | Post-auth create-or-join workspace (creator → Owner) |
| `/setup` | unauthenticated | Workspace setup wizard |
| `/vault/:id` | member | Vault view |
| `/item/:id` | view permission | Item detail |
| `/import` | member | Import wizard |
| `/sends` | member | My active sends |
| `/sends/new` | member | Standalone send creation |
| `/s/:token` | public | Recipient one-time view |
| `/members` | admin | Member management |
| `/teams` | admin | Team management |
| `/audit` | admin | Audit log viewer |
| `/settings` | self | User settings (profile, sessions) |
| `/settings/security` | self | 2FA, Passkey, backup codes |
| `/settings/sso` | admin | SSO + domain config |
| `/settings/service-tokens` | admin | Service tokens |
| `/settings/policy` | admin | Org security policy |

### 8.2 Design System
- Dark mode default, light mode toggle
- Color tokens defined in [DESIGN.md §8.4](./DESIGN.md#8-ui--ux-design)
- Typography: Inter (UI), JetBrains Mono (passwords/keys)
- Spacing scale: 4/8/16/24/32px
- Border radius: 8px cards, 6px buttons, 4px badges

### 8.3 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+K` / `Ctrl+K` | Open universal search |
| `/` | Focus search in list views |
| `c` | Copy password (on item detail) |
| `r` | Reveal password (on item detail) |
| `e` | Edit current item |
| `s` | Share current item |
| `Esc` | Close modal / blur input |
| `1-9` | Jump to vault by index |

### 8.4 Accessibility
- All interactive elements keyboard-reachable
- ARIA labels on icon-only buttons
- Focus visible on keyboard navigation
- Color contrast WCAG AA (4.5:1 for text, 3:1 for large text)
- Screen reader tested (NVDA/VoiceOver) for primary flows

---

## 9. Tech Stack (Decisions)

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | SvelteKit + TypeScript + Tailwind | Lightweight, fast HMR, team familiar |
| Backend | Hono + TypeScript (Node.js 20+) | Fast iteration, edge-ready |
| Database | PostgreSQL 16 | JSONB, RLS, generated columns |
| ORM | Drizzle ORM | Type-safe, lightweight, no codegen |
| Auth helper | Lucia v3 + custom OAuth | Session + 2FA support |
| Cache / Queue | Redis 7 | Rate limit, session, BullMQ |
| Object storage | Cloudflare R2 | S3-compatible, no egress fees |
| KMS | AWS KMS (prod), HashiCorp Vault (dev) | Envelope encryption |
| Email | Resend | Transactional, good DX |
| Crypto | Web Crypto API (browser), Node's `crypto` (server) | Audited, native |
| CLI | Rust + Cargo | Cross-platform, fast |
| Browser ext | TypeScript + Svelte (popup) + Vite | Manifest V3 |
| Infra | Cloudflare (WAF) + Fly.io (compute) + Neon (postgres) | Simple ops |
| CI/CD | GitHub Actions | Standard |
| Monitoring | Sentry + Grafana Cloud (Loki + Tempo + Prometheus) | Unified |

---

## 10. Constraints & Assumptions

### Constraints
- Budget: ~$2k/month infrastructure target Phase A; scales with usage
- Team: 2 backend + 1 frontend + 1 designer + 0.5 SRE
- Compliance: PDPA Thailand required; GDPR if EU customers; SOC 2 Phase D
- Browser support: latest 2 versions of Chrome/Firefox/Safari/Edge

### Assumptions
- Initial users on Google Workspace (iux24.com)
- Mobile is web-responsive; native app is Phase D
- Self-hosting NOT supported for v1 (cloud-only)
- English UI first, Thai i18n added Phase B

---

## 11. Out of Scope (Explicit OOS)

| ID | Item | Reason | Maybe Future |
|---|---|---|---|
| OOS-001 | Self-hosted / on-premise | High support cost | Phase D Enterprise |
| OOS-002 | Native mobile apps | Web-responsive sufficient initially | Phase D |
| OOS-003 | Cross-org sharing (between Woxa orgs) | Complex UX, low demand | TBD |
| OOS-004 | Internal messenger / chat | Not our domain | Never |
| OOS-005 | Document collaboration | Not our domain | Never |
| OOS-006 | Free tier with unlimited users | Business sustainability | Phase D pricing |
| OOS-007 | KeePass `.kdbx` import | Low user count | If requested |
| OOS-008 | Apple Passwords import | Easy CSV path exists | Phase D nice-to-have |
| OOS-009 | Yubikey hardware tokens | WebAuthn covers this | Already via Passkey |
| OOS-010 | SAML 2.0 (Okta/OneLogin) | Google Workspace covers iux24 | Phase D Enterprise |

---

## 12. Acceptance Criteria per Phase

### Phase 0 (Foundation) — Week 1
- [ ] `pnpm install && pnpm dev` works on fresh clone in < 15 min
- [ ] CI pipeline passes (lint, typecheck, test, build)
- [ ] DB migrations apply + seed loads sample data
- [ ] Storybook shows base components (Button, Input, Card, Badge, Modal, Toast)
- [ ] Production deployment skeleton (empty homepage on real domain)

### Phase A (MVP) — Week 7
- [ ] All US-001 through US-052 acceptance criteria met
- [ ] FR-001 through FR-085 implemented (where Phase=A)
- [ ] All NFR P0 met (performance, security)
- [ ] Internal team of 5+ users actively using
- [ ] 100+ items imported from existing tools
- [ ] Zero P0/P1 bugs open

### Phase B (Daily Use) — Week 14
- [ ] All US-053, US-054, US-055 + B-tier US-021 through US-041 met
- [ ] Browser extension installed by 80% of internal users
- [ ] First production service token in use (e.g., GitHub Actions)
- [ ] CLI installable via Homebrew
- [ ] Audit log streaming to staging SIEM

### Phase C (Zero-Knowledge) — Week 20
- [ ] All zero-knowledge requirements (FR-035, FR-117, NFR-032) verified by network inspection
- [ ] External penetration test report: 0 critical/high findings (or all fixed)
- [ ] US-060, US-061 (rotation reminders, permission request) shipped
- [ ] Migration tool successfully migrates internal data with 0 loss

### Phase D (Enterprise) — Week 28+
- [ ] SCIM provisioning verified with Google Workspace
- [ ] US-062, US-063, US-064 (auditor role, compliance reports, break-glass) shipped
- [ ] Mobile apps live in App Store + Play Store
- [ ] SOC 2 Type I audit started
- [ ] First external enterprise customer signed

---

## 13. Risks & Mitigations

> 📐 **Full risk register in [PHASES.md](./PHASES.md#-risks-register-live)**

Top 5 risks to be aware of:
1. **Google OAuth consent review delay** — Apply Day 1 with minimal scopes
2. **Internal users stick to Slack** — Aggressive UX + leadership mandate + browser ext early
3. **Zero-knowledge migration data loss** — 30-day rollback retention; staged rollout
4. **Browser extension store review delays** — Submit beta to Chrome Web Store at sprint start
5. **Pen test critical finding post-launch** — Schedule for end of Phase C, fix before GA

---

## 14. Open Questions

> ❓ Items needing decision before/during implementation:

| # | Question | Owner | Needed by |
|---|---|---|---|
| Q1 | KMS provider: AWS KMS vs HashiCorp Vault (self-hosted)? | @infra | Sprint A2 |
| Q2 | Email provider: Resend vs AWS SES? | @backend | Sprint A1 |
| Q3 | Hosting: Fly.io vs AWS ECS vs Cloudflare Workers? | @infra | Sprint 0.1 |
| Q4 | Pricing model for external customers? | @product | Phase B |
| Q5 | Mobile: React Native vs Flutter vs Native? | @frontend | Sprint D5 |
| Q6 | Should we support shared TOTP from start? | @product | Sprint A3 |
| Q7 | Browser extension distribution: store-first or self-hosted-first for internal? | @product | Sprint B7 |
| Q8 | Recovery kit format: PDF + paper vs QR code only? | @product | Sprint C6 |

---

## 15. Glossary

> 📐 **Full glossary in [DESIGN.md Appendix B](./DESIGN.md#appendix-b-glossary)**

Key terms for this doc:
- **JIT Provisioning** — Auto-create user account on first SSO login
- **DEK** — Data Encryption Key (per-item)
- **KEK** — Key Encryption Key (in KMS, wraps DEKs)
- **Blind Index** — HMAC of plaintext for search without decryption
- **Burn** — Irreversibly delete after first read
- **Service Token** — Non-human credential for CI/CD
- **Wrap / Unwrap** — Encrypt / decrypt a key with another key

---

## 16. Sign-Off

> Approval required before development begins:

| Role | Name | Sign-off | Date |
|---|---|---|---|
| Product Owner | ching@iux24.com | ☐ | |
| Engineering Lead | _TBD_ | ☐ | |
| Security Reviewer | _TBD_ | ☐ | |
| Design Lead | _TBD_ | ☐ | |

---

**END OF REQUIREMENTS**

📐 Next: [PRP.md](./PRP.md) for implementation execution plan
