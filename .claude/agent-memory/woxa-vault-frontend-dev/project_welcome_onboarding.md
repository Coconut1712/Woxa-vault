---
name: project-welcome-onboarding
description: The /welcome email-first workspace discovery onboarding page, its mock lookup, and where the real API + /setup wizard should plug in
metadata:
  type: project
---

`/welcome` (email-first workspace discovery, REQUIREMENTS.md routes table line ~934 `/welcome | none | Email-first workspace discovery`) landed 2026-05-21. Public, single-column centered card matching `/login/password`'s shell (ambient orbs + `bg-card border-border rounded-2xl shadow-card card-elevated`).

- `src/app/welcome/page.tsx` — client page, Suspense-wrapped (reads `useSearchParams` for an optional same-origin `next` hop, sanitized via local `safeNext`). Email validated inline with `EMAIL_RE` + length cap 254 (NO zod — zod is only a transitive dep in this repo, not declared in package.json; don't import it). Debounced (400ms) mock workspace lookup with a `lookupSeq` ref so stale responses can't overwrite newer ones. States: idle/searching/found/none. Continue → `/login/password?email=&next=`. "Create new workspace" outline button → `/setup` (route does NOT exist yet — that's the AC-005 4-step wizard, still pending). Footer link "Use email + password for now" → `/login/password`.
- `src/lib/mock/sso.ts` — appended `DiscoveredWorkspace` interface, `MOCK_WORKSPACES` (only `iux24.com` → "iux24 Workspace", 24 members, blue), `domainFromEmail()`, and async `discoverWorkspace(email)`. **TODO(api): replace with `GET /workspaces/discover?domain=` — MUST be rate-limited + constant-time (enumeration surface).**
- Translation namespace: `onboarding.*` (title, subtitle, email_label, email_placeholder, searching, workspace_members `{domain}·{count}`, workspace_active, continue, or, create_workspace, no_google_prefix, use_password_link, no_match, invalid_email, aria_workspace_avatar). "workspace", "Active", "Google Workspace" kept English in TH per project rules.

**Why**: AC-005 onboarding entry point; the existing `src/app/page.tsx` (root `/`) is a DIFFERENT "welcome" surface (returning-user sign-in with SSO) — do not confuse the two. `/welcome` is the new-user/workspace-discovery funnel.

**How to apply**:
- Workspace-avatar tiles can reuse `colorFor(color)` from `@/components/icon` → `{ bg, ring, text, glow }` (already light/dark paired).
- When the `/setup` wizard is built, the Create button + footer already point at it; just add `src/app/setup/`.
- When the real discovery endpoint lands, swap `discoverWorkspace()` and keep the seq-guard + debounce; flag rate-limit + audit-log requirements to the backend agent in [[reference-api-contract]].

**Self-audit (2026-05-21)**: no console logging of email, no `dangerouslySetInnerHTML`, no secret in storage, email never put in URL except same-origin `/login/password?email=` (consistent with existing `src/app/page.tsx` behavior — that surface already passes `email` as a query param, so this matches convention rather than the sessionStorage hop used by [[project-account-settings-wired]]'s forgot-password flow).
