/**
 * Shared post-auth workspace-routing predicate.
 *
 * Both `SessionGuard` (which bounces no-workspace users out of /app to /spaces)
 * and the /spaces page (which bounces users who DO have a workspace into /app)
 * read membership state through this single helper so the two surfaces can
 * never disagree and trap the user in a redirect loop.
 *
 * Resolution rules — order matters, first definite signal wins:
 *   1. `hasWorkspace` boolean (preferred) when present.
 *   2. `workspaceCount` number → membership iff `> 0`.
 *   3. Neither field present (older backend) → UNKNOWN.
 *
 * UNKNOWN fails OPEN: `needsWorkspaceSelection` returns `false`, so existing
 * users on a backend that predates these fields are NEVER bounced into /spaces.
 */

import type { MeUser } from "@/lib/api/me";

/**
 * True only when the user's membership resolves to an explicit "no workspace".
 * Returns false for both "has a workspace" and "unknown" (fail open).
 */
export function needsWorkspaceSelection(me: MeUser): boolean {
  if (typeof me.hasWorkspace === "boolean") {
    return me.hasWorkspace === false;
  }
  if (typeof me.workspaceCount === "number") {
    return me.workspaceCount <= 0;
  }
  return false;
}
