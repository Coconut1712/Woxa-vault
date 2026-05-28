import type { ColorKey } from "@/lib/types";

export type MemberRole = "owner" | "admin" | "member" | "guest";
export type MemberStatus = "active" | "invited" | "suspended";

export interface Member {
  id: string;
  email: string;
  name: string;
  role: MemberRole;
  status: MemberStatus;
  lastActiveAt?: string;
  joinedAt: string;
  vaultCount: number;
  twoFaEnabled: boolean;
  avatarColor: ColorKey;
  teams: string[];
}

export const members: Member[] = [
  {
    id: "u_ching",
    email: "ching@iux24.com",
    name: "Ching Suriya",
    role: "owner",
    status: "active",
    lastActiveAt: "2026-05-13T14:22:00Z",
    joinedAt: "2026-01-10T08:00:00Z",
    vaultCount: 5,
    twoFaEnabled: true,
    avatarColor: "violet",
    teams: ["DevOps", "Leadership"],
  },
  {
    id: "u_somchai",
    email: "somchai@iux24.com",
    name: "Somchai Dev",
    role: "admin",
    status: "active",
    lastActiveAt: "2026-05-13T13:00:00Z",
    joinedAt: "2026-01-15T08:00:00Z",
    vaultCount: 4,
    twoFaEnabled: true,
    avatarColor: "blue",
    teams: ["DevOps"],
  },
  {
    id: "u_mali",
    email: "mali@iux24.com",
    name: "Mali Marketing",
    role: "member",
    status: "active",
    lastActiveAt: "2026-05-13T08:00:00Z",
    joinedAt: "2026-02-01T08:00:00Z",
    vaultCount: 2,
    twoFaEnabled: true,
    avatarColor: "fuchsia",
    teams: ["Marketing"],
  },
  {
    id: "u_kana",
    email: "kana@iux24.com",
    name: "Kana Finance",
    role: "member",
    status: "active",
    lastActiveAt: "2026-05-12T16:30:00Z",
    joinedAt: "2026-02-10T08:00:00Z",
    vaultCount: 1,
    twoFaEnabled: false,
    avatarColor: "amber",
    teams: ["Finance"],
  },
  {
    id: "u_design",
    email: "design@iux24.com",
    name: "Praew Design",
    role: "member",
    status: "active",
    lastActiveAt: "2026-05-11T10:00:00Z",
    joinedAt: "2026-03-01T08:00:00Z",
    vaultCount: 2,
    twoFaEnabled: true,
    avatarColor: "emerald",
    teams: ["Design"],
  },
  {
    id: "u_marketing",
    email: "noi@iux24.com",
    name: "Noi K.",
    role: "member",
    status: "active",
    lastActiveAt: "2026-05-12T11:00:00Z",
    joinedAt: "2026-03-20T08:00:00Z",
    vaultCount: 2,
    twoFaEnabled: true,
    avatarColor: "cyan",
    teams: ["Marketing"],
  },
  {
    id: "u_vendor",
    email: "vendor@partner.com",
    name: "External Vendor",
    role: "guest",
    status: "active",
    lastActiveAt: "2026-05-10T14:00:00Z",
    joinedAt: "2026-05-01T08:00:00Z",
    vaultCount: 1,
    twoFaEnabled: false,
    avatarColor: "rose",
    teams: [],
  },
  {
    id: "u_newbie",
    email: "newbie@iux24.com",
    name: "New Joiner",
    role: "member",
    status: "invited",
    joinedAt: "2026-05-12T18:30:00Z",
    vaultCount: 0,
    twoFaEnabled: false,
    avatarColor: "indigo",
    teams: [],
  },
];

export interface TrashItem {
  id: string;
  name: string;
  type: "login" | "api_key" | "ssh" | "note" | "card";
  vaultName: string;
  vaultColor: ColorKey;
  deletedBy: string;
  deletedAt: string;
  expiresAt: string;
}

export const trashItems: TrashItem[] = [
  {
    id: "t_001",
    name: "Old AWS access keys",
    type: "api_key",
    vaultName: "Production",
    vaultColor: "rose",
    deletedBy: "Ching Suriya",
    deletedAt: "2026-05-10T12:00:00Z",
    expiresAt: "2026-06-09T12:00:00Z",
  },
  {
    id: "t_002",
    name: "Mailchimp legacy",
    type: "login",
    vaultName: "Marketing",
    vaultColor: "fuchsia",
    deletedBy: "Mali Marketing",
    deletedAt: "2026-05-08T10:30:00Z",
    expiresAt: "2026-06-07T10:30:00Z",
  },
  {
    id: "t_003",
    name: "Slack webhook (deprecated)",
    type: "api_key",
    vaultName: "Shared",
    vaultColor: "blue",
    deletedBy: "Somchai Dev",
    deletedAt: "2026-05-05T15:00:00Z",
    expiresAt: "2026-06-04T15:00:00Z",
  },
  {
    id: "t_004",
    name: "Test card 4242…",
    type: "card",
    vaultName: "Production",
    vaultColor: "rose",
    deletedBy: "Ching Suriya",
    deletedAt: "2026-04-20T09:00:00Z",
    expiresAt: "2026-05-20T09:00:00Z",
  },
  {
    id: "t_005",
    name: "Note: old recovery procedure",
    type: "note",
    vaultName: "Personal",
    vaultColor: "violet",
    deletedBy: "Ching Suriya",
    deletedAt: "2026-04-15T11:00:00Z",
    expiresAt: "2026-05-15T11:00:00Z",
  },
];

export interface ActiveSession {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip: string;
  location: string;
  lastActiveAt: string;
  current: boolean;
}

export const sessions: ActiveSession[] = [
  {
    id: "s_1",
    device: "MacBook Pro",
    browser: "Chrome 127",
    os: "macOS Sonoma",
    ip: "203.150.x.x",
    location: "Bangkok, Thailand",
    lastActiveAt: "2026-05-13T14:22:00Z",
    current: true,
  },
  {
    id: "s_2",
    device: "iPhone 15",
    browser: "Safari Mobile",
    os: "iOS 18",
    ip: "171.96.x.x",
    location: "Bangkok, Thailand",
    lastActiveAt: "2026-05-13T08:30:00Z",
    current: false,
  },
  {
    id: "s_3",
    device: "Windows Laptop",
    browser: "Edge 130",
    os: "Windows 11",
    ip: "49.228.x.x",
    location: "Chiang Mai, Thailand",
    lastActiveAt: "2026-05-11T19:00:00Z",
    current: false,
  },
];
