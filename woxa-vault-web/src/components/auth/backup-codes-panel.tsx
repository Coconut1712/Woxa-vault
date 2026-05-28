"use client";

/**
 * Display 10 plaintext backup codes with hard "save before close" controls.
 *
 * Used after both:
 *   - POST /auth/2fa/verify-enroll (initial enrollment)
 *   - POST /auth/2fa/regenerate-backup-codes (manual rotation)
 *
 * The confirm button is disabled until the user explicitly ticks the
 * "I have saved my backup codes" checkbox — the codes are returned ONCE and
 * losing them locks the user out of self-serve MFA recovery.
 */

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Check,
  CloudUpload,
  Copy,
  Download,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

interface Props {
  codes: string[];
  /** Confirm + close. Caller decides what's next (refresh /me, etc.). */
  onConfirm: () => void;
  /** Optional override for the action label (default: "Done"). */
  confirmLabel?: string;
}

export function BackupCodesPanel({ codes, onConfirm, confirmLabel }: Props) {
  const t = useT();
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      toast.success(t("auth.twofa.codes.copied"));
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("auth.twofa.codes.copy_failed"));
    }
  }, [codes, t]);

  const handleDownload = useCallback(() => {
    const lines = [
      "Woxa Vault — 2FA Backup Codes",
      "================================",
      `Generated: ${new Date().toISOString()}`,
      "",
      "Use any of these codes ONCE in place of a TOTP code if you lose your",
      "authenticator. Each code works exactly one time.",
      "",
      ...codes.map((code, i) => `${String(i + 1).padStart(2, "0")}. ${code}`),
      "",
      "Store this file somewhere safe (password manager, printed copy, etc.).",
      "Re-generating backup codes invalidates ALL of these.",
      "",
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "woxa-vault-backup-codes.txt";
    a.rel = "noreferrer noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [codes]);

  const handlePrint = useCallback(() => {
    // Isolated iframe to bypass the host stylesheet / dark mode.
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) {
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(buildPrintHtml(codes));
    doc.close();
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      return;
    }
    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };
    win.addEventListener("afterprint", cleanup);
    // Generous fallback in case the print dialog never fires afterprint.
    window.setTimeout(cleanup, 30_000);
    win.focus();
    win.print();
  }, [codes]);

  return (
    <div className="space-y-4">
      {/* Heavy danger-zone banner */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 px-3 py-2.5 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="size-4 mt-0.5 shrink-0" />
        <p className="text-xs leading-relaxed">
          {t("auth.twofa.codes.warning_one_time")}
        </p>
      </div>

      {/* Codes grid */}
      <div className="rounded-lg border border-line-2 bg-surface-1 p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {codes.map((code, i) => (
            <div
              key={code}
              className="flex items-center gap-2 font-mono text-sm select-all"
            >
              <span className="text-[10px] text-muted-foreground tabular-nums w-5 text-right">
                {String(i + 1).padStart(2, "0")}.
              </span>
              <code className="text-foreground tracking-wide">{code}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              {t("common.copied")}
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              {t("auth.twofa.codes.copy_all")}
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownload}
        >
          <Download className="size-3.5" />
          {t("auth.twofa.codes.download")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePrint}
        >
          <Printer className="size-3.5" />
          {t("auth.twofa.codes.print")}
        </Button>
      </div>

      {/* Cloud-sync warning for downloaded .txt — mirrors RecoveryKitModal. */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400">
        <CloudUpload className="size-3.5 mt-0.5 shrink-0" />
        <p className="text-[11px] leading-relaxed">
          {t("auth.twofa.codes.cloud_warning")}
        </p>
      </div>

      {/* Confirmation checkbox + Done */}
      <label
        htmlFor="twofa-codes-confirm"
        className={cn(
          "flex items-start gap-3 text-xs leading-relaxed cursor-pointer select-none rounded-lg border border-line-1 bg-surface-1 p-3",
          confirmed ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Checkbox
          id="twofa-codes-confirm"
          checked={confirmed}
          onCheckedChange={(next) => setConfirmed(Boolean(next))}
          className="mt-0.5"
        />
        <span>{t("auth.twofa.codes.confirm_saved")}</span>
      </label>

      <Button
        type="button"
        disabled={!confirmed}
        onClick={onConfirm}
        className="w-full h-10 bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {confirmLabel ?? t("common.done")}
      </Button>
    </div>
  );
}

function buildPrintHtml(codes: string[]): string {
  const rows = codes
    .map(
      (code, i) =>
        `<div class="row"><span class="num">${String(i + 1).padStart(
          2,
          "0",
        )}.</span><code>${escapeHtml(code)}</code></div>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" />
<meta name="referrer" content="no-referrer" />
<title>Woxa Vault — 2FA Backup Codes</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #111827;
    background: #ffffff;
    margin: 0;
    padding: 40px;
  }
  .card {
    max-width: 560px;
    margin: 0 auto;
    border: 2px solid #111827;
    border-radius: 16px;
    padding: 32px;
  }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .gen { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .num { color: #6b7280; font-size: 12px; width: 24px; text-align: right; }
  code {
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 16px;
    letter-spacing: 0.06em;
  }
  .warning {
    margin-top: 24px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 12px;
    line-height: 1.5;
  }
  @media print { body { padding: 0; } .card { border-color: #000; } }
</style>
</head>
<body>
  <div class="card">
    <h1>Woxa Vault — 2FA Backup Codes</h1>
    <div class="gen">Generated: ${escapeHtml(new Date().toLocaleString())}</div>
    <div class="grid">${rows}</div>
    <div class="warning">Each code works exactly once. Re-generating invalidates the entire list. Keep this page in a secure location.</div>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
