"use client";

/**
 * Danger-zone dialog to turn off TOTP. Backend requires:
 *   - current Master Password
 *   - current TOTP code (or backup code) since 2FA is still on
 */

import { useState, type FormEvent } from "react";
import { AlertCircle, AlertTriangle, Eye, EyeOff, Loader2, ShieldOff } from "lucide-react";
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
import { disableTwoFactor } from "@/lib/api/two-factor";
import { useT } from "@/lib/i18n/provider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisabled: () => void;
}

export function TwoFactorDisableDialog({ open, onOpenChange, onDisabled }: Props) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword("");
    setCode("");
    setUseBackup(false);
    setShowPassword(false);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (password.length === 0 || code.trim().length === 0) {
      setError(t("auth.twofa.disable.error.missing_fields"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await disableTwoFactor({ password, code: code.trim() });
      toast.success(t("auth.twofa.disable.toast.success"));
      reset();
      onDisabled();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setError(t("auth.twofa.disable.error.invalid_password"));
        } else if (err.code === "invalid_code") {
          setError(t("auth.twofa.disable.error.invalid_code"));
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
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="size-4 text-rose-600 dark:text-rose-400" />
            {t("auth.twofa.disable.title")}
          </DialogTitle>
          <DialogDescription>
            {t("auth.twofa.disable.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-rose-700 dark:text-rose-300">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed">
            {t("auth.twofa.disable.warning")}
          </p>
        </div>

        <form
          id="twofa-disable-form"
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
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {useBackup
                ? t("auth.mfa.challenge.backupCodeLabel")
                : t("auth.twofa.disable.code_label")}
            </Label>
            <Input
              value={code}
              onChange={(e) => {
                if (useBackup) {
                  const cleaned = e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9-]/g, "")
                    .slice(0, 11);
                  setCode(cleaned);
                } else {
                  const digits = e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 6);
                  setCode(digits);
                }
                if (error) setError(null);
              }}
              inputMode={useBackup ? "text" : "numeric"}
              autoComplete="one-time-code"
              maxLength={useBackup ? 11 : 6}
              placeholder={
                useBackup
                  ? t("auth.mfa.challenge.backupCodePlaceholder")
                  : "123456"
              }
              className="font-mono text-center tracking-[0.4em]"
              aria-invalid={error ? true : undefined}
            />
            <button
              type="button"
              onClick={() => {
                setUseBackup((v) => !v);
                setCode("");
                if (error) setError(null);
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              {useBackup
                ? t("auth.mfa.challenge.useTotpInstead")
                : t("auth.mfa.challenge.useBackup")}
            </button>
          </div>

          {error && (
            <p className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1">
              <AlertCircle className="size-3" />
              {error}
            </p>
          )}
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
            form="twofa-disable-form"
            type="submit"
            disabled={
              submitting || password.length === 0 || code.trim().length === 0
            }
            className="bg-rose-500 text-white hover:bg-rose-500/90"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {t("auth.twofa.disable.submitting")}
              </>
            ) : (
              <>
                <ShieldOff className="size-3.5" />
                {t("auth.twofa.disable.submit")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
