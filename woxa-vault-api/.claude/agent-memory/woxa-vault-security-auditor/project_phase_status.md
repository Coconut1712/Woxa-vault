---
name: project-phase-status
description: Current build phase of Woxa Vault and which security controls are deferred
metadata:
  type: project
---

Woxa Vault is in **Phase A / A.5** (as of 2026-05-22).

**Why:** Server-side encryption with a local/KMS-wrapped KEK is in place, but
full zero-knowledge (client-side master-key wrapping), RLS, and several
controls are deferred to later phases. How to apply: don't flag deferred
Phase B/C items as regressions; check them against the documented phase.

Consciously deferred (do not flag as new bugs):
- KEK lives in KMS only / per-vault wrapped keys -> Phase C (currently
  LOCAL_KEK_BASE64 unwrap path exists, see lib/itemCrypto.ts unwrapDek).
- Postgres RLS policies -> Phase C (defense-in-depth, app-layer checks are
  the current boundary).
- Explicit-deny and time-limited grants -> deferred (every grant is allow,
  no expiry) per DESIGN.md §11.3 / lib/access.ts header.
- ClamAV virus scan on attachments -> Phase B.
- Audit log append-only enforced at DB role level -> not yet (convention only).

Login password vs vault Master password: currently the same `passwordHash`
credential — flagged separately by the team as needing to be split (see
user auto-memory). Not part of the itemActivity feature.
