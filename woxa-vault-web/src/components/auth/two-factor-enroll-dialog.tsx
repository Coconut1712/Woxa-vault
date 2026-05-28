"use client";

/**
 * 3-step modal to enroll TOTP:
 *   1. Scan QR — POST /auth/2fa/enroll, show QR + secret, instructions.
 *   2. Verify — collect 6-digit code, POST /auth/2fa/verify-enroll.
 *   3. Save backup codes — display 10 plaintext codes with strong
 *      "save it now" affordances. User must explicitly confirm before close.
 *
 * Spec: only call `onComplete` from step 3, after the user ticks the
 * confirmation checkbox. Parents refresh /me when they receive this signal so
 * the surrounding card flips into the Enabled state.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import {
  enrollTwoFactor,
  verifyEnrollTwoFactor,
  type TotpEnrollResponse,
} from "@/lib/api/two-factor";
import { useT } from "@/lib/i18n/provider";
import { BackupCodesPanel } from "./backup-codes-panel";

type Stage =
  | { kind: "loading" }
  | { kind: "scan"; data: TotpEnrollResponse }
  | { kind: "verify"; data: TotpEnrollResponse }
  | { kind: "codes"; codes: string[] }
  | { kind: "error"; message: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called once the user finishes step 3 (saves backup codes + confirms).
   * Parent should refresh /me here.
   */
  onComplete: () => void;
}

export function TwoFactorEnrollDialog({ open, onOpenChange, onComplete }: Props) {
  const t = useT();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });

  const startEnroll = useCallback(async () => {
    setStage({ kind: "loading" });
    try {
      const data = await enrollTwoFactor();
      setStage({ kind: "scan", data });
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === "two_factor_already_enabled"
      ) {
        setStage({
          kind: "error",
          message: t("auth.twofa.enroll.error.already_enabled"),
        });
        return;
      }
      setStage({
        kind: "error",
        message:
          err instanceof ApiError
            ? err.message
            : t("auth.twofa.enroll.error.enroll_failed"),
      });
    }
  }, [t]);

  // Kick off /enroll whenever the dialog opens. Resetting on close keeps the
  // dialog clean for the next mount.
  useEffect(() => {
    if (open) {
      void startEnroll();
    } else {
      setStage({ kind: "loading" });
    }
  }, [open, startEnroll]);

  const handleOpenChange = (next: boolean) => {
    // Once the user has reached step 3 (backup codes shown), prevent the
    // dialog from closing via backdrop click / ESC. They must explicitly
    // confirm with the Done button so we know they had a chance to save.
    if (!next && stage.kind === "codes") return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {stage.kind === "loading" && <LoadingStage />}
        {stage.kind === "error" && (
          <ErrorStage
            message={stage.message}
            onClose={() => onOpenChange(false)}
            onRetry={() => void startEnroll()}
          />
        )}
        {stage.kind === "scan" && (
          <ScanStage
            data={stage.data}
            onCancel={() => onOpenChange(false)}
            onContinue={() => setStage({ kind: "verify", data: stage.data })}
          />
        )}
        {stage.kind === "verify" && (
          <VerifyStage
            data={stage.data}
            onBack={() => setStage({ kind: "scan", data: stage.data })}
            onVerified={(codes) => setStage({ kind: "codes", codes })}
          />
        )}
        {stage.kind === "codes" && (
          <CodesStage
            codes={stage.codes}
            onDone={() => {
              onComplete();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LoadingStage() {
  const t = useT();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("auth.twofa.enroll.scan.title")}</DialogTitle>
        <DialogDescription>{t("auth.twofa.enroll.loading")}</DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    </>
  );
}

function ErrorStage({
  message,
  onClose,
  onRetry,
}: {
  message: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("auth.twofa.enroll.error.title")}</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
      </DialogHeader>
      <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-rose-700 dark:text-rose-300">
        <AlertCircle className="size-4 mt-0.5 shrink-0" />
        <span className="text-xs leading-relaxed">{message}</span>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          {t("common.retry")}
        </Button>
      </DialogFooter>
    </>
  );
}

/* =====================================================================
   STEP 1 — Scan QR
   ===================================================================== */
function ScanStage({
  data,
  onCancel,
  onContinue,
}: {
  data: TotpEnrollResponse;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(data.secret);
      setCopied(true);
      toast.success(t("auth.twofa.enroll.scan.secret_copied"));
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("auth.twofa.enroll.scan.copy_failed"));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Smartphone className="size-4 text-muted-foreground" />
          {t("auth.twofa.enroll.scan.title")}
        </DialogTitle>
        <DialogDescription>
          {t("auth.twofa.enroll.scan.subtitle")}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* QR — white background for scannability even in dark mode. */}
        <div className="flex justify-center">
          <div className="rounded-xl bg-white p-3 ring-1 ring-line-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.qrDataUrl}
              alt={t("auth.twofa.enroll.scan.qr_alt")}
              width={200}
              height={200}
              className="size-50"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t("auth.twofa.enroll.scan.secret_label")}
          </Label>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 inline-flex items-center px-3 rounded-md border border-line-1 bg-surface-1 font-mono text-xs break-all select-all">
              {data.secret}
            </code>
            <Button variant="outline" size="sm" onClick={copySecret}>
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  {t("common.copied")}
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  {t("auth.twofa.enroll.scan.copy_secret")}
                </>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t("auth.twofa.enroll.scan.manual_hint")}
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={onContinue}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {t("auth.twofa.enroll.scan.continue")}
        </Button>
      </DialogFooter>
    </>
  );
}

/* =====================================================================
   STEP 2 — Verify code
   ===================================================================== */
function VerifyStage({
  data: _data,
  onBack,
  onVerified,
}: {
  data: TotpEnrollResponse;
  onBack: () => void;
  onVerified: (codes: string[]) => void;
}) {
  const t = useT();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const submit = useCallback(
    async (raw?: string) => {
      const value = (raw ?? code).trim();
      if (value.length !== 6 || submitting) return;
      setSubmitting(true);
      setErrorKey(null);
      try {
        const res = await verifyEnrollTwoFactor({ code: value });
        onVerified(res.backupCodes);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === "invalid_code" || err.status === 401) {
            setErrorKey("auth.twofa.enroll.verify.invalid_code");
          } else if (err.code === "rate_limited" || err.status === 429) {
            setErrorKey("auth.twofa.enroll.verify.rate_limited");
          } else if (err.code === "two_factor_already_enabled") {
            // Edge case: someone else completed setup in another tab.
            toast.error(t("auth.twofa.enroll.error.already_enabled"));
            setErrorKey("auth.twofa.enroll.error.already_enabled");
          } else {
            setErrorKey("auth.twofa.enroll.verify.generic_error");
          }
        } else {
          setErrorKey("auth.twofa.enroll.verify.generic_error");
        }
        setSubmitting(false);
      }
    },
    [code, submitting, onVerified, t],
  );

  // Auto-submit when 6 digits entered.
  useEffect(() => {
    if (code.length === 6 && /^\d{6}$/.test(code) && !submitting) {
      void submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          {t("auth.twofa.enroll.verify.title")}
        </DialogTitle>
        <DialogDescription>
          {t("auth.twofa.enroll.verify.subtitle")}
        </DialogDescription>
      </DialogHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3"
        id="twofa-verify-form"
      >
        <div className="space-y-2">
          <Label htmlFor="twofa-verify-code">
            {t("auth.twofa.enroll.verify.code_label")}
          </Label>
          <Input
            id="twofa-verify-code"
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(digits);
              if (errorKey) setErrorKey(null);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            placeholder="123456"
            className="h-11 font-mono text-center tracking-[0.4em] text-base"
            aria-invalid={errorKey ? true : undefined}
            disabled={submitting}
          />
          {errorKey && (
            <p className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1">
              <AlertCircle className="size-3" />
              {t(errorKey)}
            </p>
          )}
        </div>
      </form>

      <DialogFooter>
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          {t("common.back")}
        </Button>
        <Button
          form="twofa-verify-form"
          type="submit"
          disabled={code.length !== 6 || submitting}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {submitting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              {t("auth.twofa.enroll.verify.verifying")}
            </>
          ) : (
            t("auth.twofa.enroll.verify.submit")
          )}
        </Button>
      </DialogFooter>
    </>
  );
}

/* =====================================================================
   STEP 3 — Save backup codes
   ===================================================================== */
function CodesStage({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const t = useT();
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          {t("auth.twofa.enroll.codes.title")}
        </DialogTitle>
        <DialogDescription>
          {t("auth.twofa.enroll.codes.subtitle")}
        </DialogDescription>
      </DialogHeader>

      <BackupCodesPanel codes={codes} onConfirm={onDone} />
    </>
  );
}
