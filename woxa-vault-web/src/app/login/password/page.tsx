"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Sticking the user's email in the URL would leak PII via Referer headers,
 * third-party analytics scripts, and error-monitoring URL capture (Sentry et al.).
 * For the email pre-fill hop into /forgot-password we use sessionStorage instead.
 */
const FORGOT_EMAIL_STORAGE_KEY = "woxa-forgot-email";
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { ApiError, NetworkError } from "@/lib/api/client";

export default function PasswordLoginWrapper() {
  return (
    <Suspense fallback={null}>
      <PasswordLogin />
    </Suspense>
  );
}

/**
 * Same-origin redirect target check — mirrors `sanitizeNext` in sso.ts but
 * lives here so the password flow can route post-login without bouncing
 * through the SSO helper. Returns the safe value or `/app`.
 */
function safeNext(value: string | null): string {
  if (!value) return "/app";
  if (value.length > 256) return "/app";
  if (!value.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

type Step =
  | { kind: "password" }
  | { kind: "mfa"; mfaToken: string; tokenExpiresAt: number };

/**
 * Backend JWT is documented as ~5 min. We don't read the JWT itself; we just
 * start a countdown from the moment we received it. Slight clock skew is fine
 * since the backend is the source of truth for expiry — when our timer hits
 * zero, we bounce back to the password step regardless of what the backend
 * would say. This keeps the UI honest if the user wanders away mid-challenge.
 */
const MFA_TOKEN_TTL_MS = 5 * 60 * 1000;

function PasswordLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const paramEmail = params.get("email") ?? "";
  const nextHop = safeNext(params.get("next"));
  const notice = params.get("notice");
  const [email, setEmail] = useState(paramEmail);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "password" });

  // If we hopped here from /forgot-password the email was stashed in
  // sessionStorage rather than the URL to avoid PII leaking via Referer /
  // history / analytics. Pull it through once and clear immediately.
  useEffect(() => {
    if (paramEmail) return;
    try {
      const stashed = sessionStorage.getItem(FORGOT_EMAIL_STORAGE_KEY);
      if (stashed) {
        setEmail(stashed);
        sessionStorage.removeItem(FORGOT_EMAIL_STORAGE_KEY);
      }
    } catch {
      // sessionStorage may be unavailable.
    }
  }, [paramEmail]);

  const backToPassword = useCallback((nextErrorKey?: string | null) => {
    setStep({ kind: "password" });
    setSubmitting(false);
    if (nextErrorKey !== undefined) setErrorKey(nextErrorKey);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorKey(null);
    try {
      const result = await login(email, password);
      if (result.status === "mfa_required") {
        setStep({
          kind: "mfa",
          mfaToken: result.mfaToken,
          tokenExpiresAt: Date.now() + MFA_TOKEN_TTL_MS,
        });
        setSubmitting(false);
        // Clear the password from memory once we've handed off — the user
        // shouldn't need it again on this flow, and it lowers exposure if
        // the tab is later compromised.
        setPassword("");
        return;
      }
      router.push(nextHop);
    } catch (err) {
      setErrorKey(mapAuthError(err));
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

        {step.kind === "password" ? (
          <PasswordStep
            email={email}
            password={password}
            setPassword={setPassword}
            show={show}
            setShow={setShow}
            submitting={submitting}
            errorKey={errorKey}
            notice={notice}
            signupHref={
              nextHop && nextHop !== "/app"
                ? `/signup?next=${encodeURIComponent(nextHop)}`
                : "/signup"
            }
            onSubmit={submit}
            onForgot={() => {
              if (email) {
                try {
                  sessionStorage.setItem(FORGOT_EMAIL_STORAGE_KEY, email);
                } catch {
                  // sessionStorage may be unavailable (private mode); the
                  // forgot-password page tolerates a missing pre-fill.
                }
              }
              router.push("/forgot-password");
            }}
          />
        ) : (
          <MfaChallengeStep
            email={email}
            mfaToken={step.mfaToken}
            tokenExpiresAt={step.tokenExpiresAt}
            nextHop={nextHop}
            onCancel={() => backToPassword(null)}
            onTokenExpired={() => backToPassword("login.error.mfa_expired")}
          />
        )}
      </div>
    </div>
  );
}

function PasswordStep({
  email,
  password,
  setPassword,
  show,
  setShow,
  submitting,
  errorKey,
  notice,
  signupHref,
  onSubmit,
  onForgot,
}: {
  email: string;
  password: string;
  setPassword: (v: string) => void;
  show: boolean;
  setShow: (next: (s: boolean) => boolean) => void;
  submitting: boolean;
  errorKey: string | null;
  notice: string | null;
  signupHref: string;
  onSubmit: (e: React.FormEvent) => void;
  onForgot: () => void;
}) {
  const t = useT();
  return (
    <>
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="size-4" /> {t("login.use_different_email")}
      </Link>

      <h2 className="text-xl font-semibold mb-1">{t("login.welcome_back")}</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {t("login.signing_in_as", { email })}
      </p>

      {notice === "regenerate-recovery" && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/[0.10] dark:bg-amber-500/[0.05] px-3 py-2 text-amber-800 dark:text-amber-300"
        >
          <ShieldCheck className="size-4 mt-0.5 shrink-0" />
          <span className="text-xs leading-relaxed">
            {t("login.after_recovery_notice")}
          </span>
        </div>
      )}

      {errorKey && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
        >
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{t(errorKey)}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{t("login.password_label")}</Label>
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              placeholder={t("login.password_placeholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              className="h-11 pr-10 font-mono-secret"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded"
              aria-label={show ? t("common.hide") : t("common.show")}
            >
              {show ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={onForgot}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("login.forgot_password_link")}
            </button>
            <span className="text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="size-3" /> {t("login.secure_connection")}
            </span>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
          disabled={!password || submitting}
        >
          {submitting ? t("login.signing_in") : t("login.sign_in")}{" "}
          {!submitting && <ArrowRight className="size-4" />}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground text-center mt-6">
        {t("signup.from_login_prompt")}{" "}
        <Link href={signupHref} className="text-brand hover:underline font-medium">
          {t("signup.from_login_link")}
        </Link>
      </p>

      <p className="text-xs text-muted-foreground text-center mt-3">
        {t("login.login_password_hint")}
      </p>
    </>
  );
}

/**
 * MFA challenge — exchanges the short-lived mfaToken for a real session.
 * Code is held in component state ONLY (never localStorage / cookies / URL).
 */
function MfaChallengeStep({
  email,
  mfaToken,
  tokenExpiresAt,
  nextHop,
  onCancel,
  onTokenExpired,
}: {
  email: string;
  mfaToken: string;
  tokenExpiresAt: number;
  nextHop: string;
  onCancel: () => void;
  onTokenExpired: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const { completeMfaLogin } = useAuth();
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(
    () => tokenExpiresAt - Date.now(),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracks the last code value we auto-submitted so that typing past 6 digits,
  // deleting back, and re-entering the same 6th digit doesn't fire a duplicate
  // submit. Cleared on `invalid_code` so the user can retry the same code on
  // purpose (e.g., clock-tick edge cases).
  const lastSubmittedRef = useRef<string | null>(null);

  // Auto-focus on mount AND whenever the user toggles backup mode so the
  // freshly mounted input gets focus.
  useEffect(() => {
    inputRef.current?.focus();
  }, [useBackup]);

  // Token-expiry countdown. Re-renders once per second; when it would hit zero
  // we bounce the user back to the password step so the next attempt is fresh.
  useEffect(() => {
    const tick = () => {
      const ms = tokenExpiresAt - Date.now();
      if (ms <= 0) {
        onTokenExpired();
        return;
      }
      setRemainingMs(ms);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [tokenExpiresAt, onTokenExpired]);

  const submit = useCallback(
    async (rawCode?: string) => {
      const value = (rawCode ?? code).trim();
      if (!value) return;
      if (submitting) return;
      setSubmitting(true);
      setErrorKey(null);
      try {
        await completeMfaLogin({
          mfaToken,
          code: value,
          useBackupCode: useBackup,
        });
        router.push(nextHop);
      } catch (err) {
        if (err instanceof NetworkError) {
          setErrorKey("login.error.network");
        } else if (err instanceof ApiError) {
          if (
            err.code === "mfa_token_invalid" ||
            err.code === "mfa_session_expired" ||
            err.status === 400
          ) {
            // The mfaToken in the body expired or was tampered with — there's
            // no retry that fixes a dead token, so fall back to the password
            // step for a fresh login. (`mfa_session_expired` mirrors the SSO
            // flow's terminal code; the generic 400 fallback also lands here.)
            onTokenExpired();
            return;
          }
          if (err.code === "invalid_code" || err.status === 401) {
            // Wrong 2FA code — the token is still valid, so keep the user on
            // the challenge to retry. Intentionally do NOT clear the field —
            // let them fix the typo. Reset the auto-submit dedupe so they can
            // deliberately retry the same digits (e.g., they're sure the code
            // is right and the TOTP window just rolled over).
            lastSubmittedRef.current = null;
            setErrorKey("login.error.mfa_invalid_code");
          } else if (err.code === "rate_limited" || err.status === 429) {
            setErrorKey("login.error.rate_limited");
          } else {
            setErrorKey("login.error.generic");
          }
        } else {
          setErrorKey("login.error.generic");
        }
        setSubmitting(false);
      }
    },
    [
      code,
      submitting,
      completeMfaLogin,
      mfaToken,
      useBackup,
      router,
      nextHop,
      onTokenExpired,
    ],
  );

  // Auto-submit when TOTP input reaches 6 digits (only in numeric mode).
  // Guarded by `lastSubmittedRef` so retyping the same 6-digit value (e.g.,
  // typed 7, deleted, retyped the same 6th) does not fire a duplicate request
  // and burn rate-limit quota.
  useEffect(() => {
    if (useBackup) return;
    if (
      code.length === 6 &&
      /^\d{6}$/.test(code) &&
      !submitting &&
      code !== lastSubmittedRef.current
    ) {
      lastSubmittedRef.current = code;
      void submit(code);
    }
    // We intentionally exclude `submit` from the deps to avoid double-firing
    // when the callback identity changes after `submit` already kicked off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, useBackup, submitting]);

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const countdown = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="size-4" /> {t("common.cancel")}
      </button>

      <h2 className="text-xl font-semibold mb-1">
        {t("auth.mfa.challenge.title")}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {t("auth.mfa.challenge.subtitle", { email })}
      </p>

      {errorKey && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
        >
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{t(errorKey)}</span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="mfa-code">
            {useBackup
              ? t("auth.mfa.challenge.backupCodeLabel")
              : t("auth.mfa.challenge.codeLabel")}
          </Label>
          <div className="relative">
            {useBackup ? (
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            ) : (
              <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            )}
            <Input
              ref={inputRef}
              id="mfa-code"
              value={code}
              onChange={(e) => {
                if (useBackup) {
                  // Backup codes are `ABCDE-FGHIJ` (10 chars + 1 dash = 11);
                  // accept letters/digits/dash and uppercase as the user types.
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
                if (errorKey) setErrorKey(null);
              }}
              inputMode={useBackup ? "text" : "numeric"}
              autoComplete={useBackup ? "off" : "one-time-code"}
              maxLength={useBackup ? 11 : 6}
              placeholder={
                useBackup
                  ? t("auth.mfa.challenge.backupCodePlaceholder")
                  : "123456"
              }
              required
              className="h-11 pl-9 font-mono text-center tracking-[0.4em]"
              aria-invalid={errorKey ? true : undefined}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setUseBackup((v) => !v);
                setCode("");
                lastSubmittedRef.current = null;
                if (errorKey) setErrorKey(null);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {useBackup
                ? t("auth.mfa.challenge.useTotpInstead")
                : t("auth.mfa.challenge.useBackup")}
            </button>
            <span className="text-muted-foreground tabular-nums">
              {t("auth.mfa.challenge.expires_in", { time: countdown })}
            </span>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
          disabled={submitting || code.length === 0}
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("auth.mfa.challenge.verifying")}
            </>
          ) : (
            <>
              {t("auth.mfa.challenge.verify")}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground text-center mt-6">
        {t("auth.mfa.challenge.hint")}
      </p>
    </>
  );
}

function mapAuthError(err: unknown): string {
  if (err instanceof NetworkError) return "login.error.network";
  if (err instanceof ApiError) {
    if (err.code === "invalid_credentials" || err.status === 401) {
      return "login.error.invalid_credentials";
    }
    if (err.code === "rate_limited" || err.status === 429) {
      return "login.error.rate_limited";
    }
  }
  return "login.error.generic";
}
