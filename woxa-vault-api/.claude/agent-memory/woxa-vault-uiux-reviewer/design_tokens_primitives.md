---
name: design-tokens-primitives
description: Canonical design tokens, color pairings, and locations of shared primitives in woxa-vault-web
metadata:
  type: reference
---

## Design Tokens (Tailwind CSS 4, src/app/globals.css)

Surface tokens (auto light/dark): `bg-surface-1`, `bg-surface-2`, `bg-surface-3`
Border tokens: `border-line-1`, `border-line-2`, `border-line-3`, `border-border`
Text tokens: `text-foreground`, `text-muted-foreground`
Brand: `bg-brand`, `text-brand`, `text-brand-foreground`, `hover:bg-brand/90`

## Approved Semantic Color Pairings

Success / Emerald:
- `text-emerald-700 dark:text-emerald-400` (text)
- `bg-emerald-500/15 dark:bg-emerald-500/10` (bg)
- `border-emerald-500/30 dark:border-emerald-500/20` (border)

Warning / Amber:
- `text-amber-700 dark:text-amber-400`
- `bg-amber-500/15 dark:bg-amber-500/10`
- `border-amber-500/30 dark:border-amber-500/20`

Danger / Rose:
- `text-rose-700 dark:text-rose-300`
- `bg-rose-500/[0.06] dark:bg-rose-500/[0.02]`
- `border-rose-500/30 dark:border-rose-500/10`
- Delete buttons: `bg-rose-500 text-white hover:bg-rose-500/90`

## Shared Primitive Locations

- Topbar: `src/components/layout/topbar.tsx` — every page must use `<Topbar title subtitle actions />`
- IconTile + colorFor: `src/components/icon/index.tsx`
- api-states: `src/components/shared/api-states.tsx` (ApiLoadingState, ApiErrorState, VaultGridSkeleton, ListSkeleton)
- Settings primitives: `src/components/settings/primitives.tsx` (SectionTitle, Card, Field, DangerCard, IntegrationRow, etc.)
- Share dialog: `src/components/vault/share-dialog.tsx`
- BulkActionsBar: `src/components/vault/bulk-actions.tsx`

## BootSplash Pattern

Hardcoded hex gradient used in multiple files for the auth splash — intentional branding, same value each time:
`bg-gradient-to-br from-[#7c66ff] to-[#c084fc]`
Files: audit/page.tsx:713, trash/page.tsx:578, settings/page.tsx:1505

## from-white/[0.xx] Pattern

`bg-gradient-to-br from-white/[0.08] to-white/[0.02]` — used on avatar fallback circles in dashboard and audit. Light-only issue; will be invisible in light mode — needs dark: flip or `surface-*` token.
