---
name: forced-setup-page-pattern
description: The shared pattern for post-auth forced-setup wall pages that live outside /app and run their own auth check
metadata:
  type: project
---

Forced post-auth "wall" pages (/setup-password, /spaces, /setup-2fa, /login/mfa) all follow one pattern.

**Why:** They must run BEFORE /app content paints but cannot be wrapped by SessionGuard or they would loop (the guard would re-redirect a user it just sent there).

**How to apply:**
- Live OUTSIDE `src/app/app/` (no Sidebar/Topbar). NOT wrapped by SessionGuard.
- Own auth check in a `useEffect` (no router calls in render): unauthenticated → `/`; requiresPasswordSetup → `/setup-password` (password wall outranks all); then the page's own condition.
- Quiet `BootSplash` returned while booting or about to redirect (spinner + brand logo, `t("auth.checking_session")`).
- Pages reading `?next=` use `safeNext()` with allowlist regex `^\/(?!\/)[A-Za-z0-9_\-./~?&=#%@:+,]*$` (length<=256) — copied from /login/mfa. Wrap the consuming child in `<Suspense fallback={...}>` because `useSearchParams`.
- After completing the wall's action: `await refresh()` (updates /me flags so the guard at `next` won't bounce back) THEN `router.replace(nextHop)`.
- Background blur blobs: two `bg-[#6366f1]/[#a855f7]` radial gradients, opacity 0.10/0.06, blur-[120px].

Related: [[require-2fa-policy]]
