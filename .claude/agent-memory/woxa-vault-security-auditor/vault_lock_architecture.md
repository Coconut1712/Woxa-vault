---
name: vault_lock_architecture
description: Phase A vault auto-lock + unlock flow — state machine, files, persistence design
metadata:
  type: reference
---

**Files (verify they exist before referencing):**
- `woxa-vault-web/src/components/vault-lock/lock-provider.tsx` — state machine + sessionStorage persistence + Page Visibility detection + keyboard shortcut.
- `woxa-vault-web/src/components/vault-lock/lock-screen.tsx` — fullscreen overlay with focus trap, ESC suppression, cooldown UI.
- `woxa-vault-web/src/lib/vault-lock/use-idle-detector.ts` — DOM event listeners (throttled) + interval poll.
- `woxa-vault-api/src/routes/me.ts` — `POST /me/verify-password` handler (AC-055.8 backing endpoint).
- `woxa-vault-web/src/lib/api/me.ts` — `verifyPassword` client.
- `woxa-vault-web/src/lib/auth/provider.tsx` — `persistUnlockTimestamp` / `clearUnlockTimestamp` integration on every auth event.
- `woxa-vault-web/src/app/app/layout.tsx` — mounts `VaultLockProvider` + `VaultLockScreen` inside `SessionGuard`.

**State machine:**
- Single source of truth: `unlockedAt` timestamp in `sessionStorage` (key `woxa-vault-unlocked-at`). NOT localStorage (XSS exfil survives less).
- Locked iff: no timestamp, or `Date.now() - timestamp >= 15min`.
- Lazy initializer in `useState` reads sessionStorage once on first render to avoid a single-frame flash of the lock screen for an already-unlocked user.
- `IDLE_LIMIT_MS = 15 * 60 * 1000` (exported).
- Reasons: `"idle" | "manual" | "sleep" | "restart"` — feed into the LockScreen subtitle.

**Triggers:**
- Idle: `useIdleDetector` interval (30s) compares `Date.now() - lastActivityRef.current >= IDLE_LIMIT_MS`.
- Sleep: Page Visibility — hidden for ≥ IDLE_LIMIT_MS on resume → lock with "sleep".
- Manual: Cmd/Ctrl+Shift+L global keydown OR Topbar Lock button OR Sidebar dropdown.
- Restart: lazy initializer detects missing/stale sessionStorage timestamp.

**Unlock:**
- `POST /me/verify-password` with `{ password }`. Verify-only — no cookie set, no session rotation, `Cache-Control: no-store`.
- Two-tier rate limit: soft 30/15min (every attempt), hard 5/15min (failures only).
- Constant-time via `VERIFY_DUMMY_HASH` for `password_not_set` (SSO-only) 409 path.
- Audit events: `account.vault_unlock_success` / `account.vault_unlock_failed` with `metadata.phase = "A"` and `metadata.reason`.

**Phase A residual (DOCUMENTED, not a finding):**
- Backend KEK = backend can still decrypt items even when UI is locked. A stolen-cookie attacker can bypass via JSON APIs directly. Phase C moves KEK derivation client-side. Phase A.5 *recommended* hardening: add `sessions.vault_unlocked_at` + middleware `requireUnlockedVault` on item read paths. See [[phase_a_residuals]].

Related: [[auth_session_patterns]] [[phase_a_residuals]]
