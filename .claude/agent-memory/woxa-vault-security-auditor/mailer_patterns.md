---
name: mailer_patterns
description: Resend mailer module — HTML escape rules, dev fallback, redact behavior
metadata:
  type: reference
---

**Outbound email module:** `woxa-vault-api/src/lib/mailer/resend.ts`.

**Helpers exported:**
- `sendInviteEmail(input)` — only consumer so far (invitations). Returns `{ sent, errorCode? }`.
- `redactEmail(addr)` — masks local part to first char + `***@domain`. Used for log lines.
- `isValidEmail(addr)` — RFC-5322-ish RX, length ≤254. Defense-in-depth on top of route-layer Zod.

**HTML safety:**
- `escapeHtml` covers `& < > " '` (5 chars). All dynamic fields (`inviterName`, `orgName`, `role`, `url`, `expires`) go through it before landing in the template.
- Plaintext fallback skips escaping (text renderers don't interpret markup). DO NOT pipe HTML-escaped text through both layers.

**Logging discipline:**
- Module logs `{ to: redactedEmail, invitationId, emailSent }` only. NEVER logs `acceptUrl` or the raw `to`.
- Dev fallback (`RESEND_API_KEY` unset) uses `console.log` directly — bypasses pino redact intentionally so a dev can see the link. Production env guard at `config/env.ts:124-130` refuses to boot without `RESEND_API_KEY`.
- pino redact paths cover `*.acceptUrl`, `*.accept_url`, `*.token`, `*.invitationToken`, `*.mfaToken`, `*.backupCodes`, `*.otpauthUri`, `*.qrDataUrl`.

**Failure semantics:**
- DB row is committed BEFORE Resend call. Transport failure does NOT roll back the invitation. Caller (route handler) surfaces `emailSent: false` + `emailError` in response so admin can retry via `/invite/:id/resend`.

**Production deploy checklist (audit before signoff):**
1. `RESEND_API_KEY` scoped to send-only on verified domain (not a master key)
2. `MAIL_FROM` matches a DKIM-signed sender; DMARC policy ≥ quarantine
3. SPF includes `_spf.resend.com`
4. `NODE_ENV=production` so dev fallback is statically unreachable

Related: [[audit_and_logging]] [[validation_and_ratelimit]]
