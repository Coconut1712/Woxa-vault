---
name: shared-primitives
description: Locations, sizing conventions, and focus-ring behavior of shared UI primitives — Button, Input, Popover, FilterPill, Topbar, ActiveChip
metadata:
  type: project
---

## Topbar
`src/components/layout/topbar.tsx` — `h-14` sticky header, `actions` slot renders in `flex items-center gap-1` div. All action buttons should be `size="sm"` (h-7) or a custom h-7 trigger to stay visually aligned.

## Button
`src/components/ui/button.tsx`
- default: `h-8`
- sm: `h-7`
- lg: `h-9`
- Focus ring built-in: `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`
- ALWAYS use `<Button>` wrapper when possible — custom `<button>` or `<PopoverTrigger className="...">` loses the built-in focus ring

## Input
`src/components/ui/input.tsx` — default `h-8`, focus ring built-in. Pages commonly override to `h-9` for search fields (both members and audit do this — established pattern). Members adds `bg-card/40 border-line-1`; audit omits those (minor inconsistency).

## Popover
`src/components/ui/popover.tsx` — Base UI `@base-ui/react/popover`. `PopoverTrigger` renders a native `<button>` (confirmed from d.ts). Does NOT inherit Button focus ring — must add `focus-visible:ring-*` manually or wrap content with `<Button asChild>`.

## FilterPill (members page pattern)
`src/app/app/members/page.tsx:1212` — tab-style filter: `px-3 h-7 rounded-md text-xs font-medium`, active = `bg-surface-3 text-foreground`, inactive = `text-muted-foreground`. Wrapped in `flex gap-1 p-1 bg-card/40 border border-line-1 rounded-lg` container.

## ActiveChip (audit page pattern)
`src/app/app/audit/page.tsx:686` — active filter chip: `h-7 px-2 rounded-md text-xs border border-brand/30 bg-brand/10`, click = clears that filter. This pattern is local to audit page — not a shared component yet.

## Control Height Consistency Rule
- Topbar action area: h-7 (Button size="sm" or custom triggers)
- In-page filter row: h-9 for search Input, h-7 for chips/pills — creates visual tension; needs decision
- SelectTrigger inside Popover: h-9 (audit, requests pages) — established

## Select
`src/components/ui/select.tsx` — shadcn base-ui. `SelectTrigger className="h-9"` is the established usage inside filter panels.
