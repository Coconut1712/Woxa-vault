---
name: project-attachments-and-members
description: Attachments + Members API clients and where they wire into the UI (round 2.3, 2026-05-19)
metadata:
  type: project
---

Round 2.3 (file attachments + workspace members live API) landed 2026-05-19.

**Clients**
- `src/lib/api/attachments.ts` — `listAttachments`, `uploadAttachment(itemId, File, { onProgress? })`, `attachmentDownloadUrl(id)`, `downloadAttachment(id, filename?)`, `deleteAttachment(id)`. Uploads bypass `apiFetch` and call `fetch` directly with FormData so the browser sets the multipart boundary; XHR fallback used when `onProgress` is provided. Error codes mapped per status: 413 → `attachment_too_large`, 415 → `attachment_mime_not_allowed`. Backend also returns `attachment_item_quota_exceeded` (413) from the envelope.
- `src/lib/api/members.ts` — `listMembers()` returns `{ members, invitations }`; mutations: `updateMemberRole`, `removeMember`, `inviteMember`, `resendInvite`, `revokeInvite`. Types: `OrgRole`, `InviteRole` (excludes owner), `InvitationStatus`, `OrgMember`, `Invitation`, `InvitationCreatedResponse` (`{ invitation, acceptUrl }`).

**UI surfaces using them**
- `src/components/vault/attachments-section.tsx` — reusable section component. Props `itemId | null`, `hideUpload`, `hideDelete`. Exposes `AttachmentsSectionHandle` via `forwardRef` (`queuedCount()`, `consumeQueue(itemId)`) so the new-item dialog can drain the queue after the item is created. Drag-and-drop + file picker; per-file 25 MB pre-check.
- `src/components/vault/new-item-dialog.tsx` — embeds `<AttachmentsSection ref itemId={null}>` for `note` + `login` kinds; submit handler calls `attachmentsRef.current?.consumeQueue(created.id)` after `createDisplayItem` returns.
- `src/components/vault/edit-item-dialog.tsx` — embeds `<AttachmentsSection itemId={item.id}>` for `note` + `login` kinds (live upload + delete).
- `src/app/app/item/[id]/page.tsx` — embeds `<AttachmentsSection itemId={item.id} hideUpload hideDelete={!canEdit}>` inside a card under Notes so the detail page can download (and delete when role allows) without re-uploading.
- `src/app/app/members/page.tsx` — fully rewritten on top of `listMembers`. Derives `currentRole` by matching `useAuth().user.id` to a member row. RBAC: invite + row-menu (3-dot, change-role + remove) only shown for `owner`/`admin`. Pending invitations rendered in their own amber card with a 3-dot menu (resend + revoke). `InviteMemberDialog` POSTs `inviteMember`, opens `InviteSuccessDialog` (read-only Input + Copy button) showing the returned `acceptUrl`. Resending an invite also opens the success dialog with the new url.

**Phase A gotcha**: backend does NOT yet deliver invitation email. `POST /members/invite` and `POST /members/invite/:id/resend` return `acceptUrl` in the response body — UI MUST surface this for the admin to copy. Phase B will drop `acceptUrl` from the response once Resend is wired.

**Error code mapping** (toast descriptions)
- attachments: 413 `attachment_too_large` → `items.attachments.error.too_large`; 413 `attachment_item_quota_exceeded` → `items.attachments.error.quota_exceeded`; 415 `attachment_mime_not_allowed` → `items.attachments.error.mime_not_allowed`; otherwise `items.attachments.error.upload_failed`. 4xx on list collapses to `items.attachments.error.list_failed` (silent toast on 404). Delete failure → `items.attachments.error.delete_failed`.
- members: 409 `already_member` → `members.error.already_member`; 409 `invitation_already_accepted` → `members.error.invitation_already_accepted`; 409 `invitation_revoked` → `members.error.invitation_revoked`; 409 `last_owner` → `members.error.last_owner`.

**Translation key namespaces added** (all in `src/lib/i18n/translations.ts`)
- `items.attachments.*` (title, drop_hint, choose_file, uploading, empty, delete_confirm, limit_hint, available_after_save, queued, queued_plural, download, delete, uploaded_at, error.{too_large,quota_exceeded,mime_not_allowed,upload_failed,delete_failed,list_failed}, toast.{uploaded,deleted})
- `members.*` (active, pending, empty.{title,desc}, pending_empty, joined_at, last_active, invitation.{expires,sent}, actions.{resend,revoke,change_role,remove,copy_link}, toast.{role_updated,removed,invited,resent,revoked,link_copied}, error.{list_failed,invite_failed,already_member,invitation_already_accepted,invitation_revoked,last_owner,role_update_failed,remove_failed,revoke_failed,resend_failed}, invite.{title,subtitle,email_label,role_label,submit,email_warning,copy_link,success,accept_url_label,created_for,expires_in,close}, invitedBy, role.unknown, copy_link_{title,subtitle})
- `common.you`

**TODO for the next round**
- Upload progress UI is wired (XHR path exists) but the AttachmentsSection currently only shows a spinner. Hook `uploadAttachment(itemId, file, { onProgress })` to a real progress bar if/when design lands.
- Members page still uses derived avatar initials (no real avatar storage yet) — `MemberAvatar` / `EmailAvatar` hash the seed to a `ColorKey`.
- `members.export` and `common.more_filters` buttons remain disabled; no backend endpoint yet.
- The old mock `src/lib/mock/members.ts` still exports `members` + `trashItems` + `sessions`; trash + account still consume those.
