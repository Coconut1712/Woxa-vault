---
name: project-resend-test-pre-existing-failure
description: src/lib/mailer/resend.test.ts "falls back to console.log when RESEND_API_KEY is not configured" fails in isolation — pre-existing, unrelated to RBAC work
metadata:
  type: project
---

`src/lib/mailer/resend.test.ts` test "falls back to console.log when
RESEND_API_KEY is not configured" fails even in isolation with RESEND_API_KEY
unset: expects errorCode `not_configured` but gets `transport_failed`.

**Why:** the mailer module (`src/lib/mailer/resend.ts`) lazily caches its Resend
client; the test's `delete process.env.RESEND_API_KEY` does not force the
"not configured" branch the assertion expects. This is a test/module-caching
mismatch in the mailer code, not in any RBAC/member code.

**How to apply:** Treat as a known pre-existing red. When verifying member /
RBAC changes, the suite baseline is "1 failed | 76 passed" with the single
failure being this resend test. Do not attribute it to member-route edits.
Related: [[project-single-owner-invariant]].
