---
name: weak-and-bydesign
description: Woxa Vault defense-in-depth gaps and by-design ZK behaviors a red-teamer should not mis-report as criticals
metadata:
  type: project
---

**Master-password delete gate is FRONTEND-ONLY (defense-in-depth gap, Low/Info).**
The round-2 "master password gate before delete (vault/folder/team/member/trash)" is a UX confirmation dialog in the web app. The API DELETE handlers (`DELETE /vaults/:id` at vaults.ts:634, items/teams/members/trash) require ONLY a valid session + RBAC role — NO server-side password/`requireVaultUnlocked` re-verification. A session-only attacker (stolen cookie / XSS) can delete with no password. `requireVaultUnlocked` is mounted ONLY on plaintext-READ endpoints (item GET/:id, /:id/password, /:id/versions/:version, attachment /:id/download), never on destructive writes.
- Why not Critical: deletion is destructive but not a secret-disclosure; no documented requirement (DESIGN/REQUIREMENTS) mandates a server-side step-up on delete. It's a missing step-up control, route to blue team as harden-if-desired.
- Re-test: if blue team adds a server gate, confirm DELETE without password → 4xx.

**ZK accepts unvalidated ciphertext — BY DESIGN, not a finding.** `POST /vaults/:id/items` stores arbitrary base64 in `*Ciphertext` columns without validation. The server cannot decrypt/validate ZK ciphertext by definition; garbage only harms the owner's own decrypt. Do not report as injection/integrity bug.

**LOCAL_KEK_BASE64 scope (Phase A residual, acceptable).** `LOCAL_KEK` (env) wraps only: legacy Phase-A item DEKs (none on V2 rows), MFA TOTP secrets, and the IP-HMAC key. It does NOT protect V2 item secrets. DESIGN.md notes the DB+env-read combo as the exact threat AWS KMS (Phase B) will close. Not exploitable for V2 plaintext.
