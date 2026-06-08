---
name: i18n-conventions
description: Translation file structure, terms kept English in Thai locale, interpolation pattern, and known gaps
metadata:
  type: reference
---

## Translation File

Path: `src/lib/i18n/translations.ts`
Hook: `useT()` from `src/lib/i18n/provider.tsx`
Dict shape: `Record<string, { en: string; th: string }>`
Interpolation: `{var}` inside string values, e.g. `t("vault.items_count", { n: 5 })`

## Terms Intentionally Left English in Thai

Proper nouns: Google Workspace, Slack, GitHub, AWS, Stripe, email addresses, version numbers
Security terms: Passphrase, TOTP, API key, Zero-knowledge, TXT record

## Known i18n Bugs (from 2026-06-04 review)

1. `vault/[id]/page.tsx:829` — hardcoded `" Items"` English label in column header. Should be `tr("vault.items_count", { n: filtered.length })`.
2. `members/page.tsx:620` — non-active member status shows `t("common.status")` which renders "Status"/"สถานะ". Should show `t("common.inactive")` or equivalent; no such key exists yet (needs adding to translations.ts + usage).
3. `members/page.tsx:969` — `placeholder="name@example.com"` hardcoded. Should be a translated key.
4. `new-item-dialog.tsx:457` — `placeholder="Stripe Live · Slack Bot · ..."` hardcoded English hint text.
5. `new-item-dialog.tsx:535` — `placeholder="MM/YY"` hardcoded English date format.
