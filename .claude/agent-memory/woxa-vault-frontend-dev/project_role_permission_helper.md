---
name: role-permission-helper
description: Where org-role UI gating lives and how it layers on top of per-vault roles in woxa-vault-web
metadata:
  type: project
---

Org/workspace-role UI gating helper lives at `src/lib/auth/permissions.ts` (pure
functions over `OrgRole | null` from `@/lib/api/members`): `isWorkspaceAdmin`,
`isGuest`, `canViewWorkspaceSettings`, `canViewAuditLog`, `canWriteVaultData`.

**Why:** Owner directive — UI must mirror the backend role gate so users never
see buttons/pages that would just 403. Backend mirror: GET /audit is admin-only;
all non-GET vault/item/folder/attachment/send/vault-member endpoints 403 for
guests via `blockGuestWrites`.

**How to apply:**
- There are TWO role layers. Org role = `useAuth().me?.role`
  (owner|admin|member|guest, `null` = no workspace). Per-vault role =
  `vault.role` (manager|editor|user|viewer). The org helpers layer ON TOP — AND
  them with existing vault-role checks; never replace them. e.g.
  `canManage = vault.role === "manager" && canWriteVaultData(role)`.
- Guests are read-only EVERYWHERE: hide every create/edit/delete/share/move/send
  affordance regardless of vault role. KEEP reveal/copy/download for guests.
  Note: favorite-toggle is a PATCH (write) so it's hidden for guests too.
- Settings + Audit pages use an effect-driven `router.replace("/app")` guard with
  a local `BootSplash` early-return (label `t("auth.checking_session")`) so
  protected content never flashes — mirrors the setup-password/spaces redirect
  pattern.
- Surfaces already gated for these rules: sidebar (nav filter + new-vault +
  folder menu), command-palette (quick actions + go-to group), dashboard,
  favorites, vault/[id], item/[id], sends. See [[login-vs-master-password]] for
  the separate credential note.
