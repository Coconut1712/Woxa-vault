export type ItemType = "login" | "api_key" | "ssh" | "note" | "card" | "identity";

export type VaultRole = "manager" | "editor" | "user" | "viewer";

export type ColorKey =
  | "violet"
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "fuchsia"
  | "cyan"
  | "indigo";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  domain: string;
  logo?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: "owner" | "admin" | "member" | "guest";
}

export interface Vault {
  id: string;
  name: string;
  description?: string;
  iconKey: string;
  color: ColorKey;
  itemCount: number;
  memberCount: number;
  encryptionVersion: 1 | 2;
}

export interface Folder {
  id: string;
  vaultId: string;
  parentId: string | null;
  name: string;
  iconKey?: string;
  itemCount: number;
}

export interface Item {
  id: string;
  vaultId: string;
  folderId: string | null;
  type: ItemType;
  name: string;
  username?: string;
  password?: string;
  url?: string;
  totpSecret?: string;
  notes?: string;
  tags: string[];
  favorite: boolean;
  updatedAt: string;
  lastUsedAt?: string;
  createdBy: string;
  customFields?: Array<{ name: string; value: string; type: "text" | "secret" }>;
}

export interface Send {
  id: string;
  itemName: string;
  recipientEmail?: string;
  maxViews: number;
  viewCount: number;
  expiresAt: string;
  createdAt: string;
  hasPassphrase: boolean;
  status: "active" | "expired" | "burned";
  token: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: { name: string; email: string };
  action: string;
  target: string;
  metadata?: Record<string, string>;
  ip?: string;
}
