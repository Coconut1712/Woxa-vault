---
name: workspace-settings-full-wiring
description: Workspace Settings page wired to GET/PATCH /workspace/settings; only require2fa + autoLockMinutes are LIVE — requireSso/jitEnabled/allowedDomains demoted to inert Preview (security-audit honesty fix); rest of page is honest static "Preview"
metadata:
  type: project
---

`/workspace/settings` now models the FULL policy, not just require2fa.

**Why:** Backend round for workspace security + SSO enforcement shipped green; the
settings page was lagging with local-`useState`/mock toggles that didn't persist.
Owner directive: the page must not lie about what saves.

**Backend contract (read from handler, not the markdown which was stale):**
- GET `/workspace/settings` → readable by ANY member, resolves org from caller
  (no IDOR), 404 `not_found` if no membership. Returns fully-defaulted policy.
- PATCH → owner+admin only (403 `forbidden`), PARTIAL body (`sso` deep-merged so
  you can send one sub-field), returns full policy to re-sync. Rate-limited
  20/hr/user (429 + Retry-After). No-op write = 200 no audit row.
- Shape: `{ require2fa, autoLockMinutes (int, clamp [1,120], default 15, NO
  "never"), sso: { allowedDomains: string[] (max 100; server lowercases/trims/
  dedupes/validates and SILENTLY DROPS invalid), jitEnabled, requireSso } }`.
- Defaults const'd in api client: `AUTO_LOCK_MIN/MAX/DEFAULT` = 1/120/15.

**How to apply / where the pieces live:**
- API client `src/lib/api/workspace-settings.ts`: full `WorkspaceSettings` +
  `WorkspaceSettingsPatch` (partial) + `coerceSettings()` defensive coercion
  (clamps minutes, filters non-string domains, `=== true` for bools). PATCH
  returns the re-synced full policy — never need a second GET.
- Page `src/app/app/settings/page.tsx`: shared hook `useWorkspaceSettingsController()`
  does ONE GET (AbortController, `settings: WorkspaceSettings | null`) and a
  generic `patch(body, optimistic, onSuccess?)` that copies the require2fa
  gold-standard: optimistic merge → re-sync from response → revert + 403/429/
  generic toast on fail. Both SecurityPolicySection and SsoSection instantiate
  their own copy (only one tab mounts at a time).
- Shared row components in the page: `LivePolicyRow` (null=loading, loadFailed
  hint, read-only badge+hint for non-admin, Enforced badge when on) and
  `PreviewPolicyRow` (inert disabled switch + "Preview" badge, opacity-60).
- **2 LIVE controls (as of the 2026-05-22 audit fix):** require2fa (Authentication
  card, the only one rendering the green `common.enforced` badge) + autoLockMinutes
  (Sessions card Select, options 1/5/15/30/60/90/120 — "never" removed since backend
  can't represent it; reuses `secpol.minutes`/`secpol.hours` parameterized keys for
  90/120). NOTE: sso.requireSso and sso.jitEnabled USED to be live LivePolicyRows
  but were demoted to PreviewPolicyRow — see [[sso-enforcement-phase-a]] and
  [[ui-honesty-no-fake-enforced]]. Do NOT re-wire them live until AC-006.2 ships.
- **allowedDomains is now READ-ONLY Preview** (`src/components/vault/allowed-domains.tsx`):
  props are just `domains|null`, `loading`, `loadFailed`. It renders the server's
  flat string list read-only inside an `opacity-60` region with a `common.preview`
  badge and issues NO add/remove writes (no PATCH). (It was briefly a fully-controlled
  add/remove list, but that implied enforcement that doesn't exist — AC-006.2 /
  org_domains table not built — so it was demoted in the same audit fix.) Mock
  `AllowedDomain`/`allowedDomains` exports still exist in mock/sso.ts only because
  `members/invite-dialog.tsx` imports them.
- **Static "Preview" (NO backend, don't fake persistence):** requirePasskeyAdmin,
  sessionMaxHours, sso.autoDeprovision → PreviewPolicyRow / disabled. The entire
  mock SSO block (connected provider card + sync/test/disconnect, group mappings,
  default JIT role, initial vault, add-provider, recent SSO events, disconnect
  DangerCard) is wrapped in one `opacity-70 pointer-events-none` region behind a
  dashed "design preview" banner (`sso.preview_section_note`). IP allowlist +
  compliance keep their existing static enterprise-plan badge markers.

**i18n keys (EN+TH):** `common.preview`, `secpol.auto_lock.toast_saved`,
`sso.preview_section_note`, `domains.load_error` (live-control keys). Audit fix
added honest-copy keys: `secpol.require_sso_preview_desc`, `sso.jit_preview_desc`,
`sso.domain_enforcement_pending`, `domains.preview_desc`, `domains.empty_preview`,
and REMOVED now-dead keys: `secpol.require_sso.toast_enabled/disabled`,
`sso.jit.toast_enabled/disabled`, `secpol.require_sso_desc`, `sso.jit_desc`,
`sso.domain_enforcement_prefix/suffix`, `domains.desc`, `domains.empty`,
`domains.toast.added/added_desc/removed/invalid/duplicate`. Error toasts (still
used by require2fa/autoLock) reuse `secpol.require_2fa.error_*`.

**Gotcha:** ESLint rule `react-hooks/set-state-in-effect` is an ERROR here —
do NOT call `setState` synchronously in an effect body (the old require2fa code's
`setLoadFailed(false)` reset would now fail lint). State already inits correctly
and the load effect runs once, so the reset is unnecessary; setState inside the
async promise callback is fine.

Related: [[require-2fa-policy]], [[role-permission-helper]]
