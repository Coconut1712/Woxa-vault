"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Eye, EyeOff, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { copyWithAutoClear } from "@/lib/clipboard";

// On-screen reveal of a secret value auto-hides after 5s (AC-013.4). This is
// distinct from the clipboard auto-clear (30s, AC-014.3) handled below.
const REVEAL_HIDE_MS = 5_000;

interface SecretFieldProps {
  label: string;
  /**
   * The plaintext value. For fields whose secret is already in hand (text
   * fields, cached secrets), pass it directly. For on-demand reveal (e.g. a
   * password fetched only when shown/copied) leave this undefined and supply
   * `onReveal` instead.
   */
  value?: string;
  monospace?: boolean;
  type?: "text" | "secret";
  /**
   * Async resolver for the secret value, called the FIRST time the user clicks
   * show or copy. The resolved value is cached for the lifetime of the field so
   * subsequent show/hide/copy never refetch. Use this for secrets that should
   * only be fetched (and audited as a reveal) on demand.
   */
  onReveal?: () => Promise<string | null>;
}

export function SecretField({
  label,
  value,
  monospace,
  type = "secret",
  onReveal,
}: SecretFieldProps) {
  const t = useT();
  const [revealed, setRevealed] = useState(type === "text");
  const [copied, setCopied] = useState(false);
  const [autoHideAt, setAutoHideAt] = useState<number | null>(null);
  // Cache for an on-demand resolved secret. Once filled we never refetch.
  const [resolved, setResolved] = useState<string | null>(value ?? null);
  const [working, setWorking] = useState(false);
  // Cancels the pending best-effort clipboard clear from the last copy, so a
  // fresh copy supersedes the old timer and unmount doesn't leave it dangling.
  const clearClipboardRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => clearClipboardRef.current?.();
  }, []);

  // Keep the cache in sync if the parent passes a value directly (e.g. once it
  // has resolved an on-demand secret and re-renders with it).
  useEffect(() => {
    if (value !== undefined) setResolved(value);
  }, [value]);

  useEffect(() => {
    if (!autoHideAt) return;
    const remaining = autoHideAt - Date.now();
    if (remaining <= 0) {
      setRevealed(false);
      setAutoHideAt(null);
      return;
    }
    const timer = setTimeout(() => {
      setRevealed(false);
      setAutoHideAt(null);
    }, remaining);
    return () => clearTimeout(timer);
  }, [autoHideAt]);

  /**
   * Ensure the secret value is in hand. Returns the cached value, or resolves
   * it via `onReveal` exactly once. Returns null on failure (after toasting).
   */
  const ensureValue = async (): Promise<string | null> => {
    if (resolved !== null) return resolved;
    if (!onReveal) return value ?? null;
    setWorking(true);
    try {
      const next = await onReveal();
      setResolved(next ?? "");
      return next ?? "";
    } catch {
      toast.error(t("secret.reveal_failed"));
      return null;
    } finally {
      setWorking(false);
    }
  };

  const handleReveal = async () => {
    if (working) return;
    if (revealed) {
      setRevealed(false);
      setAutoHideAt(null);
      return;
    }
    const v = await ensureValue();
    if (v === null) return;
    setRevealed(true);
    setAutoHideAt(Date.now() + REVEAL_HIDE_MS);
  };

  const handleCopy = async () => {
    if (working) return;
    const v = await ensureValue();
    if (v === null) return;
    // Supersede any clear still pending from a previous copy before scheduling
    // the new one (AC-014.3 — real auto-clear after 30s).
    clearClipboardRef.current?.();
    const { ok, cancel } = await copyWithAutoClear(v);
    clearClipboardRef.current = cancel;
    if (!ok) {
      toast.error(t("toast.copy_failed"));
      return;
    }
    setCopied(true);
    toast.success(t("toast.field_copied", { label }), {
      description: t("secret.clipboard_clear"),
    });
    setTimeout(() => setCopied(false), 1500);
  };

  const plain = resolved ?? value ?? "";
  const display = revealed ? plain : "•".repeat(Math.min(plain.length || 12, 24));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
          {label}
        </label>
        {autoHideAt && (
          <span className="text-[10px] text-amber-400 flex items-center gap-1">
            <span className="size-1 rounded-full bg-amber-400 animate-pulse-soft" />
            {t("secret.hides_in_5s")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 group">
        <div
          className={`flex-1 px-3 py-2 bg-surface-1 border border-line-1 rounded-lg text-sm overflow-x-auto transition-colors ${
            revealed ? "border-line-3" : ""
          } ${monospace ? "font-mono-secret" : ""}`}
        >
          {display || <span className="text-muted-foreground">—</span>}
        </div>
        {type === "secret" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleReveal}
            type="button"
            disabled={working}
            aria-label={revealed ? t("secret.aria.hide") : t("secret.aria.reveal")}
          >
            {working ? (
              <Loader2 className="size-4 animate-spin" />
            ) : revealed ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          type="button"
          disabled={working}
          aria-label={t("secret.aria.copy")}
        >
          {copied ? (
            <Check className="size-4 text-emerald-400" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
