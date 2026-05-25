# 🎫 Jira Draft — Woxa Secret Vault

> Copy-paste ready content for `woxalabs.atlassian.net`
> Created: 2026-05-12 · Reporter: ching@iux24.com

---

## 📤 Upload Plan

### ลำดับการ upload (แนะนำ)

```
Step 1: สร้าง Confluence Space "Woxa Secret Vault"
  └─ Upload 5 docs เป็น Confluence pages (พร้อม inline preview)

Step 2: สร้าง Jira Epic "WSV-1: Woxa Secret Vault — Implementation"
  ├─ Attach: prototype.html (interactive demo file)
  ├─ Link: Confluence space (Web link field)
  └─ Description: ใช้ template ด้านล่าง

Step 3: สร้าง Stories (5 stories, หนึ่งต่อ Phase)
  └─ Link each to Epic WSV-1

Step 4: สร้าง Sub-tasks ภายในแต่ละ Story
  └─ ตาม sprint plan ใน PHASES.md
```

### 📁 Confluence Structure (Space: "Woxa Secret Vault")

```
🏠 Woxa Secret Vault (Space home)
├─ 📋 README — Workspace home & status
├─ 📐 DESIGN — Architecture & security model
├─ 🗺 PHASES — Sprint roadmap
├─ 📋 REQUIREMENTS — Functional & non-functional specs
├─ 🎯 PRP — Implementation guide for dev team
└─ 🎬 Prototype demo (link to hosted HTML)
```

### 📎 File Mapping

| Local file | Destination | Why |
|---|---|---|
| `README.md` | Confluence: "Woxa Secret Vault" home page | Workspace dashboard |
| `DESIGN.md` | Confluence: "Architecture" | Reference doc |
| `PHASES.md` | Confluence: "Roadmap" | Living sprint plan |
| `REQUIREMENTS.md` | Confluence: "Requirements" | Spec source of truth |
| `PRP.md` | Confluence: "PRP — Implementation Guide" | Dev execution doc |
| `prototype.html` | Jira Epic attachment + hosted preview | Stakeholder demo |

> 💡 **ทำไม Confluence + Jira:**
> Confluence = living docs ที่ดู/แก้ได้ตลอด (markdown-friendly)
> Jira = task tracking + tickets
> Bidirectional link ทำให้ dev คลิกจาก ticket → spec ได้ทันที

### 🌐 Hosting Prototype (Optional)

```bash
# Option A: GitHub Pages (free, public)
gh repo create woxalabs/woxa-vault-prototype --public
git push -u origin main
# Enable Pages in settings → https://woxalabs.github.io/woxa-vault-prototype

# Option B: Internal staging
scp prototype.html staging.iux24.com:/var/www/preview/woxa-vault/
# → https://staging.iux24.com/preview/woxa-vault/prototype.html

# Option C: Just attach to Epic + open locally
# Download from Jira → open in browser
```

---

# 🏷 Master Epic Draft

## Field Values (copy ทีละช่อง)

| Field | Value |
|---|---|
| **Project** | `WSV` (Woxa Secret Vault) — สร้าง project ใหม่ถ้ายังไม่มี |
| **Issue Type** | Epic |
| **Epic Name** | `Woxa Secret Vault` |
| **Summary** | `[EPIC] Woxa Secret Vault — Internal password manager with Google Workspace SSO` |
| **Priority** | 🔴 Highest |
| **Labels** | `vault` `security` `internal-tool` `q3-2026` |
| **Components** | `Backend` `Frontend` `Security` `Infrastructure` |
| **Reporter** | ching@iux24.com |
| **Assignee** | _TBD (Engineering Lead)_ |
| **Fix Version** | `v1.0` |
| **Start Date** | 2026-05-19 (Week 1) |
| **Target End Date** | 2026-12-01 (Week 28) |
| **Story Point Estimate** | _epic-level: ~120 SP_ |

---

## Description (paste ใน Description field)

```markdown
# 🎯 Goal

สร้างระบบ central secret vault สำหรับทีม iux24 พร้อม Google Workspace SSO, one-time send สำหรับ external party, browser extension + CLI สำหรับ daily use, และ zero-knowledge encryption ในระยะที่ 3

# 📝 Background / Why

**ปัญหาปัจจุบัน:**
ทีมงานแชร์ password / API key / SSH key ผ่าน Slack DM, LINE, email, Google Doc
- ❌ ไม่ปลอดภัย (เก็บใน chat history)
- ❌ ไม่มี audit trail (ใครเห็น password ตอนไหน)
- ❌ ไม่มี expiration (รหัส 2 ปีก่อนยังอยู่ใน Slack)
- ❌ ไม่มี access control (คนออก = password ยังอยู่ในมือ)

**Solution:**
ระบบกลางที่:
- เก็บรหัสแบบ persistent (vault) + one-time send (external)
- Zero-knowledge encryption (Phase C)
- Google Workspace SSO + JIT provisioning
- Audit log ครบทุก action
- ใช้งานง่าย: search Cmd+K, browser autofill, CLI

# 🎬 Demo / Reference

**Interactive prototype:** [link to hosted HTML or attached file]
- 11 screens ครอบคลุม flow ทั้งหมด
- กดปุ่ม "Demo Tour" บนแถบด้านบนเพื่อดู walkthrough อัตโนมัติ
- รองรับ light/dark mode

**Confluence documentation:**
- [📋 README — Workspace home](link)
- [📐 DESIGN — Architecture](link)
- [🗺 PHASES — Roadmap](link)
- [📋 REQUIREMENTS — Specs](link)
- [🎯 PRP — Implementation Guide](link)

# ✅ Success Criteria

- [ ] 20+ internal users สมัครและใช้งานจริง ภายใน Week 7
- [ ] 100+ items imported จาก existing tools (1Password etc.)
- [ ] Daily active users ≥ 80% ของ org
- [ ] First CI/CD service token in production ภายใน Week 13
- [ ] Browser extension installed ≥ 80% ของ org ภายใน Week 14
- [ ] External pen test: 0 critical/high findings ภายใน Week 20
- [ ] SOC 2 Type I audit started ภายใน Week 28

# 📊 Phases (5 child stories)

| Phase | Story | Duration | Goal |
|---|---|---|---|
| 0 | WSV-2 | 1 wk | Foundation: repo, CI, schema, design system |
| A | WSV-3 | 6 wks | MVP: SSO + Vault + Import + Bulk |
| B | WSV-4 | 7 wks | Daily Use: Teams + Browser ext + CLI + Service Tokens |
| C | WSV-5 | 6 wks | Zero-Knowledge + Lifecycle: Rotation, Request, Pen test |
| D | WSV-6 | 8+ wks | Enterprise: SCIM, Mobile, Anomaly, SOC 2 |

**Total:** ~28 weeks (≈ 7 months)

# 🧰 Tech Stack (locked)

- **Frontend:** SvelteKit + TypeScript + Tailwind
- **Backend:** Hono + TypeScript (Node.js 20)
- **Database:** PostgreSQL 16 + Drizzle ORM
- **Cache/Queue:** Redis 7 + BullMQ
- **KMS:** AWS KMS (prod), HashiCorp Vault (dev)
- **Storage:** Cloudflare R2
- **CLI:** Rust
- **Browser ext:** TypeScript + Svelte + Manifest V3
- **Infra:** Cloudflare + Fly.io + Neon (Postgres)
- **Monitoring:** Sentry + Grafana Cloud

# 🛡 Security Highlights

- Phase A-B: Server-side envelope encryption (KMS-wrapped DEK)
- Phase C+: Zero-knowledge — server cannot decrypt anything
- AES-256-GCM symmetric encryption
- X25519 key exchange (Phase C+)
- Argon2id KDF (t=3, m=64MB, p=4)
- TLS 1.3 only + HSTS preload
- External pen test before public launch

# 👥 Team & Resources

- 2 Backend Engineers
- 1 Frontend Engineer
- 1 Designer (part-time)
- 0.5 SRE
- Security review (external, Phase C)

# ⚠ Top Risks

1. 🔴 Google OAuth consent review delay (1-2 weeks) — **apply Day 1**
2. 🔴 Users stick to Slack DMs — mitigate with browser ext + leadership mandate
3. 🟠 Zero-knowledge migration data loss — 30d rollback retention
4. 🟠 Chrome Web Store review delays — submit beta early Phase B
5. 🟠 Single owner risk (no break-glass yet) — Phase D4 must ship before scale

# 📎 Attachments

- `prototype.html` — Interactive demo (open in browser)
- `DESIGN.pdf` — Architecture document
- `REQUIREMENTS.pdf` — Spec document
- `PRP.pdf` — Implementation guide

# 🔗 Links

- 📚 Confluence Space: [Woxa Secret Vault](link)
- 🎨 Figma (when designs available): [link]
- 📊 Notion roadmap (mirror): [link]
- 💬 Slack channel: `#woxa-vault-dev`
- 🚨 Incident response: PagerDuty `woxa-vault` service
```

---

# 📋 Child Stories (5 stories)

## Story 1 — Phase 0: Foundation

### Field Values

| Field | Value |
|---|---|
| **Issue Type** | Story |
| **Epic Link** | WSV-1 |
| **Summary** | `[Phase 0] Foundation — Repo, CI, schema, design system` |
| **Priority** | 🔴 Highest |
| **Story Points** | 5 |
| **Sprint** | Sprint 1 (Week 1) |
| **Labels** | `phase-0` `setup` |
| **Components** | `Infrastructure` `Backend` `Frontend` |

### Description

```markdown
# 🎯 Goal
Skeleton ready. ทุกคนใน team สามารถ run locally ภายใน 15 นาที. CI green. DB migrations work.

# 📋 Tasks (sub-tasks ภายใน)

## Backend
- [ ] Initialize pnpm workspace (apps/, packages/)
- [ ] Hono server skeleton with `/healthz` endpoint
- [ ] Drizzle ORM setup + initial migration (empty schema, ready)
- [ ] Database schema from DESIGN.md §7 (all tables)
- [ ] Seed script for local dev (sample org + 2 users)
- [ ] OpenAPI spec generator

## Frontend
- [ ] SvelteKit + TypeScript + Tailwind setup
- [ ] Design tokens from DESIGN.md §8.4
- [ ] Base components: Button, Input, Card, Badge, Toast, Modal
- [ ] Storybook for component dev
- [ ] Layout shell (sidebar + main area)

## Infra
- [ ] GitHub Actions CI: lint, typecheck, test, build
- [ ] Docker Compose for local: postgres, redis, mailcatcher
- [ ] Preview deployments (Cloudflare Pages)
- [ ] Secret scanning (gitleaks)
- [ ] `.env.example` with all needed vars

## Docs
- [ ] CONTRIBUTING.md with setup instructions
- [ ] pnpm scripts: dev, test, migrate, seed

# ✅ Acceptance Criteria
- [ ] `git clone && pnpm install && pnpm dev` works in < 15 min
- [ ] CI passes on first PR
- [ ] DB migrations apply cleanly
- [ ] Storybook shows 6 base components
- [ ] Production deployment skeleton (empty homepage) live

# 🧪 Validation
\`\`\`bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
docker compose up -d
pnpm --filter @woxa/api db:migrate && pnpm --filter @woxa/api db:seed
pnpm build
curl http://localhost:3000/healthz  # Expected: {"ok":true}
\`\`\`

# 📚 References
- [PRP.md §Phase 0](confluence-link)
- [DESIGN.md §7 Database Schema](confluence-link)
```

---

## Story 2 — Phase A: MVP

### Field Values

| Field | Value |
|---|---|
| **Issue Type** | Story |
| **Epic Link** | WSV-1 |
| **Summary** | `[Phase A] MVP — Google SSO + Vault + Import + Bulk operations` |
| **Priority** | 🔴 Highest |
| **Story Points** | 34 |
| **Sprint** | Sprints 2-7 (Weeks 2-7) |
| **Labels** | `phase-a` `mvp` `sso` |
| **Components** | `Backend` `Frontend` `Security` |

### Description

```markdown
# 🎯 Goal
Internal iux24 team uses daily. 100+ items stored. Zero passwords in Slack.

# 📋 Sprints (sub-tasks)

## Sprint A1 (Week 2): Auth + Google Workspace SSO
- [ ] Google OAuth setup (Cloud Console, consent screen)
- [ ] `/auth/google` redirect with `hd=iux24.com` parameter
- [ ] `/auth/google/callback` — verify ID token + hd claim
- [ ] JIT provisioning for verified domains
- [ ] Master password fallback (Argon2id)
- [ ] Session management (JWT + httpOnly cookie)
- [ ] Rate limiting (5 attempts / 15 min)

## Sprint A2 (Week 3): Org + Vault/Folder/Item + KMS
- [ ] Organization CRUD + setup wizard (4 steps)
- [ ] Domain verification via TXT record
- [ ] Vault, Folder, Item CRUD (Login type)
- [ ] Server-side envelope encryption with KMS
- [ ] DEK cache (5min LRU)
- [ ] Soft delete with 30-day trash

## Sprint A3 (Week 4): Item UX
- [ ] Universal search (Cmd+K) with fuzzy match
- [ ] Item detail page with reveal/copy
- [ ] Clipboard auto-clear (30s)
- [ ] TOTP code generation + countdown
- [ ] Favorites + Recently used

## Sprint A4 (Week 5): Sharing + 2FA + Sessions
- [ ] Vault access management
- [ ] TOTP 2FA setup with QR code + backup codes
- [ ] WebAuthn / Passkey registration
- [ ] Session list + revoke
- [ ] Force 2FA org policy
- [ ] Login alert email on new device

## Sprint A5 (Week 6, 3 days): Import Wizard 🆕
- [ ] Importers: 1Password (1pux), Bitwarden (JSON), LastPass (CSV), generic CSV
- [ ] Dry-run preview (first 50 items)
- [ ] Field mapping UI
- [ ] Conflict policy: skip / overwrite / append "(2)"
- [ ] Background worker (BullMQ)
- [ ] Error CSV downloadable

## Sprint A6 (Week 6, 2 days): Bulk Operations 🆕
- [ ] Multi-select checkboxes
- [ ] Floating action bar
- [ ] Bulk: share, move, delete, tag, favorite
- [ ] Transaction wrap with skip-on-no-permission

## Sprint A7 (Week 7): Audit + Polish + Soft Launch
- [ ] Audit log: all auth.*, item.*, vault.*, member.* events
- [ ] /audit page with filters (admin only)
- [ ] CSV export
- [ ] Background jobs: cleanup expired sessions + soft-deleted items
- [ ] Onboarding tour
- [ ] Production deployment (Fly.io + Cloudflare)
- [ ] Sentry + Grafana monitoring
- [ ] Internal launch to 5+ users

# ✅ Acceptance Criteria
- [ ] All US-001 through US-052 met (see REQUIREMENTS.md §3)
- [ ] All FR-001 to FR-085 implemented (where Phase=A)
- [ ] Login latency < 1s P95
- [ ] Search latency < 100ms P95 for 1000 items
- [ ] Lighthouse: Performance > 90, A11y > 95
- [ ] Internal team of 5+ active for 1 week
- [ ] 100+ items imported
- [ ] Zero P0/P1 bugs in Sentry

# 🚨 Key Risks
- 🔴 Google OAuth consent review (1-2 wks) — apply Day 1 of A1
- 🟠 1Password 1pux format changes — pin parser version
```

---

## Story 3 — Phase B: Daily Use Features

### Field Values

| Field | Value |
|---|---|
| **Issue Type** | Story |
| **Epic Link** | WSV-1 |
| **Summary** | `[Phase B] Daily Use — Teams + Browser Extension + CLI + Service Tokens` |
| **Priority** | 🟠 High |
| **Story Points** | 34 |
| **Sprint** | Sprints 8-14 (Weeks 8-14) |
| **Labels** | `phase-b` `daily-use` `extension` `cli` |

### Description

```markdown
# 🎯 Goal
80%+ org installed browser extension. First CI/CD service token in production.

# 📋 Sprints

## Sprint B1 (Week 8): Teams + Role Hierarchy
- [ ] Teams CRUD
- [ ] Team member management
- [ ] vault_access supports principal_type='team'
- [ ] Access resolution: user > team > domain

## Sprint B2 (Week 9): Google Groups → Teams Sync
- [ ] Google Admin SDK integration (directory.groups.readonly)
- [ ] Service account with domain-wide delegation
- [ ] Group → Team mapping config UI
- [ ] Sync job (every 15 min) + on-login sync

## Sprint B3 (Week 10): Folder/Item ACL + Granular Permissions
- [ ] Folder-level ACL (inherit from vault, override)
- [ ] Item-level ACL override
- [ ] Permission atoms: view_metadata, view_password, copy_password, view_totp, edit_metadata, edit_password, share, delete, manage_access, export
- [ ] Preset roles → permission set mapping
- [ ] "Who can access" reasoning trace

## Sprint B4 (Week 11): All Item Types + Attachments
- [ ] Item types: API Key, SSH Key, Note, Card, Identity (Login from A)
- [ ] Custom fields per item
- [ ] Attachment upload (chunked, max 25MB)
- [ ] Encrypted storage in Cloudflare R2

## Sprint B5 (Week 12): One-time Send
- [ ] POST /sends, GET /s/:token, POST /s/:token/burn
- [ ] URL fragment encryption (key in #, not on server)
- [ ] "Reveal" guard against link-preview bots
- [ ] Optional email lock + passphrase
- [ ] Send management UI
- [ ] Recipient view (public)

## Sprint B6 (Week 13): Service Tokens + CLI v1 🆕
- [ ] Service token model (scoped: items / vault path / tag)
- [ ] IP allowlist (CIDR)
- [ ] Mandatory expiration (max 1 year)
- [ ] Zero-downtime rotation (7-day overlap)
- [ ] CLI in Rust: login, list, get, send, env get
- [ ] Cross-platform distribution (Homebrew, install script)
- [ ] OS keychain for refresh token

## Sprint B7 (Week 14): Browser Extension v1 🆕
- [ ] Extension scaffold (Chrome + Firefox + Edge, Manifest V3)
- [ ] Background service worker (session + cache)
- [ ] Content script: detect login forms
- [ ] Match items by URL domain
- [ ] Floating dropdown for autofill
- [ ] Cmd+Shift+L (fill) + Cmd+Shift+F (search)
- [ ] Auto-lock after 15 min idle
- [ ] Submit to Chrome Web Store (review takes 2-4 wks)

# ✅ Acceptance Criteria
- [ ] All US-053-055 + B-tier stories met
- [ ] Browser ext installed by 80% of internal users
- [ ] First production service token in use (e.g., GitHub Actions)
- [ ] CLI installable via Homebrew
- [ ] Mobile responsive verified (iPhone Safari + Android Chrome)
```

---

## Story 4 — Phase C: Zero-Knowledge + Lifecycle

### Field Values

| Field | Value |
|---|---|
| **Issue Type** | Story |
| **Epic Link** | WSV-1 |
| **Summary** | `[Phase C] Zero-Knowledge Encryption + Password Rotation + Pen Test` |
| **Priority** | 🟠 High |
| **Story Points** | 29 |
| **Sprint** | Sprints 15-20 (Weeks 15-20) |
| **Labels** | `phase-c` `zero-knowledge` `security` `compliance` |

### Description

```markdown
# 🎯 Goal
Server cannot decrypt anything. External pen test passed (0 critical/high). Lifecycle features shipped.

# 📋 Sprints

## Sprint C1 (Week 15): Client Crypto Library
- [ ] packages/crypto with Web Crypto API wrappers
- [ ] Argon2id (WASM via hash-wasm or @noble/hashes)
- [ ] AES-256-GCM encrypt/decrypt
- [ ] X25519 keypair gen, ECDH, key wrap
- [ ] HKDF-SHA-256 derive
- [ ] NIST test vectors pass
- [ ] Performance: encrypt 1MB < 100ms

## Sprint C2 (Week 16): User Keypair + Master Password Flow
- [ ] Signup: keypair generation in browser
- [ ] Login: send auth_key_hash (NOT master pw)
- [ ] Master pw change re-encrypts private key
- [ ] Strength meter (zxcvbn)
- [ ] HIBP k-anonymity breach check

## Sprint C3 (Week 17): Vault Key Wrapping
- [ ] Vault key encrypted per user with public key
- [ ] Share = re-wrap with recipient's pubkey
- [ ] All item I/O client-side encrypted
- [ ] Loading states for crypto operations

## Sprint C4 (Week 18, 3 days): Password Rotation + Reminders 🆕
- [ ] Schema: password_changed_at, rotation_policy_days, expires_at
- [ ] Org-level rotation defaults (e.g., production = 90 days)
- [ ] Dashboard widget: "12 secrets need rotation"
- [ ] Item badges: Fresh / Aging / Due / Overdue / Expired
- [ ] Weekly digest email to owners

## Sprint C5 (Week 18, 2 days): Permission Request Workflow 🆕
- [ ] access_requests table
- [ ] "Request Access" button on metadata-only items
- [ ] Approver UI: Approve / Deny / Counter-offer / Ask
- [ ] Auto-deny after 7 days pending
- [ ] Time-limited grants

## Sprint C6 (Week 19): Migration Tool + Recovery Kit
- [ ] One-time migration: server-side → zero-knowledge
- [ ] 30-day rollback retention
- [ ] 24-word mnemonic (BIP39) Recovery Kit
- [ ] PDF generation for printable recovery
- [ ] Admin-assisted recovery flow

## Sprint C7 (Week 20): Blind Index Search + Pen Test
- [ ] search_hash = HMAC(server_secret, name)
- [ ] Server-assisted hashing endpoint
- [ ] External pen test (hire firm)
- [ ] HackerOne private bounty
- [ ] Fix all critical/high findings before GA

# ✅ Acceptance Criteria
- [ ] Network inspection proves zero-knowledge (no plaintext to server)
- [ ] grep "master_password" in apps/api/src → 0 matches
- [ ] Migration tool: 0 data loss verified by before/after diff
- [ ] Pen test report: 0 Critical, 0 High (or all fixed)
- [ ] Recovery Kit tested by real user
```

---

## Story 5 — Phase D: Enterprise

### Field Values

| Field | Value |
|---|---|
| **Issue Type** | Story |
| **Epic Link** | WSV-1 |
| **Summary** | `[Phase D] Enterprise — SCIM, Mobile, Compliance, SOC 2 prep` |
| **Priority** | 🟡 Medium |
| **Story Points** | 40 |
| **Sprint** | Sprints 21-28+ (Weeks 21-28+, rolling) |
| **Labels** | `phase-d` `enterprise` `mobile` `compliance` `soc2` |

### Description

```markdown
# 🎯 Goal
SCIM auto-provisioning. Mobile apps. Compliance reports. First enterprise customer signed. SOC 2 Type I audit started.

# 📋 Sprints

## D1 (Week 21): SCIM 2.0 Provisioning
- [ ] /scim/v2/Users and /scim/v2/Groups endpoints
- [ ] Bearer token auth for SCIM
- [ ] Google Workspace SCIM app config
- [ ] Azure AD SCIM config

## D2 (Week 22): Browser Extension v2
- [ ] Detect signup forms → offer save
- [ ] Inline password generator
- [ ] Iframe autofill (Stripe etc.)
- [ ] Smart form detection (ML-assisted)

## D3 (Week 23, 3 days): Auditor Role + Compliance Reports 🆕
- [ ] Auditor role (metadata + audit only, no decrypt)
- [ ] Time-limited invitation (max 30 days)
- [ ] PDF report templates: SOC 2 Access Matrix, Change Log, PDPA, Custom
- [ ] Org-branded signed PDFs

## D4 (Week 23, 2 days): Break-Glass / Emergency Access 🆕
- [ ] Designated contacts (M of N approval, default 2 of 3)
- [ ] Cooldown period (default 48h)
- [ ] Heavy audit on every emergency action
- [ ] Owner can cancel during cooldown

## D5 (Weeks 24-25): Mobile Apps
- [ ] React Native (iOS + Android)
- [ ] Biometric unlock (Face ID, Touch ID, Android Biometric)
- [ ] iOS Autofill Provider
- [ ] Android Autofill Service
- [ ] Offline cached vault (24h staleness)
- [ ] Push notifications

## D6 (Week 26): Desktop App (Tauri)
- [ ] Tauri shell
- [ ] OS keychain for refresh token
- [ ] System tray quick search

## D7 (Week 27): Anomaly Detection
- [ ] User behavior baseline (30-day rolling)
- [ ] Triggers: 10× volume, geo jump, off-hours, failed 2FA spike
- [ ] Auto-mitigation: alert, re-auth, lock
- [ ] Slack + PagerDuty integration

## D8 (Week 28+): HSM + BYOK + SOC 2 Prep
- [ ] AWS CloudHSM integration (Enterprise tier)
- [ ] BYOK API
- [ ] Vanta or Drata for compliance monitoring
- [ ] Document all controls (SOC 2 CC criteria)
- [ ] Schedule SOC 2 Type I audit

# ✅ Acceptance Criteria
- [ ] SCIM verified with Google Workspace (user added → appears in < 1min)
- [ ] Auditor invited, sees metadata, blocked from decrypting
- [ ] Break-glass simulation: 3 contacts, 2 approve, 48h cooldown
- [ ] Mobile apps live in App Store + Play Store
- [ ] Anomaly alert fires correctly
- [ ] SOC 2 Type I audit kicked off
- [ ] First external enterprise customer signed
```

---

# 🎟 Sub-task Template (per sprint)

Use this template สำหรับ sub-tasks ใน Story:

```
Summary: [WSV-X] Sprint AY — Task description
Issue Type: Sub-task
Parent: <Story key>
Sprint: <Sprint name>
Story Points: 1-5
Labels: phase-a, backend / frontend / infra
Components: Backend / Frontend / Infrastructure / Security
Assignee: <dev name>

Description:
# What
<one-paragraph task description>

# Files involved
- apps/api/src/routes/auth.ts
- apps/web/src/routes/(auth)/welcome/+page.svelte

# Reference
- [PRP.md §A1.2 — Routes](confluence-link)
- [DESIGN.md §6 — Encryption](confluence-link)

# Acceptance
- [ ] Specific criterion 1
- [ ] Specific criterion 2
- [ ] Unit tests added
- [ ] E2E test for primary flow
- [ ] Code reviewed by another senior
- [ ] Deployed to staging

# Testing notes
\`\`\`bash
# How to verify
\`\`\`
```

---

# 🏷 Labels Convention

| Label | Use for |
|---|---|
| `phase-0` `phase-a` `phase-b` `phase-c` `phase-d` | Phase grouping |
| `backend` `frontend` `infra` `cli` `extension` `mobile` | Component scope |
| `security` `crypto` `auth` | Security-related |
| `bug` `enhancement` `tech-debt` `documentation` | Type of work |
| `blocked` `needs-design` `needs-spec` | Status indicators |
| `p0-blocker` `p1-high` `p2-medium` `p3-low` | Priority (also use Priority field) |
| `q3-2026` `q4-2026` | Quarter target |
| `external-dependency` | Waiting on outside party |

---

# 🔄 Workflow & Status

```
Backlog → To Do → In Progress → In Review → QA → Done
                                              ↘ Blocked (any state)
```

**Standard transitions:**
- **To Do → In Progress:** Dev claims, sets owner, starts work
- **In Progress → In Review:** PR opened, code review starts
- **In Review → QA:** PR merged, deployed to staging
- **QA → Done:** Acceptance criteria all checked, demo'd
- **→ Blocked:** with comment explaining blocker + link to dependency

---

# 📅 Sprint Setup

| Sprint # | Dates | Phase | Stories Active |
|---|---|---|---|
| Sprint 1 | 2026-05-19 → 2026-05-25 | 0 | WSV-2 (Foundation) |
| Sprint 2 | 2026-05-26 → 2026-06-01 | A | WSV-3 (A1) |
| Sprint 3 | 2026-06-02 → 2026-06-08 | A | WSV-3 (A2) |
| Sprint 4 | 2026-06-09 → 2026-06-15 | A | WSV-3 (A3) |
| Sprint 5 | 2026-06-16 → 2026-06-22 | A | WSV-3 (A4) |
| Sprint 6 | 2026-06-23 → 2026-06-29 | A | WSV-3 (A5, A6) |
| Sprint 7 | 2026-06-30 → 2026-07-06 | A | WSV-3 (A7) |
| Sprint 8-14 | 2026-07-07 → 2026-08-24 | B | WSV-4 |
| Sprint 15-20 | 2026-08-25 → 2026-10-05 | C | WSV-5 |
| Sprint 21+ | 2026-10-06 → 2026-12-01+ | D | WSV-6 |

---

# 📊 Dashboard / Filters

แนะนำสร้าง Jira dashboard ที่มี:

1. **WSV Epic burndown** — JQL: `"Epic Link" = WSV-1`
2. **Active sprint board** — Scrum board view
3. **By Component** — pie chart of Backend/Frontend/Infra/Security counts
4. **Blocked items** — JQL: `status = Blocked AND project = WSV`
5. **Recently updated** — last 7 days
6. **High priority queue** — JQL: `priority in (Highest, High) AND status != Done`

---

# 🤝 Stakeholder Comm Plan

| Audience | Channel | Cadence | Format |
|---|---|---|---|
| Engineering team | `#woxa-vault-dev` Slack | Daily | Standup updates |
| Product / Design | `#woxa-vault-product` | Weekly | Sprint review |
| Leadership | Email + Confluence | Bi-weekly | Status report |
| All-hands | Town hall | End of phase | Demo + Q&A |
| External users (Phase D+) | Customer email | Per release | Release notes |

---

# ✏️ Comment Templates

## Status Update (post in Jira comment)
```
**Sprint X update — [date]**

✅ Done this sprint:
- [task] — link to PR/commit

🚧 In progress:
- [task]

⚠️ Blockers:
- [issue] — needs: [what]

📅 Next sprint focus:
- [task]
```

## Code Review Hand-off
```
PR ready for review: [link]

**What:** [one-line summary]
**Risk:** [low / medium / high]
**Testing:** [unit / e2e / manual?]
**Reviewers needed:** [@person1 for backend, @person2 for security]

Acceptance criteria addressed:
- [x] AC-1
- [x] AC-2
```

## Demo / Sign-off
```
Sprint demo scheduled: [date] [time]

Will demo:
- [feature 1] — completing US-XXX
- [feature 2] — completing FR-YYY

Demo environment: [staging URL]
Required attendees: @PO @design-lead
```

---

# 🔧 Setup Checklist (Admin)

ก่อนเริ่ม dev:

- [ ] สร้าง Jira project `WSV` (Software, Scrum)
- [ ] สร้าง Confluence Space "Woxa Secret Vault"
- [ ] Upload 5 docs (.md files) เป็น Confluence pages
- [ ] สร้าง Epic + 5 Stories ตาม draft นี้
- [ ] สร้าง Sub-tasks ตาม PRP.md (ใช้ template ด้านบน)
- [ ] Link Epic ↔ Confluence space
- [ ] สร้าง Slack channel `#woxa-vault-dev`
- [ ] Setup CI/CD (GitHub Actions → Jira integration via Atlassian for GitHub app)
- [ ] กำหนด sprint cadence (weekly, Monday start)
- [ ] Assign Engineering Lead (Reporter → Assignee transfer for Epic)
- [ ] Schedule kickoff meeting + share Epic link with team

---

# 📝 Quick-Reference: Field-by-Field

**For Epic (WSV-1):**
```
Summary:      [EPIC] Woxa Secret Vault — Internal password manager with Google Workspace SSO
Issue Type:   Epic
Priority:     Highest
Labels:       vault, security, internal-tool, q3-2026
Components:   Backend, Frontend, Security, Infrastructure
Start Date:   2026-05-19
Due Date:     2026-12-01
Story Points: 142 (sum of children)
```

**For Stories (WSV-2 to WSV-6):**
ใช้ค่าจาก "Field Values" ของแต่ละ Story ด้านบน

**For Sub-tasks:**
ใช้ template "Sub-task Template" ด้านบน

---

# ⚠ Notes for Project Lead

> 1. **อย่าสร้าง Sub-tasks ทั้งหมดทีเดียว** — สร้างเฉพาะ Sprint ปัจจุบัน + ถัดไป
>    เพื่อไม่ให้ board รก, จะ break ความ flexibility ใน re-planning
>
> 2. **Confluence pages ต้อง sync กับ repo** — ถ้า DESIGN.md update ใน repo
>    ต้องอัปเดต Confluence ด้วย (หรือใช้ Confluence App ที่ sync จาก Git)
>
> 3. **prototype.html ควรอัพโหลด version ใหม่** ทุกครั้งที่มี design change
>    หรือ host ที่ staging URL แล้วใส่ link เดียวใน Epic
>
> 4. **Story Points calibration** — ตัวเลขใน draft นี้ประมาณการ
>    refine ใน sprint planning ครั้งแรก (poker estimate กับ team)
>
> 5. **Phase A6 (Bulk Ops) + A5 (Import)** อยู่ใน sprint เดียวกัน (Week 6)
>    เพราะใน PRP.md แบ่งเป็น 3 + 2 วัน — อาจจะ overcommit
>    ถ้า capacity ไม่พอ ย้าย A6 เป็น Sprint แรกของ Phase B

---

**END OF JIRA DRAFT**

> Copy → paste → ปรับ link/key ตามจริง → submit
