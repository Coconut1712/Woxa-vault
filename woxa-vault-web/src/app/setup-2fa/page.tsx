"use client";

/**
 * /setup-2fa — mandatory forced-enrollment wall for users whose workspace has
 * the Require-2FA policy turned on but who have no TOTP enrolled. SessionGuard
 * redirects every authenticated /app route here while
 * `me.requiresTwoFactorEnroll` is true, and the API client bounces direct calls
 * that hit a 403 `two_factor_required`. We live OUTSIDE the /app tree (no
 * sidebar, no top bar) and run our own auth check, so we are NOT wrapped by
 * SessionGuard — that separation is what keeps the redirect from looping.
 *
 * Auth-state guards (effect-driven, no router calls in render):
 *   - unauthenticated → bounced to / (cannot enroll without a session).
 *   - requiresPasswordSetup → /setup-password (the password wall outranks 2FA).
 *   - requiresTwoFactorEnroll === false → /app (they don't owe an enrollment;
 *     they wandered in or just finished).
 *
 * Non-dismissible: there is NO skip/close affordance. The flow is the same
 * 3 steps as `TwoFactorEnrollDialog` (scan QR → verify code → save backup
 * codes), but rendered full-page. The user must complete all three and
 * explicitly confirm they saved the backup codes before we let them through.
 * After completion we `refresh()` /me (flips requiresTwoFactorEnroll → false)
 * and route to the sanitized `next` (default /app).
 *
 * SECURITY:
 *   - The TOTP secret and backup codes are held in component state ONLY — never
 *     localStorage, cookies, or the URL. We never log them.
 *   - This is a UX wall; the backend enforces the policy independently, so a
 *     client that skips the page still can't reach secret routes.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackupCodesPanel } from "@/components/auth/backup-codes-panel";
import { ApiError } from "@/lib/api/client";
import {
  enrollTwoFactor,
  verifyEnrollTwoFactor,
  type TotpEnrollResponse,
} from "@/lib/api/two-factor";
import { useAuth } from "@/lib/auth/provider";
import { useT } from "@/lib/i18n/provider";

/**
 * Same-origin redirect target check — allowlist regex (not prefix-only) closes
 * protocol-relative / encoded / control-char bypasses. Mirrors `safeNext` in
 * the SSO MFA page. Returns the safe value or `/app`.
 */
const NEXT_RE = /^\/(?!\/)[A-Za-z0-9_\-./~?&=#%@:+,]*$/;
function safeNext(value: string | null): string {
  if (!value) return "/app";
  if (value.length > 256) return "/app";
  return NEXT_RE.test(value) ? value : "/app";
}

type Stage =
  | { kind: "loading" }
  | { kind: "scan"; data: TotpEnrollResponse }
  | { kind: "verify"; data: TotpEnrollResponse }
  | { kind: "codes"; codes: string[] }
  | { kind: "error"; message: string };

export default function SetupTwoFactorPage() {
  return (
    <Suspense fallback={<BootSplash />}>
      <SetupTwoFactorWall />
    </Suspense>
  );
}

function SetupTwoFactorWall() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { status, me, refresh } = useAuth();

  const nextHop = safeNext(params.get("next"));
  const [stage, setStage] = useState<Stage>({ kind: "loading" });

  // Auth-state guards — effect-driven, no router calls in render.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
      return;
    }
    if (status !== "authenticated" || !me) return;
    // The Master Password wall outranks the 2FA wall.
    if (me.requiresPasswordSetup) {
      router.replace("/setup-password");
      return;
    }
    // Wandered in (or just finished) — they don't owe an enrollment.
    if (me.requiresTwoFactorEnroll !== true) {
      router.replace("/app");
    }
  }, [status, me, router]);

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
        // Already enrolled in another tab — refresh and let the guard route us
        // out of this wall.
        await refresh();
        router.replace(nextHop);
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
  }, [t, refresh, router, nextHop]);

  // Kick off /enroll once we have a confirmed, eligible session.
  const eligible =
    status === "authenticated" &&
    !!me &&
    !me.requiresPasswordSetup &&
    me.requiresTwoFactorEnroll === true;

  useEffect(() => {
    if (eligible && stage.kind === "loading") {
      void startEnroll();
    }
    // Only re-run when eligibility flips on; startEnroll is stable enough and
    // re-including it would re-enroll on every stage transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible]);

  const handleComplete = useCallback(async () => {
    // Flip requiresTwoFactorEnroll → false in the cached profile BEFORE routing
    // so SessionGuard at `next` doesn't bounce us straight back here.
    await refresh();
    router.replace(nextHop);
  }, [refresh, router, nextHop]);

  // Quiet splash while AuthProvider boots OR while we're about to redirect.
  if (
    status !== "authenticated" ||
    !me ||
    me.requiresPasswordSetup ||
    me.requiresTwoFactorEnroll !== true
  ) {
    return <BootSplash />;
  }

  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-[480px] rounded-full bg-[#6366f1] opacity-[0.10] blur-[120px]" />
        <div className="absolute bottom-0 -right-32 size-[480px] rounded-full bg-[#a855f7] opacity-[0.06] blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative py-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="size-8 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
            <ShieldCheck className="size-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">Woxa Vault</span>
        </div>

        {/* Policy notice — explains why the user is here and that it's mandatory. */}
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 px-4 py-3 text-amber-700 dark:text-amber-400">
          <ShieldCheck className="size-4 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">
              {t("setup_2fa.policy_title")}
            </p>
            <p className="text-xs leading-relaxed mt-0.5">
              {t("setup_2fa.policy_desc")}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-6">
          {stage.kind === "loading" && <LoadingStage />}
          {stage.kind === "error" && (
            <ErrorStage
              message={stage.message}
              onRetry={() => void startEnroll()}
            />
          )}
          {stage.kind === "scan" && (
            <ScanStage
              data={stage.data}
              onContinue={() => setStage({ kind: "verify", data: stage.data })}
            />
          )}
          {stage.kind === "verify" && (
            <VerifyStage
              onBack={() => setStage({ kind: "scan", data: stage.data })}
              onVerified={(codes) => setStage({ kind: "codes", codes })}
            />
          )}
          {stage.kind === "codes" && (
            <CodesStage
              codes={stage.codes}
              onDone={() => void handleComplete()}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingStage() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <span className="text-sm">{t("auth.twofa.enroll.loading")}</span>
    </div>
  );
}

function ErrorStage({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">
        {t("auth.twofa.enroll.error.title")}
      </h1>
      <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-rose-700 dark:text-rose-300">
        <AlertCircle className="size-4 mt-0.5 shrink-0" />
        <span className="text-xs leading-relaxed">{message}</span>
      </div>
      <Button
        onClick={onRetry}
        className="w-full h-10 bg-brand text-brand-foreground hover:bg-brand/90"
      >
        <RefreshCw className="size-3.5" />
        {t("common.retry")}
      </Button>
    </div>
  );
}

/* STEP 1 — Scan QR */
function ScanStage({
  data,
  onContinue,
}: {
  data: TotpEnrollResponse;
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
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Smartphone className="size-4 text-muted-foreground" />
          {t("auth.twofa.enroll.scan.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("auth.twofa.enroll.scan.subtitle")}
        </p>
      </div>

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

      <Button
        onClick={onContinue}
        className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
      >
        {t("auth.twofa.enroll.scan.continue")}
      </Button>
    </div>
  );
}

/* STEP 2 — Verify code */
function VerifyStage({
  onBack,
  onVerified,
}: {
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
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          {t("auth.twofa.enroll.verify.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("auth.twofa.enroll.verify.subtitle")}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-2"
      >
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
      </form>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 h-11"
        >
          {t("common.back")}
        </Button>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={code.length !== 6 || submitting}
          className="flex-1 h-11 bg-brand text-brand-foreground hover:bg-brand/90"
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
      </div>
    </div>
  );
}

/* STEP 3 — Save backup codes */
function CodesStage({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">
          {t("auth.twofa.enroll.codes.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("auth.twofa.enroll.codes.subtitle")}
        </p>
      </div>
      <BackupCodesPanel
        codes={codes}
        onConfirm={onDone}
        confirmLabel={t("setup_2fa.finish")}
      />
    </div>
  );
}

function BootSplash() {
  const t = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="size-9 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
          <ShieldCheck className="size-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="size-3 border-2 border-current border-r-transparent rounded-full animate-spin" />
          <span>{t("auth.checking_session")}</span>
        </div>
      </div>
    </div>
  );
}
