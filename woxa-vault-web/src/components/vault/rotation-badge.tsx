"use client";

/**
 * RotationBadge — the 🟢🟡🔴 password-rotation status pill (US-060 / AC-060.3).
 *
 * Server computes `rotationStatus` from `passwordChangedAt` + the effective
 * policy (item override ?? org default). We just render it:
 *   fresh   → emerald  (due > 14 days away)
 *   due     → amber    (within 14 days, not past)
 *   overdue → rose     (past the due date)
 *   none    → nothing  (no policy applies / no password)
 *
 * `variant="dot"` renders just a colored status dot (for dense list rows);
 * `variant="badge"` renders the full pill with a label + the due date.
 */

import { RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import {
  ROTATION_DAYS_MAX,
  ROTATION_DAYS_MIN,
} from "@/lib/api/workspace-settings";
import type { RotationStatus } from "@/lib/api/types";

const STYLES: Record<
  "fresh" | "due" | "overdue",
  { badge: string; dot: string; label: string }
> = {
  fresh: {
    badge:
      "border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    label: "rotation.status.fresh",
  },
  due: {
    badge:
      "border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    label: "rotation.status.due",
  },
  overdue: {
    badge:
      "border-rose-500/30 dark:border-rose-500/20 bg-rose-500/15 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
    label: "rotation.status.overdue",
  },
};

export function RotationBadge({
  status,
  dueAt,
  variant = "badge",
  className,
}: {
  status: RotationStatus | undefined;
  dueAt?: string | null;
  variant?: "badge" | "dot";
  className?: string;
}) {
  const t = useT();
  if (!status || status === "none") return null;
  const style = STYLES[status];
  const label = t(style.label);

  if (variant === "dot") {
    const aria = dueAt
      ? t("rotation.dot_aria", { label, when: formatDate(dueAt) })
      : label;
    return (
      <span
        role="img"
        aria-label={aria}
        title={aria}
        className={cn("inline-block size-2 rounded-full shrink-0", style.dot, className)}
      />
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] gap-1", style.badge, className)}
    >
      <RotateCw className="size-2.5" />
      {dueAt ? t("rotation.badge_with_date", { label, when: formatDate(dueAt) }) : label}
    </Badge>
  );
}

/**
 * Parse the rotation-policy text input into the wire value: a positive integer
 * within [1, 3650], or `null` to inherit the org default. Empty / 0 / garbage
 * all collapse to `null` (the backend clamps too — this just keeps the UI honest).
 */
export function parseRotationDays(raw: string): number | null {
  const n = Math.round(Number(raw.trim()));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(ROTATION_DAYS_MAX, Math.max(ROTATION_DAYS_MIN, n));
}

/**
 * The "Rotation policy: every N days" form field shared by the new-/edit-item
 * dialogs (US-060 / AC-060.1). An empty value inherits the workspace default.
 */
export function RotationPolicyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
        {t("rotation.policy.label")}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={ROTATION_DAYS_MIN}
          max={ROTATION_DAYS_MAX}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("rotation.policy.placeholder")}
          className="h-9 max-w-44"
        />
        <span className="text-xs text-muted-foreground">
          {t("rotation.policy.unit")}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/80">
        {t("rotation.policy.hint")}
      </p>
    </div>
  );
}
