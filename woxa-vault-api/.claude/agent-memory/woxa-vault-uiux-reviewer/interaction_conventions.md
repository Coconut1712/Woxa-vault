---
name: interaction-conventions
description: Approved interaction patterns for Woxa Vault frontend (3-dot menu, Base-UI, focus rings, BootSplash)
metadata:
  type: reference
---

## 3-dot Dropdown Pattern

Single DropdownMenu per row/card. DropdownMenuTrigger wraps a `<button>` with aria-label.
DropdownMenuGroup holds all actions. Destructive items use `variant="destructive"` on DropdownMenuItem.
Reference: [[feedback_ui_three_dot_menu.md]] (user memory).

## Base-UI DropdownMenuItem

Uses `onClick` (NOT `onSelect` — Base UI, not Radix). cmdk CommandItem uses `onSelect`.
Reference: [[reference_baseui_dropdown_onclick.md]].

## Focus Ring

UI primitives (button, input, select, checkbox, switch) use `focus-visible:ring-3 focus-visible:ring-ring/50`.
Bare `<button>` elements in JSX should add `focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none`.
Inline text-input inside comboboxes (share-dialog, bulk-share-dialog, members invite-dialog) use `outline-none` without replacement — WCAG gap.

## Destructive Actions

Must go through Dialog confirm, not `window.confirm()`. Current violations:
- `vault/[id]/page.tsx:310` — `window.confirm` for quick delete

## BootSplash

Shared boot/auth-checking splash used in audit, trash, settings. Has hardcoded hex gradient `from-[#7c66ff] to-[#c084fc]` — intentional branding, not a token gap.
