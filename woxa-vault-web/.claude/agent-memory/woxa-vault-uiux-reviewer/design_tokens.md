---
name: design-tokens
description: Canonical design tokens — surface/line/brand colors, radius scale, typography; where they are defined and their light/dark values
metadata:
  type: project
---

## Token File
`src/app/globals.css` — `@theme inline` block (lines 7-59) maps CSS vars to Tailwind utilities.

## Surface + Line Tokens (auto light/dark)
| Token | Light | Dark |
|---|---|---|
| `surface-1` | rgba(15,15,18,0.03) | rgba(255,255,255,0.02) |
| `surface-2` | rgba(15,15,18,0.05) | rgba(255,255,255,0.04) |
| `surface-3` | rgba(15,15,18,0.08) | rgba(255,255,255,0.06) |
| `line-1` | rgba(15,15,18,0.06) | rgba(255,255,255,0.06) |
| `line-2` | rgba(15,15,18,0.10) | rgba(255,255,255,0.10) |
| `line-3` | rgba(15,15,18,0.16) | rgba(255,255,255,0.16) |

## Brand Token
- Light: `--brand: #6d5cf2` · Dark: `--brand: #7c66ff`
- `--brand-foreground: #ffffff` (both themes — safe to use `text-white` on brand bg)
- Tailwind: `bg-brand`, `text-brand`, `border-brand`, `bg-brand/10`, etc.
- `accent-brand` is valid in Tailwind v4 (maps to CSS `accent-color`, `--color-brand` registered)

## Radius Scale (base = 10px)
- `rounded-sm` = 6px · `rounded-md` = 8px · `rounded-lg` = 10px
- `rounded-xl` = 14px · `rounded-2xl` = 18px · `rounded-3xl` = 22px
- Design rule: cards = 8px (`rounded-md`), buttons = 6px (`rounded-sm`), badges = 4px (hardcoded in scrollbar CSS at line 251)
- NOTE: Button component uses `rounded-lg` by default (min(var(--radius-md),12px)); shadcn base-ui variant

## Typography
- Body: `font-sans` (Inter/Geist Sans)
- Monospace sensitive data: `font-mono-secret` — defined in `@layer utilities` (globals.css:284) — uses Geist Mono, NOT JetBrains Mono (design doc says JetBrains but actual impl uses Geist Mono)
- Table headers: `text-[10px] uppercase tracking-wider` pattern is established convention

## Hardcoded Colors That ARE Acceptable
- `from-[#7c66ff] to-[#c084fc]` in BootSplash gradient icon — intentional brand accent, not a token drift
- `text-white` on `bg-brand` / gradient brand backgrounds — correct (brand-foreground = #ffffff)
- Semantic status pairs: `text-emerald-600 dark:text-emerald-400`, `text-rose-600 dark:text-rose-400` — established pattern in codebase

## Popover Background
- `bg-popover` (from `PopoverContent` default): light = #ffffff, dark = #18181b — correct, auto-adapts
