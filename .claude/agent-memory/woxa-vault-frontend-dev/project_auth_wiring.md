---
name: project-auth-wiring
description: Where auth lives in woxa-vault-web and which files own which responsibility
metadata:
  type: project
---

Frontend auth stack landed 2026-05-18 (replaces the mocked setTimeout login).

- `src/lib/api/client.ts` — `apiFetch<T>()`, exports `ApiError` + `NetworkError`. Reads `NEXT_PUBLIC_API_BASE_URL` (fallback `http://localhost:8787`). Always sends `credentials: "include"` and `cache: "no-store"`.
- `src/lib/api/auth.ts` — `login()`, `logout()`, `fetchCurrentUser()`. `fetchCurrentUser` normalizes 401 → `null`; `logout` swallows 401.
- `src/lib/auth/provider.tsx` — `<AuthProvider>` + `useAuth()`. Three states: `loading | authenticated | unauthenticated`. Bootstraps via `/auth/me` on mount, then immediately hydrates `me: MeUser | null` from `/me` so guards can read `requiresPasswordSetup` / `hasRecoveryKit`. `refresh()` re-pulls both endpoints; `login()` follows up with `/me` before flipping status to `authenticated`. Use `useAuth().me` (not `user`) for the recovery-kit / setup flags.
- `src/lib/auth/session-guard.tsx` — wraps `/app` layout. Redirects to `/` when `unauthenticated`; renders splash while `loading`. ALSO redirects to `/setup-password` whenever `me.requiresPasswordSetup === true`. The setup page itself lives outside `/app` and runs its own auth check.
- `src/app/layout.tsx` — `<AuthProvider>` nested inside `<I18nProvider>` so `useT()` works inside auth UI.
- `src/app/app/layout.tsx` — wraps subtree in `<SessionGuard>`.
- `src/app/login/password/page.tsx` — real `POST /auth/login` via `useAuth().login()`. `mapAuthError()` at the bottom maps `ApiError.code` → translation key.
- `src/components/layout/sidebar.tsx` — both dropdowns (workspace switcher + user card) wire to `handleSignOut` which calls `logout()` then `router.push("/")`.

**Why**: backend uses HttpOnly cookie sessions; the frontend never sees the token directly, so every fetch needs `credentials: include` and the session check has to round-trip /auth/me on hydrate.

**How to apply**: when adding new API-backed UI, import `apiFetch` from `@/lib/api/client` and catch `ApiError`/`NetworkError`. For protected pages, putting them under `/app/*` is enough — SessionGuard already covers them. Mock data for vault/items/sends is still authoritative until those endpoints land in [[reference-api-contract]].
