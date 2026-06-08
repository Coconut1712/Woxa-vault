"use client";

/**
 * /setup-password — mandatory landing for users provisioned through SSO who
 * have never set a local Master Password. The SessionGuard redirects every
 * authenticated route here while `me.requiresPasswordSetup` is true, so we
 * intentionally live OUTSIDE the `/app` tree (no sidebar, no top bar).
 *
 *   - Anonymous users → bounced to /login/password (cannot set without a
 *     session because the endpoint requires auth).
 *   - Authenticated users with `requiresPasswordSetup === false` → bounced
 *     to /app; they already have a password.
 *   - Otherwise: render the password form. On success show the recovery-kit
 *     modal (blocking), then refresh /me + redirect to /app.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  evaluatePassword,
  StrengthMeter,
} from "@/components/auth/password-policy";
import { RecoveryKitModal } from "@/components/auth/recovery-kit-modal";
import { ApiError } from "@/lib/api/client";
import { setupPassword } from "@/lib/api/me";
import { getKdfSalt } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/provider";
import { useT } from "@/lib/i18n/provider";
import { persistUnlockTimestamp, persistPrivateKey } from "@/components/vault-lock/lock-provider";
import {
  deriveMasterKey,
  deriveAuthKeyHash,
  generateUserKeypair,
  encryptPrivateKey,
  toBase64,
  fromBase64
} from "@/lib/crypto-client";

export default function SetupPasswordPage() {
  const t = useT();
  const router = useRouter();
  const { status, me, refresh } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  // Auth state guards — keep them simple and effect-driven, no router calls in
  // render.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
      return;
    }
    if (status === "authenticated" && me && !me.requiresPasswordSetup) {
      // User already has a password — get out of this flow.
      router.replace("/app");
    }
  }, [status, me, router]);

  const checks = useMemo(() => evaluatePassword(password), [password]);
  const matches = password.length > 0 && password === confirm;
  const blocking = !checks.minLength || !matches;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setTouched(true);
    setServerError(null);
    if (blocking || !me) return;
    setSubmitting(true);
    try {
      // Phase C: Generate ZK Keys. Use the server-issued per-user KDF salt so
      // the master key derived here matches the one re-derived at unlock. Prefer
      // the salt already on /me; fall back to a direct lookup if absent.
      const saltB64 = me.kdfSalt ?? (await getKdfSalt(me.email));
      const salt = fromBase64(saltB64);
      const masterKey = await deriveMasterKey(password, salt);
      const masterAuthKeyHash = await deriveAuthKeyHash(masterKey, salt);
      
      const { publicKey, privateKey } = generateUserKeypair();
      const encrypted = await encryptPrivateKey(privateKey, masterKey);

      const res = await setupPassword({ 
        password,
        masterAuthKeyHash,
        publicKey: toBase64(publicKey),
        encryptedPrivateKey: toBase64(encrypted.ciphertext),
        privateKeyIv: toBase64(encrypted.iv),
        privateKeyAuthTag: toBase64(encrypted.authTag),
      });

      // The user just proved possession of the master password → the vault
      // is implicitly unlocked. Stamp the timestamp before we route into /app.
      persistUnlockTimestamp();
      // Also store the decrypted private key for this session
      persistPrivateKey(privateKey);

      setRecoveryCode(res.recoveryCode);
      toast.success(t("setup_password.success_toast"));
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "password_already_set" || err.status === 409) {
          setServerError(t("setup_password.error.already_set"));
          // Refresh and bounce — the user shouldn't be here anymore.
          await refresh();
          setTimeout(() => router.replace("/app"), 1200);
          return;
        }
        if (err.code === "validation_error" || err.status === 400) {
          setServerError(err.message || t("account.password.error.too_short"));
          return;
        }
        if (err.code === "rate_limited" || err.status === 429) {
          setServerError(t("account.password.error.rate_limited"));
          return;
        }
      }
      setServerError(t("setup_password.error.generic"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryConfirm = async () => {
    // Hide the modal first to avoid a flash on the next route.
    setRecoveryCode(null);
    await refresh();
    // After setting the password, a freshly-provisioned user typically has no
    // workspace yet — send them to /spaces to create or join one. /spaces is a
    // legitimate post-auth hub (workspace switcher + create), so landing there
    // is correct whether or not the user already has a workspace.
    router.replace("/spaces");
  };

  // Quiet splash while AuthProvider boots OR while we're about to redirect.
  if (status !== "authenticated" || !me) {
    return <BootSplash label={t("auth.checking_session")} />;
  }
  if (!me.requiresPasswordSetup) {
    return <BootSplash label={t("auth.checking_session")} />;
  }

  return (
    <>
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

          <h1 className="text-xl font-semibold mb-1">
            {t("setup_password.title")}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {t("setup_password.subtitle")}
          </p>

          {/* Show the signed-in email as a non-editable hint so the user
              understands which account they're setting up. */}
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-line-1 bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" />
            <span className="font-mono-secret truncate">{me.email}</span>
          </div>

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
                htmlFor="setup-password"
                className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
              >
                {t("setup_password.password_label")}
              </Label>
              <div className="relative">
                <Input
                  id="setup-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched(true)}
                  autoComplete="new-password"
                  required
                  minLength={10}
                  autoFocus
                  className="h-11 pr-10 font-mono-secret"
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
              {password.length > 0 && <StrengthMeter checks={checks} />}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="setup-password-confirm"
                className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
              >
                {t("setup_password.confirm_label")}
              </Label>
              <Input
                id="setup-password-confirm"
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
                  {t("setup_password.submitting")}
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  {t("setup_password.submit")}
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      {recoveryCode && (
        <RecoveryKitModal
          recoveryCode={recoveryCode}
          context="setup"
          onConfirm={() => void handleRecoveryConfirm()}
        />
      )}
    </>
  );
}

function BootSplash({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="size-9 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
          <ShieldCheck className="size-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="size-3 border-2 border-current border-r-transparent rounded-full animate-spin" />
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}
