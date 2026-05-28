"use client";

/**
 * /forgot-password — PUBLIC reset surface that consumes the recovery kit.
 *
 * The backend's `/auth/password/reset-with-recovery` endpoint is constant-time
 * w.r.t. unknown emails vs. bad codes, so the UI MUST NOT differentiate them:
 * a 401 here always reads as "recovery code is invalid", never "email not
 * found". This is a deliberate anti-enumeration property.
 *
 * On success: the backend nukes all sessions and clears the recovery hash,
 * so the user must:
 *   1. Sign in fresh with the new password.
 *   2. Regenerate a new recovery kit from Account Settings (the
 *      `?notice=regenerate-recovery` flag forwards a banner to /login/password).
 */

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Email is forwarded from /login/password via sessionStorage rather than a
 * URL query param so that the user's address is never leaked through Referer
 * headers, browser history, third-party scripts, or error monitoring.
 */
const FORGOT_EMAIL_STORAGE_KEY = "woxa-forgot-email";
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  evaluatePassword,
  StrengthMeter,
} from "@/components/auth/password-policy";
import { ApiError, NetworkError } from "@/lib/api/client";
import { resetPasswordWithRecovery } from "@/lib/api/me";
import { useT } from "@/lib/i18n/provider";

export default function ForgotPasswordWrapper() {
  return (
    <Suspense fallback={null}>
      <ForgotPassword />
    </Suspense>
  );
}

function ForgotPassword() {
  const t = useT();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");

  // Pull the email pre-fill from sessionStorage (set by /login/password) and
  // clear it immediately so it never persists beyond this render.
  useEffect(() => {
    try {
      const stashed = sessionStorage.getItem(FORGOT_EMAIL_STORAGE_KEY);
      if (stashed) {
        setEmail(stashed);
        sessionStorage.removeItem(FORGOT_EMAIL_STORAGE_KEY);
      }
    } catch {
      // sessionStorage may be unavailable (private mode, etc.).
    }
  }, []);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const checks = useMemo(() => evaluatePassword(newPassword), [newPassword]);
  const matches = newPassword.length > 0 && newPassword === confirm;
  const codeFilled = recoveryCode.trim().length > 0;
  const emailFilled = email.trim().length > 0;
  const blocking =
    !emailFilled || !codeFilled || !checks.minLength || !matches;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setTouched(true);
    setServerError(null);
    if (blocking) return;
    setSubmitting(true);
    try {
      await resetPasswordWithRecovery({
        email: email.trim(),
        recoveryCode,
        newPassword,
      });
      toast.success(t("forgot_password.success"));
      // Forward the email to login via sessionStorage (NOT the URL — would leak
      // PII through Referer/history/analytics) and use a query flag only for
      // the non-sensitive "regenerate recovery kit" hint.
      try {
        sessionStorage.setItem(FORGOT_EMAIL_STORAGE_KEY, email.trim());
      } catch {
        // sessionStorage may be unavailable; the login page tolerates the miss.
      }
      router.replace("/login/password?notice=regenerate-recovery");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "recovery_kit_invalid" || err.status === 401) {
          setServerError(t("forgot_password.error.invalid"));
        } else if (err.code === "rate_limited" || err.status === 429) {
          toast.error(t("forgot_password.error.rate_limited"));
          setServerError(t("forgot_password.error.rate_limited"));
        } else if (err.code === "validation_error" || err.status === 400) {
          setServerError(err.message || t("account.password.error.too_short"));
        } else {
          setServerError(t("forgot_password.error.generic"));
        }
      } else if (err instanceof NetworkError) {
        setServerError(t("forgot_password.error.generic"));
      } else {
        setServerError(t("forgot_password.error.generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-[480px] rounded-full bg-[#6366f1] opacity-[0.10] blur-[120px]" />
        <div className="absolute bottom-0 -right-32 size-[480px] rounded-full bg-[#a855f7] opacity-[0.06] blur-[120px]" />
      </div>

      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-card card-elevated relative">
        <div className="flex items-center gap-2 mb-6">
          <div className="size-8 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
            <ShieldCheck className="size-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">Woxa Vault</span>
        </div>

        <Link
          href="/login/password"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="size-4" /> {t("forgot_password.back_to_login")}
        </Link>

        <h1 className="text-xl font-semibold mb-1">
          {t("forgot_password.title")}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {t("forgot_password.subtitle")}
        </p>

        {serverError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
          >
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span className="text-xs">{serverError}</span>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-1.5">
            <Label
              htmlFor="fp-email"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
            >
              {t("forgot_password.email_label")}
            </Label>
            <Input
              id="fp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="fp-code"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
            >
              {t("forgot_password.code_label")}
            </Label>
            <Textarea
              id="fp-code"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder={t("forgot_password.code_placeholder")}
              required
              rows={3}
              autoComplete="off"
              spellCheck={false}
              className="font-mono-secret text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="fp-new-password"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
            >
              {t("forgot_password.new_password_label")}
            </Label>
            <div className="relative">
              <Input
                id="fp-new-password"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onBlur={() => setTouched(true)}
                autoComplete="new-password"
                required
                minLength={10}
                className="h-11 pr-10 font-mono-secret"
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
            {newPassword.length > 0 && <StrengthMeter checks={checks} />}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="fp-confirm"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
            >
              {t("forgot_password.confirm_label")}
            </Label>
            <Input
              id="fp-confirm"
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched(true)}
              autoComplete="new-password"
              required
              className="h-11 font-mono-secret"
            />
            {touched && confirm.length > 0 && !matches && (
              <p className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1">
                <X className="size-3" />
                {t("account.password.error.no_match")}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={submitting || blocking}
            className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("forgot_password.submitting")}
              </>
            ) : (
              <>
                {t("forgot_password.submit")}
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
