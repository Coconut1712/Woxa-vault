"use client";

/**
 * Shared password policy primitives used by every Master Password entry
 * surface in the app:
 *
 *   - /setup-password (post-SSO mandatory password setup)
 *   - /forgot-password (reset with recovery kit)
 *   - /invite/[token] (signup-and-accept)
 *
 * Backend enforces `password.length >= 10` only; the other checks are
 * recommendations the meter visualises but does not block on.
 */

import { Check, X } from "lucide-react";

import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export interface PasswordChecks {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  digit: boolean;
  special: boolean;
}

export function evaluatePassword(password: string): PasswordChecks {
  return {
    minLength: password.length >= 10,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function StrengthMeter({ checks }: { checks: PasswordChecks }) {
  const t = useT();
  const score =
    (checks.minLength ? 1 : 0) +
    (checks.uppercase ? 1 : 0) +
    (checks.lowercase ? 1 : 0) +
    (checks.digit ? 1 : 0) +
    (checks.special ? 1 : 0);

  const tone =
    score <= 2
      ? { fill: "bg-rose-500", label: t("invite.signup.strength.weak") }
      : score === 3
        ? { fill: "bg-amber-500", label: t("invite.signup.strength.fair") }
        : score === 4
          ? { fill: "bg-blue-500", label: t("invite.signup.strength.good") }
          : { fill: "bg-emerald-500", label: t("invite.signup.strength.strong") };

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {t("invite.signup.strength_label")}
        </span>
        <span className="text-[11px] font-medium tabular-nums">
          {tone.label}
        </span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((step) => (
          <div
            key={step}
            className={cn(
              "h-1 flex-1 rounded-full",
              step <= score ? tone.fill : "bg-surface-3",
            )}
          />
        ))}
      </div>
      <ul className="space-y-1 pt-1">
        <PolicyItem
          ok={checks.minLength}
          required
          label={t("invite.signup.policy.min_length")}
        />
        <PolicyItem
          ok={checks.uppercase}
          label={t("invite.signup.policy.recommend_uppercase")}
        />
        <PolicyItem
          ok={checks.lowercase}
          label={t("invite.signup.policy.recommend_lowercase")}
        />
        <PolicyItem
          ok={checks.digit}
          label={t("invite.signup.policy.recommend_digit")}
        />
        <PolicyItem
          ok={checks.special}
          label={t("invite.signup.policy.recommend_special")}
        />
      </ul>
    </div>
  );
}

function PolicyItem({
  ok,
  required,
  label,
}: {
  ok: boolean;
  required?: boolean;
  label: string;
}) {
  return (
    <li className="flex items-center gap-2 text-[11px]">
      <span
        className={cn(
          "size-3.5 rounded-full flex items-center justify-center shrink-0",
          ok
            ? "bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : required
              ? "bg-rose-500/[0.10] dark:bg-rose-500/[0.04] text-rose-700 dark:text-rose-300"
              : "bg-surface-2 text-muted-foreground",
        )}
      >
        {ok ? <Check className="size-2.5" /> : <X className="size-2.5" />}
      </span>
      <span
        className={cn(
          ok
            ? "text-foreground/90"
            : required
              ? "text-rose-700 dark:text-rose-300"
              : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </li>
  );
}
