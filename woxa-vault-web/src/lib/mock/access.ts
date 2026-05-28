import type { ColorKey } from "@/lib/types";

export type PrincipalType = "user" | "team" | "domain" | "external";
export type AccessRole = "manager" | "editor" | "user" | "viewer";
export type AccessSource = "direct" | "inherited" | "team";

export interface Team {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  color: ColorKey;
}

export const teams: Team[] = [
  {
    id: "t_devops",
    name: "DevOps",
    description: "Infrastructure & deployment team",
    memberCount: 5,
    color: "blue",
  },
  {
    id: "t_marketing",
    name: "Marketing",
    description: "Growth + content team",
    memberCount: 4,
    color: "fuchsia",
  },
  {
    id: "t_finance",
    name: "Finance",
    description: "Billing, payroll, vendor management",
    memberCount: 3,
    color: "amber",
  },
  {
    id: "t_design",
    name: "Design",
    description: "Product & brand design",
    memberCount: 3,
    color: "emerald",
  },
  {
    id: "t_leadership",
    name: "Leadership",
    description: "Founders & department heads",
    memberCount: 4,
    color: "violet",
  },
];

export interface AccessGrant {
  id: string;
  principalType: PrincipalType;
  /** user_id / team_id / domain string / external email */
  principalId: string;
  /** display label */
  principalName: string;
  principalSubtitle?: string;
  principalColor?: ColorKey;
  role: AccessRole;
  source: AccessSource;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
}

export interface ResourceAccess {
  vaultId?: string;
  folderId?: string;
  itemId?: string;
  grants: AccessGrant[];
}

/** Mock access for the AWS Production Root item (and other items inherit from vault) */
export const itemAccess: Record<string, AccessGrant[]> = {
  i_aws_root: [
    {
      id: "ag_1",
      principalType: "user",
      principalId: "u_ching",
      principalName: "Ching Suriya",
      principalSubtitle: "ching@iux24.com",
      principalColor: "violet",
      role: "manager",
      source: "direct",
      grantedBy: "system",
      grantedAt: "2026-01-10T08:00:00Z",
    },
    {
      id: "ag_2",
      principalType: "team",
      principalId: "t_devops",
      principalName: "DevOps",
      principalSubtitle: "5 members",
      principalColor: "blue",
      role: "editor",
      source: "inherited",
      grantedBy: "Ching Suriya",
      grantedAt: "2026-01-15T08:00:00Z",
    },
    {
      id: "ag_3",
      principalType: "user",
      principalId: "u_somchai",
      principalName: "Somchai Dev",
      principalSubtitle: "somchai@iux24.com",
      principalColor: "blue",
      role: "editor",
      source: "team",
      grantedBy: "via DevOps team",
      grantedAt: "2026-01-15T08:00:00Z",
    },
    {
      id: "ag_4",
      principalType: "external",
      principalId: "vendor@partner.com",
      principalName: "vendor@partner.com",
      principalSubtitle: "External · expires in 5 days",
      principalColor: "rose",
      role: "viewer",
      source: "direct",
      grantedBy: "Ching Suriya",
      grantedAt: "2026-05-08T10:00:00Z",
      expiresAt: "2026-05-18T10:00:00Z",
    },
  ],
};

/** Vault-level access (inherits to all items unless overridden) */
export const vaultAccess: Record<string, AccessGrant[]> = {
  v_production: [
    {
      id: "vg_1",
      principalType: "user",
      principalId: "u_ching",
      principalName: "Ching Suriya",
      principalSubtitle: "ching@iux24.com",
      principalColor: "violet",
      role: "manager",
      source: "direct",
      grantedBy: "system",
      grantedAt: "2026-01-10T08:00:00Z",
    },
    {
      id: "vg_2",
      principalType: "team",
      principalId: "t_devops",
      principalName: "DevOps",
      principalSubtitle: "5 members",
      principalColor: "blue",
      role: "editor",
      source: "direct",
      grantedBy: "Ching Suriya",
      grantedAt: "2026-01-15T08:00:00Z",
    },
    {
      id: "vg_3",
      principalType: "domain",
      principalId: "iux24.com",
      principalName: "@iux24.com",
      principalSubtitle: "All workspace members",
      principalColor: "indigo",
      role: "viewer",
      source: "direct",
      grantedBy: "Ching Suriya",
      grantedAt: "2026-02-01T08:00:00Z",
    },
  ],
  v_shared: [
    {
      id: "sg_1",
      principalType: "domain",
      principalId: "iux24.com",
      principalName: "@iux24.com",
      principalSubtitle: "All workspace members",
      principalColor: "indigo",
      role: "user",
      source: "direct",
      grantedBy: "Ching Suriya",
      grantedAt: "2026-01-10T08:00:00Z",
    },
    {
      id: "sg_2",
      principalType: "team",
      principalId: "t_marketing",
      principalName: "Marketing",
      principalSubtitle: "4 members",
      principalColor: "fuchsia",
      role: "editor",
      source: "direct",
      grantedBy: "Ching Suriya",
      grantedAt: "2026-02-15T08:00:00Z",
    },
  ],
};

export const roleConfig: Record<
  AccessRole,
  {
    label: string;
    description: string;
    color: string;
    abilities: { view: boolean; use: boolean; edit: boolean; share: boolean; delete: boolean };
  }
> = {
  manager: {
    label: "Manager",
    description: "Full control — edit, share, and delete",
    color: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    abilities: { view: true, use: true, edit: true, share: true, delete: true },
  },
  editor: {
    label: "Editor",
    description: "Can view, use, edit, and share",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    abilities: { view: true, use: true, edit: true, share: true, delete: false },
  },
  user: {
    label: "User",
    description: "Can view and use (copy/decrypt) only",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    abilities: { view: true, use: true, edit: false, share: false, delete: false },
  },
  viewer: {
    label: "Viewer",
    description: "Sees item exists but cannot reveal secrets",
    color: "bg-muted text-muted-foreground border-white/[0.08]",
    abilities: { view: true, use: false, edit: false, share: false, delete: false },
  },
};
