import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, orgMembers, users } from "@/db/schema";

// ---------------------------------------------------------------------------
// Workspace security policy — stored in `organizations.settings` (jsonb).
//
// The settings column already exists (schema.ts:39, default `{}`); this module
// is the single owner of its shape. We only formalize `require2fa` for now but
// keep the object OPEN (`.passthrough()`) so future policy keys
// (rotation_defaults — DESIGN.md §12.2, ip_allowlist, …) coexist without a
// schema migration. The merge helper writes ONE key without clobbering the
// rest (defense against a PATCH stomping unrelated policy).
//
// Threat model (read/parse path):
//   * Asset: the `require2fa` flag — a security control whose *false* default
//     must be fail-safe. A malformed/legacy/partial `settings` blob must never
//     accidentally read as `require2fa: true` AND must never throw and take
//     down /me or the enforcement guard.
//   * Adversary: none directly writes settings except owner/admin via the
//     guarded PATCH; the risk is data drift (older rows, future keys).
//   * Mitigation: `readOrgPolicy` is total — any parse failure degrades to the
//     safe default `{ require2fa: false }` rather than throwing. The flag is
//     only ever set to `true` through the validated PATCH path.
// ---------------------------------------------------------------------------

// Vault auto-lock idle window (minutes) bounds. The client reads
// `autoLockMinutes` from GET /workspace/settings to drive its idle overlay
// timer; the value is also a candidate for the server-side unlock window (see
// middleware/auth.ts notes). Clamp to a sane band so a bad value can neither
// disable locking (0/∞) nor make the app unusable (sub-minute flapping).
export const AUTO_LOCK_MIN = 1;
export const AUTO_LOCK_MAX = 120;
export const AUTO_LOCK_DEFAULT = 15;

// Clamp + round a candidate auto-lock value into [AUTO_LOCK_MIN, AUTO_LOCK_MAX].
// Non-finite / non-number input degrades to the default rather than throwing —
// keeping readOrgPolicy total (see threat model above).
export function clampAutoLockMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return AUTO_LOCK_DEFAULT;
  const rounded = Math.round(value);
  if (rounded < AUTO_LOCK_MIN) return AUTO_LOCK_MIN;
  if (rounded > AUTO_LOCK_MAX) return AUTO_LOCK_MAX;
  return rounded;
}

// Basic domain shape: at least one dot-separated label group, no scheme/path,
// no leading/trailing dot or hyphen per label. Intentionally permissive (we are
// matching against Google `hd`/email domains, not registering DNS) but tight
// enough to reject "", "@", "http://x", spaces.
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// Normalize an SSO allow-list: lowercase, trim, strip empties, validate shape,
// dedupe. Total — anything not array-shaped yields []. Order is preserved
// (first occurrence wins) so the UI shows a stable list.
export function normalizeAllowedDomains(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const d = raw.trim().toLowerCase();
    if (!d || !DOMAIN_RE.test(d) || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

// SSO sub-policy as exposed by the contract. allowedDomains is a verified-shape,
// deduped, lowercased list; the booleans gate JIT provisioning + (future) SSO-
// only login enforcement.
export interface OrgSsoPolicy {
  allowedDomains: string[];
  jitEnabled: boolean;
  requireSso: boolean;
}

// Validate ONLY the keys we own; allow unknown keys through so we never drop
// policy this module doesn't know about yet. The `sso` object is itself a
// passthrough so a partial PATCH (e.g. only jitEnabled) doesn't have to restate
// the whole block.
export const orgSettingsSchema = z
  .object({
    require2fa: z.boolean().optional(),
    autoLockMinutes: z.number().optional(),
    sso: z
      .object({
        allowedDomains: z.array(z.string()).optional(),
        jitEnabled: z.boolean().optional(),
        requireSso: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

// Narrowed, fully-defaulted view used by the enforcement guards and the
// settings GET endpoint. Only the policy fields the API contract exposes.
export interface OrgSecurityPolicy {
  require2fa: boolean;
  autoLockMinutes: number;
  sso: OrgSsoPolicy;
}

const SAFE_DEFAULT: OrgSecurityPolicy = {
  require2fa: false,
  autoLockMinutes: AUTO_LOCK_DEFAULT,
  sso: { allowedDomains: [], jitEnabled: true, requireSso: false },
};

function safeDefaultCopy(): OrgSecurityPolicy {
  return {
    require2fa: false,
    autoLockMinutes: AUTO_LOCK_DEFAULT,
    sso: { allowedDomains: [], jitEnabled: true, requireSso: false },
  };
}

// Total parse: never throws. A null / non-object / malformed blob → safe
// default. Each field is read defensively so legacy drift in one key cannot
// taint the others:
//   * require2fa: only `true` reads true (fail-safe).
//   * autoLockMinutes: clamped; bad/missing → default.
//   * sso.jitEnabled: DEFAULTS TRUE (preserve current JIT behavior); only an
//     explicit `false` disables auto-provisioning.
//   * sso.requireSso: defaults false (fail-open for login; enabling it is opt-in).
//   * sso.allowedDomains: normalized list (empty = no domain restriction).
export function readOrgPolicy(settings: unknown): OrgSecurityPolicy {
  const parsed = orgSettingsSchema.safeParse(settings ?? {});
  if (!parsed.success) return safeDefaultCopy();
  const d = parsed.data;
  const ssoRaw = (d.sso ?? {}) as Record<string, unknown>;
  return {
    require2fa: d.require2fa === true,
    autoLockMinutes: clampAutoLockMinutes(d.autoLockMinutes),
    sso: {
      allowedDomains: normalizeAllowedDomains(ssoRaw.allowedDomains),
      // Missing / non-boolean → true (current behavior). Only explicit false off.
      jitEnabled: ssoRaw.jitEnabled === false ? false : true,
      requireSso: ssoRaw.requireSso === true,
    },
  };
}

// Deep-merge a policy patch into the existing settings blob WITHOUT dropping
// keys this module doesn't model. The `sso` sub-object is merged field-by-field
// so a partial PATCH (e.g. only `sso.jitEnabled`) preserves the other sso keys
// (allowedDomains / requireSso). Returns the new object to persist as-is.
export function mergeOrgSettings(
  existing: unknown,
  patch: Partial<OrgSettings>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  const { sso: patchSso, ...topPatch } = patch;
  const merged: Record<string, unknown> = { ...base, ...topPatch };

  if (patchSso !== undefined) {
    const existingSso =
      base.sso && typeof base.sso === "object" && !Array.isArray(base.sso)
        ? (base.sso as Record<string, unknown>)
        : {};
    merged.sso = { ...existingSso, ...patchSso };
  }

  return merged;
}

// ---------------------------------------------------------------------------
// requiresTwoFactorEnroll — the account-level signal driving both the /me
// payload and the server-side enforcement guard.
//
// Logic (account-level, NOT per-workspace):
//   true  iff  the user has NOT enrolled TOTP (totp_enabled_at IS NULL)
//             AND at least ONE org they are a member of has require2fa = true.
//
// Why "any membership org": 2FA is an ACCOUNT credential — a single TOTP
// enrollment satisfies the policy of every workspace the user belongs to. So
// the moment the user enrolls, the signal flips false everywhere. Conversely a
// user with no enrollment who joins even one require2fa workspace is gated. An
// admin who flips the policy on while THEY lack 2FA is gated too (consistent —
// no special-casing the policy-setter).
//
// `totpEnabledAt` (verified enrollment), not `totpSecretEncrypted` (started
// but unverified), is the gate: a half-finished enrollment must NOT unlock
// secrets.
// ---------------------------------------------------------------------------
export async function userRequiresTwoFactorEnroll(userId: string): Promise<boolean> {
  const row = await db.query.users.findFirst({
    columns: { totpEnabledAt: true },
    where: eq(users.id, userId),
  });
  // No user row (shouldn't happen behind requireAuth) → don't gate.
  if (!row) return false;
  // Already has verified 2FA → never gated.
  if (row.totpEnabledAt !== null) return false;

  return await anyMembershipRequiresTwoFactor(userId);
}

// True iff at least one org the user belongs to has require2fa enabled. Reads
// only the orgs the caller is actually a member of (no client input) so there
// is no cross-tenant leakage.
export async function anyMembershipRequiresTwoFactor(userId: string): Promise<boolean> {
  const memberships = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId));
  if (memberships.length === 0) return false;

  const orgIds = memberships.map((m) => m.orgId);
  const orgRows = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(inArray(organizations.id, orgIds));

  return orgRows.some((o) => readOrgPolicy(o.settings).require2fa);
}

// ---------------------------------------------------------------------------
// SSO domain / JIT enforcement (Phase 1).
//
// The SSO callback runs BEFORE a brand-new user has any org membership
// (Single-Owner onboarding: a new SSO user always lands org-less — see
// routes/sso.ts). So there is no single "the org" to read `sso.allowedDomains`
// from at callback time. We therefore enforce the STORED policy across the set
// of LIVE (non-deleted) orgs, keyed by the email domain:
//
//   * Domain allow-list: if ANY live org has a NON-EMPTY allowedDomains list,
//     the signing-in email domain MUST appear in at least one such list. An org
//     with an empty allowedDomains imposes no restriction (dev / open mode).
//     Rationale: an admin who pins allowedDomains is asserting "only these
//     domains may SSO into a Woxa workspace"; an attacker from an unlisted
//     domain is rejected even if no org has claimed their domain yet.
//
//   * JIT provisioning: a brand-new user (no membership) is auto-provisioned
//     only if JIT is enabled for the org(s) that claim their domain. If EVERY
//     org whose allowedDomains contains the email domain has jitEnabled=false,
//     reject the new-user provisioning (admin must invite first). When no org
//     claims the domain, JIT falls back to the global default (enabled) — there
//     is no domain→org binding to consult, matching pre-Phase-1 behavior.
//
// Both queries read ONLY org policy (no per-caller input beyond the verified
// email domain), so there is no cross-tenant data leak: the SSO subject learns
// nothing about which orgs exist (a rejection is a generic redirect error).
// ---------------------------------------------------------------------------

// Load every live org's normalized SSO policy alongside its id. Used by the
// domain + JIT gates below. Excludes soft-deleted orgs (deletedAt IS NOT NULL).
async function liveOrgSsoPolicies(): Promise<{ orgId: string; sso: OrgSsoPolicy }[]> {
  const rows = await db
    .select({ id: organizations.id, settings: organizations.settings })
    .from(organizations)
    .where(isNull(organizations.deletedAt));
  return rows.map((r) => ({ orgId: r.id, sso: readOrgPolicy(r.settings).sso }));
}

// True iff the email domain is permitted to SSO. Permitted when NO live org
// pins a non-empty allowedDomains list (open mode), OR the domain appears in at
// least one such list. `emailDomain` must already be lowercased + trimmed.
export async function ssoDomainAllowed(emailDomain: string): Promise<boolean> {
  if (!emailDomain) return false;
  const policies = await liveOrgSsoPolicies();
  const restricting = policies.filter((p) => p.sso.allowedDomains.length > 0);
  if (restricting.length === 0) return true; // no org restricts → open
  return restricting.some((p) => p.sso.allowedDomains.includes(emailDomain));
}

// True iff a brand-new (membership-less) SSO user from `emailDomain` may be
// JIT-provisioned. If one or more orgs CLAIM the domain (allowedDomains
// contains it), JIT is allowed only if at least one of those claiming orgs has
// jitEnabled=true. If NO org claims the domain, fall back to true (no binding
// to gate against — preserves prior behavior). `emailDomain` must be normalized.
export async function ssoJitAllowed(emailDomain: string): Promise<boolean> {
  if (!emailDomain) return false;
  const policies = await liveOrgSsoPolicies();
  const claiming = policies.filter((p) => p.sso.allowedDomains.includes(emailDomain));
  if (claiming.length === 0) return true; // no domain→org binding → default on
  return claiming.some((p) => p.sso.jitEnabled);
}
