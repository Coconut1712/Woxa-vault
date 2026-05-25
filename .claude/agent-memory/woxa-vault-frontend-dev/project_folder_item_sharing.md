---
name: project-folder-item-sharing
description: Folder/item-level sharing + effectiveRole "most specific wins" gating wired into the web UI
metadata:
  type: project
---

Folder-level and item-level sharing (per-resource ACLs) are now wired in the web UI on top of the existing vault-member sharing. Backend was already shipped.

**Why:** The owner wanted the "most specific wins" effective-role model (item override > folder grant > vault membership) to actually change what the UI lets you do — e.g. an item-level Viewer override on a vault Editor can OPEN the item but not copy/edit/delete it.

**How to apply:** When touching sharing or per-item affordances, reuse these seams instead of re-deriving role logic.

Key pieces (all under woxa-vault-web/):
- `src/lib/api/grants.ts` — item + folder member wrappers (`list/add/update/removeItemMember`, `...FolderMember...`), mirror of the vault-member wrappers in `vaults.ts`. Endpoints `/items/:id/members` and `/folders/:id/members` share the same `{member}`/`{members}`/void shapes. 409 = member_conflict (no last-manager concern for folder/item).
- `src/components/vault/share-dialog.tsx` — generalized over `resourceKind: "vault"|"folder"|"item"`. Props now `{resourceKind, resourceId, resourceName, canManage, currentUserId, initialMembers?, onMembersChange?}`. It FETCHES members on open via a `RESOURCE_API` dispatch table (keyed by kind) and holds them in local state; `initialMembers` only seeds to avoid a flash (vault page uses it). `describeError(err, t, kind)` maps 409→last_manager only for vault, else→already_member.
- `src/lib/auth/permissions.ts` — added `canRevealItem`, `canEditItemRole`, `canShareResourceRole` (pure, take a VaultRole). These answer the resource-level question only; ALWAYS AND with `canWriteVaultData(orgRole)` so guests stay read-only.
- `src/lib/items-overlay.ts` — `DisplayItemSummary`/`DisplayItemFull` carry `displayEffectiveRole` (fallback "manager" for legacy wire that omits `effectiveRole`). Helper `withVaultRole(item, vaultRole)` re-bases the fallback to the vault role. `effectiveRole?: VaultRole` lives on `ItemSummary` in `src/lib/api/types.ts` (ItemFull inherits it).

Gating applied (the affordances keyed off the ITEM's effective role, ANDed with org-write):
- Vault list rows (`vault/[id]/page.tsx`): quick-delete + more-menu → `canEditItemRole(itemRole) && canWrite` where `itemRole = item.effectiveRole ?? vault.role`. Favorite stays ungated for everyone.
- Item detail (`item/[id]/page.tsx`): edit/delete → `canEditItemRole`; share → `canShareResourceRole || item.createdBy.id === me.id`; send → requires `!isViewOnly`. An effective viewer (`!canRevealItem`) gets a view-only amber banner, a dashed `ViewOnlyField` placeholder for `hasPassword && isViewOnly` (getItem returns password/notes null, 200 not 403), and the attachments section is hidden (download would 403).

Entry points for Share (UserPlus icon, inside the existing 3-dot dropdown convention):
- Item detail: outline "Share" button next to Edit.
- Folders: 3-dot menu in BOTH `sidebar.tsx` VaultBranch folder rows AND the vault page action bar (shown when a folder filter is active). Folder share gated by parent vault role being manager|editor AND canWrite.

i18n keys added: `share.folder_desc`, `share.share_folder`, `share.share_item`, `share.read_only_note_resource`, `item.share`, `item.readonly_notice`, `item.readonly_notice_desc`, `item.readonly_secret`, `folder.actions_aria`.

Gotcha: the `react-hooks/set-state-in-effect` errors in share-dialog (lines ~233/253) are PRE-EXISTING (org-roster loader + reset-on-close effects), not from the new member-fetch effect. tsc + build both pass clean. See [[project-api-scaffolding]] for the broader API client layout and [[reference-api-contract]].
