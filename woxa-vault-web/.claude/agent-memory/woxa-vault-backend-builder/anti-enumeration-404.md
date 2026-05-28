---
name: anti-enumeration-404
description: Tenant-boundary errors must return 404 (not 403) to prevent ID enumeration
metadata:
  type: feedback
---

Return **404 `not_found`** — not 403 — when the caller is asking about a resource they cannot see across a tenant boundary.

**Why:** matches the existing pattern in `loadVaultForUser` and is called out explicitly in API_CONTRACT.md ("also returned for resources the user cannot see, to prevent enumeration"). 403 leaks "this ID exists somewhere"; 404 does not.

**How to apply:**
- Vault / folder / item / send not visible to caller → 404.
- POST `/vaults/:id/members` with `userId` in a different org → 404 ("Target user is not a member of this workspace") — does NOT confirm the user exists in another org.
- DELETE `/sends/:id` when caller is not the sender → 404.
- DO use 403 `forbidden` when the resource IS visible but the action requires a higher role on it (e.g. viewer trying to edit a vault they can see). The frontend UI relies on 403 to render "you don't have permission" without hiding the resource itself.

Last-owner / last-manager guards use **409 conflict** with codes `last_owner` or `forbidden` + `details.reason = "last_manager"` — see [[shared-helpers]] for the helper signatures.
