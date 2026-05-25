---
name: project-api-scaffolding
description: Where the round-2 API client (vaults/items/sso) lives and which UI surfaces are now live vs still on mock
metadata:
  type: project
---

Round-2 API client (auth, vaults, items, sso) plus the live-data swap landed by 2026-05-18.

- `src/lib/api/types.ts` — `VaultColor`, `VaultRole`, `VaultSummary`, `Vault`, `VaultDetail`, `VaultMember`, `Vault{Create,Update}Input`, `ItemType` (`"login" | "note"` only in round 2), `ItemSummary` (with `hasPassword`/`hasNotes`/`hasTotp` flags — NO inline secrets), `ItemFull` (decrypted `password`/`notes`), `Item{Create,Update}Input`, `SsoErrorCode`.
- `src/lib/api/vaults.ts` — `listVaults`, `createVault`, `getVault`, `updateVault`, `deleteVault`. Thin wrappers over `apiFetch`.
- `src/lib/api/items.ts` — `listItems(vaultId)`, `createItem(vaultId, input)`, `getItem(id)` (audits `item.reveal`), `updateItem`, `deleteItem`. PATCH: send a string to update, `null` to clear, omit the key to leave ciphertext untouched.
- `src/lib/api/sso.ts` — `googleSsoStartUrl()`, `startGoogleSso({ email?, next? })`, `asSsoErrorCode()`.
- `src/lib/api/sends.ts` — `createSend`, `listSends`, `burnSend`, `previewSend`, `revealSend`. Types: `SendStatus`, `SendSummary`, `SendCreateInput`, `SendCreated` (token + viewUrl revealed ONCE), `SendPreview`, `SendRevealResult`.

**Live (API-backed) surfaces**:
- `src/app/app/page.tsx` (dashboard vault grid + stats) — uses `useVaults()`. NOTE: `activeSends` stat still reads from `src/lib/mock/data.ts`.
- `src/app/app/vault/[id]/page.tsx` — `getVault` + `listItems` + `deleteVault` (manager-only delete).
- `src/app/app/item/[id]/page.tsx` — `getItem` (privileged reveal) + `deleteItem`.
- `src/app/app/sends/page.tsx` — `listSends` + `burnSend`. Row shows `tokenHashPreview` (mono) since backend never returns raw token in list; "Copy" buttons are permanently disabled with tooltip `sends.copy_disabled_tooltip` (URL is only available right after creation).
- `src/app/app/sends/new/page.tsx` — `createSend` on submit; pulls source item via `getItem(itemId)` (counts as a reveal) when `?item=` param is present. Maps form expiry → minutes via `EXPIRES_TO_MINUTES`. Surfaces `viewUrl` in the success card.
- `src/app/s/[token]/page.tsx` — public reveal flow: `previewSend(token)` → preview/passphrase stages → `revealSend(token, { password? })`. Handles 425 `send_not_ready` with one auto-retry after 2s; 401 codes flip stage to passphrase; 404/410 → notfound/expired UI. `history.replaceState` strips the URL fragment on mount.
- `src/components/vault/new-vault-dialog.tsx` — `createVault`, refreshes `useVaults()`.
- `src/components/vault/new-item-dialog.tsx` — `createItem`, login + note only in round 2 (other types removed from the picker).
- `src/components/vault/edit-item-dialog.tsx` — `updateItem` with minimal diff (only send changed keys).
- `src/components/layout/sidebar.tsx` and `command-palette.tsx` — both read vaults from `useVaults()`.

**Still mock (no endpoint yet)**: favorites, trash, audit, members, settings, account, notifications, lock-screen, share-dialog/access lists, folders. Each carries a `// TODO: swap to API when …` comment near the import where it was already obvious; the rest still import from `src/lib/mock/data.ts` / `access.ts` / `members.ts`.

**Why**: contract was finalized in `/API_CONTRACT.md` and backend routes shipped, so the read/write path for vaults+items+sends is now real. Audit, members, folders, favorite toggle, TOTP, custom fields, and attachments remain on mock until their endpoints land.

**Sends gotchas** (2026-05-19):
- `POST /sends` rate-limited 10/min/user → map `rate_limited` code to `sends.error.rate_limited`.
- `POST /s/:token/reveal` may return 425 `send_not_ready` within ~1s of creation (burn-guard against link-preview bots). Wait 2s and retry once before surfacing an error.
- 401 codes on reveal: `send_password_required` → flip to passphrase stage; `send_password_invalid` → stay on passphrase stage and show inline error.
- GET /sends only returns `tokenHashPreview` (12 hex). Raw token is unrecoverable after creation; "Copy link" in the list is therefore permanently disabled.
- Source-item field picker on the new-send page issues a `getItem(itemId)` which the backend audits as `item.reveal` — same cost as opening the item page.

**How to apply**:
- Mount `VaultsProvider` (defined at `src/lib/vaults/provider.tsx`) once inside `src/app/app/layout.tsx`. Pages read with `useVaults()` (`{ vaults, status, error, refresh }`); after any create/update/delete that affects the list, call `refresh()`.
- Shared loading/error/skeleton UI lives at `src/components/shared/api-states.tsx` — `ApiErrorState`, `ApiLoadingState`, `ListSkeleton`, `VaultGridSkeleton`. The error component already maps `forbidden`, `not_found`, `network_error` to localized copy under `api.error.*`.
- Treat `getItem` as a privileged "reveal" — do NOT call it on list hover, background refresh, or prefetch.
- When showing `VaultSummary.iconKey`/`color`, default to `"folder"` / `"violet"` because both can be `null`.
- 409 `vault_not_empty` is the only mutation-time code with bespoke copy (`api.error.vault_not_empty`).
- The mock layer at `src/lib/mock/data.ts` still owns `auditEvents`, `sends`, `workspace`, `currentUser`, `folders`, and the legacy item array. Don't delete these — multiple pages still consume them.

**Translation keys added in the swap (all in `src/lib/i18n/translations.ts`)**: `api.error.{forbidden_title,forbidden_desc,not_found_title,not_found_desc,delete_failed,save_failed,create_failed,vault_not_empty,reveal_failed}`, `vaults.empty.{title,desc,cta}`, `vault.items.empty.{title,desc,cta}`, `vault.delete.{title,desc,button,danger_zone}`, `vault.deleted_toast`, `item.delete.{title,desc,button}`, `item.deleted_toast`, `item.reveal_loading`, `item.no_secret`, `dash.view_all`.
