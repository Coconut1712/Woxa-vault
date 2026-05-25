---
name: ui-honesty-no-fake-enforced
description: Never render a live/Enforced control for a security feature the backend doesn't actually enforce — use the inert Preview pattern instead
metadata:
  type: feedback
---

A security control's UI must not imply enforcement the backend doesn't deliver. No green "Enforced"-style badge, no success toast ("X is now required"), no working toggle/PATCH for a feature that isn't actually enforced server-side. Demote such controls to the inert **Preview** pattern: disabled control + "Preview" badge, honest "pending/coming soon" copy, no PATCH.

**Why:** In a password manager, showing "Enforced" on an unenforced control is a false-sense-of-security finding (audited as HIGH). See [[sso-enforcement-phase-a]] for the incident.

**How to apply:** Before wiring any security toggle as live, confirm the backend genuinely enforces it. If enforcement is blocked/unbuilt, mirror the existing Preview pattern in `src/app/app/settings/page.tsx` (`PreviewPolicyRow` for toggle rows; for richer controls, render the server value read-only inside an `opacity-60` region with a `common.preview` badge). Also remove now-dead toast keys you orphan, but leave pre-existing dead keys alone unless they're in scope.
