---
name: delete-with-password-dialog
description: Shared master-password-gated delete dialog component and its i18n keys / wiring pattern
metadata:
  type: reference
---

`DeleteWithPasswordDialog` lives at `src/components/shared/delete-with-password-dialog.tsx`.

Wraps any destructive action behind a master-password gate via `POST /me/verify-password` (`verifyPassword` in `src/lib/api/me.ts`). Mirrors the ZK/non-ZK derivation logic from [[vault-lock-screen]] (`src/components/vault-lock/lock-screen.tsx`): if `getLoginInfo(email).requiresZk`, derive `masterAuthKeyHash` with the server-issued kdfSalt; else send plaintext `password`.

Props: `open, onOpenChange, title, description, confirmLabel?, busy?, onConfirmed`. It does NOT auto-close on success — the parent's `onConfirmed` handler is expected to close the dialog (most existing delete handlers already `setOpen(false)` in their finally block). If `onConfirmed` throws, the dialog toasts the error and stays open for retry.

i18n keys live under `delete_confirm.*` in `src/lib/i18n/translations.ts` (password_label, password_placeholder, wrong_password, no_password, rate_limited `{n}`, hint).

Wired into: vault page (delete vault / quick-delete item / delete folder — uses `tr` not `t`), trash page (empty-all-trash), teams page (delete team — added `teams.delete.title`/`.desc`), members page (remove member — added `members.remove.title`/`.desc`). Error handling: 401→inline wrong_password, 409 password_not_set→toast+close, 429→inline cooldown (30s client-side).
