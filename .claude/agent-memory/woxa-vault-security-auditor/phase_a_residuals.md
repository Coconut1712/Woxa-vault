---
name: phase_a_residuals
description: Documented Phase A risks the team has consciously deferred — do not re-raise as critical
metadata:
  type: project
---

These are known, documented, and accepted in Phase A. Flag as warnings/info with reference to the migration phase. Do not escalate to critical without new evidence.

**Why:** Phase A is an MVP with backend-held KEK; some defense-in-depth gaps are intentionally deferred until Phase B (multi-instance) or Phase C (zero-knowledge).

**How to apply:**

1. **Rate limit is in-memory** (`rateLimit.ts:11`) — process restart resets counters; multi-instance deployment can't share state. Phase B = Redis sliding window. Account-lock (`failed_login_count` → `lockedUntil` in DB) provides DB-level fallback for /auth/login specifically.

2. **Vault lock is UX-only, not cryptographic** — backend can decrypt items for any caller with a valid session even when UI is "locked". A session-thief can curl JSON APIs and bypass the gate. Phase C = client-side KEK derivation. *Recommended Phase A.5 hardening: `sessions.vault_unlocked_at` server-side check on item read endpoints.*

3. **No cross-tab lock state sync** — manual `markLocked` in Tab A doesn't lock Tab B. Auto-lock via idle still fires per-tab. Phase B candidate: `BroadcastChannel` + signed timestamp.

4. **sessionStorage timestamp is not HMAC-bound** — XSS can write a fresh timestamp to bypass the lock UI. Mitigation = strict CSP + zero `dangerouslySetInnerHTML`. Phase C will make this moot because unlock will be a real crypto operation.

5. **`LOCAL_KEK_BASE64` is the envelope-encryption root** — password setup/regenerate/reset do NOT rotate the KEK or re-wrap DEKs. Phase C will coordinate DEK re-wrap with the frontend.

6. **Audit log is not yet append-only at DB role level** — relying on app-layer discipline. Phase B = Postgres role with no UPDATE/DELETE perms on `audit_events`.

7. **Append-only audit table not enforced via RLS** — Phase B deliverable.

Related: [[project_phase]] [[vault_lock_architecture]]
