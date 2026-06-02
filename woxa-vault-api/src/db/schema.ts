import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  bigint,
  index,
  uniqueIndex,
  jsonb,
  boolean,
  customType,
  primaryKey,
} from "drizzle-orm/pg-core";

// drizzle-orm doesn't ship a first-class bytea type — register one so
// password_ciphertext / notes_ciphertext / dek_ciphertext stay strongly typed.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer) {
    return value;
  },
  fromDriver(value: unknown) {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    return Buffer.alloc(0);
  },
});

// ---------------------------------------------------------------------------
// Phase A schema (subset of DESIGN.md §7). Only includes what is required to
// satisfy the login flow contract with woxa-vault-web:
//   - organizations: minimal so users can belong to one
//   - users: email + argon2id hash + status (DESIGN.md §7.1)
//   - sessions: Lucia v3 session table (DESIGN.md §7.6)
// Vaults / items / sends / audit / RLS are intentionally deferred.
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    name: text("name"),
    displayName: text("display_name"),

    // Two-password model (DESIGN.md §7.1, AC-002.2).
    //
    // `password_hash` = Argon2id hash of the MASTER password ONLY. It is the
    // subject of the vault-unlock gate (`requireVaultUnlocked` /
    // `vault_unlocked_at`) and the recovery kit; it is NEVER used to
    // authenticate `POST /auth/login`. Set via `POST /me/password/setup`. NULL
    // = master not yet set (drives `requiresPasswordSetup`).
    passwordHash: text("password_hash"),
    // Argon2id hash of the LOGIN password — the credential `POST /auth/login`
    // verifies. Distinct value from `password_hash` (master). NULL = the user
    // cannot log in with email+password (SSO-only / legacy accounts → use
    // Google). Set at `POST /auth/register`.
    loginPasswordHash: text("login_password_hash"),
    // When the master-password hash was last (re)set. Used by audit + future
    // "force re-login after X" checks. NULL = master never set (SSO-only users).
    passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),

    // Phase C+: zero-knowledge auth — Argon2id hash of LOGIN auth key derived
    // client-side from the LOGIN password.
    authKeyHash: text("auth_key_hash"),

    // Phase C+: zero-knowledge unlock — Argon2id hash of MASTER auth key derived
    // client-side from the MASTER password. Used for vault-unlock gate.
    masterAuthKeyHash: text("master_auth_key_hash"),

    // Recovery kit (DESIGN.md §6 — Phase A scaffolding for the zero-knowledge
    // recovery flow). The server stores ONLY an Argon2id hash of the recovery
    // code; the plaintext code is shown to the user exactly once at generation
    // time. `recovery_kit_used_at` is set when the recovery flow is invoked —
    // recovery is single-use; the row is invalidated (hash = NULL) on use and
    // the user must regenerate via `POST /me/recovery-kit/regenerate`.
    recoveryKitHash: text("recovery_kit_hash"),
    recoveryKitCreatedAt: timestamp("recovery_kit_created_at", { withTimezone: true }),
    recoveryKitUsedAt: timestamp("recovery_kit_used_at", { withTimezone: true }),

    // 2FA (Phase A US-003)
    totpSecretEncrypted: text("totp_secret_encrypted"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    // RFC 6238 §5.2 replay guard. Holds the most recent TOTP time-step
    // (floor(unix_seconds / 30) ± skew window) that successfully verified for
    // this user, across ALL TOTP entry points (enroll / disable / regenerate /
    // login). Every TOTP success runs a monotonic compare-and-set:
    //   UPDATE users SET last_totp_step = $step
    //     WHERE id = $id AND (last_totp_step IS NULL OR last_totp_step < $step)
    // A 0-row result means the step (or an earlier one in the same code's
    // validity window) was already consumed → the code is rejected as a replay.
    // NULL = no TOTP has ever been accepted. Backup-code logins do NOT touch
    // this column (they carry their own single-use marker).
    lastTotpStep: bigint("last_totp_step", { mode: "number" }),

    // Google OAuth `sub` claim — stable identifier even if the user's email
    // changes inside Google Workspace. Set on first successful SSO login.
    ssoSubject: text("sso_subject"),

    // Notification preferences (DESIGN.md §7.1). Stores a JSON object of
    // toggles (e.g. { "newLogin": true, "vaultShared": true }).
    // Defaults to all-on ({}) server-side; logic in lib/notifications.ts
    // interprets missing keys as true (opt-out model).
    notificationPreferences: jsonb("notification_preferences").notNull().default(sql`'{}'::jsonb`),

    // Account state
    status: text("status").notNull().default("active"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    // Email is globally unique and case-insensitive. The index is defined as
    // UNIQUE on `lower(email)` (migration 0006) so a stray un-normalized
    // insert (e.g. invitation flow) cannot create a duplicate row that the
    // lowercase-only login lookup would never find. We still normalize at
    // every insert path; the index is the last-line defense.
    emailIdx: uniqueIndex("users_email_idx").on(sql`lower(${t.email})`),
    ssoSubjectIdx: uniqueIndex("users_sso_subject_idx").on(t.ssoSubject),
  }),
);

export const orgMembers = pgTable(
  "org_members",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // owner / admin / member / guest — DESIGN.md §3
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("org_members_pkey").on(t.orgId, t.userId),
    userIdx: index("org_members_user_idx").on(t.userId),
    // Single-owner invariant (DESIGN.md §3): at most ONE `owner` row per org.
    // Defense-in-depth alongside the app-level transaction in the transfer
    // endpoint — a partial unique index means even a race that tried to insert
    // a second owner row fails at the DB. The WHERE clause scopes uniqueness
    // to owner rows only so admins/members can co-exist freely.
    singleOwnerIdx: uniqueIndex("org_members_single_owner_idx")
      .on(t.orgId)
      .where(sql`${t.role} = 'owner'`),
  }),
);

// Lucia v3 session table (DESIGN.md §7.6). Lucia owns the schema columns
// `id`, `userId`, `expiresAt`; we add device/IP metadata as separate columns.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    // Hard ceiling beyond which the sliding-window refresh in `validateSessionToken`
    // refuses to extend the session, regardless of activity. WARN-2: prevents an
    // attacker who steals a session token from quietly riding it forever by
    // generating any traffic at all.
    absoluteExpiresAt: timestamp("absolute_expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),

    // WARN-I (Phase A.5 server-side vault lock): the wall-clock instant of the
    // most recent successful master-password verification for this session.
    // NULL = never unlocked in this session (treated as locked). The
    // `requireVaultUnlocked` middleware compares `now() - vault_unlocked_at`
    // against `VAULT_UNLOCK_IDLE_MS` and rejects sensitive item-read endpoints
    // with `401 vault_locked` when the window is exceeded — so a stolen-cookie
    // attacker cannot bypass the frontend lock by hitting the JSON APIs.
    vaultUnlockedAt: timestamp("vault_unlocked_at", { withTimezone: true }),

    // M-1 (active workspace): the org this session is currently "looking at".
    // A user may belong to several workspaces; without this column every
    // org-scoped operation (members / invites / settings / transfer / audit)
    // silently targeted the FIRST membership by joined_at, so a multi-workspace
    // user always acted on the wrong org. This stores the user's selection,
    // set via POST /workspace/switch.
    //
    // SECURITY: this value is NEVER trusted on its own. `resolveActiveOrg`
    // re-validates on every request that the caller is STILL a member of this
    // org and derives the role from that membership — so a stale/forged value
    // cannot grant access to an org the user left, nor escalate privileges.
    // ON DELETE SET NULL: when the org is deleted the pointer falls back to
    // NULL and the resolver reverts to the first-membership default.
    activeOrgId: uuid("active_org_id").references(() => organizations.id, {
      onDelete: "set null",
    }),

    // Metadata captured at session creation for audit (DESIGN.md §7.6).
    deviceName: text("device_name"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

// Audit events table — schema present for Phase A but wiring across endpoints
// is deferred (REQUIREMENTS §4.7). Login/logout will write to this table.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    targetName: text("target_name"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    success: boolean("success").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgTimeIdx: index("audit_org_time_idx").on(t.orgId, t.occurredAt),
    actorIdx: index("audit_actor_idx").on(t.actorUserId, t.occurredAt),
  }),
);

// ---------------------------------------------------------------------------
// Teams (DESIGN.md §7.2). Group of users within an organization.
// ---------------------------------------------------------------------------

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNameIdx: uniqueIndex("teams_org_name_idx").on(t.orgId, t.name),
  }),
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // lead | member
    role: text("role").notNull().default("member"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.userId] }),
    userIdx: index("team_members_user_idx").on(t.userId),
  }),
);

// ---------------------------------------------------------------------------
// Vaults (DESIGN.md §7.2). Phase A subset — name/description/icon/color +
// owning org + created_by. RLS / wrapped vault keys arrive in Phase C.
// ---------------------------------------------------------------------------

export const vaults = pgTable(
  "vaults",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    iconKey: text("icon_key"),
    color: text("color"), // validated by Zod at the route layer
    encryptionVersion: integer("encryption_version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("vaults_org_idx").on(t.orgId),
  }),
);

// Vault membership row. Composite PK = (vault_id, user_id).
export const vaultMembers = pgTable(
  "vault_members",
  {
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // manager / editor / user / viewer per API_CONTRACT.md.
    role: text("role").notNull().default("editor"),
    // Role to revert to when temporary access expires (null = remove member).
    originalRole: text("original_role"),
    // When this temporary role expires.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.vaultId, t.userId] }),
    userIdx: index("vault_members_user_idx").on(t.userId),
  }),
);

// Team-level vault grants.
export const vaultTeamMembers = pgTable(
  "vault_team_members",
  {
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // manager / editor / user / viewer
    role: text("role").notNull().default("editor"),
    // Role to revert to when temporary access expires.
    originalRole: text("original_role"),
    // When this temporary role expires.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.vaultId, t.teamId] }),
    teamIdx: index("vault_team_members_team_idx").on(t.teamId),
  }),
);

// Folders. Flat per-vault (DESIGN.md §7.3 allows nesting up to 3 levels — we
// keep `parent_id` as a future column but omit it from the wire contract in
// round 2.x). `position` is a frontend-managed integer sort key.
export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    iconKey: text("icon_key"),
    color: text("color"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vaultIdx: index("folders_vault_idx").on(t.vaultId),
    positionIdx: index("folders_position_idx").on(t.vaultId, t.position),
  }),
);

// Items table. Secret fields live in dedicated bytea columns. Each row carries
// its own wrapped DEK (`dek_ciphertext`) — the DEK is unwrapped only inside
// the request handler that needs the plaintext and zeroized after use.
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    // US-012 / FR-030: one of login | note | api_key | ssh | card | identity.
    // Plaintext label (drives UI form/icon) — NOT a secret. Stored as text (no
    // PG enum/check) so adding kinds needs no column migration; the closed
    // vocabulary is enforced by the Zod `typeSchema` in routes/items.ts.
    type: text("type").notNull(),
    name: text("name").notNull(),

    // Non-sensitive metadata kept in plaintext for list views + search.
    // Searched by GET /search (US-017): name, username, url, type. NEVER the
    // ciphertext columns or anything inside the encrypted notes meta blob
    // (tags/totp/card/etc.) — those are secret-equivalent in Phase A.
    username: text("username"),
    url: text("url"),

    // Envelope-encrypted secret fields. NULL = absent / cleared by client.
    passwordCiphertext: bytea("password_ciphertext"),
    passwordIv: bytea("password_iv"),
    notesCiphertext: bytea("notes_ciphertext"),
    notesIv: bytea("notes_iv"),

    // Per-item DEK wrapped by the LOCAL_KEK (Phase A) — will move to KMS in B.
    // NULL in Zero-Knowledge mode (encryptionVersion >= 2).
    dekCiphertext: bytea("dek_ciphertext"),
    dekIv: bytea("dek_iv"),

    // Optional folder assignment. SET NULL on folder delete (DESIGN.md §7.3).
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),

    // US-015 AC-015.3 / FR-039: timestamp of the LAST password change. Set on
    // create (when a password is present) and on any PATCH that changes the
    // password. NULL = item never had a password (e.g. note). Drives the
    // frontend "password last changed X ago" display + rotation policy (FR-039).
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Who soft-deleted this item (powers the Trash "deleted by" column). SET
    // NULL if that user is later removed so the trash row survives the FK. NULL
    // also means "live item" (paired with deletedAt = NULL).
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    vaultIdx: index("items_vault_idx").on(t.vaultId),
    updatedIdx: index("items_updated_idx").on(t.vaultId, t.updatedAt),
    folderIdx: index("items_folder_idx").on(t.folderId),
    // US-017 (AC-017.2/.5 / FR-041): trigram GIN indexes back the fuzzy
    // `ILIKE '%q%'` search over PLAINTEXT metadata in GET /search. Requires the
    // pg_trgm extension (created by the search migration). Only name/username/
    // url are indexed — never ciphertext or the encrypted notes meta blob.
    nameTrgmIdx: index("items_name_trgm_idx").using(
      "gin",
      sql`${t.name} gin_trgm_ops`,
    ),
    usernameTrgmIdx: index("items_username_trgm_idx").using(
      "gin",
      sql`${t.username} gin_trgm_ops`,
    ),
    urlTrgmIdx: index("items_url_trgm_idx").using(
      "gin",
      sql`${t.url} gin_trgm_ops`,
    ),
  }),
);

// Folder-level sharing grants (DESIGN.md §11.3 "most specific wins"). A row
// here grants a user a role on ALL items inside the folder, ranking BELOW an
// item-level override but ABOVE plain vault membership. Mirrors
// `vault_members` conventions: composite PK + user index. Cascades on folder
// delete so orphaned grants can't linger.
export const folderMembers = pgTable(
  "folder_members",
  {
    folderId: uuid("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // manager / editor / user / viewer — same role vocabulary as vault_members.
    role: text("role").notNull().default("viewer"),
    // Role to revert to when temporary access expires.
    originalRole: text("original_role"),
    // When this temporary role expires.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.folderId, t.userId] }),
    userIdx: index("folder_members_user_idx").on(t.userId),
  }),
);

// Team-level folder grants.
export const folderTeamMembers = pgTable(
  "folder_team_members",
  {
    folderId: uuid("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"),
    originalRole: text("original_role"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.folderId, t.teamId] }),
    teamIdx: index("folder_team_members_team_idx").on(t.teamId),
  }),
);

// Item-level sharing grants (DESIGN.md §11.3). The MOST specific level — a row
// here overrides any folder grant or vault membership for the (item, user)
// pair, and may UPGRADE or DOWNGRADE the effective role. Cascades on item
// delete.
export const itemMembers = pgTable(
  "item_members",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"),
    // Role to revert to when temporary access expires.
    originalRole: text("original_role"),
    // When this temporary role expires.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.itemId, t.userId] }),
    userIdx: index("item_members_user_idx").on(t.userId),
  }),
);

// Team-level item grants.
export const itemTeamMembers = pgTable(
  "item_team_members",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"),
    originalRole: text("original_role"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.itemId, t.teamId] }),
    teamIdx: index("item_team_members_team_idx").on(t.teamId),
  }),
);

// One-time sends (DESIGN.md §7.4). Round 2.x stores server-side ciphertext
// (Phase A envelope encryption); the zero-knowledge URL-fragment flow is
// deferred. Token is the URL-visible random handle; the DB stores SHA-256 of
// the token only — raw token never persisted (mirrors the session table).
export const oneTimeSends = pgTable(
  "one_time_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),

    // Encrypted content blob + IV + per-send wrapped DEK.
    contentCiphertext: bytea("content_ciphertext").notNull(),
    contentIv: bytea("content_iv").notNull(),
    dekCiphertext: bytea("dek_ciphertext").notNull(),
    dekIv: bytea("dek_iv").notNull(),

    // Optional password gate (Argon2id hash of caller-supplied password).
    passwordHash: text("password_hash"),

    maxViews: integer("max_views").notNull().default(1),
    viewCount: integer("view_count").notNull().default(0),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    burnedAt: timestamp("burned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    expiresIdx: index("one_time_sends_expires_idx").on(t.expiresAt),
    createdByIdx: index("one_time_sends_created_by_idx").on(t.createdBy),
  }),
);

// ---------------------------------------------------------------------------
// Attachments (DESIGN.md §7.3). Phase A: server-side envelope encryption,
// same DEK-wrapping pattern as items/sends. Each attachment owns its own DEK
// (separate from the parent item's DEK) so revealing an item doesn't force
// decryption of every attached file — the API only unwraps the attachment's
// DEK at download time.
//
// Cap per file: 25 MB ciphertext (REQUIREMENTS.md FR-038). Cap per item is
// enforced at the route layer (sum query) since DESIGN.md does not pin a
// hard limit yet — we use 100 MB / item as a conservative starting point.
// ---------------------------------------------------------------------------
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    // Sanitized display filename. Original Unicode kept; path separators and
    // control chars stripped at the route layer before persisting.
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(), // plaintext size; ciphertext is +16 (auth tag)
    // Storage key relative to the storage root (e.g. "abc/def/<uuid>.bin").
    // Never returned in API responses.
    storageKey: text("storage_key").notNull(),
    // Per-attachment DEK + IV used to encrypt the file body. DEK is itself
    // wrapped under LOCAL_KEK_BASE64 (Phase A) — same envelope as items.
    dekCiphertext: bytea("dek_ciphertext").notNull(),
    dekIv: bytea("dek_iv").notNull(),
    contentIv: bytea("content_iv").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    itemIdx: index("attachments_item_idx").on(t.itemId),
  }),
);

// ---------------------------------------------------------------------------
// 2FA backup codes (REQUIREMENTS US-003 / FR-007 — single-use 10-code set).
// Each row is one Argon2id-hashed backup code that the user may present in
// lieu of a TOTP code at login time (or to disable 2FA). Codes are generated
// in plaintext exactly once at enroll/regenerate time and shown to the user
// then; the plaintext is never persisted.
//
// On use the row is marked (used_at = now()) atomically — a concurrent retry
// with the same code can't double-spend it. On disable / regenerate the
// entire set is deleted.
// ---------------------------------------------------------------------------
export const userMfaBackupCodes = pgTable(
  "user_mfa_backup_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("user_mfa_backup_codes_user_idx").on(t.userId),
  }),
);

// ---------------------------------------------------------------------------
// Import Jobs (DESIGN.md §15.2). Track background migration tasks.
export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // 1password, bitwarden, lastpass, generic_csv
    status: text("status").notNull().default("pending"), // pending, processing, completed, failed
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`), // targetVaultId, targetFolderId, conflictPolicy
    stats: jsonb("stats").notNull().default(sql`'{"total":0,"created":0,"skipped":0,"failed":0}'::jsonb`),
    errorLog: jsonb("error_log").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("import_jobs_org_idx").on(t.orgId),
    userIdx: index("import_jobs_user_idx").on(t.userId),
  }),
);

// Import Items. Stores parsed items before they are committed to the vault.
export const importItems = pgTable(
  "import_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    // The parsed item data in a format ready for createItem (type, name, etc.).
    data: jsonb("data").notNull(),
    status: text("status").notNull().default("pending"), // pending, imported, skipped, failed
    error: text("error"),
  },
  (t) => ({
    jobIdx: index("import_items_job_idx").on(t.jobId),
  }),
);

// ---------------------------------------------------------------------------
// Zero-Knowledge Encryption (Phase C, DESIGN.md §6).
// ---------------------------------------------------------------------------

// User Keys: stores the client-side generated public key and the master-password-wrapped private key.
export const userKeys = pgTable(
  "user_keys",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    publicKey: bytea("public_key").notNull(),         // X25519 public
    encryptedPrivateKey: bytea("encrypted_private_key").notNull(), // encrypted with stretched master key
    privateKeyIv: bytea("private_key_iv").notNull(),
    privateKeyAuthTag: bytea("private_key_auth_tag").notNull(),
    kdfAlgorithm: text("kdf_algorithm").notNull().default("argon2id"),
    kdfParams: jsonb("kdf_params").notNull().default(sql`'{}'::jsonb`),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// Vault Keys: stores the vault-wide DEK wrapped with each member's user public key.
export const vaultKeys = pgTable(
  "vault_keys",
  {
    vaultId: uuid("vault_id").notNull().references(() => vaults.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    wrappedKey: bytea("wrapped_key").notNull(), // vault key encrypted with user pubkey
    wrapAlgo: text("wrap_algo").notNull().default("x25519-aes256gcm"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.vaultId, t.userId] }),
  })
);

// Item Versions: a self-contained snapshot of an item's state taken BEFORE each
// content edit (US-015 AC-015.2 / FR-037 "last 10 versions"). Each row carries
// its OWN wrapped DEK (dek_ciphertext/dek_iv) so a version can be decrypted on
// its own even after the live item's DEK has rotated — the snapshot does not
// depend on the current items row for key material.
//
// Phase A (encryptionVersion=1): password/notes ciphertext + IVs are the
// server-side envelope, and dek_ciphertext/dek_iv are the LOCAL_KEK-wrapped DEK.
// Phase C ZK (encryptionVersion=2): the ciphertexts are client blobs and the
// DEK columns are NULL (the client holds the key hierarchy).
//
// NOTE: encrypted_data/iv/auth_tag are LEGACY columns from migration 0021 (an
// opaque single-blob design that was never written by any code path). They were
// made nullable in the follow-up migration and are intentionally left unused —
// the per-field columns below are the source of truth.
export const itemVersions = pgTable(
  "item_versions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),

    // Legacy (0021) — unused, nullable. Do not write.
    encryptedData: bytea("encrypted_data"),
    iv: bytea("iv"),
    authTag: bytea("auth_tag"),

    // Plaintext metadata snapshot (mirrors items.* — never secret).
    type: text("type").notNull(),
    name: text("name").notNull(),
    username: text("username"),
    url: text("url"),

    // Encrypted field snapshot (mirrors items.* envelope columns).
    passwordCiphertext: bytea("password_ciphertext"),
    passwordIv: bytea("password_iv"),
    notesCiphertext: bytea("notes_ciphertext"),
    notesIv: bytea("notes_iv"),

    // Snapshot of the wrapped DEK so the version decrypts self-contained
    // (Phase A). NULL in ZK mode (encryptionVersion=2).
    dekCiphertext: bytea("dek_ciphertext"),
    dekIv: bytea("dek_iv"),

    // Which envelope generation this snapshot used (1 = Phase A server-side,
    // 2 = ZK client blobs). Drives how the reveal endpoint decrypts.
    encryptionVersion: integer("encryption_version").notNull().default(1),

    // Who made the edit that produced this snapshot (the editor of the NEW
    // state). Email denormalized so the history survives user deletion.
    modifiedBy: uuid("modified_by").references(() => users.id, { onDelete: "set null" }),
    modifiedByEmail: text("modified_by_email"),
    modifiedAt: timestamp("modified_at", { withTimezone: true }).notNull().defaultNow(),
    changeSummary: text("change_summary"),
  },
  (t) => ({
    itemVersionIdx: uniqueIndex("item_versions_item_num_idx").on(t.itemId, t.versionNumber),
  })
);

// Invitations (DESIGN.md §7.1). A pending org membership where the user may
// not yet exist. Accepting an invite materializes (or links) a `users` row
// and an `org_members` row, then sets `accepted_at` here.
//
// `token_hash` stores SHA-256 of the raw invite token (same pattern as
// one_time_sends + sessions). The raw token only ever appears in the
// invitation URL sent by email; never persisted.
// ---------------------------------------------------------------------------
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(), // owner / admin / member / guest
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgEmailIdx: index("invitations_org_email_idx").on(t.orgId, t.email),
    tokenIdx: uniqueIndex("invitations_token_hash_idx").on(t.tokenHash),
  }),
);

// ---------------------------------------------------------------------------
// Notifications (event-driven in-app inbox). A row is the AFFECTED user's copy
// of something that happened to THEIR access — they were shared a resource, had
// their role changed, were revoked, or their one-time send was opened. We never
// notify the actor about their own action (guarded in lib/notifications.ts and
// by the recipient-is-the-target design).
//
// SECURITY: notifications carry NO secret/plaintext. `metadata` holds only
// roles / resource kinds / counts / booleans — never password ciphertext, DEKs
// or send content. A notification only ever describes access the recipient
// already has (they're the grantee/target), so it leaks nothing new.
//
// `read_at` NULL = unread (drives the badge count). `actor_user_id`/`actor_email`
// are SET NULL / nullable so the row survives the actor being deleted.
// ---------------------------------------------------------------------------
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Recipient — the AFFECTED user. Cascade so a deleted user's inbox is GC'd.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Context org (the workspace the event happened in). SET NULL so the row
    // survives the org being deleted; nullable for events with no org context.
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    // Event type — one of the closed vocabulary in lib/notifications.ts
    // (share.received | role.changed | access.revoked | member.role_changed |
    // send.viewed).
    type: text("type").notNull(),
    // Who triggered it (the actor). SET NULL on actor deletion; actorEmail is a
    // denormalized snapshot so the inbox can render "from x@y" without a join.
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    // What the event was about (vault | folder | item | user | send) + its id +
    // a human name snapshot for display. targetId is free-text (not a typed FK)
    // because it spans multiple tables.
    targetType: text("target_type"),
    targetId: text("target_id"),
    targetName: text("target_name"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    // NULL = unread.
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Primary list query: the caller's own notifications newest first.
    userCreatedIdx: index("notifications_user_created_idx").on(t.userId, t.createdAt.desc()),
    // Cheap unread-count badge poll: partial index over only the unread rows.
    userUnreadIdx: index("notifications_user_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
  }),
);

// ---------------------------------------------------------------------------
// Access Requests (DESIGN.md §19). Viewer users can request permission to
// access secrets. Approvers (Managers) can approve or deny these requests.
// ---------------------------------------------------------------------------
export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // What the request is for (item | folder | vault) + its id + its human name.
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    targetName: text("target_name"),
    // Requested role: user | editor | manager.
    requestedRole: text("requested_role").notNull(),
    // NULL = permanent access. Total minutes (Days*1440 + Hours*60 + Minutes).
    durationMinutes: integer("duration_minutes"),
    reason: text("reason").notNull(),
    // pending | approved | denied | expired | cancelled.
    status: text("status").notNull().default("pending"),

    // Approval details.
    approverId: uuid("approver_id").references(() => users.id, { onDelete: "set null" }),
    approvedRole: text("approved_role"),
    approvedDurationMinutes: integer("approved_duration_minutes"),
    decisionReason: text("decision_reason"),

    // Timestamps.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // When the approved access should expire.
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("access_requests_org_idx").on(t.orgId),
    requesterIdx: index("access_requests_requester_idx").on(t.requesterId),
    targetIdx: index("access_requests_target_idx").on(t.targetType, t.targetId),
    statusIdx: index("access_requests_status_idx").on(t.status),
  }),
);

// ---------------------------------------------------------------------------
// Type exports for use across the app.
// ---------------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type Vault = typeof vaults.$inferSelect;
export type NewVault = typeof vaults.$inferInsert;
export type VaultMember = typeof vaultMembers.$inferSelect;
export type VaultTeamMember = typeof vaultTeamMembers.$inferSelect;
export type NewVaultTeamMember = typeof vaultTeamMembers.$inferInsert;
export type FolderMember = typeof folderMembers.$inferSelect;
export type NewFolderMember = typeof folderMembers.$inferInsert;
export type FolderTeamMember = typeof folderTeamMembers.$inferSelect;
export type NewFolderTeamMember = typeof folderTeamMembers.$inferInsert;
export type ItemMember = typeof itemMembers.$inferSelect;
export type NewItemMember = typeof itemMembers.$inferInsert;
export type ItemTeamMember = typeof itemTeamMembers.$inferSelect;
export type NewItemTeamMember = typeof itemTeamMembers.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type OneTimeSend = typeof oneTimeSends.$inferSelect;
export type NewOneTimeSend = typeof oneTimeSends.$inferInsert;
export type OrgMember = typeof orgMembers.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type UserMfaBackupCode = typeof userMfaBackupCodes.$inferSelect;
export type NewUserMfaBackupCode = typeof userMfaBackupCodes.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type AccessRequest = typeof accessRequests.$inferSelect;
export type NewAccessRequest = typeof accessRequests.$inferInsert;

export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;
export type ImportItem = typeof importItems.$inferSelect;
export type NewImportItem = typeof importItems.$inferInsert;

export type UserKey = typeof userKeys.$inferSelect;
export type NewUserKey = typeof userKeys.$inferInsert;
export type VaultKey = typeof vaultKeys.$inferSelect;
export type NewVaultKey = typeof vaultKeys.$inferInsert;
export type ItemVersion = typeof itemVersions.$inferSelect;
export type NewItemVersion = typeof itemVersions.$inferInsert;
