"use client";

/**
 * /signup — self-service email + LOGIN password signup. Pre-auth, standalone
 * (no sidebar / top bar), styled like the root `/` and `/login/password` pages.
 *
 * Two-password model (intentional UX guardrail):
 *   - This page sets the LOGIN password (the account / sign-in credential).
 *   - The MASTER password (which unlocks the vault) is set LATER at
 *     /setup-password, together with the recovery kit. The copy here goes out
 *     of its way to make that distinction so the user never conflates the two.
 *
 * Flow after a successful register:
 *   register() sets the session cookie + flips auth state → router.replace("/app")
 *   → SessionGuard sees `requiresPasswordSetup=true` + no workspace → walks the
 *   user to /setup-password (Master Password + recovery kit) → /spaces.
 * Routing through /app + the guard (rather than jumping straight to
 * /setup-password) keeps the post-auth ladder in one place.
 */

import { Suspense, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  evaluatePassword,
  StrengthMeter,
} from "@/components/auth/password-policy";
import { ApiError, NetworkError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/provider";
import { useT } from "@/lib/i18n/provider";

export default function SignupPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SignupPage />
    </Suspense>
  );
}

/**
 * Same-origin redirect allowlist — mirrors the regex used by /login/mfa and the
 * forced-setup wall pages. Anything that isn't a relative same-origin path is
 * dropped to `/app` so a crafted `?next=` can't open-redirect off-site.
 */
const NEXT_ALLOWLIST = /^\/(?!\/)[A-Za-z0-9_\-./~?&=#%@:+,]*$/;
function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (value.length > 256) return null;
  if (!NEXT_ALLOWLIST.test(value)) return null;
  return value;
}

function SignupPage() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { register } = useAuth();

  // `next` is carried through to /login if the user already has an account, so
  // they land where they originally intended after signing in instead.
  const nextHop = safeNext(params.get("next"));
  const loginHref = nextHop
    ? `/login/password?next=${encodeURIComponent(nextHop)}`
    : "/login/password";

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // When the email is already taken we surface an inline "sign in instead" link.
  const [emailTaken, setEmailTaken] = useState(false);

  const checks = useMemo(() => evaluatePassword(password), [password]);
  const matches = password.length > 0 && password === confirm;
  // Backend enforces min length 10; match is a client-side correctness gate.
  const blocking = !email || !checks.minLength || !matches;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setTouched(true);
    setErrorKey(null);
    setEmailTaken(false);
    if (blocking) return;
    setSubmitting(true);
    try {
      await register({ email, password, displayName });
      // Session cookie is set + auth state flipped. Route through /app and let
      // SessionGuard walk to /setup-password → /spaces.
      router.replace("/app");
    } catch (err) {
      if (err instanceof NetworkError) {
        setErrorKey("signup.error.network");
      } else if (err instanceof ApiError) {
        if (err.code === "email_taken" || err.status === 409) {
          setEmailTaken(true);
          setErrorKey("signup.error.email_taken");
        } else if (err.code === "validation_error" || err.status === 400) {
          setErrorKey("signup.error.validation");
        } else if (err.code === "rate_limited" || err.status === 429) {
          setErrorKey("signup.error.rate_limited");
        } else {
          setErrorKey("signup.error.generic");
        }
      } else {
        setErrorKey("signup.error.generic");
      }
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
          href={nextHop ? `/?next=${encodeURIComponent(nextHop)}` : "/"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="size-4" /> {t("signup.back_to_start")}
        </Link>

        <h1 className="text-xl font-semibold mb-1">{t("signup.title")}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {t("signup.subtitle")}
        </p>

        {/* Two-password explainer — login password vs Master Password. */}
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-blue-500/30 dark:border-blue-500/20 bg-blue-500/[0.06] dark:bg-blue-500/[0.03] px-3 py-2.5 text-blue-800 dark:text-blue-300">
          <KeyRound className="size-4 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium leading-snug">
              {t("signup.two_password_notice_title")}
            </p>
            <p className="text-[11px] leading-relaxed opacity-90">
              {t("signup.two_password_notice_desc")}
            </p>
          </div>
        </div>

        {errorKey && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
          >
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs">{t(errorKey)}</span>
              {emailTaken && (
                <Link
                  href={loginHref}
                  className="block mt-1 text-xs font-medium underline underline-offset-2 hover:no-underline"
                >
                  {t("signup.error.email_taken_action")}
                </Link>
              )}
            </div>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-1.5">
            <Label
              htmlFor="signup-email"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
            >
              {t("signup.email_label")}
            </Label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailTaken) {
                  setEmailTaken(false);
                  setErrorKey(null);
                }
              }}
              placeholder={t("signup.email_placeholder")}
              autoComplete="email"
              required
              autoFocus
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="signup-displayName"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
            >
              {t("signup.displayName_label")}
            </Label>
            <Input
              id="signup-displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("signup.displayName_placeholder")}
              autoComplete="name"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="signup-password"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
            >
              {t("signup.password_label")}
            </Label>
            <div className="relative">
              <Input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            <p className="text-[11px] text-muted-foreground">
              {t("signup.password_hint")}
            </p>
            {password.length > 0 && <StrengthMeter checks={checks} />}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="signup-password-confirm"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
            >
              {t("signup.password_confirm_label")}
            </Label>
            <Input
              id="signup-password-confirm"
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
                {t("signup.submitting")}
              </>
            ) : (
              <>
                {t("signup.submit")}
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-6">
          {t("signup.have_account")}{" "}
          <Link
            href={loginHref}
            className="text-brand hover:underline font-medium"
          >
            {t("signup.sign_in_link")}
          </Link>
        </p>
      </div>
    </div>
  );
}
