"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Loader2, AlertCircle, Eye, KeyRound, FileText } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SecretField } from "@/components/vault/secret-field";
import {
  listDisplayItemVersions,
  getDisplayItemVersion,
  type DisplayItemVersion,
  type ItemVersionSummary,
} from "@/lib/items-overlay";
import { ApiError } from "@/lib/api/client";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";

interface Props {
  itemId: string;
  /** ZK vaults need the vault key to decrypt revealed version content. */
  vaultKey?: Uint8Array;
  /** Reload signal — bump after an edit so a freshly snapshotted version shows. */
  reloadToken?: number;
}

export function ItemVersionsSection({ itemId, vaultKey, reloadToken }: Props) {
  const t = useT();

  const [versions, setVersions] = useState<ItemVersionSummary[]>([]);
  const [canReveal, setCanReveal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The version currently open in the reveal dialog (null = closed).
  const [active, setActive] = useState<DisplayItemVersion | null>(null);
  const [revealing, setRevealing] = useState<number | null>(null);
  const [revealError, setRevealError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    listDisplayItemVersions(itemId, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setVersions(res.versions);
        setCanReveal(res.canReveal);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, "network_error", String(err)),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [itemId, reloadKey, reloadToken]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const openVersion = useCallback(
    async (version: number) => {
      setRevealing(version);
      setRevealError(false);
      try {
        const content = await getDisplayItemVersion(
          itemId,
          version,
          undefined,
          vaultKey,
        );
        setActive(content);
      } catch {
        setRevealError(true);
      } finally {
        setRevealing(null);
      }
    },
    [itemId, vaultKey],
  );

  return (
    <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
        <History className="size-3.5 text-violet-600 dark:text-violet-400" />
        {t("item.versions.title")}
      </h2>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("item.versions.loading")}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="size-3.5 text-rose-600 dark:text-rose-400" />
            {t("item.versions.error")}
          </span>
          <button
            onClick={retry}
            className="text-xs font-medium text-brand hover:underline"
          >
            {t("item.versions.retry")}
          </button>
        </div>
      ) : versions.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {t("item.versions.empty")}
        </p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {versions.map((v) => (
              <li
                key={v.version}
                className="flex items-center gap-3 rounded-xl border border-line-1 bg-surface-1 px-3 py-2.5"
              >
                <span className="shrink-0 inline-flex items-center justify-center min-w-9 h-6 px-2 rounded-md bg-surface-2 border border-line-2 text-xs font-medium tabular-nums text-foreground/80">
                  {t("item.versions.label", { n: v.version })}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground/90 truncate">
                    <span className="font-mono-secret">{v.editedByEmail}</span>
                  </p>
                  <p className="text-xs text-muted-foreground" title={v.createdAt}>
                    {timeAgo(v.createdAt)}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  {v.hasPassword && (
                    <Badge
                      variant="outline"
                      className="border-line-2 bg-surface-2 text-foreground/70 gap-1 text-[10px]"
                    >
                      <KeyRound className="size-2.5" />
                      {t("item.versions.has_password")}
                    </Badge>
                  )}
                  {v.hasNotes && (
                    <Badge
                      variant="outline"
                      className="border-line-2 bg-surface-2 text-foreground/70 gap-1 text-[10px]"
                    >
                      <FileText className="size-2.5" />
                      {t("item.versions.has_notes")}
                    </Badge>
                  )}
                </div>
                {canReveal && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    disabled={revealing !== null}
                    onClick={() => void openVersion(v.version)}
                    aria-label={t("item.versions.view_aria", { n: v.version })}
                    title={t("item.versions.view")}
                  >
                    {revealing === v.version ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {versions.length >= 10 && (
            <p className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
              {t("item.versions.cap_note", { n: 10 })}
            </p>
          )}

          {revealError && (
            <p className="mt-3 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="size-3.5" />
              {t("item.versions.reveal_failed")}
            </p>
          )}
        </>
      )}

      <Dialog
        open={active !== null}
        onOpenChange={(o) => {
          if (!o) setActive(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t("item.versions.dialog_title", { n: active.version })}
                </DialogTitle>
                <DialogDescription>
                  {t("item.versions.dialog_desc", {
                    when: formatDateTime(active.createdAt),
                    email: active.editedByEmail,
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {active.username && (
                  <SecretField
                    label={t("item.username")}
                    value={active.username}
                    type="text"
                  />
                )}
                {active.password && (
                  <SecretField
                    label={t("item.password")}
                    value={active.password}
                    monospace
                  />
                )}
                {active.url && (
                  <SecretField
                    label={t("item.url")}
                    value={active.url}
                    type="text"
                  />
                )}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    {t("item.notes")}
                  </label>
                  {active.notesPlain ? (
                    <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/80 leading-relaxed px-3 py-2 bg-surface-1 border border-line-1 rounded-lg">
                      {active.notesPlain}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground italic px-3 py-2 bg-surface-1 border border-dashed border-line-2 rounded-lg">
                      {t("item.versions.no_notes")}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
