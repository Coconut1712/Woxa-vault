---
name: audit-ip-masked
description: audit_events.ip_masked column + maskIp/clientIpAuditFields helpers; PDPA-safe coarse IP display alongside the HMAC ipHash
metadata:
  type: project
---

Audit log now stores a masked DISPLAY IP next to the HMAC `ipHash`.

**Why:** PDPA data minimization — admins want a coarse network hint without
the backend ever persisting the full IP.

**How to apply:**
- Helpers live in `src/lib/ipHash.ts`:
  - `maskIp(ip)` → IPv4 first 2 octets `"203.0.•.•"`, IPv6 first 2 hextets
    `"2001:db8:•"`, `"unknown"`/empty/garbage → `null`. Glyph is `•` (U+2022).
    Leading `::` and compressed forms whose 2nd hextet is empty → null.
  - `clientIpAuditFields(c)` → `{ ipHash, ipMasked }` computed from a single
    `getClientIp(c)`. **Spread `...clientIpAuditFields(c)` into EVERY new
    `auditEvents` insert** instead of setting `ipHash` alone — keeps the two
    columns from drifting. (ipHash.ts imports getClientIp from clientIp.ts; no
    cycle.)
- Schema: `auditEvents.ipMasked = text("ip_masked")` (nullable). The `sessions`
  table also has an `ipHash` column — it is NOT audit-related, leave it alone
  (no masked sibling there).
- Migration `drizzle/0033_audit_ip_masked.sql` (ADD COLUMN ip_masked text).
  drizzle-kit generate worked this round BUT emitted a stray
  `item_versions.encryption_version SET DEFAULT 2` line from snapshot drift —
  hand-stripped it so the migration only adds the column.
- DTO: `toAuditDto` in `src/routes/audit.ts` returns `ipMasked: row.ipMasked ?? null`.
  `AuditEventDTO` interface grew the field. Frontend renders ipMasked in the IP
  column; ipHash stays for correlation. API_CONTRACT.md `AuditEvent` updated.
- Precompute sites (`const ipHash = hashIp(...)` reused for session/rekey/mailer
  ctx) were converted to `const { ipHash, ipMasked } = clientIpAuditFields(c)`
  (getClientIp form) or got a sibling `const ipMasked = maskIp(ip)` (hashIp(ip)
  form). items.ts view-debounce uses `ipMaskedStr` next to `ipHashStr`.
- `auth.logout` audit insert has NO IP at all (never did) — left unchanged.
  `imports.ts` background job audit insert also has no `c`/IP — unchanged.
- Tests: `src/lib/maskIp.test.ts` (unit) + `src/routes/auditIpMasked.test.ts`
  (integration via POST /vaults). `itemActivity.test.ts` DTO-key assertion was
  updated to include "ipMasked".
