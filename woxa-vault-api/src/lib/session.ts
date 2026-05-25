import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, ne } from "drizzle-orm";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import { db } from "@/db/client";
import { sessions, type Session } from "@/db/schema";
import { env } from "@/config/env";

// ---------------------------------------------------------------------------
// Session manager (DESIGN.md §7.6 + Lucia v3 best practices).
//
// Threat model:
// - Asset: session token (auth bearer). If leaked, attacker can impersonate.
// - Adversary: network attacker (cookie theft), insider with DB access.
// - Mitigations:
//   * Token = 20 bytes random → base32 (32 chars) sent to client only once.
//   * DB stores ONLY SHA-256(token); raw token never persisted.
//     => DB leak cannot replay sessions.
//   * Cookie is HttpOnly + Secure (prod) + SameSite=Lax + signed by browser.
//   * Sliding expiry: refresh when half life remaining.
// - Residual risk: XSS in web app could read non-HttpOnly local storage —
//   we use HttpOnly cookie specifically to mitigate this.
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = env.SESSION_TTL_SECONDS * 1000;
const REFRESH_WINDOW_MS = SESSION_TTL_MS / 2;
// Hard ceiling — past this point a session is force-expired regardless of
// activity. WARN-2 mitigation: prevents an attacker who steals a session
// token from sliding it forward forever by polling. 30 days picked to
// comfortably exceed any reasonable continuous-use window for a daily app.
const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionMetadata {
  ipHash?: string;
  userAgent?: string;
  deviceName?: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  // 20 bytes → 32 base32 chars; ~160 bits entropy.
  const bytes = randomBytes(20);
  return encodeBase32LowerCaseNoPadding(bytes);
}

export async function createSession(
  userId: string,
  metadata: SessionMetadata = {},
): Promise<{ token: string; session: Session }> {
  const token = generateSessionToken();
  const sessionId = hashToken(token);
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS);
  const absoluteExpiresAt = new Date(now + SESSION_ABSOLUTE_TTL_MS);

  const [session] = await db
    .insert(sessions)
    .values({
      id: sessionId,
      userId,
      expiresAt,
      absoluteExpiresAt,
      // WARN-I: a fresh session = the user has just proved identity (password
      // login or SSO callback). Initial state is unlocked so they don't get
      // bounced straight into a lock prompt. The 15-minute idle window then
      // takes over.
      vaultUnlockedAt: new Date(now),
      ipHash: metadata.ipHash,
      userAgent: metadata.userAgent,
      deviceName: metadata.deviceName,
    })
    .returning();

  if (!session) {
    throw new Error("failed to create session");
  }

  return { token, session };
}

export interface ValidatedSession {
  session: Session;
  fresh: boolean; // true if expiry was extended this validation
}

export async function validateSessionToken(token: string): Promise<ValidatedSession | null> {
  const sessionId = hashToken(token);
  const row = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!row) return null;
  if (row.revokedAt) return null;

  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    // Expired — clean up lazily.
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Absolute-expiry ceiling — see SESSION_ABSOLUTE_TTL_MS comment. Past this
  // point we refuse to extend the session even if it is still inside the
  // sliding window. Treat as fully expired and reap the row.
  if (row.absoluteExpiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Sliding window: if more than half the TTL has elapsed, extend — but never
  // beyond `absolute_expires_at`. The min() clamp is what enforces the hard
  // ceiling: once we are within the last sliding-TTL of the absolute ceiling
  // the session stops moving forward and will expire on schedule.
  let fresh = false;
  let session = row;
  if (row.expiresAt.getTime() - now < REFRESH_WINDOW_MS) {
    const candidate = now + SESSION_TTL_MS;
    const newExpiresAt = new Date(Math.min(candidate, row.absoluteExpiresAt.getTime()));
    const [updated] = await db
      .update(sessions)
      .set({ expiresAt: newExpiresAt, lastActiveAt: new Date() })
      .where(eq(sessions.id, sessionId))
      .returning();
    if (updated) {
      session = updated;
      fresh = newExpiresAt.getTime() !== row.expiresAt.getTime();
    }
  }

  return { session, fresh };
}

export async function invalidateSessionToken(token: string): Promise<void> {
  const sessionId = hashToken(token);
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// F-09: revoke every session belonging to `userId` except `keepSessionId`. Used
// by /auth/2fa/disable so a 2FA removal terminates any parallel session that
// might already be open on another device (e.g. an attacker who learned the
// password but not the 2FA factor — once 2FA is off, every prior cookie
// becomes a single-factor bearer token and must be re-minted).
export async function invalidateOtherSessions(
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

// WARN-I: stamp the Phase A.5 vault-unlock timestamp on a single session row.
// Called from POST /me/verify-password (after the master password verifies)
// and POST /me/sessions/revoke-all (caller just re-proved the master password
// — that proof gates BOTH the revoke action and the unlock).
//
// Threat model: the column is per-session, so unlocking session A does NOT
// unlock session B held by a parallel attacker. Each cookie-bearer must
// produce the master password to clear the lock for its own row.
export async function markSessionVaultUnlocked(token: string): Promise<void> {
  const sessionId = hashToken(token);
  await db
    .update(sessions)
    .set({ vaultUnlockedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

// Background-friendly cleanup; safe to call from cron later.
export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = env.SESSION_COOKIE_NAME;

export function buildSessionCookie(token: string, expiresAt: Date): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}`,
  ];
  if (env.SESSION_COOKIE_SECURE) attrs.push("Secure");
  if (env.SESSION_COOKIE_DOMAIN) attrs.push(`Domain=${env.SESSION_COOKIE_DOMAIN}`);
  return attrs.join("; ");
}

export function buildClearSessionCookie(): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  if (env.SESSION_COOKIE_SECURE) attrs.push("Secure");
  if (env.SESSION_COOKIE_DOMAIN) attrs.push(`Domain=${env.SESSION_COOKIE_DOMAIN}`);
  return attrs.join("; ");
}
