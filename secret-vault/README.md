# 🔐 Woxa Secret Vault — Workspace

```
████████████████████████████████████████████████████████████
█  Secure secret sharing for teams · Zero-knowledge by design  █
████████████████████████████████████████████████████████████
```

> 💡 **About this workspace**
> Internal team password vault + one-time secret sharing service.
> Inspired by 1Password Business, Bitwarden, and Vaultwarden — but with stricter security defaults and tighter Google Workspace integration.

---

## 📋 Properties

| | |
|---|---|
| 🏷 **Status** | 🟡 Design phase · Pre-Phase 0 |
| 📅 **Created** | 2026-05-12 |
| 📅 **Target launch** | Phase A internal: Week 7 · Public beta: Week 13 |
| 👤 **Owner** | ching@iux24.com |
| 👥 **Stakeholders** | iux24 DevOps, Finance, Marketing teams |
| 🎯 **Primary metric** | 100% production credentials in vault by Phase A end |
| 🔒 **Security target** | Zero-knowledge by Phase D · SOC 2 Type I by Phase E |

---

## 📚 Pages in this workspace

| Page | Purpose | Status |
|---|---|---|
| 📐 [**DESIGN.md**](./DESIGN.md) | Architecture, security model, DB schema, API | 🟢 v0.2 |
| 🗺 [**PHASES.md**](./PHASES.md) | Implementation roadmap, sprint plan, tasks | 🟢 v0.2 |
| 🎬 [**prototype.html**](./prototype.html) | Interactive UI prototype (11 screens) | 🟢 Demo-ready |
| 📝 *USE-CASES.md* | Real-world scenarios catalog | ⏸ Planned |
| 📊 *METRICS.md* | KPIs, success criteria, dashboards | ⏸ Planned |

---

## 🎯 The Problem We're Solving

> ⚠️ **Current state**
> ทีมงานแชร์ password/API key ผ่าน Slack DM, LINE, email, Google Doc
> ─ ไม่ปลอดภัย, ไม่มี audit trail, ไม่มี expiration, ไม่มี access control

> ✨ **Desired state**
> ทุก credential อยู่ในระบบกลาง — encrypted, audited, with proper access control
> SSO ผ่าน Google Workspace · จำกัด domain · revoke ได้ทันที

---

## 🏗 System at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│  USER LAYER                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ Web UI   │  │ Browser  │  │ CLI      │  │ Mobile   │         │
│  │ (Svelte) │  │ Extension│  │ (Rust)   │  │ (RN)     │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       └─────────────┴─────────────┴─────────────┘                │
│                           │                                       │
│  ─────────────────────────┼─────────────────────────              │
│  AUTH LAYER               ▼                                       │
│  ┌────────────────────────────────────────────────┐             │
│  │  Google Workspace SSO (hd=iux24.com restricted)│             │
│  │  + Email/Password (Argon2id) + 2FA (TOTP/Passkey)│            │
│  └────────────────────┬───────────────────────────┘             │
│                       │                                          │
│  ─────────────────────┼─────────────────────────                 │
│  APP LAYER            ▼                                          │
│  ┌────────────────────────────────────────────────┐             │
│  │  API (Hono)                                    │             │
│  │  ├─ Vault / Item CRUD                          │             │
│  │  ├─ One-time Send                              │             │
│  │  ├─ Access control (RBAC + ACL)                │             │
│  │  ├─ Audit log                                  │             │
│  │  └─ Service tokens (CI/CD)                     │             │
│  └────┬───────────────────────┬───────────────────┘             │
│       │                       │                                  │
│  ─────┼───────────────────────┼─────────────────                 │
│  DATA │ LAYER                 │                                  │
│       ▼                       ▼                                  │
│  ┌─────────────┐    ┌─────────────────┐                         │
│  │ PostgreSQL  │    │ KMS / Vault     │                         │
│  │ (encrypted  │    │ (envelope key)  │                         │
│  │  ciphertext)│    └─────────────────┘                         │
│  └─────────────┘                                                 │
│                                                                  │
│  ┌─────────────┐    ┌─────────────────┐                         │
│  │ Redis       │    │ S3/R2           │                         │
│  │ (sessions,  │    │ (encrypted      │                         │
│  │  rate-limit)│    │  attachments)   │                         │
│  └─────────────┘    └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗺 Roadmap At-a-Glance

| Phase | Duration | Focus | Critical Outcome |
|---|---|---|---|
| **0** Foundation | 1 wk | Setup, tooling, schema | Dev environment ready |
| **A** MVP | 6 wks | SSO + Vault + Import + Bulk | Internal team uses daily |
| **B** Daily Use | 7 wks | Teams + Browser ext + CLI | Power users hooked |
| **C** Zero-Knowledge | 6 wks | Client-side crypto + Lifecycle | Server can't decrypt anything |
| **D** Enterprise | 8+ wks | SCIM, mobile, compliance | Sell to enterprise |

> 📍 **Total: ~28 weeks (≈ 7 months)** to enterprise-ready
> 🚀 **Internal soft launch: Week 7** (end of Phase A)
> 🌐 **Public beta: Week 14** (end of Phase B)

---

## 🎯 Current Focus

> 🔴 **Phase 0 — Foundation**
> Status: ⏸ Not started · Target start: Week 1
>
> **Next action:** Approve design + spin up repo

### What's blocking us right now
- [ ] Stakeholder sign-off on `DESIGN.md`
- [ ] Approve `PHASES.md` timeline & resource allocation
- [ ] Provision Google Cloud project (for OAuth credentials)
- [ ] Decide tech stack final: Hono+Drizzle vs Rust+Axum
- [ ] Hire / assign: 2 backend, 1 frontend, 0.5 SRE

---

## 💎 Key Design Decisions

| Decision | Choice | Rationale | Locked? |
|---|---|---|---|
| Auth method | Google Workspace SSO (primary) + master password (fallback) | iux24 already on Google Workspace; JIT provisioning saves admin work | ✅ |
| Domain restriction | `hd=iux24.com` at OAuth + server-side verify | Defense in depth | ✅ |
| Encryption (Phase A-B) | Server-side envelope (KMS) | Faster to ship; search-friendly | ✅ |
| Encryption (Phase C+) | Zero-knowledge (client-side) | Insider threat resistance + audit-grade | ✅ |
| Database | PostgreSQL 16 | JSONB, RLS, generated columns | ✅ |
| Backend | Hono (Node + TS) | Fast iteration; team familiar | 🟡 Re-evaluate at Phase D |
| Frontend | SvelteKit + TS | Lightweight, fast HMR | ✅ |
| Browser ext | Manifest v3 (Chrome/Firefox/Edge) | Future-proof | ✅ |

---

## 🔑 Core Concepts (Glossary)

| Term | Definition |
|---|---|
| **Vault** | Container of items with own access list (e.g., "Production") |
| **Folder** | Sub-grouping within vault (e.g., "AWS", "Databases") |
| **Item** | Single secret entry (Login, API Key, SSH Key, Note, Card) |
| **Send** | Ephemeral one-time copy to external recipient |
| **Workspace** | Top-level org tenant (= Google Workspace) |
| **Team** | Group of users for batch access assignment (synced from Google Groups) |
| **JIT Provisioning** | Auto-create user on first SSO login |
| **Zero-Knowledge** | Server holds only ciphertext; cannot decrypt |
| **Envelope Encryption** | DEK encrypted by KEK (in KMS); data encrypted by DEK |
| **Blind Index** | HMAC of plaintext stored alongside ciphertext for search |
| **Burn** | Irreversibly delete after first read |
| **Break-glass** | Emergency access requiring multiple approvers + cooldown |

---

## 🎬 Demo

> 🌐 **Local demo:** `python3 -m http.server 9876` then open `http://localhost:9876/prototype.html`
>
> Click **▶ Run Demo Tour** in the top bar for guided walkthrough of all 11 screens.

### Key flows to demo
1. **Workspace discovery** — email-first routing to correct SSO
2. **Google Workspace SSO** with `hd=iux24.com` restriction
3. **2FA challenge** with TOTP/Passkey
4. **Dashboard** with universal search (Cmd+K)
5. **Item detail** with reveal/copy/TOTP
6. **One-time send** with passphrase + email lock
7. **Recipient view** with burn-after-read
8. **SSO settings** with Google Groups → Teams mapping
9. **Audit log** with JIT provision events

---

## 📊 Success Metrics

### Phase A (Week 7)
- [ ] 20+ internal users sign up
- [ ] 100+ items in vault
- [ ] Zero passwords still in Slack (audit shows usage shifted)
- [ ] Login latency < 500ms (P95)
- [ ] Zero high/critical security findings

### Phase B (Week 14)
- [ ] 80%+ of org enables browser extension
- [ ] First CI/CD service token in production
- [ ] One-time send used 100+ times in 30 days
- [ ] Mean time to revoke departing user < 5 min

### Phase C (Week 20)
- [ ] Zero-knowledge migration: 100% items re-encrypted
- [ ] External pen test report: 0 critical/high findings
- [ ] Account recovery via Recovery Kit tested by real user

### Phase D (Week 28+)
- [ ] 3 external enterprise customers
- [ ] SOC 2 Type I audit complete
- [ ] Mobile app: 50% of users install

---

## ⚠️ Top Risks (live register)

| # | Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | Google OAuth consent review takes 2+ weeks | High | Medium | Apply early in Phase 0; use minimal scopes | @ching |
| 2 | Zero-knowledge migration loses data | Low | Critical | 30-day rollback retention; staged rollout | @backend-lead |
| 3 | Browser extension store review delays | Med | Medium | Submit beta to Chrome Web Store at B6 start | @frontend |
| 4 | Internal users stick to Slack DMs | High | High | Aggressive UX (extension + CLI) + leadership mandate | @ching |
| 5 | KMS cost overruns at scale | Low | Medium | Envelope pattern reduces KMS calls; cache DEK | @infra |
| 6 | Single-owner risk (no break-glass yet) | High | Critical | Phase D D7 must ship before public launch | @ching |

---

## 📞 Contacts

| Role | Person |
|---|---|
| Product Owner | ching@iux24.com |
| Engineering Lead | _TBD_ |
| Security Reviewer | _TBD (external)_ |
| Design | _TBD_ |
| Stakeholder (DevOps) | _TBD_ |

---

## 📝 Changelog

| Date | Version | Change |
|---|---|---|
| 2026-05-12 | v0.2 | Notion-style restructure · Added README · Re-prioritized phases based on usage review (Import/Bulk/CLI/Browser ext moved earlier) |
| 2026-05-12 | v0.1 | Initial design + prototype |

---

<div align="center">

🔐 **Built for iux24** · with security as default, not an afterthought

</div>
