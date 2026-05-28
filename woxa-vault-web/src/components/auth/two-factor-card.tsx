"use client";

/**
 * Two-factor authentication card on Account → Security.
 *
 * Renders one of three states based on the /me profile:
 *
 *  A) Disabled (`twoFactorEnabled === false && !twoFactorPending`) — shows the
 *     "Enable 2FA" CTA which opens the 3-step enroll dialog.
 *  B) Enabled (`twoFactorEnabled === true`) — green status + backup-code count
 *     + "Regenerate" / "Disable" actions. Surfaces an amber low-codes nudge
 *     when fewer than 3 backup codes remain.
 *  C) Pending (`twoFactorPending === true && !twoFactorEnabled`) — amber card
 *     letting the user resume or cancel an in-progress enrollment.
 */

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/settings/primitives";
import { ApiError } from "@/lib/api/client";
import type { MeUser } from "@/lib/api/me";
import { disableTwoFactor } from "@/lib/api/two-factor";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";

import { TwoFactorEnrollDialog } from "./two-factor-enroll-dialog";
import { TwoFactorDisableDialog } from "./two-factor-disable-dialog";
import { TwoFactorRegenerateDialog } from "./two-factor-regenerate-dialog";

interface Props {
  me: MeUser;
  /**
   * Called after a state-changing action (enroll complete, disable, regenerate)
   * so the parent can refresh /me and update the card.
   */
  onChanged: () => void | Promise<void>;
}

export function TwoFactorCard({ me, onChanged }: Props) {
  const t = useT();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [discardPendingOpen, setDiscardPendingOpen] = useState(false);

  const handleEnrollComplete = async () => {
    toast.success(t("auth.twofa.enroll.toast.completed"));
    await onChanged();
  };

  const handleDisabled = async () => {
    await onChanged();
  };

  const handleRegenerated = async () => {
    toast.success(t("auth.twofa.regenerate.toast.success"));
    await onChanged();
  };

  return (
    <Card>
      <div className="flex items-start gap-3">
        <StatusIcon me={me} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            {t("auth.twofa.card.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
            <StatusSummary me={me} />
          </p>

          {me.twoFactorEnabled && (
            <BackupCodeStatus
              remaining={me.backupCodesRemaining}
              onRegenerate={() => setRegenerateOpen(true)}
            />
          )}

          {me.twoFactorPending && !me.twoFactorEnabled && (
            <PendingBanner
              onResume={() => setEnrollOpen(true)}
              onCancel={() => setDiscardPendingOpen(true)}
            />
          )}
        </div>

        <Actions
          me={me}
          onEnable={() => setEnrollOpen(true)}
          onRegenerate={() => setRegenerateOpen(true)}
          onDisable={() => setDisableOpen(true)}
        />
      </div>

      <TwoFactorEnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        onComplete={() => void handleEnrollComplete()}
      />
      <TwoFactorDisableDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        onDisabled={() => {
          void handleDisabled();
        }}
      />
      <TwoFactorRegenerateDialog
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        onRegenerated={() => void handleRegenerated()}
      />
      <DiscardPendingDialog
        open={discardPendingOpen}
        onOpenChange={setDiscardPendingOpen}
        onDiscarded={() => void onChanged()}
      />
    </Card>
  );
}

/**
 * "Cancel pending" affordance — clears an in-progress (unverified) TOTP
 * enrollment. The backend accepts a password-only disable while 2FA is still
 * pending (no TOTP code exists yet), so this is a smaller dialog than the
 * full disable flow used when 2FA is fully enabled.
 */
function DiscardPendingDialog({
  open,
  onOpenChange,
  onDiscarded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscarded: () => void;
}) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword("");
    setShowPassword(false);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || password.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await disableTwoFactor({ password });
      toast.success(t("auth.twofa.pending.toast.discarded"));
      reset();
      onDiscarded();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setError(t("auth.twofa.disable.error.invalid_password"));
        } else if (err.code === "rate_limited") {
          setError(t("auth.twofa.disable.error.rate_limited"));
        } else {
          setError(t("auth.twofa.disable.error.generic"));
        }
      } else {
        setError(t("auth.twofa.disable.error.generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("auth.twofa.pending.discard.title")}</DialogTitle>
          <DialogDescription>
            {t("auth.twofa.pending.discard.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <form
          id="twofa-discard-pending-form"
          className="space-y-3"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t("auth.twofa.disable.password_label")}
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                autoComplete="current-password"
                required
                autoFocus
                className="pr-10 font-mono-secret"
                aria-invalid={error ? true : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded"
                aria-label={showPassword ? t("common.hide") : t("common.show")}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {error && (
              <p className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1">
                <AlertCircle className="size-3" />
                {error}
              </p>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            form="twofa-discard-pending-form"
            type="submit"
            disabled={submitting || password.length === 0}
            className="bg-rose-500 text-white hover:bg-rose-500/90"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {t("auth.twofa.pending.discard.submitting")}
              </>
            ) : (
              t("auth.twofa.pending.discard.submit")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ me }: { me: MeUser }) {
  if (me.twoFactorEnabled) {
    return (
      <div className="size-10 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/10 ring-1 ring-emerald-500/30 dark:ring-emerald-500/20 flex items-center justify-center shrink-0">
        <CheckCircle2 className="size-5 text-emerald-700 dark:text-emerald-400" />
      </div>
    );
  }
  if (me.twoFactorPending) {
    return (
      <div className="size-10 rounded-xl bg-amber-500/15 dark:bg-amber-500/10 ring-1 ring-amber-500/30 dark:ring-amber-500/20 flex items-center justify-center shrink-0">
        <AlertTriangle className="size-5 text-amber-700 dark:text-amber-400" />
      </div>
    );
  }
  return (
    <div className="size-10 rounded-xl bg-muted ring-1 ring-line-1 flex items-center justify-center shrink-0">
      <Smartphone className="size-5 text-muted-foreground" />
    </div>
  );
}

function StatusSummary({ me }: { me: MeUser }) {
  const t = useT();
  if (me.twoFactorEnabled) {
    if (me.totpEnabledAt) {
      return (
        <>
          {t("auth.twofa.card.enabled_since", {
            when: formatDateTime(me.totpEnabledAt),
          })}
        </>
      );
    }
    return <>{t("auth.twofa.card.enabled")}</>;
  }
  if (me.twoFactorPending) {
    return <>{t("auth.twofa.card.pending")}</>;
  }
  return <>{t("auth.twofa.card.disabled")}</>;
}

function Actions({
  me,
  onEnable,
  onRegenerate,
  onDisable,
}: {
  me: MeUser;
  onEnable: () => void;
  onRegenerate: () => void;
  onDisable: () => void;
}) {
  const t = useT();
  if (me.twoFactorEnabled) {
    return (
      <div className="flex flex-col gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onRegenerate}>
          <RefreshCw className="size-3.5" />
          {t("auth.twofa.actions.regenerate")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDisable}
          className="text-rose-700 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 hover:bg-rose-500/15 dark:hover:bg-rose-500/10 border-rose-500/30 dark:border-rose-500/15"
        >
          <ShieldOff className="size-3.5" />
          {t("auth.twofa.actions.disable")}
        </Button>
      </div>
    );
  }
  if (me.twoFactorPending) {
    // Actions surfaced inside the PendingBanner; nothing here.
    return null;
  }
  return (
    <Button
      size="sm"
      onClick={onEnable}
      className="bg-brand text-brand-foreground hover:bg-brand/90 shrink-0"
    >
      <ShieldCheck className="size-3.5" />
      {t("auth.twofa.actions.enable")}
    </Button>
  );
}

function BackupCodeStatus({
  remaining,
  onRegenerate,
}: {
  remaining: number | undefined;
  onRegenerate: () => void;
}) {
  const t = useT();
  if (typeof remaining !== "number") return null;
  const low = remaining < 3;
  return (
    <div className="mt-3 space-y-2">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
          low
            ? "border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "border-line-1 bg-surface-1 text-muted-foreground",
        )}
      >
        <span className="tabular-nums">
          {t("auth.twofa.card.backup_remaining", { count: remaining })}
        </span>
      </div>
      {low && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
          {t("auth.twofa.card.low_backup_warning")}
          <button
            type="button"
            onClick={onRegenerate}
            className="underline hover:text-amber-800 dark:hover:text-amber-300"
          >
            {t("auth.twofa.card.regenerate_now")}
          </button>
        </p>
      )}
    </div>
  );
}

function PendingBanner({
  onResume,
  onCancel,
}: {
  onResume: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 px-3 py-2.5">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200/90">
          {t("auth.twofa.card.pending_banner")}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          onClick={onResume}
          className="bg-amber-500 text-white hover:bg-amber-500/90"
        >
          {t("auth.twofa.card.resume_setup")}
        </Button>
      </div>
    </div>
  );
}
