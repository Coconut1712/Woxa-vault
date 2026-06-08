---
name: accepted-decisions
description: Intentional design decisions confirmed by the team — do not re-flag these as violations
metadata:
  type: feedback
---

## SSO Controls Labelled "Preview"

`requireSso`, `allowedDomains`, `jitEnabled` are shown in settings/page.tsx but not yet enforced (pending org_domains table / AC-006.2). They display a "Preview" badge. This is intentional — not a UX bug.
Reference: [[project_workspace_sso_controls_preview.md]].

## Login Password vs Master Password Separation

Login password (used at /login) and Master password (used to unlock vault at POST /me/verify-password) are separate credentials. Frontend intentionally does NOT auto-unlock vault after login. This is correct zero-knowledge design.
Reference: [[project_login_vs_master_password.md]].

## BootSplash Hardcoded Hex Gradient

`from-[#7c66ff] to-[#c084fc]` in audit, trash, settings BootSplash is intentional brand coloring matching the logo gradient. Not a design-token gap — the brand gradient has no token equivalent yet.

## Trash/Audit Admin-Only Gate

Trash page gates on `isWorkspaceAdmin`, audit gates on `canViewAuditLog`. Non-admins are silently redirected to /app. This is correct RBAC behavior, not a UX dead-end.

## Item "quick delete" in vault list uses window.confirm

Noted as anti-pattern. Status: KNOWN VIOLATION, not yet converted to Dialog. Flag again on next review.
