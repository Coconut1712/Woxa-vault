import type { ExtractTablesWithRelations } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { notifications, users } from "@/db/schema";
import * as schema from "@/db/schema";

// ---------------------------------------------------------------------------
// Notification writer (event-driven in-app inbox).
//
// Threat model:
//   Asset: a recipient's notification inbox. The risk is (a) leaking secret
//     material into a notification field, and (b) notifying the WRONG user —
//     e.g. notifying the actor about their own action, or surfacing an event to
//     someone who shouldn't see it.
//   Adversaries:
//     * A buggy/hostile caller passing plaintext into `metadata` — mitigated by
//       contract (callers pass only roles/ids/names/counts/booleans) and by the
//       fact that the recipient is ALWAYS computed server-side from the
//       mutation's target, never from client input.
//     * Self-notification noise / "you shared X with yourself" — guarded here:
//       when userId === actorUserId we silently skip the insert.
//   Mitigations:
//     * Recipient (`userId`) is derived by the calling handler from the
//       mutation target (grantee / removed user / send creator), not the body.
//     * Runs INSIDE the same Drizzle transaction as the triggering mutation's
//       audit insert (pass `tx`), so a notification is never written for a
//       change that rolled back, and vice versa — they commit atomically.
//     * No secret/plaintext is ever stored; `metadata` holds only
//       roles/kinds/counts/booleans — never password ciphertext, DEKs
//       or send content.
//     * `metadata` is sanitized at runtime against a key allowlist before
//       insert (sanitizeMetadata) — even an `as`-cast secret in a future call
//       site is stripped, so a notification can never carry plaintext into the
//       DB/API. Type contract + this runtime guard are belt-and-braces.
//     * User preferences: recipients can opt-out of specific event types via
//       their profile settings. The writer checks these before persisting.
// ---------------------------------------------------------------------------

// Closed vocabulary of event-driven notification types. Keep in sync with the
// route DTO + the frontend. Types that depend on unbuilt features
// (rotation.due, auth.new_device, permission.*, group.synced, audit.anomaly,
// system.welcome) are intentionally NOT here.
export const NOTIFICATION_TYPES = [
  "share.received",
  "role.changed",
  "access.revoked",
  "member.role_changed",
  "send.viewed",
  "access_request.created",
  "access_request.approved",
  "access_request.denied",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Keys used in users.notification_preferences jsonb. */
export type NotificationPreference = "newLogin" | "sendReceived" | "vaultShared";

/** Map internal notification types to user-facing preference toggles. */
const TYPE_TO_PREFERENCE: Record<NotificationType, NotificationPreference> = {
  "share.received": "vaultShared",
  "role.changed": "vaultShared",
  "access.revoked": "vaultShared",
  "member.role_changed": "vaultShared",
  "send.viewed": "sendReceived",
  "access_request.created": "vaultShared",
  "access_request.approved": "vaultShared",
  "access_request.denied": "vaultShared",
};

// Resource kinds carried in metadata for the resource-sharing events.
export type ResourceKind = "vault" | "folder" | "item";

// Per-type metadata contract (documentation + a light compile-time guard at the
// call sites). Only non-secret descriptors — roles, kinds, counts, booleans.
export type NotificationMetadata =
  | { resourceKind: ResourceKind; role: string } // share.received
  | { resourceKind: ResourceKind; from: string; to: string } // role.changed
  | { resourceKind: ResourceKind } // access.revoked
  | { from: string; to: string } // member.role_changed
  | { viewsRemaining: number; burned: boolean } // send.viewed
  | { resourceKind: ResourceKind; role: string; decisionReason?: string } // access_request.created/approved/denied
  | Record<string, string | number | boolean | undefined>;

// The transaction type produced by `db.transaction(async (tx) => ...)` for the
// postgres-js driver. Accepting this (rather than the top-level db) lets a
// notification join the SAME transaction as the triggering mutation's audit
// insert, so they commit/rollback together.
export type Tx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

// Runtime allowlist (defense-in-depth): the only metadata keys a notification
// may carry — all non-secret descriptors. Anything else (or a non-primitive
// value) is stripped before persisting, so a future caller can't leak a secret
// through `metadata` even with an `as`-cast.
const ALLOWED_METADATA_KEYS = new Set([
  "resourceKind",
  "role",
  "from",
  "to",
  "viewsRemaining",
  "burned",
  "decisionReason",
]);

function sanitizeMetadata(
  meta: NotificationMetadata | undefined,
): Record<string, string | number | boolean> {
  if (!meta || typeof meta !== "object") return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (
      ALLOWED_METADATA_KEYS.has(k) &&
      (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    ) {
      out[k] = v;
    }
  }
  return out;
}

export interface CreateNotificationInput {
  /** Recipient — the AFFECTED user (grantee / target / send creator). */
  userId: string;
  /** Context org. Null when the event has no org context. */
  orgId?: string | null;
  type: NotificationType;
  /** The actor who triggered the event (null for anonymous public callers). */
  actorUserId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  metadata?: NotificationMetadata;
}

/**
 * Insert one notification for the affected user, inside the caller's
 * transaction. NEVER notifies the actor about their own action — when
 * `userId === actorUserId` the insert is silently skipped (returns false).
 *
 * Checks user notification preferences before persisting.
 *
 * Returns true when a row was written, false when skipped (self-action or opted-out).
 */
export async function createNotification(tx: Tx, input: CreateNotificationInput): Promise<boolean> {
  // Self-action guard: don't notify a user about something they did themselves.
  if (input.actorUserId && input.userId === input.actorUserId) {
    return false;
  }

  // Preference check: fetch recipient's opt-out settings.
  const recipient = await tx.query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: { notificationPreferences: true },
  });

  if (recipient) {
    const prefs = recipient.notificationPreferences as Record<string, boolean>;
    const key = TYPE_TO_PREFERENCE[input.type];
    // Opt-out model: if key is missing (new pref) or literally true, we notify.
    // Only literal false disables.
    if (prefs[key] === false) {
      return false;
    }
  }

  await tx.insert(notifications).values({
    userId: input.userId,
    orgId: input.orgId ?? null,
    type: input.type,
    actorUserId: input.actorUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    targetName: input.targetName ?? null,
    metadata: sanitizeMetadata(input.metadata),
  });
  return true;
}
