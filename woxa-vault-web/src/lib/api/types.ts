/**
 * Backend-aligned shapes for the woxa-vault-api endpoints (round 2).
 *
 * Mirrors /API_CONTRACT.md exactly. Kept separate from `src/lib/types.ts` (which
 * still drives the mock-data UI) so the wire shape can evolve without touching
 * every page. As mock-backed pages get swapped to real API calls, they should
 * import from here.
 *
 * Key reminders from the contract:
 *  - Ids are bare UUIDs — frontend treats them as opaque strings.
 *  - `ItemSummary` does NOT contain decrypted secrets. Use `hasPassword` /
 *    `hasNotes` / `hasTotp` to decide what to render. Call `getItem(id)` to
 *    pull the decrypted `ItemFull` — that call audits a `item.reveal`.
 *  - Round 2 only ships `ItemType` of `"login" | "note"` and locks `folderId`,
 *    `tags`, `favorite`, `totpSecret`, `customFields` to defaults.
 */

export type VaultColor =
  | "violet"
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "fuchsia"
  | "cyan"
  | "indigo";

export type VaultRole = "manager" | "editor" | "user" | "viewer";

/** Returned by GET /vaults and on every vault mutation that returns the summary. */
export interface VaultSummary {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  color: VaultColor | null;
  itemCount: number;
  memberCount: number;
  encryptionVersion: number;
  /**
   * Monotonic vault-key generation (Phase C Wave-2b). Echoed as
   * `expectedKeyVersion` on a re-key / migrate. v1 vaults default to 1.
   */
  keyVersion?: number;
  /**
   * True after a member was revoked from a v2 vault — the vault needs a
   * client-driven re-key (`POST /vaults/:id/rekey`) to rotate the key and
   * re-encrypt every item (AC-024.5). Cleared once the re-key succeeds.
   */
  rekeyPending?: boolean;
  /**
   * ISO deadline of the v1→v2 migration rollback window (30 days). Present on a
   * migrated v2 vault that can still be reverted (`POST /vaults/:id/migrate/rollback`).
   * Absent/undefined when never migrated or the window elapsed. Lets the rollback
   * affordance survive a page refresh instead of living only in session state.
   */
  rollbackAvailableUntil?: string | null;
  role: VaultRole;
  createdAt: string;
  updatedAt: string;
}

/** Extended shape used by POST /vaults + GET /vaults/:id + PATCH /vaults/:id. */
export interface Vault extends VaultSummary {
  createdBy: string;
}

export interface VaultMember {
  userId: string;
  email: string;
  displayName: string;
  role: VaultRole;
  expiresAt?: string | null;
}

export interface VaultTeamMember {
  teamId: string;
  teamName: string;
  role: VaultRole;
  expiresAt?: string | null;
}

export type ResourceGrant =
  | { type: "user"; member: VaultMember }
  | { type: "team"; member: VaultTeamMember };
export interface VaultDetail {
  vault: Vault;
  members: VaultMember[];
  wrappedKey?: string | null;
  teamMembers: VaultTeamMember[];
}

export interface VaultCreateInput {
  name: string;
  description?: string | null;
  iconKey?: string | null;
  color?: string | null;
  encryptionVersion?: number;
  wrappedKey?: string;
}


export type VaultUpdateInput = Partial<VaultCreateInput>;

/**
 * Folder shape — see /API_CONTRACT.md "Endpoints — Folders".
 *
 * Round 2.x ships flat per-vault folders. `parent_id` is not exposed on the
 * wire (DESIGN.md §7.3 reserves up to 3 nested levels for a later round).
 */
export interface Folder {
  id: string;
  vaultId: string;
  name: string;
  iconKey: string | null;
  color: VaultColor | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderCreateInput {
  name: string;
  iconKey?: string | null;
  color?: VaultColor | null;
  position?: number;
}

export interface FolderUpdateInput {
  name?: string;
  iconKey?: string | null;
  color?: VaultColor | null;
  position?: number;
}

/** Item types — backend persists all six verbatim (FR-030). */
export type ItemType = "login" | "note" | "api_key" | "ssh" | "card" | "identity";

/**
 * Server-computed password-rotation badge state (US-060 / AC-060.3):
 *   "none"    — no policy applies OR no password (no badge)
 *   "fresh"   — 🟢 due date > 14 days away
 *   "due"     — 🟡 within 14 days of the due date (inclusive)
 *   "overdue" — 🔴 due date has passed
 */
export type RotationStatus = "none" | "fresh" | "due" | "overdue";

export interface ItemActor {
  id: string;
  displayName: string;
}

/**
 * Shape returned by list endpoints. Decrypted fields are NEVER on this shape;
 * the `has*` booleans are server-derived so UI can decide what affordances to
 * show without a reveal round-trip.
 */
export interface ItemSummary {
  id: string;
  vaultId: string;
  folderId: string | null;
  type: ItemType;
  name: string;
  username: string | null;
  url: string | null;
  tags: string[];
  favorite: boolean;
  hasPassword: boolean;
  hasNotes: boolean;
  hasTotp: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  /**
   * When the item's password ciphertext last changed (ISO), or null if the item
   * has never had a password (e.g. a secure note). Backend sets it to `now` and
   * snapshots a version ONLY when a PATCH carries a non-empty `password` /
   * `passwordCiphertext` (US-015 / FR-037).
   */
  passwordChangedAt: string | null;
  /**
   * US-060 / AC-060.1-3 — password rotation policy + server-computed status.
   * `rotationPolicyDays`: the item's OWN window (days), or null = inherit the
   * org default (`rotationDefaultDays`). `rotationStatus` drives the 🟢🟡🔴
   * badge ("none" = no badge). `rotationDueAt` = passwordChangedAt + effective
   * days, or null when status is "none". Optional on the wire for legacy
   * responses that pre-date Phase C.
   */
  rotationPolicyDays?: number | null;
  rotationStatus?: RotationStatus;
  rotationDueAt?: string | null;
  createdBy: ItemActor;
  /**
   * The caller's effective role on THIS item — "most specific wins":
   * item override > folder grant > vault membership. Drives per-item
   * affordance gating (reveal/copy/edit/delete/share). Optional on the wire
   * for legacy responses; callers default it to the vault role when absent.
   */
  effectiveRole?: VaultRole;
  /** Optional expiry for temporary access. */
  expiresAt?: string | null;

  /**
   * Phase C ZK (encryptionVersion=2) metadata ciphertext. When `nameCiphertext`
   * is non-null the plaintext `name`/`username`/`url` are blanked server-side
   * (`""`/null); the client decrypts these with the vault key for display. v1
   * items leave them null and use the plaintext columns. (FR-043)
   */
  nameCiphertext?: string | null;
  nameIv?: string | null;
  usernameCiphertext?: string | null;
  usernameIv?: string | null;
  urlCiphertext?: string | null;
  urlIv?: string | null;
}

/**
 * Shape returned by GET /items/:id — backend decrypts inline and audits
 * `item.reveal`. Round 2 ships only password + notes; the other secret fields
 * are reserved on the wire and always come back as null / empty.
 */
export interface ItemFull extends ItemSummary {
  password: string | null;
  notes: string | null;
  totpSecret: string | null;
  customFields: any[];

  // Phase C: ZK fields
  passwordCiphertext?: string | null;
  passwordIv?: string | null;
  notesCiphertext?: string | null;
  notesIv?: string | null;
}


export interface ItemCreateInput {
  type: ItemType;
  name: string;
  username?: string | null;
  url?: string | null;
  password?: string | null;
  notes?: string | null;

  // Phase C: ZK fields
  passwordCiphertext?: string;
  passwordIv?: string;
  notesCiphertext?: string;
  notesIv?: string;

  /**
   * Phase C ZK metadata ciphertext (FR-043). Sent alongside `name: ""` for v2
   * vaults; the server blanks the plaintext columns and stores these verbatim.
   * On PATCH, sending `nameCiphertext` re-encrypts the name and scrubs the
   * plaintext; `usernameCiphertext`/`urlCiphertext` accept `null` to clear.
   */
  nameCiphertext?: string | null;
  nameIv?: string | null;
  usernameCiphertext?: string | null;
  usernameIv?: string | null;
  urlCiphertext?: string | null;
  urlIv?: string | null;
  /**
   * Blind-index tokens (base64 HMAC-SHA256). On create this seeds the index; on
   * PATCH, present (even `[]`) REPLACES the item's whole term set, omitted leaves
   * it untouched. Computed client-side via `computeSearchTerms`.
   */
  searchTerms?: string[];

  /**
   * Optional folder id within the same vault. The backend returns
   * `404 not_found` if the folder belongs to a different vault.
   */
  folderId?: string | null;

  /**
   * US-060 / AC-060.1 — per-item rotation window in days. `null`/`0`/omitted =
   * inherit the org default. Clamped server-side to [1, 3650]. Metadata-only on
   * PATCH (does NOT reset `passwordChangedAt` or snapshot a version).
   */
  rotationPolicyDays?: number | null;
}

/**
 * PATCH /items/:id body. `type` is optional: the backend accepts an item
 * type-change (FR-030, all six types persist verbatim). Omit it to leave the
 * type untouched; send it only when the user actually switches the item kind.
 */
export type ItemUpdateInput = Partial<ItemCreateInput>;

/**
 * One row of an item's password version history (US-015 / FR-037). Metadata
 * only — never carries secret content. Returned by GET /items/:id/versions,
 * newest first, capped at the 10 most recent.
 */
export interface ItemVersionSummary {
  version: number;
  type: ItemType;
  name: string;
  editedByEmail: string;
  createdAt: string;
  hasPassword: boolean;
  hasNotes: boolean;
}

/** Envelope for GET /items/:id/versions. */
export interface ItemVersionListResponse {
  /**
   * Whether the caller may reveal a version's content. `false` for an effective
   * viewer/auditor — the UI lists versions but hides/disables the reveal action,
   * mirroring the backend's 403 on GET /items/:id/versions/:version.
   */
  canReveal: boolean;
  versions: ItemVersionSummary[];
}

/**
 * Decrypted (Phase A, encryptionVersion=1) version content from
 * GET /items/:id/versions/:version. In ZK mode (encryptionVersion=2) the
 * password/notes come back as ciphertext instead — see `ItemVersionContent`.
 */
export interface ItemVersionContent {
  version: number;
  type: ItemType;
  name: string;
  username: string | null;
  url: string | null;
  /** Phase A: decrypted server-side. ZK: null (use the ciphertext fields). */
  password: string | null;
  notes: string | null;
  createdAt: string;
  editedByEmail: string;

  /** ZK (encryptionVersion=2) fields — client decrypts with the vault key. */
  passwordCiphertext?: string | null;
  passwordIv?: string | null;
  notesCiphertext?: string | null;
  notesIv?: string | null;
  /**
   * ZK metadata-ciphertext snapshot (Wave-2a). When non-null the snapshot's
   * `name`/`username`/`url` are blanked; the client decrypts these. Legacy v2
   * snapshots return null here → fall back to the plaintext fields.
   */
  nameCiphertext?: string | null;
  nameIv?: string | null;
  usernameCiphertext?: string | null;
  usernameIv?: string | null;
  urlCiphertext?: string | null;
  urlIv?: string | null;
}

/**
 * SSO error codes returned via `?error=<code>` on the redirect back to `/`.
 * Keep this union in sync with `sso.error.*` keys in i18n/translations.ts and
 * the table in /API_CONTRACT.md ("Redirect-only error codes").
 */
export type SsoErrorCode =
  | "sso_state_mismatch"
  | "sso_domain_forbidden"
  | "sso_email_unverified"
  | "sso_provider_error"
  | "sso_internal_error";

export interface ImportJob {
  id: string;
  orgId: string;
  userId: string;
  source: string;
  status: "pending" | "processing" | "completed" | "failed";
  config: {
    targetVaultId?: string;
    targetFolderId?: string | null;
    conflictPolicy?: "skip" | "overwrite" | "append";
  };
  stats: {
    total: number;
    created: number;
    skipped: number;
    failed: number;
  };
  errorLog: { message: string; timestamp: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportItem {
  id: string;
  jobId: string;
  data: any;
  status: "pending" | "imported" | "skipped" | "failed";
  error: string | null;
}
