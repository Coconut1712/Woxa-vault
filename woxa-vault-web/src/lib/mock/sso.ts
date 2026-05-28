import type { ColorKey } from "@/lib/types";

export type SsoProviderId = "google" | "microsoft" | "okta";

export interface SsoProvider {
  id: SsoProviderId;
  name: string;
  status: "connected" | "available";
  domain?: string;
  syncedAt?: string;
  memberCount?: number;
  color: ColorKey;
}

export const ssoProviders: SsoProvider[] = [
  {
    id: "google",
    name: "Google Workspace",
    status: "connected",
    domain: "iux24.com",
    syncedAt: "2026-05-13T13:55:00Z",
    memberCount: 12,
    color: "blue",
  },
  {
    id: "microsoft",
    name: "Microsoft Entra ID",
    status: "available",
    color: "cyan",
  },
  {
    id: "okta",
    name: "Okta",
    status: "available",
    color: "indigo",
  },
];

export interface GroupMapping {
  id: string;
  groupName: string;
  groupId: string;
  teamName: string;
  teamId: string;
  memberCount: number;
  autoSync: boolean;
  lastSyncedAt: string;
}

export const groupMappings: GroupMapping[] = [
  {
    id: "gm_1",
    groupName: "devops@iux24.com",
    groupId: "groups/12345",
    teamName: "DevOps",
    teamId: "t_devops",
    memberCount: 5,
    autoSync: true,
    lastSyncedAt: "2026-05-13T13:55:00Z",
  },
  {
    id: "gm_2",
    groupName: "marketing@iux24.com",
    groupId: "groups/67890",
    teamName: "Marketing",
    teamId: "t_marketing",
    memberCount: 4,
    autoSync: true,
    lastSyncedAt: "2026-05-13T13:55:00Z",
  },
  {
    id: "gm_3",
    groupName: "finance@iux24.com",
    groupId: "groups/24680",
    teamName: "Finance",
    teamId: "t_finance",
    memberCount: 3,
    autoSync: true,
    lastSyncedAt: "2026-05-13T13:55:00Z",
  },
  {
    id: "gm_4",
    groupName: "design@iux24.com",
    groupId: "groups/13579",
    teamName: "Design",
    teamId: "t_design",
    memberCount: 3,
    autoSync: false,
    lastSyncedAt: "2026-05-12T10:00:00Z",
  },
  {
    id: "gm_5",
    groupName: "leadership@iux24.com",
    groupId: "groups/99999",
    teamName: "Leadership",
    teamId: "t_leadership",
    memberCount: 4,
    autoSync: true,
    lastSyncedAt: "2026-05-13T13:55:00Z",
  },
];

export type DomainStatus = "verified" | "pending" | "failed";

export interface AllowedDomain {
  id: string;
  domain: string;
  status: DomainStatus;
  primary: boolean;
  /** how it's linked, eg "Google Workspace" */
  linkedTo?: string;
  verifiedAt?: string;
  userCount?: number;
  /** for pending domains, the TXT record value the user must add */
  txtRecord?: string;
  addedAt: string;
}

export const allowedDomains: AllowedDomain[] = [
  {
    id: "d_1",
    domain: "iux24.com",
    status: "verified",
    primary: true,
    linkedTo: "Google Workspace",
    verifiedAt: "2026-01-10T08:00:00Z",
    userCount: 12,
    addedAt: "2026-01-10T08:00:00Z",
  },
  {
    id: "d_2",
    domain: "iux24.co.th",
    status: "verified",
    primary: false,
    verifiedAt: "2025-12-15T10:00:00Z",
    userCount: 4,
    addedAt: "2025-12-15T08:00:00Z",
  },
  {
    id: "d_3",
    domain: "iux24-partner.com",
    status: "pending",
    primary: false,
    txtRecord: "woxa-verify=k8n3p2q9z7m4x1v6b8c5d2f7",
    addedAt: "2026-05-13T11:00:00Z",
  },
];

export interface SsoEvent {
  id: string;
  timestamp: string;
  type:
    | "login.success"
    | "login.blocked"
    | "jit.provisioned"
    | "group.synced"
    | "group.removed"
    | "domain.rejected";
  email: string;
  detail: string;
  ip?: string;
}

export const ssoEvents: SsoEvent[] = [
  {
    id: "se_1",
    timestamp: "2026-05-13T13:55:00Z",
    type: "group.synced",
    email: "system",
    detail: "Synced 5 groups · 19 members reconciled",
  },
  {
    id: "se_2",
    timestamp: "2026-05-13T08:00:00Z",
    type: "login.success",
    email: "mali@iux24.com",
    detail: "Signed in via Google Workspace",
    ip: "171.96.x.x",
  },
  {
    id: "se_3",
    timestamp: "2026-05-12T18:30:00Z",
    type: "jit.provisioned",
    email: "newbie@iux24.com",
    detail: "JIT-created from Google SSO · assigned to Member role",
  },
  {
    id: "se_4",
    timestamp: "2026-05-12T14:22:00Z",
    type: "login.blocked",
    email: "external@gmail.com",
    detail: "Domain @gmail.com not in allowlist · rejected",
    ip: "49.228.x.x",
  },
  {
    id: "se_5",
    timestamp: "2026-05-12T10:00:00Z",
    type: "group.removed",
    email: "ex-employee@iux24.com",
    detail: "Removed from devops@iux24.com · revoked DevOps team access",
  },
  {
    id: "se_6",
    timestamp: "2026-05-11T09:30:00Z",
    type: "domain.rejected",
    email: "vendor@partner.com",
    detail: "External email blocked at OAuth step · use guest invite flow",
    ip: "203.150.x.x",
  },
];

/**
 * Workspace discovered from an email domain, surfaced on /welcome.
 *
 * `initial` is the avatar letter; `memberCount` is shown in the result card.
 */
export interface DiscoveredWorkspace {
  id: string;
  name: string;
  domain: string;
  initial: string;
  memberCount: number;
  color: ColorKey;
  status: "active";
}

/**
 * MOCK domain → workspace map for the /welcome discovery card.
 *
 * TODO(api): replace with `GET /workspaces/discover?domain=<domain>` once the
 * backend lands it. The real endpoint MUST be rate-limited and constant-time —
 * domain discovery is an enumeration surface (an attacker can probe which
 * companies use Woxa). Do NOT leak member counts beyond what the org has opted
 * into exposing; gate behind a coarse "exists / does not exist" if needed.
 */
const MOCK_WORKSPACES: Record<string, DiscoveredWorkspace> = {
  "iux24.com": {
    id: "ws_iux24",
    name: "iux24 Workspace",
    domain: "iux24.com",
    initial: "i",
    memberCount: 24,
    color: "blue",
    status: "active",
  },
};

/**
 * Extract a normalized lowercase domain from a user-typed email. Returns null
 * when the value isn't a plausible `local@domain.tld` shape.
 */
export function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain.includes(".")) return null;
  return domain;
}

/**
 * MOCK lookup. Async to mirror the eventual network call so callers don't have
 * to change shape when the real endpoint is wired in. Never throws.
 */
export async function discoverWorkspace(
  email: string,
): Promise<DiscoveredWorkspace | null> {
  const domain = domainFromEmail(email);
  if (!domain) return null;
  // Simulate a small network round-trip.
  await new Promise((resolve) => setTimeout(resolve, 350));
  return MOCK_WORKSPACES[domain] ?? null;
}
