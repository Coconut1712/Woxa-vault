"use client";

/**
 * SessionGuard — bounces the user back to /login when AuthProvider reports
 * "unauthenticated". Renders a quiet splash while the initial /auth/me + /me
 * checks are in flight so the protected tree never paints with stale state.
 *
 * Post-auth routing ladder (order matters — first match wins):
 *   1. `me.requiresPasswordSetup === true` → /setup-password (SSO JIT user with
 *      no local Master Password yet).
 *   2. else workspace membership resolved to NONE → /spaces (user must create
 *      or join a workspace before reaching /app). "Resolved to NONE" means
 *      `hasWorkspace === false` OR `workspaceCount === 0`; an UNKNOWN value
 *      (older backend that omits both fields) fails OPEN to /app so existing
 *      users are never bounced into /spaces by mistake.
 *   3. else `me.requiresTwoFactorEnroll === true` → /setup-2fa (the user's
 *      workspace mandates 2FA but the user has none enrolled). This rung sits
 *      AFTER workspace selection on purpose: the policy only applies once the
 *      user actually belongs to a workspace, so we must resolve membership
 *      first. UNKNOWN (older backend that omits the field) fails OPEN to /app.
 *   4. else → render /app.
 *
 * /setup-password, /spaces and /setup-2fa all live OUTSIDE /app and run their
 * own auth checks, so they are NOT wrapped by this guard — which is exactly
 * what keeps steps 2 and 3 from looping (a user sent to one of those pages is
 * not re-guarded).
 *
 * Rendering policy (security-critical — see WARN-12):
 *   - We MUST NOT render `children` until BOTH `status === "authenticated"`
 *     AND `me !== null` AND `!me.requiresPasswordSetup` AND the user is not
 *     pending a workspace-selection redirect.
 *   - In particular `status === "authenticated" && me === null` is NOT a
 *     safe-to-render state: we can't yet tell whether the user owes a
 *     password setup, so allowing children would let a JIT-provisioned SSO
 *     user see protected content for a frame before the redirect lands.
 *
 * TODO (Phase B — server-side enforcement): this guard is client-side only.
 * Move primary enforcement to a Next.js `middleware.ts` that checks the
 * Lucia session cookie on navigation, and keep this component only as a UX
 * fallback / setup-wall gate. See security audit WARN-12.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { useAuth } from "./provider";
import { needsWorkspaceSelection } from "./workspace-routing";
import { useT } from "@/lib/i18n/provider";

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { status, me } = useAuth();
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
      return;
    }
    if (status !== "authenticated" || !me) return;
    // Step 1: Master Password setup wall takes precedence over everything.
    if (me.requiresPasswordSetup) {
      router.replace("/setup-password");
      return;
    }
    // Step 2: workspace-selection wall. Only bounce when membership resolves
    // to an explicit NONE — unknown (older backend) falls through to /app.
    if (needsWorkspaceSelection(me)) {
      router.replace("/spaces");
      return;
    }
    // Step 3: forced-2FA-enrollment wall. The policy only applies once the user
    // has a workspace, so this runs AFTER the membership check. `undefined`
    // (older backend) fails open to /app.
    if (me.requiresTwoFactorEnroll === true) {
      router.replace("/setup-2fa");
      return;
    }
    // Step 4: Zero-Knowledge migration wall.
    if (me.isZeroKnowledge === false) {
      router.replace("/upgrade");
    }
  }, [status, me, router]);

  // Only render protected content once we have BOTH a confirmed session
  // and a fully loaded profile, AND the profile does not require setup,
  // AND the user is not awaiting a workspace-selection OR forced-2FA redirect.
  // Any other combination (loading, unauthenticated, me still null,
  // requiresPasswordSetup true, no-workspace, requiresTwoFactorEnroll true,
  // isZeroKnowledge false) shows the splash.
  const ready =
    status === "authenticated" &&
    me !== null &&
    !me.requiresPasswordSetup &&
    !needsWorkspaceSelection(me) &&
    me.requiresTwoFactorEnroll !== true &&
    me.isZeroKnowledge !== false;

  if (ready) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="size-9 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
          <ShieldCheck className="size-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="size-3 border-2 border-current border-r-transparent rounded-full animate-spin" />
          <span>{t("auth.checking_session")}</span>
        </div>
      </div>
    </div>
  );
}
