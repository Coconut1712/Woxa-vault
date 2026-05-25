---
name: project-vault-lock-overlay
description: Phase A vault auto-lock + unlock overlay — state model, persistence, idle/visibility/manual triggers, post-auth wiring, and security-audit hardening (round 2)
metadata:
  type: project
---

Vault auto-lock + unlock (AC-055.8, DESIGN.md §15) shipped in `/app/*` as a fullscreen overlay; app shell never unmounts.

State / persistence:
- `sessionStorage["woxa-vault-unlocked-at"]` holds a single timestamp (ms). No password, no token.
- Provider initial state read synchronously via `useState(() => readInitialLockState())` to avoid a single-frame lock flash on every navigation. Fresh timestamp (<15min) → unlocked; missing → locked with reason="restart"; expired → locked with reason="idle".
- `IDLE_LIMIT_MS = 15 * 60 * 1000` exported from `lock-provider.tsx`.
- **`recordActivity` is in-memory only** (lastActivityRef). sessionStorage is touched ONLY at lock/unlock boundaries — not on every activity tick. This closes the XSS observation-and-extension vector where a malicious script could (a) watch presence via storage cadence or (b) overwrite the timestamp to extend the unlock window.

Lock triggers wired:
- Idle 15min: `useIdleDetector` hook with throttled (1s) DOM listeners + 30s setInterval check.
- Visibility hidden ≥ 15min: `visibilitychange` listener inside provider. On resume we ALSO run an immediate idle re-check (don't wait 30s) so a borderline-idle tab locks at exactly the right moment.
- Manual: Topbar Lock button + sidebar user-menu item + `Cmd/Ctrl+Alt+L` shortcut. Moved off `Cmd/Ctrl+Shift+L` because Firefox uses that for bookmark search and the cheatsheet already assigned it to theme-toggle.
- Browser restart: sessionStorage clears across browser restart → no fresh timestamp → locked on next mount.

Cross-tab sync (added in round 2):
- BroadcastChannel("woxa-vault-lock") posts `{ type: "locked" | "unlocked", reason, ts }` on every lock/unlock event. Listening tabs sync immediately.
- localStorage write-then-remove of `woxa-vault-lock-broadcast` is the documented fallback for browsers without BroadcastChannel; remaining tabs hear it via the `storage` event.

Idle DOM listener coverage (post-audit):
- Events: pointermove, pointerdown, mousemove, mousedown, click, wheel, touchstart, keydown, keyup, scroll.
- Attached to `document` with `{ passive: true, capture: true }` — capture phase ensures children that call `stopPropagation()` can't hide activity from the tracker.

Spec deviation noted in lock-provider.tsx header: tab close → locked (sessionStorage clears with last tab in window). Spec says "tab close = don't lock", but Phase A takes the more-secure stance; Phase B can move to encrypted-IndexedDB cache.

Unlock entry points (all stamp the sessionStorage timestamp via `persistUnlockTimestamp()`):
- AuthProvider.refresh() — covers SSO callback hydration + already-signed-in tabs.
- AuthProvider.login() — password login.
- /setup-password handleSubmit — JIT'd users finishing their initial password.
- /invite/[token] handleSignup — signupAndAccept path.
- VaultLockScreen submit — POST /me/verify-password 200.

Logout clears: AuthProvider.logout calls `clearUnlockTimestamp()` so a refresh after logout can't skip the next login gate.

Hydration: No `mounted` paint-gate in VaultLockScreen (removed in round 2). The provider's sync initial-state read is enough; /app routes are dynamic so there's no SSR overlay to disagree with. This closes the brief frame where unlocked app shell could paint before the overlay snapped in.

verifyPassword API: now accepts optional `lockReason` ("idle" | "manual" | "sleep" | "restart") in the body — forwarded to backend audit log so events can be classified. Backend treats it as advisory metadata only.

Password lifecycle in LockScreen (WARN-E hardening): `setPassword("")` runs synchronously BEFORE the verifyPassword await; the plaintext lives only in a closure local for the duration of the request, then goes out of scope when the callback returns.

markLocked ordering: clearPersistedUnlockedAt() FIRST, then setState — so any synchronous consumer reading sessionStorage in the same event sees the cleared entry.

API endpoint used: POST /me/verify-password — verify-only, does NOT rotate session/cookie. 401/429/409 mapped in lock-screen.tsx.

Files:
- src/components/vault-lock/lock-provider.tsx
- src/components/vault-lock/lock-screen.tsx
- src/lib/vault-lock/use-idle-detector.ts
- src/lib/api/me.ts (added verifyPassword with optional lockReason)
- src/lib/auth/provider.tsx (persist/clear unlock on login/refresh/logout)
- src/components/layout/topbar.tsx (Lock now button)
- src/components/layout/sidebar.tsx (user-menu Lock item; uses markLocked)
- src/components/layout/keyboard-shortcuts.tsx (cheat-sheet entry ⌘⌥L)
- src/app/setup-password/page.tsx + src/app/invite/[token]/page.tsx (persist on success)

i18n keys: `vault_lock.*` namespace (title, subtitle.{idle,manual,restart,sleep}, password_label, submit, submitting, cooldown, forgot_password_link, signout_link, unlocked_toast, error.{invalid,rate_limited,rate_limited_with_cooldown,password_not_set,generic}, topbar.{lock_now,lock_shortcut,locked_toast,locked_toast_desc}). `lock_shortcut` value is now `⌘⌥L`.

Phase B TODOs:
- Re-evaluate the "tab close = locked" deviation with encrypted IndexedDB cache.
- Consider deriving a session-bound MAC on the unlock timestamp so a sessionStorage tamperer can't unlock without the active session secret (currently we rely on XSS being game-over already).
