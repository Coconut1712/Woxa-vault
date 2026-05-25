# 🗺 Woxa Secret Vault — Implementation Roadmap

> 📌 **Companion to:** [DESIGN.md](./DESIGN.md) · [README.md](./README.md)
> Re-prioritized 2026-05-12 based on real-usage gap review

---

## 📋 Properties

| | |
|---|---|
| 🏷 **Status** | 🟡 Planning · approval pending |
| 📅 **Total duration** | ~28 weeks (≈ 7 months) |
| 👥 **Team size assumed** | 2 backend + 1 frontend + 1 designer + 0.5 SRE |
| 🎯 **Definition of "done"** | Phase D complete + SOC 2 Type I started |
| 🔄 **Cadence** | 1 sprint = 1 week (5 working days) |

---

## 🎯 Phase Re-Prioritization (v0.2)

> 💡 **What changed from v0.1**
> ตาม [usage review](./README.md) เราย้าย 4 อย่างที่ P0 ขึ้นมา:
> 1. 📥 **Import wizard** → Phase A (เดิมไม่มี)
> 2. 🔄 **Bulk operations** → Phase A (เดิมไม่มี)
> 3. 🔌 **Service tokens + CLI** → Phase B (เดิม Phase D)
> 4. 🧩 **Browser extension MVP** → Phase B (เดิม Phase D)
>
> เพิ่ม P1 features ที่ Phase C:
> 5. ⏰ **Password rotation reminders**
> 6. ✋ **Permission request workflow**
> 7. 👤 **Auditor role**
> 8. 🆘 **Break-glass / emergency access**

---

## 🗓 Timeline Visualization

```
Week   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23  24  25  26  27  28
       │
P0     ▓
P-A        ▓───▓───▓───▓───▓───▓
P-B                            ▓───▓───▓───▓───▓───▓───▓
P-C                                                    ▓───▓───▓───▓───▓───▓
P-D                                                                            ▓───▓───▓───▓───▓───▓───▓───▓ ...

         ▲                   ▲                       ▲                       ▲
         │                   │                       │                       │
         Foundation       Internal soft launch   Public beta             Zero-knowledge GA
         ready            (Phase A done)         (Phase B done)          (Phase C done)
         Wk 1             Wk 7                   Wk 14                   Wk 20
```

---

## 📊 Master Sprint Database

> 🗃 All sprints across all phases. Filter mentally by Phase column.

| Sprint | Phase | Wk | Days | Goal | Priority | Status |
|---|---|---|---|---|---|---|
| 0.1 | 0 | 1 | 5 | Repo, CI, schema, design system | 🔴 P0 | 🔘 Not started |
| A1 | A | 2 | 5 | Auth + Google SSO + Org bootstrap | 🔴 P0 | 🔘 Not started |
| A2 | A | 3 | 5 | Vault/Folder/Item models + KMS | 🔴 P0 | 🔘 Not started |
| A3 | A | 4 | 5 | Item UX: search, copy, TOTP | 🔴 P0 | 🔘 Not started |
| A4 | A | 5 | 5 | Sharing + 2FA + Sessions | 🔴 P0 | 🔘 Not started |
| **A5** | A | 6 | 3 | **📥 Import wizard (NEW)** | 🔴 P0 | 🔘 Not started |
| **A6** | A | 6 | 2 | **🔄 Bulk operations (NEW)** | 🔴 P0 | 🔘 Not started |
| A7 | A | 7 | 5 | Audit + Polish + Soft launch | 🔴 P0 | 🔘 Not started |
| B1 | B | 8 | 5 | Teams + role hierarchy | 🟠 P1 | 🔘 Not started |
| B2 | B | 9 | 5 | Google Groups → Teams sync | 🟠 P1 | 🔘 Not started |
| B3 | B | 10 | 5 | Folder/Item ACL + granular perms | 🟠 P1 | 🔘 Not started |
| B4 | B | 11 | 5 | All item types + attachments | 🟠 P1 | 🔘 Not started |
| B5 | B | 12 | 5 | One-time Send | 🟠 P1 | 🔘 Not started |
| **B6** | B | 13 | 5 | **🔌 Service tokens + CLI v1 (NEW)** | 🔴 P0 | 🔘 Not started |
| **B7** | B | 14 | 5 | **🧩 Browser extension v1 (NEW)** | 🔴 P0 | 🔘 Not started |
| C1 | C | 15 | 5 | Client crypto library | 🟠 P1 | 🔘 Not started |
| C2 | C | 16 | 5 | User keypair + master pw flow | 🟠 P1 | 🔘 Not started |
| C3 | C | 17 | 5 | Vault key wrapping | 🟠 P1 | 🔘 Not started |
| **C4** | C | 18 | 3 | **⏰ Password rotation + reminders (NEW)** | 🟠 P1 | 🔘 Not started |
| **C5** | C | 18 | 2 | **✋ Permission request workflow (NEW)** | 🟠 P1 | 🔘 Not started |
| C6 | C | 19 | 5 | Migration tool + Recovery Kit | 🟠 P1 | 🔘 Not started |
| C7 | C | 20 | 5 | Blind index + Pen test | 🟠 P1 | 🔘 Not started |
| D1 | D | 21 | 5 | SCIM 2.0 provisioning | 🟡 P2 | 🔘 Not started |
| D2 | D | 22 | 5 | Browser extension v2 (autofill+save) | 🟡 P2 | 🔘 Not started |
| **D3** | D | 23 | 3 | **👤 Auditor role + compliance reports (NEW)** | 🟠 P1 | 🔘 Not started |
| **D4** | D | 23 | 2 | **🆘 Break-glass / emergency access (NEW)** | 🟠 P1 | 🔘 Not started |
| D5 | D | 24-25 | 10 | Mobile apps (iOS + Android) | 🟡 P2 | 🔘 Not started |
| D6 | D | 26 | 5 | Desktop app (Tauri) | 🟡 P2 | 🔘 Not started |
| D7 | D | 27 | 5 | Anomaly detection + alerts | 🟡 P2 | 🔘 Not started |
| D8 | D | 28+ | 5+ | HSM + BYOK + SOC 2 prep | 🟡 P2 | 🔘 Not started |

> 🆕 marks sprints added based on usage review

---

# 🟦 Phase 0 — Foundation

> 📌 **Properties**
> ⏱ **Duration:** 1 week · 📅 **Week 1** · 🔴 **Priority:** P0
> 🎯 **Goal:** Skeleton ready · 🚦 **Exit criteria:** New dev can run locally in < 15min

<details>
<summary><strong>📋 Sprint 0.1 — Project Setup</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | Skeleton ready, all members can run locally, design system defined |
| 👤 Owner | @engineering-lead |
| 📅 Days | 5 |
| 🔗 Blocks | A1, A2, A3 |

### 🏗 Backend Tasks
- [ ] Monorepo (pnpm workspaces): `apps/web`, `apps/api`, `packages/shared`, `packages/crypto`
- [ ] Hono server skeleton + structured logging (pino)
- [ ] PostgreSQL 16 in Docker Compose (with init script)
- [ ] Drizzle ORM setup + first migration (empty schema)
- [ ] Health check endpoint `/healthz`
- [ ] OpenAPI spec generator (Hono OpenAPI plugin)

### 🎨 Frontend Tasks
- [ ] SvelteKit + TypeScript + Tailwind
- [ ] Design tokens from `DESIGN.md §8.4` (colors, spacing, radius)
- [ ] Base components: Button, Input, Card, Badge, Toast, Modal
- [ ] Storybook for component dev
- [ ] Layout shell with topbar + sidebar

### ⚙️ Infra Tasks
- [ ] GitHub Actions: lint, typecheck, test, build
- [ ] Preview deployments (Cloudflare Pages or Fly preview)
- [ ] Secret scanning (gitleaks pre-commit hook)
- [ ] `.env.example` with all needed vars
- [ ] Docker Compose for local: postgres, redis, mailcatcher

### 📚 Docs Tasks
- [ ] CONTRIBUTING.md with setup instructions
- [ ] `make` or `pnpm` scripts: `dev`, `test`, `migrate`, `seed`
- [ ] ADR (Architecture Decision Records) template

### ✅ Acceptance
- [ ] `git clone && pnpm i && pnpm dev` → working at `localhost:5173`
- [ ] CI passes on PR
- [ ] DB migrations apply cleanly
- [ ] Storybook shows 6 base components

### 🎬 Demo
1. Show `pnpm dev` starting full stack in < 30s
2. Open Storybook → walk through components
3. Show CI run on a sample PR

### ⚠️ Risks
- 🟡 Drizzle migration ergonomics — pin version v0.30+
- 🟢 Tailwind config drift — use `@layer` from day 1

</details>

---

# 🟢 Phase A — MVP for Real Use

> 📌 **Properties**
> ⏱ **Duration:** 6 weeks · 📅 **Weeks 2–7** · 🔴 **Priority:** P0
> 🎯 **Goal:** Internal iux24 team uses daily for real credentials
> 🚦 **Exit criteria:** 100+ items stored, 80% of team active, zero passwords in Slack

> 💡 **Why this scope:**
> หาก ship แค่ vault อย่างเดียวโดยไม่มี import/bulk → ทีมจะไม่ migrate มา (5 ปีของ password อยู่ใน 1Password ปัจจุบัน)

<details>
<summary><strong>🎯 Sprint A1 — Auth Foundation + Google Workspace SSO</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | User login via Google Workspace, restricted to allowed domain |
| 👤 Owner | @backend-lead |
| 🔗 Blocks | A2 (needs auth) · A3 |
| 🚨 Risk | Google OAuth consent review (apply Day 1) |

### 🏗 Backend Tasks
- [ ] Google OAuth setup (Cloud Console project, consent screen, credentials)
- [ ] `GET /auth/google` → redirect with `hd=iux24.com` parameter
- [ ] `GET /auth/google/callback` — verify ID token (`hd` claim, signature, `aud`)
- [ ] Domain allowlist check against `org_settings.allowed_domains`
- [ ] JIT provisioning — create user with default role from org policy
- [ ] Session: JWT access (15min) + refresh token (30d, httpOnly cookie, rotate on use)
- [ ] `POST /auth/login` (email + password fallback, Argon2id)
- [ ] `POST /auth/logout` + session revocation
- [ ] Rate limit: 5 attempts / 15min per IP (Redis)
- [ ] Login event audit log

### 🎨 Frontend Tasks
- [ ] `/welcome` — email-first workspace discovery
- [ ] `/login` — adaptive based on workspace SSO config
- [ ] "Continue with Google Workspace" prominent button
- [ ] `/auth/callback` handler page with loading states
- [ ] Error states: wrong domain, suspended, network failure
- [ ] Workspace badge in UI ("iux24.com")

### ⚙️ Infra Tasks
- [ ] Add `iux24.com` to authorized domains in Google Cloud Console
- [ ] Configure consent screen with org logo + privacy policy
- [ ] Set up Cloudflare WAF rules for `/auth/*`

### ✅ Acceptance
- [ ] User `*@iux24.com` → Google flow → success → dashboard
- [ ] User `*@gmail.com` → rejected at Google (hd parameter)
- [ ] User `*@otherdomain.com` if reaches callback → rejected at app with clear message
- [ ] JIT creates user with role=member, no double-signup
- [ ] Failed login counter increments + lock at 5

### 🎬 Demo
1. Open `/login` → "Continue with Google" → mock picker
2. Pick `ching@iux24.com` → callback → dashboard
3. Logout → try `me@gmail.com` → see explicit rejection
4. Show audit log entry "auth.login · ching@ · Google SSO"

### ⚠️ Risks
- 🔴 Google consent review delay (1-2 wks) — **apply on Day 1**
- 🟡 Refresh token rotation race condition — use Redis lock per token

</details>

<details>
<summary><strong>🎯 Sprint A2 — Organization + Vault/Folder/Item Models + KMS</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | Org bootstrap + first-class entities + server-side encryption working |
| 👤 Owner | @backend-lead |
| 🔗 Depends on | A1 |

### 🏗 Backend Tasks
- [ ] Org CRUD; first signup = creator becomes Owner
- [ ] Org settings: `allowed_domains`, `default_role`, `require_sso`
- [ ] Domain verification via TXT record (HMAC token + DNS poll)
- [ ] Multi-org membership (user can be in multiple orgs)
- [ ] Vault CRUD (`POST/GET/PATCH/DELETE /vaults`)
- [ ] Folder CRUD (nested 3 levels max)
- [ ] Item CRUD (Login type only this sprint)
- [ ] **Envelope encryption:**
  - Generate DEK per item (256-bit)
  - Wrap with KMS master key (AWS KMS or local Vault for dev)
  - Encrypt item data with DEK (AES-256-GCM)
  - Cache wrapped DEK + plaintext DEK for 5min (reduce KMS calls)
- [ ] Soft delete with 30-day trash
- [ ] Default vaults on org creation: "Shared" + "{user}'s Personal"

### 🎨 Frontend Tasks
- [ ] Setup wizard (4 steps: org info → Google connect → domains → invite mode)
- [ ] Sidebar with vault tree + counts
- [ ] Vault create/edit modal
- [ ] Folder tree (drag-drop optional in Phase B)
- [ ] Item create modal (form: name, username, password, URL, notes)
- [ ] Item edit modal (same form)
- [ ] Delete confirmation
- [ ] Empty states (no vaults, no items, no folders)

### ⚙️ Infra Tasks
- [ ] AWS KMS key (or HashiCorp Vault for dev)
- [ ] IAM role for app → KMS (least privilege: Encrypt/Decrypt only)
- [ ] KMS audit logging to CloudTrail / Vault audit log

### ✅ Acceptance
- [ ] Wizard: fresh signup → dashboard in < 5 min
- [ ] Create vault + folder + item, all persisted
- [ ] `psql` inspection: `encrypted_data` is unintelligible
- [ ] Edit item → save → `item_versions` row created
- [ ] Delete → moves to trash → restore works
- [ ] KMS audit shows decrypt event for each item view

### 🎬 Demo
1. Walk through setup wizard
2. Create "Production" vault + "AWS" folder
3. Create item "AWS Root" with password
4. Show ciphertext in DB (`SELECT encrypted_data FROM items LIMIT 1`)
5. Edit item → show version count → restore

### ⚠️ Risks
- 🟡 KMS cost per request — DEK caching critical at scale
- 🟢 Folder nesting performance — limit to 3 levels

</details>

<details>
<summary><strong>🎯 Sprint A3 — Item UX: Search, Copy, TOTP, Reveal</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | UX of viewing and using passwords — search, copy with auto-clear, TOTP |
| 👤 Owner | @frontend-lead |
| 🔗 Depends on | A2 |

### 🏗 Backend Tasks
- [ ] `GET /items?vault_id=&folder_id=&search=&type=` with cursor pagination
- [ ] Full-text search on `plaintext_name` (Phase A only)
- [ ] `POST /items/:id/audit` — log view/copy/reveal events
- [ ] TOTP code generation endpoint (encrypted secret + RFC 6238)
- [ ] "Recently used" sorted by `last_used_at`
- [ ] "Favorites" — `favorite_by` array column

### 🎨 Frontend Tasks
- [ ] Item list with virtualized scroll (50+ items smooth)
- [ ] Universal search modal (Cmd+K) with fuzzy match (Fuse.js)
- [ ] Item detail page (read-only view):
  - Username/password/URL fields
  - Reveal toggle (5s auto-hide)
  - Copy button with toast + 30s clipboard clear
  - TOTP code with progress ring (refresh every 30s)
  - Notes (markdown rendered)
- [ ] Recently used + Favorites sections in sidebar
- [ ] Keyboard shortcuts: `/` search, `c` copy pw, `e` edit, `Esc` close, `r` reveal

### ✅ Acceptance
- [ ] Search "aws" → matches "AWS Production" via fuzzy
- [ ] Copy → toast "Copied · clears in 30s" → `pbpaste` empty after 30s
- [ ] TOTP refreshes every 30s, ring animates correctly
- [ ] View count increments on every detail open
- [ ] Cmd+K opens from anywhere; ESC closes

### 🎬 Demo
1. Login → dashboard 64 items
2. Cmd+K → "aws" → enter → detail
3. Reveal password → 5s auto-hide
4. Copy → paste in terminal → wait 30s → paste again → empty
5. Show TOTP countdown ring

### ⚠️ Risks
- 🟡 Clipboard API limitations on Safari iOS — fallback to Selection API
- 🟢 Fuzzy search at 1000+ items — pre-build index, debounce

</details>

<details>
<summary><strong>🎯 Sprint A4 — Sharing + 2FA + Session Management</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | Share items within org, force 2FA, manage active sessions |
| 👤 Owner | @backend-lead |
| 🔗 Depends on | A1, A3 |

### 🏗 Backend Tasks
- [ ] `POST /vaults/:id/access` — assign user (email lookup) with role
- [ ] Resolved access query: `GET /me/items` includes vault + override
- [ ] TOTP 2FA setup: `POST /me/2fa/totp/setup` returns QR + secret
- [ ] TOTP verify: `POST /me/2fa/totp/verify` enables 2FA
- [ ] Backup codes (10 single-use, Argon2id hashed)
- [ ] WebAuthn registration (Passkey) — `POST /me/webauthn/register`
- [ ] Session list: `GET /me/sessions`
- [ ] Session revoke: `DELETE /me/sessions/:id`
- [ ] Org policy: `require_2fa` flag → block dashboard if not enrolled
- [ ] Login alert email on new device fingerprint

### 🎨 Frontend Tasks
- [ ] Share modal: user/team picker + role select + expiration
- [ ] `/settings/security`:
  - 2FA setup with QR scan flow
  - Backup codes display (one-time)
  - Passkey registration
  - Active sessions table with "Revoke" buttons
  - Login history (last 30 days)
- [ ] Forced 2FA enrollment flow (blocks dashboard until enrolled)
- [ ] 2FA grace period banner (admin sets 7-day countdown)

### ✅ Acceptance
- [ ] User A shares item with User B → B sees in "Shared with me"
- [ ] Setup 2FA → next login requires TOTP
- [ ] Admin enables `require_2fa` → unprotected users see enrollment screen
- [ ] Revoke session from "Active sessions" → that device gets 401 within 60s
- [ ] Login from new device → alert email sent

### 🎬 Demo
1. User A shares "AWS Root" with User B (Editor)
2. Logout → login as B → see item in shared
3. Settings → setup 2FA → scan QR → verify → backup codes
4. Logout → login → 2FA required
5. Sessions → see 3 devices → revoke one

### ⚠️ Risks
- 🟡 Force 2FA mid-week disrupts workflow — give 7-day grace
- 🟢 WebAuthn cross-browser quirks — Lucia handles most

</details>

<details>
<summary><strong>🆕 🎯 Sprint A5 — Import Wizard</strong> · 🔘 Not started · 3 days · <strong>NEW from review</strong></summary>

| | |
|---|---|
| 🎯 Goal | Migrate from 1Password, Bitwarden, LastPass, generic CSV |
| 👤 Owner | @backend + @frontend |
| 🔗 Depends on | A2 |
| 🚨 Why now | **P0 blocker** — without this, no one migrates from existing tools |

### 🏗 Backend Tasks
- [ ] `POST /imports` — start import job (returns job_id)
- [ ] Background worker (BullMQ): parse + validate + create items in batches
- [ ] Importer plugins:
  - `1password-1pux` — extract zip, parse JSON, decrypt if pw provided
  - `bitwarden-json` — JSON export
  - `lastpass-csv` — CSV with `url,username,password,extra,name,grouping`
  - `chrome-csv` — Chrome password export
  - `generic-csv` — user-mapped columns
- [ ] Field mapping API: detect columns, suggest mappings
- [ ] Dry-run mode: parse + count + dedupe report without creating
- [ ] Conflict resolution: skip, overwrite, append `(2)` suffix
- [ ] Audit: `import.start`, `import.complete` events

### 🎨 Frontend Tasks
- [ ] `/import` wizard (4 steps):
  1. Choose source (visual cards: 1Password, Bitwarden, LastPass, Chrome, CSV)
  2. Upload file (drag-drop, max 10MB)
  3. **Field mapping** (column → vault field) with preview
  4. Conflict policy + target vault/folder
- [ ] Dry-run preview table (50 sample items)
- [ ] Progress bar (WebSocket or polling) for actual import
- [ ] Result page: N created, M skipped, E errors (with downloadable error CSV)

### ✅ Acceptance
- [ ] Import 1Password 1pux of 500 items → all imported in < 60s
- [ ] LastPass CSV with custom columns → mapping UI works
- [ ] Conflict (same name+username) → skip option preserves existing
- [ ] Errors shown clearly with row numbers
- [ ] Audit log shows full import summary

### 🎬 Demo
1. Export sample 1Password (10 items) → upload
2. Field mapping auto-detected → preview
3. Click "Import" → progress → done
4. Show 10 items now in dashboard
5. Re-import same file → "10 skipped (duplicates)"

### ⚠️ Risks
- 🔴 1Password 1pux format changes — pin parser version, test quarterly
- 🟡 Large imports (> 5000 items) timeout — use streaming + chunks

</details>

<details>
<summary><strong>🆕 🎯 Sprint A6 — Bulk Operations</strong> · 🔘 Not started · 2 days · <strong>NEW from review</strong></summary>

| | |
|---|---|
| 🎯 Goal | Multi-select + bulk share/move/delete/tag for power users |
| 👤 Owner | @frontend |
| 🔗 Depends on | A3, A4 |
| 🚨 Why now | **P0** — new hire = grant access to 80 items, manual is intolerable |

### 🏗 Backend Tasks
- [ ] `POST /items/bulk` — batch action: `{action, item_ids, payload}`
  - `share` — add access for principal
  - `move` — change vault/folder
  - `delete` — soft delete
  - `tag` / `untag`
  - `favorite` / `unfavorite`
- [ ] Transaction wrap; rollback on partial failure
- [ ] Permission check per item (skip silently if not allowed, report count)

### 🎨 Frontend Tasks
- [ ] Checkbox column in item list
- [ ] "Select all" / "Select page" / "Select filtered"
- [ ] Floating action bar: "X selected · [Share] [Move] [Tag] [Delete]"
- [ ] Bulk share modal (same as single, applies to all)
- [ ] Bulk move: target vault/folder picker
- [ ] Confirmation for delete (count + first 5 names)
- [ ] Result toast: "23 shared, 2 skipped (no permission)"

### ✅ Acceptance
- [ ] Select 50 items → bulk share with team → all 50 visible to team
- [ ] Select items from 2 folders → move to new folder → all relocated
- [ ] Bulk delete → trash count increases by N
- [ ] Permission denied on some items → operation succeeds for allowed, reports skipped

### 🎬 Demo
1. Dashboard → check 5 items
2. Floating bar appears → "Share" → pick "DevOps team" → done
3. Login as DevOps user → see 5 new items in Shared

### ⚠️ Risks
- 🟢 Bulk delete is destructive — strong confirmation + 30d trash

</details>

<details>
<summary><strong>🎯 Sprint A7 — Audit Log + Polish + Soft Launch</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | Audit log, UX polish, ship internally |
| 👤 Owner | All hands |

### 🏗 Backend Tasks
- [ ] Audit event types (basic set): `auth.*`, `item.*`, `vault.*`, `member.*`, `import.*`
- [ ] `GET /audit?filters` (admin only)
- [ ] Audit retention 1y (config; ramps to 3y in Phase B)
- [ ] Background jobs:
  - Cleanup expired sessions (every 5min)
  - Cleanup soft-deleted items > 30d (daily)
  - Send daily digest email to admins

### 🎨 Frontend Tasks
- [ ] `/audit` page with filters: actor, action type, date range
- [ ] Export CSV (Excel-friendly UTF-8 BOM)
- [ ] Onboarding tour (first login, dismissible)
- [ ] Help docs in-app (Notion-style sidebar)
- [ ] Empty states everywhere (no items, no audit, no shared)
- [ ] 404 / 500 pages with humor
- [ ] Animation polish (Framer Motion lite)
- [ ] Dark/light theme toggle (dark default)
- [ ] Mobile responsive QA (iPhone Safari, Pixel Chrome)

### ⚙️ Infra Tasks
- [ ] Production deployment (Fly.io / AWS ECS)
- [ ] Monitoring: Sentry (errors) + Grafana (metrics) + Loki (logs)
- [ ] Backup: hourly Postgres snapshot, encrypted to S3, tested restore quarterly
- [ ] Status page (Better Stack / Instatus)
- [ ] PagerDuty rotation (initial on-call: @ching)

### ✅ Acceptance
- [ ] Every secret action has audit entry
- [ ] CSV export opens in Excel with correct Thai chars
- [ ] Mobile (iPhone Safari): full flow works inc 2FA + reveal + copy
- [ ] Production deploy with green status
- [ ] Internal team of 5 successfully imports + uses 30+ items

### 🎬 Demo (Internal Launch)
- Town hall: full flow + Q&A
- Distribute Recovery Kit (mock) to each user
- 1-week bug bash; nightly reports

### ⚠️ Risks
- 🟡 Edge cases not caught — schedule 1-week bug bash post-launch

</details>

---

# 🟡 Phase B — Daily Use Features

> 📌 **Properties**
> ⏱ **Duration:** 7 weeks · 📅 **Weeks 8–14** · 🟠 **Priority:** P1 (+ 2 P0 sprints)
> 🎯 **Goal:** Power users hooked; CI/CD pipelines using Woxa; browser extension installed
> 🚦 **Exit criteria:** 80% of org has browser extension; first prod service token in use

<details>
<summary><strong>🎯 Sprint B1 — Teams + Role Hierarchy</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | Group users into teams; assign vault access at team level |
| 👤 Owner | @backend |

### Tasks
- [ ] Teams CRUD (admin only)
- [ ] Team member management (add/remove, with team lead role)
- [ ] `vault_access` extended with `principal_type='team'`
- [ ] Access resolution: user > team > domain > org (most specific wins)
- [ ] UI: `/settings/teams` page; team picker in Share modal

### ✅ Acceptance
- [ ] Create "DevOps" team → assign to Production vault as Editor
- [ ] All DevOps members inherit Editor access
- [ ] Add user to team → they see vault on next login
- [ ] Remove from team → access revoked (with key rotation in Phase C)

</details>

<details>
<summary><strong>🎯 Sprint B2 — Google Groups → Teams Sync</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | Auto-provision team membership from Google Groups |
| 👤 Owner | @backend |
| 🚨 Risk | Google Admin SDK requires domain-wide delegation (security review) |

### Tasks
- [ ] Google Admin SDK integration with `directory.groups.readonly`
- [ ] Service account with domain-wide delegation (org admin consents once)
- [ ] Map `google_group_email` → `woxa_team_id` (admin configures)
- [ ] Sync job (every 15min) + on-login sync
- [ ] UI: SSO settings → Group Mapping table + test simulator

### ✅ Acceptance
- [ ] Add user to `devops@iux24.com` Google Group → next login → added to DevOps team
- [ ] Remove from Google Group → next sync → removed from Woxa team
- [ ] Admin sees sync log with timestamps + counts

</details>

<details>
<summary><strong>🎯 Sprint B3 — Folder/Item ACL + Granular Permissions</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | Fine-grained permissions; "Editor can edit notes but not password" |
| 👤 Owner | @backend |

### Tasks
- [ ] Folder-level ACL (inherits vault, can override)
- [ ] Item-level ACL override (highest priority)
- [ ] **Granular permission set** (replaces simple roles):
  - `view_metadata`, `view_password`, `copy_password`, `edit_password`, `edit_notes`, `share`, `delete`, `manage_access`
- [ ] Custom role builder (Enterprise) — pick permissions
- [ ] Preset roles map to permission sets:
  - Manager = all
  - Editor = view/edit/share, no delete/manage_access
  - User = view/copy, no edit
  - Viewer = view_metadata only
- [ ] "Who can access" reasoning trace (UI explains why)

### ✅ Acceptance
- [ ] Override: item ACL gives John "view_metadata only" → John sees name but not password
- [ ] Vault = team Editor, but folder = team Viewer → team sees but can't edit
- [ ] Custom role "Auditor" with only `view_metadata` works

</details>

<details>
<summary><strong>🎯 Sprint B4 — All Item Types + Attachments</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | Support API Key, SSH Key, Secure Note, Credit Card, Identity + file attachments |

### Tasks
- [ ] Type schemas with type-specific fields
- [ ] Custom fields (per-item key-value, unlimited)
- [ ] Multi-line text support (for cert/key paste)
- [ ] Attachment upload (chunked, max 25MB)
- [ ] Encrypt attachment client-side (Phase A: server-side with KMS DEK)
- [ ] Store to S3/R2 with item-id prefix
- [ ] Download with streaming decrypt

### ✅ Acceptance
- [ ] Create SSH item with multi-line private key → preserved
- [ ] Upload 20MB PDF attachment → encrypted in storage
- [ ] Download → match original byte-for-byte

</details>

<details>
<summary><strong>🎯 Sprint B5 — One-time Send</strong> · 🔘 Not started · 5 days</summary>

| | |
|---|---|
| 🎯 Goal | Send link expires + burn-after-read for external recipients |

### Tasks
- [ ] `POST /sends` — create one-time send (ciphertext + metadata)
- [ ] `GET /s/:token` (public, no auth) — return ciphertext if not expired
- [ ] `POST /s/:token/burn` — atomic decrement view count
- [ ] Background job: cleanup expired sends every 1min
- [ ] Rate limit per IP + per token
- [ ] Optional email lock (HMAC of recipient email)
- [ ] Notification on view (configurable)
- [ ] UI: "Send one-time copy" from item detail
- [ ] UI: Manual send form `/sends/new`
- [ ] UI: My active sends `/sends` (burn early)
- [ ] UI: Recipient view `/s/:token` with Reveal guard against bots
- [ ] QR code for mobile sharing

### ✅ Acceptance
- [ ] Create send → URL with `#key` fragment → recipient opens → reveal → secret shows
- [ ] Slack preview bot does NOT trigger burn (Reveal guard works)
- [ ] After burn, refresh → "Already viewed or expired"
- [ ] Sender gets email when viewed (if notify enabled)

</details>

<details>
<summary><strong>🆕 🎯 Sprint B6 — Service Tokens + CLI v1</strong> · 🔘 Not started · 5 days · <strong>NEW from review</strong></summary>

| | |
|---|---|
| 🎯 Goal | CI/CD can read secrets via API; CLI works on developer machines |
| 👤 Owner | @backend + @infra |
| 🚨 Why now | **P0** — `.env` files in git repo otherwise; CI pipelines need this Day 1 |

### 🏗 Backend Tasks
- [ ] Service token model: scoped to specific items or paths
  - Scope: list of item IDs OR vault+folder path pattern
  - Permissions: `read` only (no write/delete)
  - Optional IP allowlist (CIDR)
  - Expiration (max 1 year, default 90 days)
  - Rotation: regenerate without downtime (overlap period)
- [ ] `POST /service-tokens` — create (admin only)
- [ ] `GET /service-tokens` — list
- [ ] `DELETE /service-tokens/:id` — revoke
- [ ] Authentication: `Authorization: ServiceToken <token>`
- [ ] Token format: `woxa_<env>_<base64>` (env = `live`/`test`)
- [ ] Audit every use: `service_token.read item=X token_id=Y ip=Z`
- [ ] Auto-disable on suspicious pattern (high error rate, unusual IP)

### 🛠 CLI Tasks (`woxa` binary)
- [ ] Built in Rust + Cargo (cross-compile macOS/Linux/Windows)
- [ ] `woxa login` — OAuth device flow → store token in OS keychain
- [ ] `woxa logout`
- [ ] `woxa list [--vault NAME] [--type api_key]`
- [ ] `woxa get NAME [--field password]` — print to stdout (env-friendly)
- [ ] `woxa get NAME --format json` — structured
- [ ] `woxa send TEXT [--expires 1h] [--max-views 1]` — create one-time send
- [ ] `woxa env get` — output `KEY=VALUE` lines for `eval $(woxa env get)`
- [ ] Auto-update via Homebrew / curl install script

### 🎨 Frontend Tasks
- [ ] `/settings/service-tokens` admin page
- [ ] Create token wizard with scope picker + permission visualization
- [ ] Show token once (after creation), copy-only
- [ ] Token usage chart (calls/day, last seen)
- [ ] Revoke + rotate actions

### ✅ Acceptance
- [ ] CI: `WOXA_TOKEN=$WOXA_TOKEN woxa get prod/stripe-key` → password printed
- [ ] Token scoped to "production" vault → cannot read "staging" (403)
- [ ] Revoke token → next request 401 within 60s
- [ ] Audit log shows every `service_token.read`
- [ ] CLI works offline-no — but on flaky network retries with backoff

### 🎬 Demo
1. Admin creates service token "github-actions-prod"
2. Scope: read-only, vault=Production, IPs=GitHub runner ranges
3. Token shown once → copy to GitHub Secrets as `WOXA_TOKEN`
4. Show GitHub Action workflow using `woxa get` → deploys with secret
5. Revoke token → show next workflow run fails

### ⚠️ Risks
- 🔴 Token leak in CI logs — never echo, mask in audit
- 🟡 Rust binary distribution complexity — use cargo-dist

</details>

<details>
<summary><strong>🆕 🎯 Sprint B7 — Browser Extension v1 (Autofill)</strong> · 🔘 Not started · 5 days · <strong>NEW from review</strong></summary>

| | |
|---|---|
| 🎯 Goal | Read-only autofill in Chrome/Firefox/Edge — sticky daily-use feature |
| 👤 Owner | @frontend |
| 🚨 Why now | **P0** — without this, users keep using Slack DM; browser ext = retention 10x |

### 🏗 Backend Tasks
- [ ] Extension auth: same OAuth + session as web
- [ ] Read-only API for extension (rate-limited harder than web)
- [ ] Push notification: vault updated → extension invalidates cache

### 🛠 Extension Tasks (Manifest V3)
- [ ] Extension scaffold (Chrome + Firefox + Edge)
- [ ] Background service worker: holds session
- [ ] Content script: detects login forms (`<input type=password>`)
- [ ] Floating dropdown UI: "Fill from Woxa Vault"
- [ ] Match items by URL domain (e.g., `*.aws.amazon.com` → AWS items)
- [ ] Keyboard shortcut: `Cmd+Shift+L` to fill
- [ ] Auto-lock: vault re-locks after 15min idle (configurable)
- [ ] Quick search popup (browser action icon): Cmd+Shift+F
- [ ] Settings page: enable/disable autofill, lock interval

### ✅ Acceptance
- [ ] Install extension → connect to workspace → unlock with master pw
- [ ] Visit `console.aws.amazon.com` → "Fill" dropdown appears → click → username + password filled
- [ ] Cmd+Shift+F opens search popup → find item → copy
- [ ] After 15min idle → extension locked → must unlock again

### 🎬 Demo
1. Install extension (from `.zip` for now, store later)
2. Sign in → vault unlocked
3. Open AWS console → autofill dropdown → click → logged in
4. Wait 15min → re-prompt

### ⚠️ Risks
- 🔴 Chrome Web Store review (2-4 wks) — submit at sprint start in parallel
- 🟡 iframe credentials (Stripe checkout) — defer to Phase D2
- 🟢 Firefox MV3 still beta — test on Firefox Nightly

</details>

---

# 🔵 Phase C — Zero-Knowledge + Lifecycle Governance

> 📌 **Properties**
> ⏱ **Duration:** 6 weeks · 📅 **Weeks 15–20** · 🟠 **Priority:** P1
> 🎯 **Goal:** Server cannot decrypt anything; pass external pen test; lifecycle features

<details>
<summary><strong>🎯 Sprint C1 — Client Crypto Library</strong> · 🔘 Not started · 5 days</summary>

### Tasks
- [ ] `packages/crypto` wrapper over Web Crypto API
- [ ] Argon2id (WASM fallback for older browsers)
- [ ] AES-256-GCM encrypt/decrypt
- [ ] X25519 keypair gen, ECDH, key wrap
- [ ] HKDF-SHA256 derive
- [ ] Unit tests with NIST test vectors
- [ ] Performance benchmarks (target: encrypt 1MB < 100ms)

### ✅ Acceptance
- [ ] All NIST vectors pass
- [ ] No external JS crypto library dependency
- [ ] Argon2id works in Chrome, Safari, Firefox, mobile

</details>

<details>
<summary><strong>🎯 Sprint C2 — User Keypair + Master Password Flow</strong> · 🔘 Not started · 5 days</summary>

### Tasks
- [ ] Signup: generate keypair in browser; derive stretched key from master pw
- [ ] Login: send `auth_key_hash` (different KDF domain), receive encrypted private key
- [ ] Master password change: re-encrypt private key with new derived key
- [ ] Strength meter (zxcvbn)
- [ ] HIBP k-anonymity check (warn on breached passwords)
- [ ] Master Password Hint (optional, never displayed without re-auth)

### ✅ Acceptance
- [ ] Network tab inspection: master password never sent
- [ ] Server only sees `auth_key_hash` + `encrypted_private_key`
- [ ] Change pw → re-login works → all items decrypt

</details>

<details>
<summary><strong>🎯 Sprint C3 — Vault Key Wrapping per User</strong> · 🔘 Not started · 5 days</summary>

### Tasks
- [ ] New vault: generate vault key (256-bit); wrap with creator pubkey
- [ ] Share vault: fetch recipient pubkey; wrap vault key; upload
- [ ] Item create/edit: encrypt locally with vault key
- [ ] Loading states for crypto operations
- [ ] Migration path planning (deferred to C6)

### ✅ Acceptance
- [ ] Server has no plaintext anywhere; `encrypted_data` truly opaque
- [ ] Sharing works end-to-end without server ever seeing vault key

</details>

<details>
<summary><strong>🆕 🎯 Sprint C4 — Password Rotation + Expiration Reminders</strong> · 🔘 Not started · 3 days · <strong>NEW from review</strong></summary>

| | |
|---|---|
| 🎯 Goal | Track per-item rotation policy; remind users when rotation due |

### Tasks
- [ ] Item field: `password_changed_at` (auto-updated on password edit)
- [ ] Item field: `rotation_policy_days` (default 90, configurable per item, null = no policy)
- [ ] Org-level defaults (e.g., "all production items rotate every 90d")
- [ ] Dashboard widget: "12 secrets need rotation"
- [ ] Email digest (weekly) of overdue items to owner
- [ ] Item detail badge: "🔄 Due in 5 days" / "⚠ Overdue 23 days"
- [ ] Rotation workflow: edit pw → mark new `password_changed_at` → audit
- [ ] **Auto-rotation hooks (Phase D)** — for AWS IAM, GitHub PATs etc.

### ✅ Acceptance
- [ ] Set policy 30d → wait → dashboard shows item as "rotation due"
- [ ] Owner gets weekly email with overdue list
- [ ] Edit password → `password_changed_at` updated → badge clears

### 🎬 Demo
1. Item AWS Root → set rotation policy 90 days
2. Show dashboard "AWS Root rotation in 84 days"
3. Manually edit `password_changed_at` to 100d ago → "Overdue 10 days"
4. Edit password → save → badge clears

</details>

<details>
<summary><strong>🆕 🎯 Sprint C5 — Permission Request Workflow</strong> · 🔘 Not started · 2 days · <strong>NEW from review</strong></summary>

| | |
|---|---|
| 🎯 Goal | "Junior asks senior for AWS access" in-app, not in Slack DM |

### Tasks
- [ ] User sees item name (metadata) but no decrypt access → "Request access" button
- [ ] Request flow:
  - User picks: role wanted (Viewer/User/Editor), duration, reason
  - Notification to vault Manager(s)
- [ ] Approver UI: pending requests list with "Approve · Deny · Counter-offer"
- [ ] Counter-offer: different role/duration
- [ ] Audit: `access.requested`, `access.approved`, `access.denied`, `access.expired`
- [ ] Optional: Slack notify integration (Phase D)

### ✅ Acceptance
- [ ] Junior requests AWS access → senior gets notification + approves with 24h limit
- [ ] After 24h, access auto-revoked
- [ ] Full audit trail of who-asked-what-when

</details>

<details>
<summary><strong>🎯 Sprint C6 — Migration Tool + Recovery Kit</strong> · 🔘 Not started · 5 days</summary>

### Tasks
- [ ] Migration on next login:
  - Force-show upgrade screen
  - Fetch items (server-side mode) → decrypt
  - Generate user keypair + vault keys
  - Re-encrypt all items client-side
  - Upload new ciphertext
  - Flip `encryption_version = 2`
- [ ] Per-org admin opt-in initially
- [ ] Keep old ciphertext for 30 days (rollback)
- [ ] Recovery Kit generation:
  - 24-word mnemonic (BIP39)
  - PDF download (printable)
  - Stored encrypted backup of master key
- [ ] Admin-assisted recovery flow
- [ ] WebAuthn unlock as alternative to master pw

### ✅ Acceptance
- [ ] Existing org migrates; all items decrypt post-migration
- [ ] Lost master pw + use mnemonic → regain access
- [ ] Lost mnemonic + admin approval → recover via re-invite

</details>

<details>
<summary><strong>🎯 Sprint C7 — Blind Index Search + External Pen Test</strong> · 🔘 Not started · 5 days</summary>

### Tasks
- [ ] Blind index: `search_hash = HMAC(server_secret, normalize(name))`
- [ ] Server-assisted hashing endpoint
- [ ] Trigram index for partial match (optional)
- [ ] Hire external security firm (book in Phase B)
- [ ] Pen test on staging environment
- [ ] HackerOne private beta program (10 researchers)
- [ ] Fix all high/critical findings before GA

### ✅ Acceptance
- [ ] Search works in zero-knowledge mode
- [ ] Pen test report: 0 critical, 0 high findings (or all fixed)

</details>

---

# 🟣 Phase D — Enterprise

> 📌 **Properties**
> ⏱ **Duration:** 8+ weeks rolling · 📅 **Weeks 21+** · 🟡 **Priority:** P2 (with 2 P1 sprints)
> 🎯 **Goal:** Sell to enterprise; SOC 2 Type I; mobile + desktop apps

<details>
<summary><strong>🎯 Sprint D1 — SCIM 2.0 Provisioning</strong> · 🔘 Not started · 5 days</summary>

### Tasks
- [ ] SCIM 2.0 endpoints (`/scim/v2/Users`, `/scim/v2/Groups`)
- [ ] Bearer token auth (admin generates)
- [ ] Google Workspace SCIM app config
- [ ] Azure AD config
- [ ] Test with mock IdPs

### ✅ Acceptance
- [ ] User added in Google Workspace → appears in Woxa < 1min
- [ ] Group changes propagate

</details>

<details>
<summary><strong>🎯 Sprint D2 — Browser Extension v2 (Full Autofill + Save)</strong> · 🔘 Not started · 5 days</summary>

### Tasks
- [ ] Detect signup forms → offer to save
- [ ] Inline password generator (with rules)
- [ ] Autofill across iframes (Stripe checkout, etc.)
- [ ] Smart form detection (heuristics + ML for tricky sites)
- [ ] One-time send shortcut

</details>

<details>
<summary><strong>🆕 🎯 Sprint D3 — Auditor Role + Compliance Reports</strong> · 🔘 Not started · 3 days · <strong>NEW from review</strong></summary>

| | |
|---|---|
| 🎯 Goal | External auditor reads metadata + audit log without decrypt access |

### Tasks
- [ ] New role: `auditor` — sees item metadata (name, vault, dates, sharing list) but NOT decrypted content
- [ ] Time-limited invitation (max 30 days, no extension)
- [ ] All auditor views logged separately
- [ ] Compliance report templates:
  - SOC 2: access matrix, change log, incident log
  - PDPA: data inventory, access requests, retention
  - Custom: free-form filter + export
- [ ] PDF generation with org branding

### ✅ Acceptance
- [ ] Invite auditor → 30d access → can browse metadata + audit only
- [ ] Auditor tries to view password → blocked + logged
- [ ] Generate SOC 2 access matrix PDF for given quarter

</details>

<details>
<summary><strong>🆕 🎯 Sprint D4 — Break-glass / Emergency Access</strong> · 🔘 Not started · 2 days · <strong>NEW from review</strong></summary>

| | |
|---|---|
| 🎯 Goal | Recover org admin if owner lost master pw / left company / died |

### Tasks
- [ ] Designated emergency contacts (2-3 trusted users) configurable
- [ ] Emergency request: contact initiates → others must approve (2 of 3)
- [ ] Cooldown period: 24-72h (configurable, admin sets) — owner can cancel
- [ ] On expiry: contacts get owner-equivalent access (audited heavily)
- [ ] Original owner can revoke if returns
- [ ] Audit + Slack/email notify on every emergency action

### ✅ Acceptance
- [ ] Set up 3 contacts → owner "leaves" → 2 contacts approve → wait 24h → access granted
- [ ] Owner returns within cooldown → cancel → access denied

</details>

<details>
<summary><strong>🎯 Sprint D5 — Mobile Apps (iOS + Android)</strong> · 🔘 Not started · 10 days</summary>

### Tasks
- [ ] React Native (or native if budget allows)
- [ ] Biometric unlock (Face ID / Touch ID / Android Biometric)
- [ ] Autofill Provider (iOS) / Autofill Service (Android)
- [ ] Offline cached vault (encrypted, 24h staleness)
- [ ] Push notifications (share, share, login alert)

</details>

<details>
<summary><strong>🎯 Sprint D6 — Desktop App (Tauri)</strong> · 🔘 Not started · 5 days</summary>

### Tasks
- [ ] Tauri shell wrapping web app
- [ ] OS keychain for refresh token
- [ ] System tray quick search (Spotlight-like)
- [ ] Native menu integration

</details>

<details>
<summary><strong>🎯 Sprint D7 — Anomaly Detection + Alerts</strong> · 🔘 Not started · 5 days</summary>

### Tasks
- [ ] User baseline: typical access rate, geo, time-of-day
- [ ] Alert triggers:
  - 10x normal volume in 1h
  - Access from new country
  - Access outside business hours
  - Failed 2FA × 5
- [ ] Send to Slack/email; optionally auto-lock account

</details>

<details>
<summary><strong>🎯 Sprint D8 — HSM + BYOK + SOC 2 Prep</strong> · 🔘 Not started · 5+ days</summary>

### Tasks
- [ ] AWS CloudHSM integration (Enterprise tier)
- [ ] Per-org KMS key isolation
- [ ] BYOK API
- [ ] Vanta / Drata for compliance monitoring
- [ ] Document all controls; map to SOC 2 CC criteria
- [ ] Schedule SOC 2 Type I audit

</details>

---

## 📊 Risks Register (Live)

| # | Risk | Phase | Probability | Impact | Mitigation | Status |
|---|---|---|---|---|---|---|
| R1 | Google OAuth consent review delay | A1 | 🟠 High | 🟡 Med | Apply Day 1, minimal scopes | ⏸ |
| R2 | 1Password 1pux format change breaks import | A5 | 🟡 Med | 🟡 Med | Pin parser, quarterly test | ⏸ |
| R3 | Browser ext review (Chrome Web Store) | B7 | 🟠 High | 🟡 Med | Submit beta early Phase B | ⏸ |
| R4 | Zero-knowledge migration data loss | C6 | 🟢 Low | 🔴 Critical | 30d rollback, staged | ⏸ |
| R5 | Internal users stick to Slack | A6+ | 🟠 High | 🔴 Critical | Browser ext + leadership mandate | ⏸ |
| R6 | Pen test finds critical issue post-launch | C7 | 🟡 Med | 🔴 Critical | Schedule for Phase C, fix before GA | ⏸ |
| R7 | Single Owner risk (no break-glass) | D4 | 🟠 High | 🔴 Critical | Ship D4 BEFORE removing initial owner | ⏸ |
| R8 | KMS cost overruns | A2+ | 🟢 Low | 🟡 Med | DEK caching (5min) | ⏸ |
| R9 | Service token leak in CI logs | B6 | 🟠 High | 🟠 High | Mask in audit, secret scanning | ⏸ |
| R10 | Mobile delays general release | D5 | 🟡 Med | 🟢 Low | Web is primary; mobile is bonus | ⏸ |

---

## 🎬 Demo Scripts (per phase)

### Phase A Demo (Internal Launch — 7 min)
1. **Wizard (60s)** — sign up, connect Google Workspace, verify domain, allow JIT
2. **Import (90s)** — upload 1Password export → 50 items imported
3. **Dashboard (60s)** — Cmd+K search "aws" → find item
4. **Item detail (60s)** — reveal/copy/TOTP with auto-clear
5. **Bulk share (60s)** — select 10 items → share with DevOps team
6. **Audit (60s)** — show all actions logged
7. **Security pitch (30s)** — "Server-side encrypted now, Zero-knowledge in Phase C"

### Phase B Demo (Public Beta — 8 min)
- + One-time send to external email + Reveal guard
- + Service token in GitHub Actions
- + Browser extension autofill on real site
- + Granular permission ("Viewer can see but not copy")

### Phase C Demo (Zero-Knowledge GA — 6 min)
- + Network tab proof: master pw never sent
- + Pen test report summary
- + Rotation reminders for stale credentials
- + Permission request flow (junior → senior approves)

### Phase D Demo (Enterprise Pitch — 10 min)
- + SCIM auto-provisioning from Azure AD
- + Auditor role with compliance PDF
- + Break-glass simulation
- + Mobile autofill
- + Anomaly alert via Slack

---

## ✅ Definition of Done (universal)

Every sprint must meet:
- [ ] Code merged to `main` with passing CI
- [ ] Unit tests cover happy path + 2 edge cases
- [ ] E2E test for primary flow (Playwright)
- [ ] Manual QA: Chrome + Safari + Firefox + mobile Safari
- [ ] Updated `DESIGN.md` if architecture changed
- [ ] Updated docs if user-facing
- [ ] Deployed to staging
- [ ] Demoed in sprint review meeting
- [ ] No P0/P1 bugs open

**Security-sensitive sprints** (A1, A4, B6, C1-C7, D4) additionally require:
- [ ] Threat modeling session done
- [ ] Independent code review by another senior engineer
- [ ] Penetration testing on staging
- [ ] Sign-off from security lead

---

## 📈 Phase Exit Gates

Phase cannot end until exit criteria met:

| Phase | Gate |
|---|---|
| **0** | Dev env runs in < 15min; CI green |
| **A** | Internal team uses daily; 100+ items; zero passwords-in-Slack audit |
| **B** | Browser extension installed by 80%; first service token in production |
| **C** | Pen test 0 critical/high; zero-knowledge verified via network inspection |
| **D** | First enterprise customer signed; SOC 2 audit started |

---

## 🔄 Retro Cadence

- **Weekly:** sprint review + retro (1h)
- **Bi-weekly:** stakeholder demo (30min)
- **Monthly:** roadmap re-prioritization
- **Quarterly:** external security review
