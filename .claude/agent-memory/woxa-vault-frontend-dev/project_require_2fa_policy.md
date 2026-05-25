---
name: require-2fa-policy
description: How the Require-2FA workspace policy is enforced across frontend (SessionGuard rung, /setup-2fa wall, 403 safety net, settings toggle)
metadata:
  type: project
---

The "Require 2FA" workspace policy is a real enforced feature (not cosmetic). Backend enforces; frontend is UX only.

**Why:** Workspaces can mandate every member have TOTP 2FA. Members without it are blocked from secret routes (vaults/items/folders/sends/attachments/vault-members) server-side.

**How to apply / where the pieces live:**
- API contract: `GET/PATCH /workspace/settings` → `{ settings: { require2fa } }`. PATCH is owner+admin only (403 `forbidden`), rate-limited (429). Client in `src/lib/api/workspace-settings.ts`.
- `MeUser.requiresTwoFactorEnroll?: boolean` (optional → fail open). Drives the forced-enrollment gate.
- SessionGuard ladder order: requiresPasswordSetup→/setup-password → needsWorkspaceSelection→/spaces → **requiresTwoFactorEnroll→/setup-2fa** → /app. The 2FA rung sits AFTER workspace selection (policy only applies once you belong to a workspace).
- `/setup-2fa` is a full-page non-dismissible wall OUTSIDE /app with its own auth check (mirrors /setup-password & /spaces pattern). Reuses enroll API (`enrollTwoFactor`/`verifyEnrollTwoFactor`) + `BackupCodesPanel`. After enroll: `await refresh()` then route to sanitized `next`.
- 403 `two_factor_required` safety net lives in `src/lib/api/client.ts` `apiFetch`: hard `window.location.assign("/setup-2fa")` (guarded against loop when already there). Catches policy flipped mid-session.
- Settings toggle in `SecurityPolicySection` (`src/app/app/settings/page.tsx`) is now live: loads via GET, optimistic PATCH with revert-on-fail, role-gated read-only for non owner/admin, warns admin who enables it without own 2FA. require2fa is now one of FOUR live controls — see [[workspace-settings-full-wiring]].

Related: [[forced-setup-page-pattern]], [[workspace-settings-full-wiring]]
