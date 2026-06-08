---
name: i18n-conventions
description: i18n key location, interpolation style, terms that stay in English, audit action key naming pattern
metadata:
  type: project
---

## Key File
`src/lib/i18n/translations.ts` — dictionary `{ en, th }` with `{var}` interpolation.
Provider: `src/lib/i18n/provider.tsx` — `useT()` hook.

## Interpolation
Use `{var}` syntax: `t("audit.loaded_count", { n: filtered.length })`.
Never string-concatenate: `t("prefix") + " " + value` is a violation.

## Terms Left in English (in Thai copy too)
- Product/brand: Google Workspace, Slack, Stripe, GitHub, AWS, Bitwarden, 1Password, LastPass
- Security terms: Passphrase, TOTP, API key, Zero-knowledge, TXT record, 2FA, Master Password
- File extensions: .csv, .1pux, .json

## Audit Action Key Pattern
`audit.action.{category}_{subcategory}` — e.g. `audit.action.2fa_enabled`, `audit.action.auth_login_success`.
The `actionLabelKey` map in `src/lib/audit-format.ts` is the single source of truth — new backend codes must be added there AND to translations.ts.

## Audit Group Keys
`audit.group.{key}` — one per ACTION_GROUP: item, folder, vault, team, member, auth, 2fa, account, attachment, send, workspace, trash, other.

## Notable Missing/Misused Keys (found in audit page review)
- `audit.empty_title` ("No events yet") is reused BOTH for the actors empty state (line 471) AND the table empty state (line 564). These have different semantics — the actors empty state means "no events loaded yet, so no actors to show" not "no events exist". A dedicated key like `audit.filter.no_actors_loaded` would be more accurate.
- `audit.loaded_count` (line 551) duplicates the count already shown in the popover footer (line 496) — redundant but not a blocker.
