"use client";

/**
 * RecoveryKitModal — one-time display surface for a freshly generated recovery
 * code. By spec this modal is HARD-BLOCKING:
 *
 *   - Cannot be dismissed by ESC or clicking the backdrop.
 *   - The "Continue" button is disabled until BOTH confirmation checkboxes
 *     are ticked.
 *   - There is no X button.
 *
 * The backing code is plaintext and shown exactly once — losing it means the
 * user cannot self-serve a password reset, so the UX deliberately removes
 * every accidental-close vector.
 *
 * Used from three call sites:
 *   - /setup-password (after POST /me/password/setup)
 *   - Account → Recovery Kit → Regenerate (after POST /me/recovery-kit/regenerate)
 *   - /invite/[token] signup (after POST /invite/:token/signup-and-accept)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CloudUpload, Copy, Download, Printer, ShieldCheck, FileText } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Auto-clear interval for the OS clipboard after copying the recovery code.
 * Mirrors AC-014.2 (clipboard auto-clear for passwords) — the recovery code is
 * at least as sensitive, so we apply the same rule.
 */
const CLIPBOARD_CLEAR_MS = 30_000;
const CLIPBOARD_TICK_MS = 1_000;
/** Fallback for printed-iframe cleanup if `afterprint` never fires. */
const PRINT_FALLBACK_CLEANUP_MS = 30_000;

export type RecoveryKitContext = "setup" | "regenerate" | "signup";

interface RecoveryKitModalProps {
  /** The plaintext recovery mnemonic from the backend. */
  recoveryCode: string;
  /**
   * Called when the user ticks both confirmation boxes and presses Continue.
   * The component does not close itself — the caller decides what comes next
   * (e.g. redirect to /app, refresh /me, dismiss).
   */
  onConfirm: () => void;
  /**
   * Controls the modal copy. Each context tweaks the headline so the user
   * understands why they are seeing this screen.
   */
  context: RecoveryKitContext;
}

/** Lifecycle states for the "Copy" button text + countdown. */
type CopyState =
  | { status: "idle" }
  | { status: "copied"; remainingSeconds: number }
  | { status: "cleared" };

export function RecoveryKitModal({
  recoveryCode,
  onConfirm,
  context,
}: RecoveryKitModalProps) {
  const t = useT();
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [understoodConfirmed, setUnderstoodConfirmed] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>({ status: "idle" });
  const copyTimersRef = useRef<{
    interval: number | null;
    timeout: number | null;
  }>({ interval: null, timeout: null });
  const printCleanupRef = useRef<(() => void) | null>(null);

  // Lock body scroll while the modal is mounted.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Swallow ESC at the window level — base-ui Dialog isn't used here so we
  // implement the no-close behaviour ourselves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Clean up the clipboard / print iframe timers on unmount.
  useEffect(() => {
    return () => {
      const { interval, timeout } = copyTimersRef.current;
      if (interval !== null) window.clearInterval(interval);
      if (timeout !== null) window.clearTimeout(timeout);
      printCleanupRef.current?.();
    };
  }, []);

  const title = useMemo(() => {
    if (context === "regenerate") return t("recovery_kit_modal.title.regenerate");
    if (context === "signup") return t("recovery_kit_modal.title.signup");
    return t("recovery_kit_modal.title.setup");
  }, [context, t]);

  const canContinue = savedConfirmed && understoodConfirmed;

  const clearClipboardTimers = useCallback(() => {
    const timers = copyTimersRef.current;
    if (timers.interval !== null) {
      window.clearInterval(timers.interval);
      timers.interval = null;
    }
    if (timers.timeout !== null) {
      window.clearTimeout(timers.timeout);
      timers.timeout = null;
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(recoveryCode);
    } catch {
      toast.error(t("recovery_kit_modal.copy_failed"));
      return;
    }

    clearClipboardTimers();

    const totalSeconds = Math.floor(CLIPBOARD_CLEAR_MS / 1000);
    setCopyState({ status: "copied", remainingSeconds: totalSeconds });

    copyTimersRef.current.interval = window.setInterval(() => {
      setCopyState((prev) => {
        if (prev.status !== "copied") return prev;
        const next = prev.remainingSeconds - 1;
        if (next <= 0) {
          if (copyTimersRef.current.interval !== null) {
            window.clearInterval(copyTimersRef.current.interval);
            copyTimersRef.current.interval = null;
          }
          return { status: "copied", remainingSeconds: 0 };
        }
        return { status: "copied", remainingSeconds: next };
      });
    }, CLIPBOARD_TICK_MS);

    copyTimersRef.current.timeout = window.setTimeout(() => {
      navigator.clipboard.writeText("").catch(() => {});
      setCopyState({ status: "cleared" });
      clearClipboardTimers();
      window.setTimeout(() => {
        setCopyState((prev) =>
          prev.status === "cleared" ? { status: "idle" } : prev,
        );
      }, 4000);
    }, CLIPBOARD_CLEAR_MS);
  }, [clearClipboardTimers, recoveryCode, t]);

  const handleDownloadPdf = useCallback(() => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(99, 102, 241); // #6366f1
    doc.text("Woxa Vault", 20, 20);
    
    doc.setFontSize(18);
    doc.setTextColor(17, 24, 39); // #111827
    doc.text(title, 20, 35);
    
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128); // #6b7280
    doc.text(`${t("recovery_kit_modal.print.generated_label")}: ${dateStr}`, 20, 42);
    
    // Recovery Words
    doc.setFontSize(12);
    doc.setTextColor(17, 24, 39);
    doc.text(t("recovery_kit_modal.code_label"), 20, 55);
    
    const words = recoveryCode.split(" ");
    doc.setFont("courier", "bold");
    doc.setFontSize(14);
    
    // Grid of 3 columns
    for (let i = 0; i < words.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 25 + col * 60;
      const y = 65 + row * 10;
      doc.text(`${String(i + 1).padStart(2, "0")}. ${words[i]}`, x, y);
    }
    
    // Warning
    doc.setDrawColor(254, 202, 202); // #fecaca
    doc.setFillColor(254, 242, 242); // #fef2f2
    doc.roundedRect(20, 150, 170, 25, 3, 3, "FD");
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(153, 27, 27); // #991b1b
    const warningLines = doc.splitTextToSize(t("recovery_kit_modal.warning_one_time"), 160);
    doc.text(warningLines, 25, 158);
    
    // Instructions
    doc.setTextColor(55, 65, 81); // #374151
    const instructionLines = doc.splitTextToSize(t("recovery_kit_modal.download.instructions"), 170);
    doc.text(instructionLines, 20, 185);
    
    doc.save(`woxa-recovery-kit-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success(t("recovery_kit_modal.download_success"));
  }, [recoveryCode, t, title]);

  const handlePrint = useCallback(() => {
    printCleanupRef.current?.();
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
    doc.write(
      buildPrintHtml(recoveryCode, {
        heading: t("recovery_kit_modal.print.heading"),
        warning: t("recovery_kit_modal.warning_one_time"),
        generatedAt: new Date().toLocaleString(),
        generatedLabel: t("recovery_kit_modal.print.generated_label"),
        instructions: t("recovery_kit_modal.download.instructions"),
      }),
    );
    doc.close();
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      return;
    }

    let removed = false;
    let fallback: number | null = null;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      if (fallback !== null) window.clearTimeout(fallback);
      try {
        win.removeEventListener("afterprint", cleanup);
      } catch {}
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      if (printCleanupRef.current === cleanup) {
        printCleanupRef.current = null;
      }
    };

    win.addEventListener("afterprint", cleanup);
    fallback = window.setTimeout(cleanup, PRINT_FALLBACK_CLEANUP_MS);
    printCleanupRef.current = cleanup;

    win.focus();
    win.print();
  }, [recoveryCode, t]);

  const copyLabel =
    copyState.status === "copied"
      ? copyState.remainingSeconds > 0
        ? t("recovery_kit_modal.action.copied_with_countdown", {
            seconds: copyState.remainingSeconds,
          })
        : t("recovery_kit_modal.action.copied")
      : copyState.status === "cleared"
        ? t("recovery_kit_modal.action.clipboard_cleared")
        : t("recovery_kit_modal.action.copy");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-kit-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto bg-card border border-border rounded-2xl shadow-card card-elevated">
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand shrink-0">
              <ShieldCheck className="size-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="recovery-kit-modal-title"
                className="text-lg font-semibold tracking-tight"
              >
                {title}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("recovery_kit_modal.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2.5 text-rose-700 dark:text-rose-300">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed">
              {t("recovery_kit_modal.warning_one_time")}
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t("recovery_kit_modal.code_label")}
            </div>
            <div className="rounded-lg border border-line-2 bg-surface-1 p-5 shadow-inner">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {recoveryCode.split(" ").map((word, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-muted-foreground w-4 tabular-nums">
                      {idx + 1}.
                    </span>
                    <span className="text-sm font-semibold tracking-wide font-mono text-foreground">
                      {word}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopy()}
                className="h-9 px-3"
              >
                <Copy className="size-3.5" />
                {copyLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                className="h-9 px-3 border-brand/20 bg-brand/[0.03] text-brand hover:bg-brand/[0.08]"
              >
                <FileText className="size-3.5" />
                {t("recovery_kit_modal.action.download_pdf")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-9 px-3"
              >
                <Printer className="size-3.5" />
                {t("recovery_kit_modal.action.print")}
              </Button>
            </div>
            
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400">
              <CloudUpload className="size-3.5 mt-0.5 shrink-0" />
              <p className="text-[11px] leading-relaxed">
                {t("recovery_kit_modal.download_confirm.body")}
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-line-1 bg-surface-1 p-3">
            <ConfirmRow
              checked={savedConfirmed}
              onChange={setSavedConfirmed}
              label={t("recovery_kit_modal.checkbox.saved")}
              id="rk-confirm-saved"
            />
            <ConfirmRow
              checked={understoodConfirmed}
              onChange={setUnderstoodConfirmed}
              label={t("recovery_kit_modal.checkbox.understood")}
              id="rk-confirm-understood"
            />
          </div>

          <Button
            type="button"
            disabled={!canContinue}
            onClick={onConfirm}
            className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
          >
            {t("recovery_kit_modal.action.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmRow({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  id: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-start gap-3 text-xs leading-relaxed cursor-pointer select-none",
        checked ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(Boolean(next))}
        className="mt-0.5"
      />
      <span>{label}</span>
    </label>
  );
}

/* =====================================================================
   Print-friendly HTML
   ===================================================================== */
function buildPrintHtml(
  code: string,
  meta: {
    heading: string;
    warning: string;
    generatedAt: string;
    generatedLabel: string;
    instructions: string;
  },
): string {
  const words = code.split(" ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" />
<meta name="referrer" content="no-referrer" />
<title>${escapeHtml(meta.heading)}</title>
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
    max-width: 640px;
    margin: 0 auto;
    border: 2px solid #111827;
    border-radius: 16px;
    padding: 32px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    margin-bottom: 24px;
    letter-spacing: -0.01em;
  }
  .brand-dot {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: linear-gradient(135deg, #7c66ff, #c084fc);
  }
  h1 {
    font-size: 22px;
    margin: 0 0 8px;
  }
  .gen {
    color: #6b7280;
    font-size: 12px;
    margin-bottom: 24px;
  }
  .label {
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.1em;
    color: #6b7280;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .grid {
    display: grid;
    grid-template-cols: repeat(3, 1fr);
    gap: 12px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
  }
  .word-row {
    display: flex;
    gap: 8px;
    font-family: "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 14px;
  }
  .num { color: #6b7280; width: 20px; text-align: right; }
  .word { font-weight: 700; }
  .warning {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 12px;
    line-height: 1.5;
    margin-bottom: 16px;
  }
  .instructions {
    font-size: 12px;
    color: #374151;
    line-height: 1.6;
  }
  @media print {
    body { padding: 0; }
    .card { border-color: #000; }
    .grid { background: #fff; }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="brand"><span class="brand-dot"></span> Woxa Vault</div>
    <h1>${escapeHtml(meta.heading)}</h1>
    <div class="gen">${escapeHtml(meta.generatedLabel)}: ${escapeHtml(meta.generatedAt)}</div>
    <div class="label">Recovery Mnemonic (24 Words)</div>
    <div class="grid">
      ${words
        .map(
          (w, i) => `
        <div class="word-row">
          <span class="num">${i + 1}.</span>
          <span class="word">${escapeHtml(w)}</span>
        </div>
      `,
        )
        .join("")}
    </div>
    <div class="warning">${escapeHtml(meta.warning)}</div>
    <div class="instructions">${escapeHtml(meta.instructions)}</div>
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
