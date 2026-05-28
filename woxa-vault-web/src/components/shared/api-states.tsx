"use client";

/**
 * Shared loading / error / empty states for API-backed pages.
 *
 * Keep these dumb (no fetch logic) so each page can compose them freely.
 * Always pair `bg-*` with a `dark:` counterpart so the colored states behave
 * in both themes — see AGENTS.md "Light/Dark Color Pattern".
 */

import { AlertCircle, Loader2, RefreshCw, ShieldX } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";

interface ErrorStateProps {
  error: ApiError;
  onRetry?: () => void;
  /** Inline (small) vs full-page hero. */
  variant?: "page" | "inline";
}

export function ApiErrorState({ error, onRetry, variant = "page" }: ErrorStateProps) {
  const t = useT();

  const isForbidden = error.code === "forbidden";
  const isNotFound = error.code === "not_found";
  const isNetwork = error.code === "network_error" || error.status === 0;

  const Icon: LucideIcon = isForbidden ? ShieldX : AlertCircle;
  const title = isForbidden
    ? t("api.error.forbidden_title")
    : isNotFound
      ? t("api.error.not_found_title")
      : t("api.error.title");
  const description = isForbidden
    ? t("api.error.forbidden_desc")
    : isNotFound
      ? t("api.error.not_found_desc")
      : isNetwork
        ? t("api.error.network")
        : t("api.error.generic");

  return (
    <div
      className={
        variant === "page"
          ? "flex flex-col items-center justify-center py-24 text-center px-6"
          : "flex flex-col items-center justify-center py-10 text-center px-6"
      }
    >
      <div className="size-14 rounded-2xl bg-rose-500/[0.06] dark:bg-rose-500/[0.02] ring-1 ring-rose-500/30 dark:ring-rose-500/10 flex items-center justify-center mb-4">
        <Icon className="size-6 text-rose-700 dark:text-rose-300" />
      </div>
      <h3 className="font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">{description}</p>
      {onRetry && !isForbidden && !isNotFound && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> {t("api.retry")}
        </Button>
      )}
    </div>
  );
}

interface LoadingStateProps {
  variant?: "page" | "inline";
  label?: string;
}

export function ApiLoadingState({ variant = "page", label }: LoadingStateProps) {
  const t = useT();
  return (
    <div
      className={
        variant === "page"
          ? "flex flex-col items-center justify-center py-24 text-muted-foreground text-sm gap-3"
          : "flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-3"
      }
    >
      <Loader2 className="size-4 animate-spin" />
      <span>{label ?? t("api.loading")}</span>
    </div>
  );
}

/** Lightweight skeleton row used in lists while data streams in. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-8 py-3 animate-pulse">
          <div className="size-9 rounded-lg bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-surface-2" />
            <div className="h-2.5 w-24 rounded bg-surface-2/60" />
          </div>
          <div className="h-3 w-16 rounded bg-surface-2/60" />
        </div>
      ))}
    </div>
  );
}

/** Card-grid skeleton (used for dashboard vault grid). */
export function VaultGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-card card-elevated shadow-card p-5 min-h-[140px] animate-pulse"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="size-11 rounded-xl bg-surface-2" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 rounded bg-surface-2" />
              <div className="h-2.5 w-44 rounded bg-surface-2/60" />
            </div>
          </div>
          <div className="pt-3 border-t border-line-1">
            <div className="h-2.5 w-24 rounded bg-surface-2/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
