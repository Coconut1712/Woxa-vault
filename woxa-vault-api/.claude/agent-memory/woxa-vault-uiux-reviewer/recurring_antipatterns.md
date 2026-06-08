---
name: recurring-antipatterns
description: UI anti-patterns this codebase tends to introduce — grep these first on every review
metadata:
  type: feedback
---

## Anti-patterns to grep first

1. **Missing dark: on light-only Tailwind classes**
   `grep -rn "bg-green-[0-9]\+\|bg-orange-[0-9]\+\|text-blue-600[^$]" --include="*.tsx" | grep -v "dark:"`
   Known violations: sends/page.tsx StatusBadge (green-50, orange-50 without dark:), sends/new/page.tsx success icon (bg-green-100 text-green-600).

2. **Hardcoded "Network error" message string** (not translated)
   `grep -rn '"Network error"' --include="*.tsx"`
   Widespread — every ApiError fallback uses hardcoded English. These are ApiError messages passed to the api-states component as `error.message`, so they're displayed to users.

3. **window.confirm() instead of Dialog**
   `grep -rn "window\.confirm" --include="*.tsx"`
   vault/[id]/page.tsx:310 (quick delete), attachments-section.tsx:241

4. **Hardcoded placeholder strings**
   `grep -rn 'placeholder="[A-Z]' --include="*.tsx"` (capital letter = untranslated English)
   new-item-dialog.tsx:457 (Stripe Live), 535 (MM/YY); members/page.tsx:969 (name@example.com)

5. **Hardcoded "Items" column header**
   `grep -rn "} Items\b" --include="*.tsx"`
   vault/[id]/page.tsx:829 — use `tr("vault.items_count", { n: filtered.length })` instead

6. **t("common.status") used as status VALUE instead of column LABEL**
   members/page.tsx:620 — inactive member displays "Status"/"สถานะ" instead of a real inactive label

7. **from-white/[0.0x] gradients** (invisible in light mode)
   `grep -rn "from-white/\[0\." --include="*.tsx"`
   dashboard activity avatar (page.tsx:422), audit actor avatar (audit/page.tsx:613)

8. **Bare `<input>` with outline-none missing focus ring**
   `grep -rn "outline-none placeholder" --include="*.tsx"` — in share-dialog, bulk-share-dialog, invite-dialog combobox search inputs

**Why:** These patterns get re-introduced with new features because developers copy old patterns. The "Network error" and placeholder issues are the most common.

**How to apply:** Run grep sweeps above before deep-reading any new page.
