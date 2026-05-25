# 🎯 PRP — Woxa Secret Vault Implementation

> **Product Requirements Prompt** สำหรับ Claude Code execution
> Version 1.0 · 2026-05-12
> Companions: [REQUIREMENTS.md](./REQUIREMENTS.md) · [DESIGN.md](./DESIGN.md) · [PHASES.md](./PHASES.md) · [prototype.html](./prototype.html)

---

## 📋 How to Use This PRP

> 💡 **PRP execution pattern (one-shot per phase):**
> 1. Read this PRP top to bottom
> 2. Read referenced docs ([REQUIREMENTS.md](./REQUIREMENTS.md), [DESIGN.md](./DESIGN.md))
> 3. Execute Phase 0 in order; run validation gates
> 4. After all Phase 0 gates pass, move to Phase A
> 5. Repeat for Phase B, C, D
>
> Each phase has:
> - 🎯 **Goal** — what success looks like
> - 📦 **Tasks** — ordered work items with file paths
> - 🧪 **Validation gates** — must pass before next phase
> - ⚠️ **Gotchas** — known pitfalls

---

## 🎯 Goal

Build a Google Workspace-integrated secret vault for iux24 with one-time send capability. Server-side encryption initially, migrating to zero-knowledge in Phase C. Browser extension + CLI for daily use. Production-ready in ~28 weeks.

## ✅ Success Criteria

- [ ] iux24 team uses daily (80%+ DAU) by Week 7
- [ ] 100+ items imported from existing tools (1Password etc.)
- [ ] First CI/CD service token in production by Week 13
- [ ] Browser extension installed by 80% of org by Week 14
- [ ] External pen test: 0 critical/high findings by Week 20
- [ ] SOC 2 Type I audit started by Week 28

## 🔍 Why This Matters

ทีม iux24 ใช้ Slack DM / Google Doc / email ส่ง credential อยู่ → ไม่ปลอดภัย, ไม่มี audit, ไม่มี revoke ทันที ระบบนี้แก้ทั้ง 4 ข้อ + เป็น foundation ของ compliance (SOC 2/PDPA) ในอนาคต

---

## 📚 Context Bundle

> Read these BEFORE writing any code:

| File | Why |
|---|---|
| [REQUIREMENTS.md](./REQUIREMENTS.md) | User stories, FR/NFR, acceptance criteria |
| [DESIGN.md §5-7](./DESIGN.md#5-security-architecture) | Security model, encryption, full DB schema |
| [DESIGN.md §9](./DESIGN.md#9-api-design-high-level) | API endpoint reference |
| [DESIGN.md §11-19](./DESIGN.md#11-granular-permissions-model) | Governance: permissions, rotation, service tokens, browser ext |
| [PHASES.md](./PHASES.md) | Sprint-by-sprint task breakdown |
| [prototype.html](./prototype.html) | UI reference (open in browser) |

### External References (read on demand)
- Hono docs: https://hono.dev
- Drizzle ORM: https://orm.drizzle.team
- SvelteKit: https://kit.svelte.dev
- Lucia v3 auth: https://lucia-auth.com
- Google OAuth `hd` param: https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters
- OWASP Password Storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Argon2id params: https://datatracker.ietf.org/doc/html/rfc9106
- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API

---

## 🏗 Target Repository Structure

```
woxa-vault/
├── apps/
│   ├── web/                          # SvelteKit frontend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── +layout.svelte
│   │   │   │   ├── +page.svelte             # Dashboard
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── welcome/+page.svelte
│   │   │   │   │   ├── login/+page.svelte
│   │   │   │   │   └── setup/+page.svelte
│   │   │   │   ├── (app)/
│   │   │   │   │   ├── vault/[id]/+page.svelte
│   │   │   │   │   ├── item/[id]/+page.svelte
│   │   │   │   │   ├── import/+page.svelte
│   │   │   │   │   ├── sends/+page.svelte
│   │   │   │   │   ├── members/+page.svelte
│   │   │   │   │   ├── audit/+page.svelte
│   │   │   │   │   └── settings/
│   │   │   │   └── s/[token]/+page.svelte   # Public recipient view
│   │   │   ├── lib/
│   │   │   │   ├── components/               # Reusable UI
│   │   │   │   ├── stores/                    # Svelte stores
│   │   │   │   ├── api/                       # Typed API client
│   │   │   │   ├── crypto/                    # Client-side crypto wrappers
│   │   │   │   └── utils/
│   │   │   └── app.html
│   │   ├── static/
│   │   ├── tests/
│   │   └── package.json
│   │
│   └── api/                          # Hono backend
│       ├── src/
│       │   ├── index.ts                       # Entry point
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── orgs.ts
│       │   │   ├── vaults.ts
│       │   │   ├── items.ts
│       │   │   ├── sends.ts
│       │   │   ├── audit.ts
│       │   │   ├── members.ts
│       │   │   ├── imports.ts
│       │   │   └── service-tokens.ts
│       │   ├── middleware/
│       │   │   ├── auth.ts
│       │   │   ├── rate-limit.ts
│       │   │   └── audit.ts
│       │   ├── db/
│       │   │   ├── schema.ts                  # Drizzle schema
│       │   │   └── migrations/
│       │   ├── lib/
│       │   │   ├── crypto.ts                  # KMS envelope, hashing
│       │   │   ├── google-oauth.ts
│       │   │   ├── email.ts
│       │   │   ├── totp.ts
│       │   │   └── importers/
│       │   │       ├── onepassword.ts
│       │   │       ├── bitwarden.ts
│       │   │       └── csv.ts
│       │   ├── jobs/
│       │   │   ├── cleanup-sessions.ts
│       │   │   ├── cleanup-trash.ts
│       │   │   └── expire-sends.ts
│       │   └── workers/
│       │       └── import-worker.ts
│       └── tests/
│
├── packages/
│   ├── shared/                       # Types shared between web + api
│   │   └── src/
│   │       ├── types.ts
│   │       └── validators.ts          # Zod schemas
│   │
│   └── crypto/                       # Shared crypto primitives
│       └── src/
│           ├── argon2.ts
│           ├── aes-gcm.ts
│           ├── x25519.ts
│           └── hkdf.ts
│
├── extension/                        # Browser extension (Phase B)
│   ├── manifest.json
│   ├── src/
│   │   ├── background.ts
│   │   ├── content-script.ts
│   │   ├── popup/                     # Svelte
│   │   └── options/
│   └── icons/
│
├── cli/                              # Rust CLI (Phase B)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       ├── commands/
│       │   ├── login.rs
│       │   ├── get.rs
│       │   ├── list.rs
│       │   └── send.rs
│       └── keychain.rs
│
├── infra/
│   ├── docker-compose.yml             # Local dev
│   ├── fly.toml                       # Production
│   └── terraform/                     # IaC for KMS, R2, etc.
│
├── docs/                             # Public docs (Phase A6)
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy.yml
│       └── extension-build.yml
│
├── package.json                       # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── REQUIREMENTS.md
├── DESIGN.md
├── PHASES.md
├── PRP.md                             # This file
├── README.md
└── prototype.html
```

---

## ⚠️ Critical Gotchas (Read FIRST)

### Security
- ⚠️ **NEVER log decrypted content.** Audit log gets action + target_id only, never `payload`.
- ⚠️ **`hd` parameter is client-side hint — MUST verify server-side from ID token claims.**
- ⚠️ **URL fragment (`#key`) is NOT sent to server.** Test this in network tab.
- ⚠️ **Argon2id params:** `t=3, m=64MB, p=4`. Don't reduce for "performance" — these are minimums per OWASP.
- ⚠️ **TOTP secrets must be encrypted at rest** even in Phase A (alongside password).
- ⚠️ **Refresh token rotation race:** use Redis lock or transaction.

### Crypto
- ⚠️ **AES-GCM IV: 96-bit random, never reuse with same key.** Use `crypto.getRandomValues()`.
- ⚠️ **Web Crypto API is async** — wrap in proper await/Promise chains.
- ⚠️ **Argon2id in browser:** native not available; use WASM (`@noble/hashes` or `hash-wasm`).
- ⚠️ **Don't roll your own crypto.** Use Web Crypto API + audited libs (@noble/* family preferred).

### Database
- ⚠️ **All access checks at DB level OR application layer with same logic.** Don't trust client.
- ⚠️ **Use Postgres `JSONB` not `JSON`** — JSONB has better indexing.
- ⚠️ **Soft delete pattern:** `deleted_at TIMESTAMPTZ` on every user-visible entity.
- ⚠️ **Foreign keys with `ON DELETE CASCADE`** for ownership relationships only. Use SET NULL for references.

### API
- ⚠️ **CORS:** allow only `https://vault.iux24.com` (production), `http://localhost:5173` (dev).
- ⚠️ **Cookie:** `SameSite=Strict; Secure; HttpOnly; Path=/`.
- ⚠️ **Rate limit BEFORE authentication** to prevent enumeration.
- ⚠️ **Error responses:** never reveal whether email exists ("Invalid email or password" generic).

### Frontend
- ⚠️ **Don't store master password in any state.** Derive key → use → zeroize.
- ⚠️ **Clipboard clear timeout:** 30s default; user-configurable up to 5min.
- ⚠️ **`history.replaceState`** after decrypt to strip URL fragment.
- ⚠️ **SvelteKit SSR:** routes that need auth must use `+layout.server.ts` for redirect.

### Testing
- ⚠️ **Test the bots-can't-burn-secret behavior** — use Playwright with fake user agents.
- ⚠️ **Test clipboard clear** — Playwright can read clipboard with permission.
- ⚠️ **Test JIT provisioning** with multiple Google account fixtures.

---

# 🟦 Phase 0 — Foundation (Week 1)

## 🎯 Goal
Skeleton ready. All team members can run locally in < 15 minutes. CI green. DB migrations work.

## 📦 Tasks (in order)

### 0.1 Initialize pnpm Workspace

**Files to create:**
- `package.json` (root)
- `pnpm-workspace.yaml`
- `turbo.json`
- `.gitignore`
- `.nvmrc` (Node 20)

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```json
// package.json (root)
{
  "name": "woxa-vault",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "db:migrate": "pnpm --filter @woxa/api db:migrate",
    "db:seed": "pnpm --filter @woxa/api db:seed"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.5.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

### 0.2 Backend Skeleton (`apps/api`)

**Files to create:**
- `apps/api/package.json` — deps: hono, @hono/node-server, drizzle-orm, drizzle-kit, pg, pino, zod, lucia, oslo
- `apps/api/src/index.ts` — Hono app entry
- `apps/api/src/db/schema.ts` — Initial schema (empty, ready for migrations)
- `apps/api/drizzle.config.ts`
- `apps/api/tsconfig.json`

**Pseudocode for `index.ts`:**
```ts
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { serve } from '@hono/node-server';

const app = new Hono();
app.use('*', logger());
app.use('*', secureHeaders({ /* CSP, HSTS, etc. */ }));
app.use('/api/*', cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true }));

app.get('/healthz', (c) => c.json({ ok: true, ts: Date.now() }));

// Routes registered here in later sprints

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`API on :${port}`);
```

### 0.3 Database Setup

**Files:**
- `apps/api/src/db/schema.ts` — copy ALL tables from [DESIGN.md §7](./DESIGN.md#7-database-schema) as Drizzle definitions
- `apps/api/drizzle.config.ts`
- `apps/api/migrations/0000_init.sql` — generated by `drizzle-kit generate`
- `apps/api/src/db/seed.ts` — sample org + 2 users for dev
- `infra/docker-compose.yml` — postgres 16, redis 7, mailcatcher

**Schema generation:**
```bash
pnpm --filter @woxa/api drizzle-kit generate
pnpm --filter @woxa/api drizzle-kit migrate
```

**docker-compose.yml:**
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: woxa
      POSTGRES_USER: woxa
      POSTGRES_PASSWORD: woxa
    ports: ["5432:5432"]
    volumes: ["pg_data:/var/lib/postgresql/data"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  mailcatcher:
    image: schickling/mailcatcher
    ports: ["1080:1080", "1025:1025"]
volumes:
  pg_data:
```

### 0.4 Frontend Skeleton (`apps/web`)

**Files to create:**
- `apps/web/package.json` — deps: svelte, @sveltejs/kit, tailwindcss, lucide-svelte, zod, ofetch
- `apps/web/svelte.config.js`
- `apps/web/vite.config.ts`
- `apps/web/tailwind.config.ts` — colors/spacing from DESIGN.md §8.4
- `apps/web/src/app.html`
- `apps/web/src/routes/+layout.svelte` — base layout
- `apps/web/src/routes/+page.svelte` — placeholder
- `apps/web/src/lib/components/Button.svelte`, `Input.svelte`, `Card.svelte`, `Badge.svelte`, `Modal.svelte`, `Toast.svelte`
- `apps/web/.storybook/main.ts`

**tailwind.config.ts (colors from prototype.html):**
```ts
export default {
  content: ['./src/**/*.{html,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0f',
        'bg-elevated': '#12121a',
        surface: '#15151c',
        'surface-2': '#1c1c25',
        border: '#25252e',
        'border-strong': '#2f2f3a',
        text: '#e4e4e7',
        'text-muted': '#9ca3af',
        accent: '#818cf8',
        'accent-bright': '#a5b4fc',
        'accent-dim': '#4f46e5',
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
        info: '#60a5fa',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      }
    }
  }
};
```

### 0.5 Shared Packages

**`packages/shared/src/types.ts`** — TypeScript types exported to both web + api:
```ts
export type UUID = string & { __uuid: true };
export type Role = 'owner' | 'admin' | 'member' | 'guest';
export type VaultRole = 'manager' | 'editor' | 'user' | 'viewer' | 'metadata_only';
export type ItemType = 'login' | 'api_key' | 'ssh_key' | 'note' | 'card' | 'identity';
// ... etc, source of truth here
```

**`packages/shared/src/validators.ts`** — Zod schemas:
```ts
import { z } from 'zod';

export const createItemSchema = z.object({
  vaultId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  type: z.enum(['login', 'api_key', 'ssh_key', 'note', 'card', 'identity']),
  name: z.string().min(1).max(200),
  encryptedData: z.string(),  // base64
  iv: z.string(),
  authTag: z.string(),
  searchHash: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
```

### 0.6 CI/CD Setup

**Files:**
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `.gitleaks.toml` (or pre-commit config)

**ci.yml:**
```yaml
name: CI
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: woxa, POSTGRES_USER: woxa, POSTGRES_DB: woxa_test }
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm --filter @woxa/api db:migrate
      - run: pnpm test
      - run: pnpm build
      - uses: gitleaks/gitleaks-action@v2
```

### 0.7 Local Dev Documentation

**Files:**
- `README.md` (already exists, update with setup)
- `CONTRIBUTING.md`
- `.env.example`

**.env.example:**
```bash
# Backend
DATABASE_URL=postgresql://woxa:woxa@localhost:5432/woxa
REDIS_URL=redis://localhost:6379
SESSION_SECRET=                # generate with: openssl rand -base64 64
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT=http://localhost:3000/api/v1/auth/google/callback
KMS_PROVIDER=local             # local | aws | vault
LOCAL_KMS_KEY=                 # generate with: openssl rand -base64 32
WEB_ORIGIN=http://localhost:5173

# Frontend
PUBLIC_API_URL=http://localhost:3000

# Email (dev uses mailcatcher)
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM=noreply@iux24.com
```

## 🧪 Phase 0 Validation Gates

Run these in order; ALL must pass:

```bash
# 1. Install
pnpm install --frozen-lockfile

# 2. Lint + typecheck
pnpm lint
pnpm typecheck

# 3. Database
docker compose up -d postgres redis
pnpm --filter @woxa/api db:migrate
pnpm --filter @woxa/api db:seed

# 4. Build
pnpm build

# 5. Dev runs
pnpm dev
# In another terminal:
curl http://localhost:3000/healthz
# Expected: {"ok":true,"ts":...}

# 6. CI passes
gh workflow run ci.yml
gh run watch
```

✅ **Exit criteria:** All 6 commands succeed on fresh clone. Storybook shows 6 base components.

---

# 🟢 Phase A — MVP (Weeks 2-7)

## 🎯 Goal
Internal iux24 team uses daily. 100+ items stored. Zero passwords in Slack. Login + 2FA + share + audit working.

---

## Sprint A1 — Auth + Google Workspace SSO (Week 2)

### A1.1 Google OAuth Setup

> 🚨 **Apply for Google Cloud OAuth consent screen on Day 1 of this sprint** — review takes 1-2 weeks for verification (use minimal scopes: `openid email profile`)

**Files:**
- `apps/api/src/lib/google-oauth.ts`
- `apps/api/src/routes/auth.ts`

**Pseudocode:**
```ts
// apps/api/src/lib/google-oauth.ts
import { OAuth2Client } from 'google-auth-library';

const oauth = new OAuth2Client({
  clientId: env.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
  redirectUri: env.GOOGLE_OAUTH_REDIRECT,
});

export function getAuthUrl(hd?: string) {
  return oauth.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    hd,  // restrict to hosted domain (Workspace)
    state: generateRandomState(),  // CSRF protection
    access_type: 'online',
  });
}

export async function verifyCallback(code: string, expectedHd?: string) {
  const { tokens } = await oauth.getToken(code);
  const ticket = await oauth.verifyIdToken({
    idToken: tokens.id_token!,
    audience: env.GOOGLE_OAUTH_CLIENT_ID,
  });
  const payload = ticket.getPayload()!;

  // Verify hosted domain (DEFENSE IN DEPTH — hd param is just a hint)
  if (expectedHd && payload.hd !== expectedHd) {
    throw new ForbiddenError('Email not in allowed Google Workspace');
  }

  return {
    email: payload.email!,
    emailVerified: payload.email_verified!,
    name: payload.name,
    picture: payload.picture,
    googleUserId: payload.sub,
    hd: payload.hd,
  };
}
```

### A1.2 Routes

```ts
// apps/api/src/routes/auth.ts
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { getAuthUrl, verifyCallback } from '@/lib/google-oauth';

export const auth = new Hono();

auth.get('/google', async (c) => {
  const email = c.req.query('email');
  let hd: string | undefined;
  if (email) {
    const domain = email.split('@')[1];
    // Look up workspace by domain to determine hd
    const org = await findOrgByDomain(domain);
    hd = org?.primary_domain;
  }
  return c.redirect(getAuthUrl(hd));
});

auth.get('/google/callback', async (c) => {
  const code = c.req.query('code')!;
  const state = c.req.query('state')!;
  if (!verifyState(state)) return c.redirect('/login?error=csrf');

  // Determine expected hd from state or session
  const expectedHd = await getExpectedHdFromState(state);

  let profile;
  try {
    profile = await verifyCallback(code, expectedHd);
  } catch (e) {
    return c.redirect(`/login?error=${encodeURIComponent(e.message)}`);
  }

  // Find or JIT-provision user
  let user = await findUserByEmail(profile.email);
  const org = await findOrgByDomain(profile.hd!);
  if (!org) return c.redirect('/login?error=no_workspace');

  if (!user) {
    user = await createUserJIT({
      email: profile.email,
      name: profile.name,
      orgId: org.id,
      role: org.settings.default_role ?? 'member',
    });
    await audit('sso.jit_provision', { user_id: user.id, org_id: org.id });
  }

  // Create session
  const session = await createSession(user.id);
  setCookie(c, 'session', session.token, {
    httpOnly: true, secure: true, sameSite: 'Strict', path: '/',
    maxAge: 60 * 60 * 24 * 30,  // 30d
  });

  await audit('auth.login', { user_id: user.id, method: 'google_sso', ip: c.req.header('x-forwarded-for') });
  return c.redirect('/');
});
```

### A1.3 Master Password Login (Fallback)

```ts
// apps/api/src/routes/auth.ts (continued)
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();

  await rateLimit(`login:${c.req.header('x-forwarded-for')}`, 5, 15 * 60);

  const user = await findUserByEmail(email);
  if (!user) {
    // Generic error — don't reveal account existence
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  if (user.locked_until && user.locked_until > new Date()) {
    return c.json({ error: 'account_locked' }, 423);
  }

  const ok = await argon2.verify(user.password_hash, password);
  if (!ok) {
    await incrementFailedLogin(user.id);
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  if (user.totp_enabled_at) {
    // Issue 2FA challenge token, redirect to TOTP page
    const challenge = await createTotpChallenge(user.id);
    return c.json({ challenge_id: challenge.id, requires_2fa: true });
  }

  await issueSession(c, user);
  await audit('auth.login', { user_id: user.id, method: 'password' });
  return c.json({ ok: true });
});
```

### A1.4 Frontend Routes

**Files:**
- `apps/web/src/routes/(auth)/welcome/+page.svelte` — email-first discovery
- `apps/web/src/routes/(auth)/login/+page.svelte` — sign-in page
- `apps/web/src/routes/(auth)/setup/+page.svelte` — workspace wizard (stub)

**Welcome page logic:**
```svelte
<!-- apps/web/src/routes/(auth)/welcome/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';

  let email = '';
  let workspace: any = null;
  let loading = false;

  async function checkWorkspace() {
    if (!email.includes('@')) return;
    loading = true;
    workspace = await api.get('/api/v1/workspaces/discover', { email });
    loading = false;
  }

  function continueWith() {
    if (workspace) goto(`/login?email=${encodeURIComponent(email)}`);
    else goto(`/setup?email=${encodeURIComponent(email)}`);
  }
</script>

<div class="auth-card">
  <h1>เริ่มต้นใช้งาน</h1>
  <input bind:value={email} on:input={checkWorkspace} />
  {#if workspace}
    <div class="workspace-detected">
      <strong>{workspace.name}</strong>
      <span>{workspace.domain} · {workspace.member_count} members</span>
    </div>
  {/if}
  <button on:click={continueWith}>Continue</button>
</div>
```

### 🧪 Sprint A1 Validation

```bash
# Backend tests
pnpm --filter @woxa/api test src/routes/auth.test.ts

# Integration test
curl -i http://localhost:3000/api/v1/auth/google
# Expected: 302 redirect to accounts.google.com with hd= param

# E2E
pnpm --filter @woxa/web test:e2e tests/auth.spec.ts
# Tests: SSO success, wrong domain rejected, password fallback, 2FA prompt

# Manual
# 1. Open http://localhost:5173/welcome
# 2. Enter ching@iux24.com → see workspace card
# 3. Click "Continue" → /login
# 4. Click "Continue with Google" → real Google OAuth (use test workspace)
# 5. Pick @iux24.com account → callback → dashboard placeholder
```

---

## Sprint A2 — Org + Vault/Folder/Item + KMS Encryption (Week 3)

### A2.1 Organization & Setup Wizard

**Backend:**
- `POST /api/v1/organizations` — create org
- `PATCH /api/v1/organizations/:id/settings`
- `POST /api/v1/organizations/:id/domains` — add domain
- `POST /api/v1/organizations/:id/domains/:domain/verify` — TXT verify

**Frontend:**
- `apps/web/src/routes/(auth)/setup/+page.svelte` — 4-step wizard

### A2.2 KMS Envelope Encryption

**Files:**
- `apps/api/src/lib/crypto.ts`

```ts
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { LRUCache } from 'lru-cache';

const kms = new KMSClient({ region: env.AWS_REGION });
const dekCache = new LRUCache<string, Buffer>({ max: 1000, ttl: 5 * 60 * 1000 });  // 5min

export async function encryptItemData(plaintext: Buffer): Promise<{
  ciphertext: Buffer; iv: Buffer; authTag: Buffer; wrappedDek: Buffer;
}> {
  // 1. Generate DEK
  const dek = randomBytes(32);  // 256-bit
  const iv = randomBytes(12);   // 96-bit for GCM

  // 2. Encrypt data with DEK
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 3. Wrap DEK with KMS master key
  const wrap = await kms.send(new EncryptCommand({
    KeyId: env.KMS_KEY_ID,
    Plaintext: dek,
  }));

  return { ciphertext, iv, authTag, wrappedDek: Buffer.from(wrap.CiphertextBlob!) };
}

export async function decryptItemData(
  ciphertext: Buffer, iv: Buffer, authTag: Buffer, wrappedDek: Buffer
): Promise<Buffer> {
  // 1. Unwrap DEK (with cache)
  const cacheKey = wrappedDek.toString('base64');
  let dek = dekCache.get(cacheKey);
  if (!dek) {
    const unwrap = await kms.send(new DecryptCommand({ CiphertextBlob: wrappedDek }));
    dek = Buffer.from(unwrap.Plaintext!);
    dekCache.set(cacheKey, dek);
  }

  // 2. Decrypt
  const decipher = createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
```

For dev (no AWS), implement `LocalKmsProvider` that uses a static key:
```ts
// apps/api/src/lib/kms-local.ts
const LOCAL_KEY = Buffer.from(env.LOCAL_KMS_KEY, 'base64');
export const localKms = {
  encrypt: (plain: Buffer) => aesGcmEncrypt(LOCAL_KEY, plain),
  decrypt: (cipher: Buffer) => aesGcmDecrypt(LOCAL_KEY, cipher),
};
```

### A2.3 Vault/Folder/Item CRUD

**Files:**
- `apps/api/src/routes/vaults.ts`
- `apps/api/src/routes/items.ts`
- `apps/web/src/lib/api/vaults.ts`
- `apps/web/src/routes/(app)/vault/[id]/+page.svelte`

**Item POST:**
```ts
items.post('/vaults/:vaultId/items', authed, async (c) => {
  const user = c.get('user');
  const vaultId = c.req.param('vaultId');
  await checkPermission(user, 'vault', vaultId, 'edit_metadata');

  const body = createItemSchema.parse(await c.req.json());

  // Server-side: encrypt the full payload
  const plaintext = Buffer.from(JSON.stringify(body.data));
  const enc = await encryptItemData(plaintext);

  const [item] = await db.insert(items).values({
    vault_id: vaultId,
    folder_id: body.folderId,
    type: body.type,
    plaintext_name: body.name,  // Phase A only, encrypted in Phase C
    encrypted_data: enc.ciphertext,
    iv: enc.iv,
    auth_tag: enc.authTag,
    wrapped_dek: enc.wrappedDek,
    created_by: user.id,
  }).returning();

  await audit('item.create', { user_id: user.id, item_id: item.id, vault_id: vaultId });
  return c.json({ item });
});
```

### 🧪 Sprint A2 Validation

```bash
# Test envelope encryption
pnpm --filter @woxa/api test src/lib/crypto.test.ts
# Test: encrypt → decrypt round trip, different DEKs per item, KMS cache works

# Manual
psql $DATABASE_URL -c "SELECT encoding('escape', encrypted_data) FROM items LIMIT 1"
# Expected: gibberish (not human-readable plaintext)

# Verify wizard
# 1. Sign up new user → wizard
# 2. Complete 4 steps → dashboard with default vaults
# 3. Create vault "Production" → see in sidebar
# 4. Create folder "AWS" → nested
# 5. Create item "AWS Root" → appears
# 6. Edit → save → version row added
# 7. Delete → trash → restore
```

---

## Sprint A3 — Item UX: Search, Copy, TOTP, Reveal (Week 4)

### A3.1 Universal Search (Cmd+K)

**File:** `apps/web/src/lib/components/SearchModal.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Fuse from 'fuse.js';

  export let items: ItemSummary[] = [];
  let open = false;
  let query = '';
  let fuse: Fuse<ItemSummary>;

  onMount(() => {
    fuse = new Fuse(items, {
      keys: ['name', 'url', 'username', 'tags'],
      threshold: 0.4,
      includeScore: true,
    });

    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        open = true;
      }
      if (e.key === 'Escape') open = false;
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  $: results = query ? fuse.search(query).slice(0, 10) : [];
</script>

{#if open}
  <div class="modal">
    <input bind:value={query} placeholder="Search..." autofocus />
    {#each results as result}
      <a href="/item/{result.item.id}" on:click={() => open = false}>
        {result.item.name}
      </a>
    {/each}
  </div>
{/if}
```

### A3.2 Clipboard Auto-Clear

```ts
// apps/web/src/lib/utils/clipboard.ts
export async function copyWithAutoClear(value: string, timeoutMs = 30000) {
  await navigator.clipboard.writeText(value);
  // Don't await clearing — it's background
  setTimeout(() => {
    // Best effort: write empty (clipboard API doesn't support direct clear)
    navigator.clipboard.writeText('').catch(() => {});
  }, timeoutMs);
}
```

### A3.3 TOTP Code

```ts
// apps/api/src/lib/totp.ts
import { authenticator } from 'otplib';
authenticator.options = { window: 1, step: 30, digits: 6 };

export function generateTotpCode(secret: string): { code: string; ttl: number } {
  return {
    code: authenticator.generate(secret),
    ttl: 30 - (Math.floor(Date.now() / 1000) % 30),
  };
}
```

Frontend renders progress ring; backend endpoint `GET /items/:id/totp` returns code + TTL (or compute client-side in Phase C).

### 🧪 Sprint A3 Validation

```bash
# E2E test: Search
pnpm --filter @woxa/web test:e2e tests/search.spec.ts
# Test: Cmd+K opens, typing filters, fuzzy match works, Enter navigates

# Manual: Copy clear
# 1. Open item → click 📋 password
# 2. Toast shows
# 3. Wait 30s → check clipboard (should be empty)

# Performance benchmark
pnpm --filter @woxa/web test:perf tests/search-perf.spec.ts
# Test: 1000 items, search < 100ms P95
```

---

## Sprint A4 — Sharing + 2FA + Sessions (Week 5)

### A4.1 Vault Access

```ts
// apps/api/src/routes/vaults.ts (extension)
vaults.post('/:id/access', authed, async (c) => {
  const user = c.get('user');
  const vaultId = c.req.param('id');
  await checkPermission(user, 'vault', vaultId, 'manage_access');

  const { principal_type, principal_id, role, expires_at } = await c.req.json();

  // For zero-knowledge (Phase C+): would also wrap vault key for new principal
  await db.insert(vaultAccess).values({
    vault_id: vaultId, principal_type, principal_id, role, expires_at,
    granted_by: user.id,
  });

  await audit('vault.share', { user_id: user.id, vault_id: vaultId, principal_type, principal_id, role });
  return c.json({ ok: true });
});
```

### A4.2 TOTP 2FA Setup

```ts
// apps/api/src/routes/auth.ts
auth.post('/2fa/totp/setup', authed, async (c) => {
  const user = c.get('user');
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.email, 'Woxa Vault', secret);
  // Store pending (not yet verified)
  await db.update(users).set({
    totp_secret_encrypted: await encryptSmall(secret),
    totp_setup_pending: true,
  }).where(eq(users.id, user.id));
  return c.json({ otpauth, qr_url: await generateQR(otpauth) });
});

auth.post('/2fa/totp/verify', authed, async (c) => {
  const user = c.get('user');
  const { code } = await c.req.json();
  const secret = await decryptSmall(user.totp_secret_encrypted!);
  if (!authenticator.check(code, secret)) {
    return c.json({ error: 'invalid_code' }, 400);
  }
  // Generate backup codes
  const backupCodes = Array.from({ length: 10 }, () => randomBytes(4).toString('hex'));
  const hashes = await Promise.all(backupCodes.map(c => argon2.hash(c)));
  await db.update(users).set({
    totp_enabled_at: new Date(),
    totp_setup_pending: false,
    backup_codes_hashed: hashes,
  }).where(eq(users.id, user.id));
  await audit('auth.2fa_enabled', { user_id: user.id });
  return c.json({ backup_codes: backupCodes });
});
```

### A4.3 Session Management

```ts
// apps/api/src/routes/me.ts
me.get('/sessions', authed, async (c) => {
  const user = c.get('user');
  const sessions = await db.select().from(sessionsTable).where(
    and(eq(sessionsTable.user_id, user.id), isNull(sessionsTable.revoked_at))
  );
  return c.json({ sessions: sessions.map(redactSensitive) });
});

me.delete('/sessions/:id', authed, async (c) => {
  const user = c.get('user');
  await db.update(sessionsTable).set({ revoked_at: new Date() })
    .where(and(eq(sessionsTable.id, c.req.param('id')), eq(sessionsTable.user_id, user.id)));
  await audit('auth.session_revoke', { user_id: user.id });
  return c.json({ ok: true });
});
```

### 🧪 Sprint A4 Validation

```bash
# E2E: Sharing
pnpm --filter @woxa/web test:e2e tests/sharing.spec.ts
# Test: User A shares with User B; B sees item; B can read but not delete (as Editor)

# E2E: 2FA
pnpm --filter @woxa/web test:e2e tests/2fa.spec.ts
# Test: setup → scan QR → enter code → backup codes shown → next login requires TOTP

# Manual: Revoke session
# 1. Login on Chrome AND Firefox (2 sessions)
# 2. Settings → Sessions → revoke Firefox session
# 3. Firefox: next request → 401 within 60s
```

---

## Sprint A5 — Import Wizard (Week 6, 3 days)

### A5.1 Importer Plugins

**Files:**
- `apps/api/src/lib/importers/onepassword.ts`
- `apps/api/src/lib/importers/bitwarden.ts`
- `apps/api/src/lib/importers/csv.ts`

```ts
// apps/api/src/lib/importers/onepassword.ts
import AdmZip from 'adm-zip';

export interface ParsedItem {
  name: string;
  type: 'login' | 'note' | 'card' | 'identity';
  username?: string;
  password?: string;
  url?: string;
  totp?: string;
  notes?: string;
  custom_fields?: Record<string, string>;
}

export async function parse1pux(buffer: Buffer, password?: string): Promise<ParsedItem[]> {
  const zip = new AdmZip(buffer);
  const exportFile = zip.getEntry('export.data');
  if (!exportFile) throw new Error('Invalid 1pux file');

  const data = JSON.parse(exportFile.getData().toString());
  const items: ParsedItem[] = [];

  for (const account of data.accounts) {
    for (const vault of account.vaults) {
      for (const item of vault.items) {
        items.push(mapTo1puxParsedItem(item));
      }
    }
  }
  return items;
}
```

### A5.2 Import Job

```ts
// apps/api/src/workers/import-worker.ts (BullMQ)
import { Worker } from 'bullmq';

new Worker('imports', async (job) => {
  const { import_id, user_id, source, target_vault_id, conflict_policy } = job.data;

  const importer = getImporter(source);
  const items = await importer.parse(job.data.file_buffer);

  let created = 0, skipped = 0, errors: any[] = [];

  for (const [i, parsed] of items.entries()) {
    try {
      const existing = await findItemByNameAndUsername(target_vault_id, parsed.name, parsed.username);
      if (existing && conflict_policy === 'skip') { skipped++; continue; }
      if (existing && conflict_policy === 'append_2') parsed.name += ' (2)';

      const enc = await encryptItemData(Buffer.from(JSON.stringify(parsed)));
      await db.insert(items).values({
        vault_id: target_vault_id,
        type: parsed.type,
        plaintext_name: parsed.name,
        encrypted_data: enc.ciphertext,
        iv: enc.iv,
        auth_tag: enc.authTag,
        wrapped_dek: enc.wrappedDek,
        created_by: user_id,
      });
      created++;
    } catch (e) {
      errors.push({ row: i, error: e.message });
    }
    job.updateProgress((i + 1) / items.length * 100);
  }

  await db.update(imports).set({
    status: 'complete', created, skipped, errors: JSON.stringify(errors),
    completed_at: new Date(),
  }).where(eq(imports.id, import_id));

  await audit('import.complete', { user_id, import_id, created, skipped });
});
```

### A5.3 Import UI

**File:** `apps/web/src/routes/(app)/import/+page.svelte` — 4-step wizard (see prototype for layout)

### 🧪 Sprint A5 Validation

```bash
# Unit: parsers
pnpm --filter @woxa/api test src/lib/importers/*.test.ts
# Fixtures: sample 1pux, bitwarden.json, lastpass.csv (10 items each)

# Manual: import 1Password
# 1. Export real 1Password vault (10+ items)
# 2. Upload to /import
# 3. Field mapping shown
# 4. Confirm → progress → done
# 5. Verify items in dashboard match source
```

---

## Sprint A6 — Bulk Operations (Week 6, 2 days)

### A6.1 Bulk Endpoint

```ts
// apps/api/src/routes/items.ts
items.post('/bulk', authed, async (c) => {
  const user = c.get('user');
  const { action, item_ids, payload } = await c.req.json();

  return await db.transaction(async (tx) => {
    let succeeded = 0, skipped = 0;
    for (const id of item_ids) {
      try {
        const item = await tx.select().from(itemsTable).where(eq(itemsTable.id, id)).limit(1);
        if (!item[0]) { skipped++; continue; }

        switch (action) {
          case 'share':
            if (!await canDo(user, item[0], 'manage_access')) { skipped++; continue; }
            await shareItem(tx, item[0], payload);
            break;
          case 'move':
            if (!await canDo(user, item[0], 'edit_metadata')) { skipped++; continue; }
            await tx.update(itemsTable).set({ vault_id: payload.target_vault_id, folder_id: payload.target_folder_id }).where(eq(itemsTable.id, id));
            break;
          case 'delete':
            if (!await canDo(user, item[0], 'delete')) { skipped++; continue; }
            await tx.update(itemsTable).set({ deleted_at: new Date() }).where(eq(itemsTable.id, id));
            break;
          case 'tag': case 'untag':
            await updateTags(tx, item[0], action, payload.tags);
            break;
        }
        succeeded++;
      } catch (e) { skipped++; }
    }
    await audit('item.bulk_' + action, { user_id: user.id, count: succeeded });
    return c.json({ succeeded, skipped });
  });
});
```

### 🧪 Sprint A6 Validation

```bash
# Unit
pnpm --filter @woxa/api test src/routes/items.bulk.test.ts

# E2E
pnpm --filter @woxa/web test:e2e tests/bulk.spec.ts
# Test: select 5 items → bulk share → all 5 shared
# Test: bulk delete with 3 lacking permission → 2 deleted, 3 skipped, toast shows counts
```

---

## Sprint A7 — Audit + Polish + Soft Launch (Week 7)

### A7.1 Audit Log UI

**File:** `apps/web/src/routes/(app)/audit/+page.svelte`

Match prototype.html screen #9 (filter by actor/action/date, CSV export).

### A7.2 Background Jobs

```ts
// apps/api/src/jobs/cleanup-sessions.ts (cron, every 5min)
await db.update(sessions).set({ revoked_at: new Date() }).where(
  and(isNull(sessions.revoked_at), lt(sessions.expires_at, new Date()))
);

// apps/api/src/jobs/cleanup-trash.ts (cron, daily)
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
await db.delete(items).where(
  and(isNotNull(items.deleted_at), lt(items.deleted_at, thirtyDaysAgo))
);
```

### A7.3 Production Deploy

- Fly.io: `fly launch` for api + web
- Cloudflare: WAF + DNS + SSL
- Neon: managed postgres
- Sentry: error tracking
- BetterStack: status page

### 🧪 Phase A Final Validation Gates

ALL must pass before Phase B:

```bash
# 1. Full test suite
pnpm test

# 2. E2E full flow
pnpm test:e2e
# Tests: signup → wizard → import 10 items → search → copy → share → audit

# 3. Performance
pnpm test:perf
# Search < 100ms P95, login < 1s P95

# 4. Security scan
pnpm audit --prod
gitleaks detect --source .

# 5. Lighthouse
npx lighthouse http://localhost:5173 --output=json
# Required: Performance > 90, Accessibility > 95, Best Practices > 95

# 6. Manual: production deploy
fly deploy --remote-only
curl https://vault.iux24.com/healthz

# 7. Internal team usage
# - 5+ users active for 1 week
# - 100+ items imported
# - Zero P0/P1 bugs in Sentry
```

---

# 🟡 Phase B — Daily Use Features (Weeks 8-14)

## 🎯 Goal
Browser extension + CLI + service tokens → 80%+ org installed extension; first prod service token in use.

## Sprint Order (refer to PHASES.md for full detail)

### B1 — Teams + Roles (Week 8)
- Teams CRUD; vault_access supports `principal_type='team'`
- UI: `/settings/teams` page; team picker in Share modal

### B2 — Google Groups → Teams Sync (Week 9)
- Service account with domain-wide delegation
- Map config; sync every 15min + on-login
- ⚠️ Domain-wide delegation requires admin consent — coordinate with iux24 IT

### B3 — Folder/Item ACL + Granular Permissions (Week 10)
- Permission atoms (FR-031)
- Access resolution: item > folder > vault > team > org
- "Who can access" with reasoning trace

### B4 — All Item Types + Attachments (Week 11)
- API Key, SSH Key, Note, Card, Identity forms
- Attachment upload to R2, encrypted, chunked, max 25MB

### B5 — One-Time Send (Week 12)
- `POST /sends`, `GET /s/:token`, `POST /s/:token/burn`
- "Reveal" guard against bots
- Cleanup job every 1min

### 🚨 B6 — Service Tokens + CLI v1 (Week 13)

**Backend:**
```ts
// apps/api/src/routes/service-tokens.ts
import { randomBytes, createHash } from 'crypto';

st.post('/', adminOnly, async (c) => {
  const { name, scope_type, scope_value, ip_allowlist, expires_at } = await c.req.json();

  const token = `woxa_live_${randomBytes(27).toString('base64url')}`;  // 36 chars
  const tokenHash = createHash('sha256').update(token).digest();

  const [created] = await db.insert(serviceTokens).values({
    org_id: c.get('user').org_id,
    name,
    token_hash: tokenHash,
    token_prefix: token.substring(0, 16),
    scope_type, scope_value: JSON.stringify(scope_value),
    permissions: ['read'],
    ip_allowlist,
    expires_at,
    created_by: c.get('user').id,
  }).returning();

  await audit('service_token.create', { ... });
  return c.json({ token: token, id: created.id });  // Show ONCE
});

// Middleware for service token auth
async function serviceTokenAuth(c: Context, next: Next) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('ServiceToken ')) return c.json({ error: 'unauthorized' }, 401);

  const token = auth.slice('ServiceToken '.length);
  const hash = createHash('sha256').update(token).digest();
  const [st] = await db.select().from(serviceTokens).where(
    and(eq(serviceTokens.token_hash, hash), isNull(serviceTokens.revoked_at), gt(serviceTokens.expires_at, new Date()))
  );
  if (!st) return c.json({ error: 'invalid_token' }, 401);

  // IP check
  const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip');
  if (st.ip_allowlist?.length && !ipInCidrs(clientIp, st.ip_allowlist)) {
    return c.json({ error: 'ip_not_allowed' }, 403);
  }

  c.set('service_token', st);
  await db.update(serviceTokens).set({ last_used_at: new Date(), last_used_ip: clientIp })
    .where(eq(serviceTokens.id, st.id));
  await next();
}
```

**CLI (Rust):**
```rust
// cli/src/main.rs
use clap::Parser;

#[derive(Parser)]
enum Cli {
    Login,
    Logout,
    List { #[arg(long)] vault: Option<String> },
    Get { name: String, #[arg(long)] field: Option<String> },
    Send { text: String, #[arg(long)] expires: String },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli {
        Cli::Login => commands::login::run().await,
        Cli::Get { name, field } => commands::get::run(&name, field.as_deref()).await,
        // ...
    }
}
```

```rust
// cli/src/commands/get.rs
pub async fn run(name: &str, field: Option<&str>) -> Result<()> {
    let token = std::env::var("WOXA_TOKEN").or_else(|_| keychain::get_token())?;
    let client = WoxaClient::new(&token);
    let item = client.get_item_by_name(name).await?;
    let value = match field.unwrap_or("password") {
        "password" => item.password,
        "username" => item.username,
        "totp" => item.totp_code()?,
        f => item.custom_field(f)?,
    };
    print!("{}", value);  // No newline → easy `eval $(woxa get ...)`
    Ok(())
}
```

### 🚨 B7 — Browser Extension v1 (Week 14)

**Files:**
- `extension/manifest.json` (Manifest V3)
- `extension/src/background.ts` — service worker
- `extension/src/content-script.ts` — injected into pages
- `extension/src/popup/+page.svelte` — Svelte popup UI
- `extension/src/options/+page.svelte` — settings

```json
// extension/manifest.json
{
  "manifest_version": 3,
  "name": "Woxa Vault",
  "version": "1.0.0",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["https://vault.iux24.com/*"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content-script.js"],
    "run_at": "document_idle"
  }],
  "action": { "default_popup": "popup.html" },
  "options_page": "options.html",
  "commands": {
    "fill-credentials": { "suggested_key": { "default": "Ctrl+Shift+L" } },
    "open-search": { "suggested_key": { "default": "Ctrl+Shift+F" } }
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

```ts
// extension/src/content-script.ts
function detectLoginForm() {
  const passwordInputs = document.querySelectorAll<HTMLInputElement>('input[type="password"]:not([readonly])');
  if (!passwordInputs.length) return;
  const usernameInput = findNearestUsername(passwordInputs[0]);

  // Ask background for matches by domain
  chrome.runtime.sendMessage(
    { type: 'find_matches', domain: location.hostname },
    (matches) => {
      if (matches?.length) showFillDropdown(usernameInput, passwordInputs[0], matches);
    }
  );
}

function showFillDropdown(usernameInput, passwordInput, matches) {
  const dropdown = document.createElement('div');
  dropdown.id = 'woxa-fill-dropdown';
  dropdown.innerHTML = matches.map(m => `
    <div class="woxa-match" data-id="${m.id}">
      <strong>${escapeHtml(m.name)}</strong>
      <span>${escapeHtml(m.username)}</span>
    </div>
  `).join('');
  document.body.appendChild(dropdown);
  positionRelativeTo(dropdown, passwordInput);

  dropdown.addEventListener('click', (e) => {
    const matchEl = e.target.closest('.woxa-match');
    if (!matchEl) return;
    const id = matchEl.dataset.id;
    chrome.runtime.sendMessage({ type: 'get_item', id }, (item) => {
      if (usernameInput) usernameInput.value = item.username;
      passwordInput.value = item.password;
      [usernameInput, passwordInput].forEach(i => i?.dispatchEvent(new Event('input', { bubbles: true })));
      dropdown.remove();
    });
  });
}

// Run on page load + watch for dynamic forms
detectLoginForm();
new MutationObserver(detectLoginForm).observe(document.body, { childList: true, subtree: true });
```

### 🧪 Phase B Final Validation Gates

```bash
# Browser extension build + load
pnpm --filter @woxa/extension build
# Load extension/dist in Chrome (Manifest V3 unpacked)
# Visit https://console.aws.amazon.com → autofill dropdown appears

# CLI build + test
cd cli && cargo build --release
./target/release/woxa login
./target/release/woxa get production/stripe-key
# Expected: password printed to stdout

# Service token end-to-end
TOKEN=$(curl -X POST $API/api/v1/service-tokens -H "Authorization: Bearer $JWT" -d '{"name":"ci","scope_type":"vault_path","scope_value":{"vault":"Production"}}' | jq -r .token)
curl $API/api/v1/items/by-name/production/stripe -H "Authorization: ServiceToken $TOKEN"

# All Phase B acceptance criteria met (see REQUIREMENTS.md §12)
```

---

# 🔵 Phase C — Zero-Knowledge + Lifecycle (Weeks 15-20)

## 🎯 Goal
Server cannot decrypt anything · Rotation reminders · Permission request workflow · Pen test passed.

## Sprints (high-level — refer to PHASES.md for detail)

### C1 — Client Crypto Library (Week 15)
- `packages/crypto/src/` — Argon2id (wasm), AES-256-GCM, X25519, HKDF
- NIST test vectors pass
- Performance: encrypt 1MB < 100ms

### C2 — User Keypair Generation (Week 16)
- Signup: generate keypair in browser
- Login: send `auth_key_hash` (not master pw); receive encrypted private key
- Master pw change re-encrypts private key

### C3 — Vault Key Wrapping (Week 17)
- Vault key encrypted per user with public key
- Share = re-wrap with recipient's public key
- All item I/O client-side encrypted

### C4 — Password Rotation + Reminders (Week 18, 3d)
```sql
ALTER TABLE items ADD COLUMN password_changed_at TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN rotation_policy_days INT;
ALTER TABLE items ADD COLUMN expires_at TIMESTAMPTZ;
```
- Dashboard widget; weekly digest email; per-item badge

### C5 — Permission Request Workflow (Week 18, 2d)
- `access_requests` table (see DESIGN.md §19)
- "Request Access" button on items
- Approval UI with approve/deny/counter-offer

### C6 — Migration Tool + Recovery Kit (Week 19)
- One-time migration: server-side → zero-knowledge
- 30-day rollback retention
- 24-word mnemonic recovery kit (BIP39)

### C7 — Blind Index + Pen Test (Week 20)
- `search_hash = HMAC(server_secret, name)`
- Server-assisted search
- External pen test scheduled here

### 🧪 Phase C Final Validation Gates

```bash
# Network proof of zero-knowledge
# 1. Open browser devtools → Network tab
# 2. Login + create item + view item + share
# 3. Inspect ALL requests: no plaintext password, name only in /search via HMAC
# 4. Search for "K9$mP2" in any response body → 0 matches

# Master password not sent
grep -r "master_password" apps/api/src  # Should find 0 (only auth_key_hash references)

# Pen test report
# Format: HTML/PDF from external firm
# Required: 0 Critical, 0 High (or all fixed before sign-off)

# Migration zero-loss
# Pre-migration: dump all decrypted items to file A
# Run migration
# Post-migration: decrypt all items with new keys → file B
# diff A B → empty
```

---

# 🟣 Phase D — Enterprise (Weeks 21-28+)

## 🎯 Goal
SCIM · Mobile · Compliance · First enterprise customer.

## Sprints (high-level)

### D1 — SCIM 2.0 Provisioning (Week 21)
- `/scim/v2/Users`, `/scim/v2/Groups` endpoints
- Bearer token auth
- Google Workspace SCIM app config

### D2 — Browser Extension v2 (Week 22)
- Save new credentials
- Inline password generator
- Iframe autofill (Stripe etc.)

### D3 — Auditor Role + Compliance Reports (Week 23, 3d)
- Read-only role; metadata + audit only
- PDF report templates (SOC 2 Access Matrix, PDPA, custom)

### D4 — Break-Glass / Emergency Access (Week 23, 2d)
- Designated contacts (M of N approval)
- Cooldown period
- Heavy audit

### D5 — Mobile Apps (Weeks 24-25)
- React Native (or native)
- Biometric unlock
- Autofill Provider (iOS), Autofill Service (Android)

### D6 — Desktop App (Week 26)
- Tauri wrapping web app
- OS keychain integration
- System tray quick search

### D7 — Anomaly Detection (Week 27)
- User baseline (30d rolling)
- Triggers: unusual volume, geo jump, off-hours, failed 2FA spike
- Auto-mitigation: alert, require re-auth, lock account

### D8 — HSM + BYOK + SOC 2 (Week 28+)
- AWS CloudHSM (Enterprise tier)
- BYOK API
- Vanta/Drata for compliance monitoring
- SOC 2 Type I audit kickoff

---

## 🧪 Universal Validation (every PR / sprint)

```bash
# Always-on checks (CI)
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
gitleaks detect
playwright test  # E2E

# Performance regression
pnpm test:perf

# Bundle size
pnpm --filter @woxa/web build && du -sh apps/web/.svelte-kit/output/client
# Target: < 250KB JS initial bundle
```

---

## 📌 Final Notes for Dev Team

### Daily workflow
1. Read PRP section for current sprint
2. Read referenced sections in DESIGN.md + REQUIREMENTS.md
3. Write failing test first (TDD encouraged)
4. Implement
5. Run validation gates locally
6. Push PR → CI green → review → merge
7. Demo at end-of-sprint review

### When stuck
1. Re-read this PRP's "Critical Gotchas" section
2. Check [DESIGN.md](./DESIGN.md) for architecture rationale
3. Check [REQUIREMENTS.md](./REQUIREMENTS.md) for acceptance criteria
4. Open [prototype.html](./prototype.html) to see expected UX
5. Ask in #woxa-vault Slack with: what you're trying to do, what you tried, error message

### When to update docs
- **DESIGN.md** — architectural change (new layer, different KMS, etc.)
- **REQUIREMENTS.md** — scope change (new user story, removed feature)
- **PHASES.md** — re-prioritization, new sprint added
- **PRP.md** — gotcha discovered, validation gate failed, better implementation pattern

### Anti-patterns to avoid
- ❌ Storing master password anywhere (even encrypted)
- ❌ Logging decrypted item content
- ❌ Custom crypto (use Web Crypto / @noble/*)
- ❌ Trusting `hd` from Google client-side (verify server)
- ❌ `git push --force` to main
- ❌ `console.log(item)` in production code
- ❌ Adding "just one more flag" to config — propose ADR first
- ❌ Mocking the database in integration tests
- ❌ Bypassing access checks in admin code paths

### Patterns to embrace
- ✅ Tests before commits
- ✅ Type-safe end-to-end (shared types in `packages/shared`)
- ✅ Audit log every sensitive action
- ✅ Soft delete with restore
- ✅ Cursor pagination (no offset)
- ✅ Background jobs for heavy work
- ✅ Feature flags for risky rollouts (Phase C migration especially)

---

**END OF PRP — let's ship 🚀**
