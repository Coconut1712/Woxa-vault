---
name: project-item-types-phased-unlock
description: NewItemDialog renders all 6 mockup item types but locks the 4 backend-unsupported ones behind a "Coming soon" badge until round 2.2
metadata:
  type: project
---

The "Create new item" dialog (`src/components/vault/new-item-dialog.tsx`) renders the full mockup type set — `login`, `note`, `api_key`, `ssh`, `card`, `identity` — in the picker, but only `login` and `note` are clickable. The other four are visually disabled with an amber "Coming soon" badge and an explanatory footnote.

Why: round 2 of the backend (see [[project-api-scaffolding]] and `/API_CONTRACT.md`) only encrypts `password_ciphertext` + `notes_ciphertext`. Submitting any other type would either be rejected by the Zod enum or silently dropped. Showing only 2 types would have looked like a regression vs the mock; hiding them with a badge keeps the picker honest.

How to apply: when the backend ships the schema delta described in API_CONTRACT.md "Item type expansion (round 2.2)" (generic `extra_fields_ciphertext` bytea pair + widened ItemType enum), flip `supported: true` for the relevant entries in `typeOptions`. Each unlocked type will also need its form-stage fields added (currently only `login` and `note` have form bodies). The matching i18n strings (`ni.type.api_key.*`, `ni.type.ssh.*`, `ni.type.card.*`, `ni.type.identity.*`, plus `ni.private_key*`, `ni.card_*`, etc.) already exist in `src/lib/i18n/translations.ts`.

The two ItemType unions intentionally diverge: `src/lib/types.ts` carries the full 6-value mock-era union (used by IconTile, format helpers, and any remaining mock-backed page), while `src/lib/api/types.ts` exposes the narrow 2-value union the wire actually accepts.
