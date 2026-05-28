---
name: view-reveal-split
description: GET /items/:id is VIEW-only (password null); reveal is a separate GET /items/:id/password endpoint
metadata:
  type: project
---

The audit log distinguishes opening an item from revealing its secret.

**Why:** Merely opening an item's detail page used to log `item.reveal` ("Secret revealed") on every `GET /items/:id`, which made the audit log inaccurate — the user often never clicked to show the password.

**How to apply (current contract in `src/routes/items.ts`):**
- `GET /items/:id` = VIEW only. Returns `item` with `password: null` for ALL roles, but still returns decrypted `notes` (frontend decodes folder/tags/favorite/totp meta out of the notes blob) + `hasPassword`. Audit action = `item.view` for everyone. Gated by `requireVaultUnlocked` (returns notes plaintext).
- `GET /items/:id/password` = REVEAL. Returns `{ password: string | null }`. The ONLY endpoint that decrypts+returns the password. Audit action = `item.reveal`. Authz: effective access AND `canRevealItem(role)` (viewer → 403); no access → 404; deleted → 404. Same middleware as old reveal (`requireVaultUnlocked` + requireAuth + requireTwoFactorEnrolled). Registered BEFORE the generic `/:id` in the same `itemRoutes` router so it isn't shadowed.

Share/role-change audit metadata enrichment (`itemMembers.ts`, `folderMembers.ts`, `vaultMembers.ts`): `*.share` + `*.role_change` now include `granteeEmail`; `*.revoke` includes `revokedEmail`. `granteeUserId`/`revokedUserId` and `from`/`to` retained. Each file has a small `emailFor(userId)` helper (returns null if user unknown). No secret values in metadata.

Tests: `src/routes/itemViewReveal.test.ts` (new). `src/routes/sharing.rbac.test.ts` updated — password is now fetched via `/items/:id/password`, not `GET /:id`. See [[test-seed]] and [[anti-enumeration-404]].
