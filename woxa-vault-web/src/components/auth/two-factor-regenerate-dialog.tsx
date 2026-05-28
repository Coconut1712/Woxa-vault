"use client";

/**
 * Regenerate the user's 10 backup codes. Two-step dialog:
 *   1. Confirm — collect password + a live TOTP code (NOT a backup code).
 *   2. Codes — display the fresh 10 codes via BackupCodesPanel; confirm + close.
 *
 * The backend requires TOTP specifically (and not a backup code) because the
 * whole point of this surface is to recover from "lost the printed codes" —
 * a backup code would let an attacker who already burned one mint themselves
 * an unlimited supply.
 */

import { useState, type FormEvent } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";

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
import { regenerateBackupCodes } from "@/lib/api/two-factor";
import { useT } from "@/lib/i18n/provider";
import { BackupCodesPanel } from "./backup-codes-panel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegenerated: () => void;
}

type Stage =
  | { kind: "confirm" }
  | { kind: "codes"; codes: string[] };

export function TwoFactorRegenerateDialog({
  open,
  onOpenChange,
  onRegenerated,
}: Props) {
  const t = useT();
  const [stage, setStage] = useState<Stage>({ kind: "confirm" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStage({ kind: "confirm" });
    setPassword("");
    setCode("");
    setShowPassword(false);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    // Once codes are showing, force the user through the BackupCodesPanel
    // confirm flow rather than letting them ESC out and lose the codes.
    if (!next && stage.kind === "codes") return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (password.length === 0 || code.length !== 6) {
      setError(t("auth.twofa.regenerate.error.missing_fields"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await regenerateBackupCodes({ password, code });
      setStage({ kind: "codes", codes: res.backupCodes });
      // Eagerly clear the password from memory once it has served its purpose.
      setPassword("");
      setCode("");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") {
          setError(t("auth.twofa.regenerate.error.invalid_password"));
        } else if (err.code === "invalid_code") {
          setError(t("auth.twofa.regenerate.error.invalid_code"));
        } else if (err.code === "rate_limited") {
          setError(t("auth.twofa.regenerate.error.rate_limited"));
        } else {
          setError(t("auth.twofa.regenerate.error.generic"));
        }
      } else {
        setError(t("auth.twofa.regenerate.error.generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-4 text-muted-foreground" />
            {t("auth.twofa.regenerate.title")}
          </DialogTitle>
          <DialogDescription>
            {stage.kind === "confirm"
              ? t("auth.twofa.regenerate.subtitle")
              : t("auth.twofa.regenerate.codes_subtitle")}
          </DialogDescription>
        </DialogHeader>

        {stage.kind === "confirm" ? (
          <>
            <form
              id="twofa-regen-form"
              className="space-y-3"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {t("auth.twofa.regenerate.password_label")}
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
                    aria-label={
                      showPassword ? t("common.hide") : t("common.show")
                    }
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
                  {t("auth.twofa.regenerate.code_label")}
                </Label>
                <Input
                  value={code}
                  onChange={(e) => {
                    const digits = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6);
                    setCode(digits);
                    if (error) setError(null);
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  className="font-mono text-center tracking-[0.4em]"
                  aria-invalid={error ? true : undefined}
                />
                <p className="text-[10px] text-muted-foreground">
                  {t("auth.twofa.regenerate.code_hint")}
                </p>
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
                form="twofa-regen-form"
                type="submit"
                disabled={
                  submitting || password.length === 0 || code.length !== 6
                }
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("auth.twofa.regenerate.submitting")}
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3.5" />
                    {t("auth.twofa.regenerate.submit")}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <BackupCodesPanel
            codes={stage.codes}
            onConfirm={() => {
              onRegenerated();
              reset();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
