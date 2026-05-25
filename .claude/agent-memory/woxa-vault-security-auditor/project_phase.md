---
name: project_phase
description: Which DESIGN phase the project is currently in and what that implies for audits
metadata:
  type: project
---

Woxa Secret Vault is in **Phase A** (as of 2026-05).

**Why:** Phase A = backend holds the KEK (envelope encryption via `LOCAL_KEK_BASE64` / KMS), users don't yet derive their own keys. Master password is an auth credential, not a KDF input.

**How to apply:**
- The vault auto-lock (AC-055.8) is documented as a **UX gate**, not a cryptographic unlock — a session-thief with a valid cookie can still bypass the lock screen by calling JSON APIs directly. This is a *documented residual* on `routes/me.ts` near the verify-password handler.
- Phase C (zero-knowledge) plans to move KEK derivation client-side and make the unlock a real cryptographic boundary.
- Do **not** flag "backend can decrypt while UI is locked" as critical — flag as warning with reference to Phase C migration. But recommend Phase A.5 enforcement (server-side `sessions.vault_unlocked_at`) before public launch.

Related: [[phase_a_residuals]] [[vault_lock_architecture]]
