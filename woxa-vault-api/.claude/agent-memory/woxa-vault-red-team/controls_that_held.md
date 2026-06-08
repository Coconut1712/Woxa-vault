---
name: controls-that-held
description: Woxa Vault defenses verified strong in red-team rounds — re-test these, don't re-discover them
metadata:
  type: project
---

Defenses that held under live attack (rounds 1–2, latest 2026-06-04). Re-run to confirm they stay closed; don't burn time re-discovering they work.

**Round-1 fix VERIFIED closed (2026-06-04):** rate-limit evasion via `cf-connecting-ip` (and all forwarding headers) — now gated behind `TRUST_PROXY` in `getClientIp` ([[check-locations]]). Rotating cf-ip no longer yields fresh buckets; login locks at 429 on the constant socket IP. Combo key `login:${ip}:${email}` + ip key `login:ip:${ip}`, limit 5 / 15min.

**Cross-tenant isolation / IDOR — strong.** Member of OrgA cannot read/write OrgB's vault, item, item-reveal, item-list, create/patch/delete in B's vault → all 404. `POST /workspace/switch` to a non-member org → 404.

**Stale/forged `active_org_id` — strong (M-1 fix).** Even when `sessions.active_org_id` is DB-forged to a non-member org, `resolveActiveOrg` re-validates membership on EVERY request and falls back to the default org. `/me`, `/vaults`, `/members`, `/audit` all stay scoped to the org the caller actually belongs to. Role always comes from the resolved membership, never the pointer.

**RBAC — strong.** Member self-escalate to admin → 403. Grant `owner` via PATCH /members → 400 (owner excluded from assignable enum; ownership only via transfer). Demote/remove Owner as member → 403. Audit is admin/owner-only → member 403. `requireTwoFactorEnrolled` enforced at API layer (403 two_factor_required) when org `require2fa` on — not frontend-only.

**ZK / DB-leak — strong (V2, V1 removed).** All V2 items have `dek_ciphertext = NULL`; `unwrapDek`/`getKek` never called in item read path; reveal returns raw `passwordCiphertext` for client-side decrypt. A DB + LOCAL_KEK_BASE64 attacker recovers ZERO V2 plaintext (V2 ciphertext is vault-key-encrypted client-side; vault key wrapped to user x25519 pubkey; privkey encrypted under master-password KDF). `encryptionVersion:1` in create-vault is ignored — server forces 2.

**Auth — strong.** Random/empty/no session cookie → 401. Session id = sha256(token), unguessable.

**Access requests — strong.** Auto-deny sweeper (`sweepStaleAccessRequests` in expirationSweeper.ts) flips pending→denied only when `status='pending' AND created_at < now()-7d`, idempotent. Decide-after-auto-deny → 409 (status!=pending guard) — no double-grant/race. Member self-approve → 403 (owner/admin only). Decide is org-scoped (cross-tenant approve blocked).

**Audit — strong.** No API path UPDATEs/DELETEs `audit_events` (insert-only/immutable). Metadata carries no secret/ciphertext values. Cross-org audit read blocked.

**Notifications — strong.** No create-notification endpoint (server-internal only). All reads/mark-read scoped to `notifications.userId = caller`; cross-user mark-read → 404, list doesn't leak other users' rows.
