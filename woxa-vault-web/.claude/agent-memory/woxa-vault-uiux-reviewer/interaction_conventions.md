---
name: interaction-conventions
description: Interaction conventions across the app — 3-dot menu pattern, filter UI patterns per page, Base UI onClick vs onSelect
metadata:
  type: project
---

## 3-Dot Menu Pattern
Single `DropdownMenu` with `MoreHorizontal` trigger. All row actions (Edit, Delete, Resend, Revoke, etc.) go inside one menu — never hover-revealed separate pencil/X icons. See members/page.tsx for reference implementation.

## Base UI Dropdown
`DropdownMenuItem` uses `onClick`, NOT `onSelect` (Base UI ≠ Radix). `cmdk` CommandItem is the only exception that uses `onSelect`. See [[reference_baseui_dropdown_onclick]] in user project memory.

## Filter UI Patterns Per Page
- **members/page.tsx**: tab-style FilterPill row (`flex gap-1 p-1 bg-card/40 border border-line-1 rounded-lg`) + search input inline — no popover, filters always visible
- **audit/page.tsx**: collapsed Popover trigger in Topbar actions + ActiveChip row in page body — good for density but splits filters across two UI zones
- **requests/page.tsx**: Select dropdowns for filters inline in page

## Audit Page Filter Architecture (2026-06-05 snapshot)
- Server-side filters: action (exact match) + from date → drives API refetch via `reloadKey`
- Client-side filters: free-text query + actor multi-select → `useMemo` over loaded rows
- This split means actor filter only covers loaded rows (50 per page), not all rows. This is a known limitation (noted in code comments) — not a UI/UX bug to report.

## Topbar Actions Height Rule
All items in the Topbar `actions` slot should be h-7 (Button size="sm"). Custom trigger buttons must explicitly set `h-7`.
