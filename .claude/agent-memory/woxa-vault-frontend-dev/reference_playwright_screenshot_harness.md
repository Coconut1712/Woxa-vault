---
name: reference-playwright-screenshot-harness
description: How to screenshot an authenticated /app page with no backend — Playwright route-mocking recipe (the /auth/me + /me + vault-lock + array-shape gotchas)
metadata:
  type: reference
---

To visually verify an authenticated `/app/*` page when no backend is running, drive `next dev` (port 3000) with Playwright via route interception. `playwright-core` is in `woxa-vault-web/node_modules` (browsers cached in `~/Library/Caches/ms-playwright`). No `chromium-cli` here; no `timeout` on macOS (poll the port with a bash `for` loop).

Import is CommonJS: `import pw from ".../playwright-core/index.js"; const { chromium } = pw;`

**Mandatory fixtures to reach an /app page as admin (each gotcha cost a render):**
- `ctx.addCookies([{name:"woxa-locale",value:"en",url},{name:"woxa_session",value:"fake",url}])` — locale forces EN; session cookie is cosmetic (auth comes from the mocked routes).
- API base the BROWSER hits = `http://localhost:8787` (NEXT_PUBLIC_API_BASE_URL unset → client.ts default). Route `ctx.route("http://localhost:8787/**", …)`. CSP `connect-src 'self'` logs a Report-Only violation but does NOT block (and Playwright intercepts before network anyway).
- Auth bootstrap is TWO calls: `GET /auth/me` → `{ user: { id, email, displayName } }`, then `GET /me` → **`{ user: MeUser }`** (wrapped! getMe does `res.user`). MeUser must have `role:"owner"`, `requiresPasswordSetup:false`, `hasWorkspace:true`, `workspaceCount:1`, `requiresTwoFactorEnroll:false` or SessionGuard redirects you off the page (to `/`, `/setup-password`, `/spaces`, `/setup-2fa`, `/upgrade`).
- **Vault-lock overlay** covers the page after a "browser restart" unless you seed `sessionStorage["woxa-vault-unlocked-at"] = String(Date.now())` via `ctx.addInitScript(...)` BEFORE navigation. Symptom: screenshot shows "Your vault is locked" master-password card on top of the (rendered) page.
- Array-shape crashes: sidebar/layout fetch `/vaults` (client does `res.vaults` un-guarded → `{}` crashes `.map`), `/me/workspaces` (`{workspaces:[...]}`), `/notifications/unread-count` (`{count:0}`). Return array-bearing shapes for these; a catch-all `{items:[],events:[],data:[]}` covers the rest. Symptom: "This page couldn't load" error boundary + `pageerror` "Cannot read properties of undefined (reading 'map')".

**Driver loop:** `goto(url,{waitUntil:"domcontentloaded"})` → `waitForSelector("table tbody tr")` (don't `networkidle` — HMR/polling never settles) → `screenshot`. Selector "Next" collides with the Next.js dev-tools button → use `{ name:"Next", exact:true }` or scope to the footer.

To crop a specific footer/control, locate by a stable text it contains, e.g. `div:has(> div:has-text("Per page")):has-text("Page")` then `.screenshot()`.

Always `pkill -f "next dev"` (and `next-server`) when done — see [[feedback-no-background-dev-servers]].
