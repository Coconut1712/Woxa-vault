"use client";

/**
 * Standalone SSO 2FA challenge — /login/mfa.
 *
 * The Google SSO callback for a 2FA-enabled user does NOT mint a session.
 * Instead it sets a short-lived HttpOnly `mfa_pending` cookie (carrying the
 * mfaToken) and 302-redirects the browser here. This is a full page load, not
 * an in-component step like the password flow.
 *
 * SECURITY:
 *  - The mfaToken lives in an HttpOnly cookie — page JS cannot (and must not)
 *    read it. We POST `/auth/2fa/verify-login` with body `{ code }` only and
 *    the browser re-attaches the cookie automatically.
 *  - The TOTP / backup code is held in component state ONLY — never
 *    localStorage, cookies, or the URL. We never log it.
 *  - The `next` redirect target is run through an allowlist regex (mirrors the
 *    welcome / spaces pages) to close open-redirect bypasses.
 *  - This page is outside /app and does NOT pass through SessionGuard — there
 *    is no session yet. On success `completeMfaLogin` flips auth state and the
 *    guard ladder downstream of `next` handles setup-password / spaces / app.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  KeyRound,
  Loader2,
  ShieldCheck,
  TimerOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { ApiError, NetworkError } from "@/lib/api/client";

export default function SsoMfaPage() {
  return (
    <Suspense fallback={null}>
      <SsoMfaChallenge />
    </Suspense>
  );
}

/**
 * Same-origin redirect target check — allowlist regex (not prefix-only) closes
 * protocol-relative / encoded / control-char bypasses. Mirrors `safeNext` in
 * the welcome page. Returns the safe value or `/app`.
 */
const NEXT_RE = /^\/(?!\/)[A-Za-z0-9_\-./~?&=#%@:+,]*$/;
function safeNext(value: string | null): string {
  if (!value) return "/app";
  if (value.length > 256) return "/app";
  return NEXT_RE.test(value) ? value : "/app";
}

/**
 * The `mfa_pending` cookie is minted with Max-Age=300 (5 min). We start a local
 * countdown from page load; the backend is the source of truth for expiry, but
 * when our timer hits zero the cookie has expired too, so we surface a terminal
 * "timed out" state that points the user back to a fresh SSO sign-in.
 */
const MFA_TOKEN_TTL_MS = 5 * 60 * 1000;

type ChallengeState = "active" | "expired";

function SsoMfaChallenge() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { completeMfaLogin } = useAuth();

  const nextHop = safeNext(params.get("next"));

  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [state, setState] = useState<ChallengeState>("active");

  const expiresAtRef = useRef<number>(Date.now() + MFA_TOKEN_TTL_MS);
  const [remainingMs, setRemainingMs] = useState(MFA_TOKEN_TTL_MS);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracks the last 6-digit value we auto-submitted so typing past 6 digits,
  // deleting back, and re-entering the same digit doesn't fire a duplicate
  // request and burn rate-limit quota. Cleared on a wrong-code error so the
  // user can deliberately retry the same digits (TOTP window edge cases).
  const lastSubmittedRef = useRef<string | null>(null);

  // Auto-focus on mount and whenever the user toggles backup mode so the
  // freshly mounted input gets focus.
  useEffect(() => {
    if (state === "active") inputRef.current?.focus();
  }, [useBackup, state]);

  // Token-expiry countdown. When it hits zero the cookie is gone too, so we go
  // to the terminal "expired" state rather than letting the user keep trying.
  useEffect(() => {
    if (state !== "active") return;
    const tick = () => {
      const ms = expiresAtRef.current - Date.now();
      if (ms <= 0) {
        setState("expired");
        setRemainingMs(0);
        return;
      }
      setRemainingMs(ms);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state]);

  const submit = useCallback(
    async (rawCode?: string) => {
      const value = (rawCode ?? code).trim();
      if (!value) return;
      if (submitting) return;
      setSubmitting(true);
      setErrorKey(null);
      try {
        // CONTRACT: SSO flow sends `{ code }` only (plus useBackupCode when
        // toggled). The mfaToken rides the HttpOnly `mfa_pending` cookie — we
        // deliberately omit it from the body.
        await completeMfaLogin({ code: value, useBackupCode: useBackup });
        // completeMfaLogin already refreshed auth state (status -> authenticated,
        // /me hydrated). Hand off to the sanitized `next`; the SessionGuard
        // ladder routes onward (setup-password / spaces / app).
        router.replace(nextHop);
      } catch (err) {
        if (err instanceof NetworkError) {
          setErrorKey("login.mfa.error.network");
          setSubmitting(false);
        } else if (err instanceof ApiError) {
          if (err.code === "rate_limited" || err.status === 429) {
            setErrorKey("login.mfa.error.rate_limited");
            lastSubmittedRef.current = null;
            setSubmitting(false);
          } else if (err.code === "mfa_session_expired") {
            // The mfa_pending cookie / session genuinely expired (or was
            // replayed). The cookie is single-source in the SSO flow, so we
            // can't retry — surface the terminal "restart SSO" state.
            setState("expired");
          } else if (err.status === 401) {
            // invalid_credentials = wrong 2FA code (or a replay we can't
            // distinguish). The cookie is still valid, so keep the user on the
            // challenge: show an inline error, clear the field, and let them
            // retry. We do NOT go terminal here — that's only for an expired
            // session above.
            setErrorKey("login.mfa.error.invalid_code");
            setCode("");
            lastSubmittedRef.current = null;
            setSubmitting(false);
          } else {
            setErrorKey("login.mfa.error.generic");
            setSubmitting(false);
          }
        } else {
          setErrorKey("login.mfa.error.generic");
          setSubmitting(false);
        }
      }
    },
    [code, submitting, completeMfaLogin, useBackup, router, nextHop],
  );

  // Auto-submit when the TOTP input reaches 6 digits (numeric mode only).
  // Guarded by `lastSubmittedRef` so retyping the same value doesn't fire twice.
  useEffect(() => {
    if (useBackup || state !== "active") return;
    if (
      code.length === 6 &&
      /^\d{6}$/.test(code) &&
      !submitting &&
      code !== lastSubmittedRef.current
    ) {
      lastSubmittedRef.current = code;
      void submit(code);
    }
    // `submit` excluded on purpose to avoid double-firing when its identity
    // changes after the call already kicked off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, useBackup, submitting, state]);

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const countdown = `${minutes}:${String(seconds).padStart(2, "0")}`;

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

        {state === "expired" ? (
          <ExpiredState />
        ) : (
          <>
            <h2 className="text-xl font-semibold mb-1">
              {t("auth.mfa.challenge.title")}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t("login.mfa.subtitle")}
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
              {t("login.mfa.hint")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Terminal state shown when the verification window genuinely expired — the
 * local countdown hit zero, or the backend returned `mfa_session_expired`
 * (cookie/session gone or replayed). A plain wrong-code 401 does NOT land here;
 * that stays on the active challenge for retry. The only way forward from this
 * state is a fresh SSO sign-in, so we point back to the login entry.
 */
function ExpiredState() {
  const t = useT();
  return (
    <>
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
        <TimerOff className="size-5" />
      </div>
      <h2 className="text-xl font-semibold mb-1">
        {t("login.mfa.expired.title")}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {t("login.mfa.expired.body")}
      </p>
      <Button
        render={<Link href="/" />}
        className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
      >
        {t("login.mfa.restart_sso")}
        <ArrowRight className="size-4" />
      </Button>
      <p className="text-xs text-muted-foreground text-center mt-6">
        <Link href="/" className="hover:text-foreground">
          {t("login.mfa.back_to_login")}
        </Link>
      </p>
    </>
  );
}
