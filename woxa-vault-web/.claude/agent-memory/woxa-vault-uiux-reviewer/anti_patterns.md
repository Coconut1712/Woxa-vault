---
name: anti-patterns
description: Recurring UI anti-patterns found in this codebase — grep for these first in any review
metadata:
  type: feedback
---

## Patterns to Grep For First

1. **Custom `<button>` without focus ring** — `className="...(no focus-visible:ring)..."` on bare `<button>` or `<PopoverTrigger className="...">`. The built-in focus ring from `<Button>` is not inherited. Check with: `grep -n 'className=.*h-7\|className=.*h-8\|className=.*h-9' page.tsx` and verify `focus-visible:ring` is present.

2. **`audit.empty_title` key misuse** — used in two semantically different places in audit/page.tsx (actor list empty + table empty). Watch for semantic key reuse across different contexts.

3. **Input height inconsistency** — members uses `h-9 bg-card/40 border-line-1`, audit uses `h-9` (no bg/border override). Prefer members convention for bg-card/40 to visually distinguish search from table bg.

4. **`bg-background` in BootSplash** — safe for full-page overlays, auto-adapts light/dark.

5. **`text-white` on gradient brand bg** — acceptable since brand-foreground = #ffffff. Only flag `text-white` on non-brand backgrounds.

6. **Hardcoded `from-[#7c66ff] to-[#c084fc]`** — intentional brand gradient in BootSplash. Do NOT flag as token drift; the design system doesn't have a gradient token yet.

7. **`accent-brand` on native checkbox** — valid in Tailwind v4 since `--color-brand` is registered in `@theme inline`. But native checkbox styling is platform-dependent and may not respect `accent-color` on all OS themes. Prefer a custom checkbox component for full control.

**Why:** These were observed in the first full audit review (2026-06-05).
**How to apply:** Start every review session by grepping for these patterns before doing a line-by-line read.
