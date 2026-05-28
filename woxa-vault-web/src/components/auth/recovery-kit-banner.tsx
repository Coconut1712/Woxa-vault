"use client";

/**
 * RecoveryKitBanner — persistent, dismissable-only-by-fixing banner shown at
 * the top of every /app page when the signed-in user no longer has an active
 * recovery kit (e.g. they just reset their password via /forgot-password and
 * haven't generated a new kit yet).
 *
 * Click-through routes the user to Account Settings → Security tab where the
 * "Regenerate Recovery Kit" card lives. The banner stays visible until the
 * underlying /me state flips back to `hasRecoveryKit: true`, which the auth
 * provider re-reads after the modal flow completes.
 */

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { useAuth } from "@/lib/auth/provider";
import { useT } from "@/lib/i18n/provider";

export function RecoveryKitBanner() {
  const { me, status } = useAuth();
  const t = useT();

  if (status !== "authenticated" || !me) return null;
  if (me.requiresPasswordSetup) return null;
  if (me.hasRecoveryKit) return null;

  return (
    <div className="px-4 sm:px-6 pt-3">
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/[0.10] dark:bg-amber-500/[0.05] px-3 py-2.5 text-amber-900 dark:text-amber-200"
      >
        <AlertTriangle className="size-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="flex-1 text-xs leading-relaxed">
          {t("auth.banner.regenerate_recovery")}
        </div>
        <Link
          href="/app/account"
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 dark:text-amber-200 hover:text-amber-950 dark:hover:text-amber-100 whitespace-nowrap"
        >
          {t("auth.banner.regenerate_recovery_action")}
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
