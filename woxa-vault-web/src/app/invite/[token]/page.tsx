"use client";

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserCog,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  evaluatePassword,
  StrengthMeter,
} from "@/components/auth/password-policy";
import { ApiError } from "@/lib/api/client";
import {
  acceptInvitation,
  previewInvitation,
  signupAndAccept,
  type InvitationPreview,
} from "@/lib/api/invitations";
import type { InviteRole } from "@/lib/api/members";
import { useAuth } from "@/lib/auth/provider";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

type Stage =
  | "loading"
  | "preview"
  | "accepting"
  | "signup"
  | "signing_up"
  | "success"
  | "error_not_found"
  | "error_expired"
  | "error_revoked"
  | "error_already_accepted"
  | "error_email_mismatch"
  | "error_generic";

const ROLE_TONE: Record<
  InviteRole,
  { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  admin: {
    icon: ShieldCheck,
    color:
      "bg-violet-500/15 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30 dark:border-violet-500/20",
  },
  member: {
    icon: UsersIcon,
    color:
      "bg-blue-500/15 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30 dark:border-blue-500/20",
  },
  guest: {
    icon: UserCog,
    color:
      "bg-muted text-muted-foreground border-line-1 dark:border-line-2",
  },
};

export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = use(params);
  // Next 16 already decodes path segments, but a defensive decodeURIComponent
  // protects against any double-encoded edge cases (e.g. manually pasted URLs).
  const token = useMemo(() => {
    try {
      return decodeURIComponent(rawToken);
    } catch {
      return rawToken;
    }
  }, [rawToken]);

  const t = useT();
  const router = useRouter();
  const { user, status: authStatus, refresh: refreshAuth } = useAuth();

  const [stage, setStage] = useState<Stage>("loading");
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [errorEmail, setErrorEmail] = useState<string | null>(null);

  const fetchPreview = useCallback(
    async (signal?: AbortSignal): Promise<InvitationPreview | null> => {
      try {
        const p = await previewInvitation(token, signal);
        if (signal?.aborted) return null;
        setPreview(p);
        // userExists === false → recipient must create an account first.
        setStage(p.userExists ? "preview" : "signup");
        return p;
      } catch (err) {
        if (signal?.aborted) return null;
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setStage("error_not_found");
            return null;
          }
          if (err.code === "invitation_expired") {
            setStage("error_expired");
            return null;
          }
          if (err.code === "invitation_revoked") {
            setStage("error_revoked");
            return null;
          }
          if (err.code === "invitation_already_accepted") {
            setStage("error_already_accepted");
            return null;
          }
        }
        setStage("error_generic");
        return null;
      }
    },
    [token],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setStage("loading");
    void fetchPreview(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchPreview]);

  const goToLoginWithNext = useCallback(
    (email?: string) => {
      const search = new URLSearchParams();
      if (email) search.set("email", email);
      search.set("next", `/invite/${encodeURIComponent(token)}`);
      router.push(`/login/password?${search.toString()}`);
    },
    [router, token],
  );

  const handleAccept = useCallback(async () => {
    if (!preview) return;

    // Not signed in → bounce through the password login with email prefilled.
    if (authStatus === "unauthenticated") {
      goToLoginWithNext(preview.email);
      return;
    }
    // Still bootstrapping the session → wait for it (Accept button is
    // disabled in this branch anyway).
    if (authStatus === "loading") return;

    setStage("accepting");
    try {
      await acceptInvitation(token);
      toast.success(t("invite.success", { orgName: preview.orgName }));
      setStage("success");
      // Small breath so the success card is visible, then route into the app.
      setTimeout(() => router.push("/app"), 800);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          // Session vanished mid-flight — restart through login.
          goToLoginWithNext(preview.email);
          return;
        }
        if (err.code === "invitation_email_mismatch") {
          setErrorEmail(user?.email ?? null);
          setStage("error_email_mismatch");
          return;
        }
        if (err.code === "already_member") {
          toast.success(
            t("invite.error.already_member", { orgName: preview.orgName }),
          );
          router.push("/app");
          return;
        }
        if (err.code === "invitation_already_accepted") {
          setStage("error_already_accepted");
          return;
        }
        if (err.code === "invitation_revoked") {
          setStage("error_revoked");
          return;
        }
        if (err.code === "invitation_expired") {
          setStage("error_expired");
          return;
        }
        if (err.status === 404) {
          setStage("error_not_found");
          return;
        }
      }
      toast.error(t("invite.error.generic"));
      setStage("preview");
    }
  }, [
    authStatus,
    goToLoginWithNext,
    preview,
    router,
    t,
    token,
    user?.email,
  ]);

  const handleSignup = useCallback(
    async (input: { password: string; displayName: string }) => {
      if (!preview) return;
      setStage("signing_up");
      try {
        const result = await signupAndAccept(token, {
          password: input.password,
          displayName: input.displayName.trim() || undefined,
        });
        // This only set the LOGIN password — the Master Password (and recovery
        // kit) are still unset, so the vault stays locked. Do NOT stamp an
        // unlock timestamp here. Backend set the session cookie; refresh the
        // auth provider so guards see the new user (with requiresPasswordSetup
        // === true), then route into /app and let SessionGuard walk to
        // /setup-password where the Master Password + recovery kit are set.
        await refreshAuth();
        toast.success(t("invite.signup.success_toast"));
        setStage("success");
        router.replace("/app");
        return result;
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === "user_exists" || err.status === 409) {
            // Backend says the email already has an account — bounce to login.
            toast.error(t("invite.error.user_exists"));
            goToLoginWithNext(preview.email);
            return;
          }
          if (err.code === "invitation_already_accepted") {
            setStage("error_already_accepted");
            return;
          }
          if (err.code === "invitation_revoked") {
            setStage("error_revoked");
            return;
          }
          if (err.code === "invitation_expired") {
            setStage("error_expired");
            return;
          }
          if (err.status === 404) {
            setStage("error_not_found");
            return;
          }
          if (err.code === "rate_limited" || err.status === 429) {
            toast.error(t("invite.error.rate_limited"));
            setStage("signup");
            return;
          }
          if (err.code === "validation_error" || err.status === 400) {
            // Inline error is the form's own state; bring it back to signup.
            toast.error(t("invite.error.generic"));
            setStage("signup");
            throw err;
          }
        }
        toast.error(t("invite.error.generic"));
        setStage("signup");
        throw err;
      }
    },
    [goToLoginWithNext, preview, refreshAuth, router, t, token],
  );

  // Proactive UX: if logged in but email doesn't match invitation, warn before
  // they click Accept. We don't block — backend is still the source of truth.
  const emailMismatchWarning = useMemo(() => {
    if (authStatus !== "authenticated") return null;
    if (!user || !preview) return null;
    if (user.email.toLowerCase() === preview.email.toLowerCase()) return null;
    return { invitedEmail: preview.email, currentEmail: user.email };
  }, [authStatus, user, preview]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-[480px] rounded-full bg-[#6366f1] opacity-[0.10] blur-[120px]" />
        <div className="absolute bottom-0 -right-32 size-[480px] rounded-full bg-[#a855f7] opacity-[0.06] blur-[120px]" />
      </div>

      <main className="flex-1 flex items-start justify-center p-6 relative z-10">
        <div className="w-full max-w-xl mt-10">
          {/* Brand mark */}
          <div className="flex items-center gap-2 mb-8">
            <div className="size-7 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
              <ShieldCheck className="size-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Woxa Vault
            </span>
          </div>

          {stage === "loading" && (
            <LoadingCard label={t("invite.loading")} />
          )}

          {stage === "preview" && preview && (
            <PreviewCard
              preview={preview}
              authStatus={authStatus}
              currentEmail={user?.email ?? null}
              mismatchWarning={emailMismatchWarning}
              onAccept={handleAccept}
              accepting={false}
            />
          )}

          {stage === "accepting" && preview && (
            <PreviewCard
              preview={preview}
              authStatus={authStatus}
              currentEmail={user?.email ?? null}
              mismatchWarning={emailMismatchWarning}
              onAccept={handleAccept}
              accepting
            />
          )}

          {(stage === "signup" || stage === "signing_up") && preview && (
            <SignupCard
              preview={preview}
              onSubmit={handleSignup}
              submitting={stage === "signing_up"}
            />
          )}

          {stage === "success" && preview && (
            <SuccessCard
              orgName={preview.orgName}
              fromSignup={stage === "success" && preview.userExists === false}
            />
          )}

          {stage === "error_not_found" && (
            <ErrorCard
              title={t("invite.error.title.not_found")}
              desc={t("invite.error.not_found")}
              tone="rose"
              icon={AlertTriangle}
              primaryHref="/"
              primaryLabel={t("invite.go_to_login")}
            />
          )}

          {stage === "error_expired" && (
            <ErrorCard
              title={t("invite.error.title.expired")}
              desc={t("invite.error.expired")}
              tone="amber"
              icon={Clock}
              primaryHref="/"
              primaryLabel={t("invite.go_to_login")}
            />
          )}

          {stage === "error_revoked" && (
            <ErrorCard
              title={t("invite.error.title.revoked")}
              desc={t("invite.error.revoked")}
              tone="rose"
              icon={AlertTriangle}
              primaryHref="/"
              primaryLabel={t("invite.go_to_login")}
            />
          )}

          {stage === "error_already_accepted" && (
            <ErrorCard
              title={t("invite.error.title.already_accepted")}
              desc={t("invite.error.already_accepted")}
              tone="amber"
              icon={CheckCircle2}
              primaryHref="/app"
              primaryLabel={t("invite.go_to_app")}
            />
          )}

          {stage === "error_email_mismatch" && preview && (
            <EmailMismatchCard
              invitedEmail={preview.email}
              currentEmail={errorEmail ?? user?.email ?? "—"}
            />
          )}

          {stage === "error_generic" && (
            <ErrorCard
              title={t("invite.error.title.generic")}
              desc={t("invite.error.generic")}
              tone="rose"
              icon={AlertTriangle}
              primaryHref="/"
              primaryLabel={t("invite.go_to_login")}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-card card-elevated">
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-3">
        <Loader2 className="size-4 animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function PreviewCard({
  preview,
  authStatus,
  currentEmail,
  mismatchWarning,
  onAccept,
  accepting,
}: {
  preview: InvitationPreview;
  authStatus: "loading" | "authenticated" | "unauthenticated";
  currentEmail: string | null;
  mismatchWarning: { invitedEmail: string; currentEmail: string } | null;
  onAccept: () => void;
  accepting: boolean;
}) {
  const t = useT();
  const role = ROLE_TONE[preview.role];
  const inviterLabel = preview.invitedByName
    ? t("invite.preview.invited_by", { name: preview.invitedByName })
    : t("invite.preview.invited_by_unknown");

  const acceptDisabled = accepting || authStatus === "loading";
  const acceptLabel = accepting
    ? t("invite.accepting")
    : authStatus === "unauthenticated"
      ? t("invite.signin_to_accept")
      : t("invite.accept");

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-card card-elevated space-y-5">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/15 dark:bg-violet-500/10 border border-violet-500/30 dark:border-violet-500/20 text-violet-700 dark:text-violet-400 text-[11px] font-medium mb-3">
          <Crown className="size-3" />
          {inviterLabel}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">
          {t("invite.preview.title", { orgName: preview.orgName })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("invite.preview.subtitle")}
        </p>
      </div>

      {/* Info grid */}
      <div className="space-y-3">
        <InfoRow
          icon={ShieldCheck}
          label={t("invite.preview.role_label")}
          value={
            <Badge
              variant="outline"
              className={cn("text-[11px] gap-1.5", role.color)}
            >
              <role.icon className="size-3" />
              {t(`members.role.${preview.role}`)}
            </Badge>
          }
        />
        <InfoRow
          icon={Mail}
          label={t("invite.preview.email_label")}
          value={
            <span className="text-sm font-mono-secret break-all">
              {preview.email}
            </span>
          }
        />
        <InfoRow
          icon={Clock}
          label={t("invite.preview.expires_label")}
          value={
            <Badge
              variant="outline"
              className="font-medium text-[11px] gap-1.5 border-amber-500/30 bg-amber-500/15 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"
            >
              <span className="size-1.5 rounded-full bg-amber-500" />
              {t("invite.preview.expires_in", {
                when: timeAgo(preview.expiresAt),
              })}
            </Badge>
          }
        />
      </div>

      {/* Email mismatch warning (proactive) */}
      {mismatchWarning && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/[0.10] dark:bg-amber-500/[0.05] border border-amber-500/40 dark:border-amber-500/25">
          <AlertTriangle className="size-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200/90">
            {t("invite.error.email_mismatch", {
              invitedEmail: mismatchWarning.invitedEmail,
              currentEmail: mismatchWarning.currentEmail,
            })}
          </p>
        </div>
      )}

      {/* Sign-in hint when anonymous */}
      {authStatus === "unauthenticated" && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-surface-1 border border-line-1">
          <Mail className="size-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("invite.signin_hint", { email: preview.email })}
          </p>
        </div>
      )}

      {/* Action */}
      <Button
        onClick={onAccept}
        disabled={acceptDisabled}
        className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
      >
        {accepting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : authStatus === "authenticated" ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <ArrowRight className="size-4" />
        )}{" "}
        {acceptLabel}
      </Button>

      {authStatus === "authenticated" && currentEmail && (
        <p className="text-[11px] text-muted-foreground text-center">
          {t("invite.preview.email_lock", { email: currentEmail })}
        </p>
      )}
    </div>
  );
}

/* ============================================================
   Signup form — shown when invitation.userExists === false
   ============================================================ */
function SignupCard({
  preview,
  onSubmit,
  submitting,
}: {
  preview: InvitationPreview;
  onSubmit: (input: { password: string; displayName: string }) => Promise<unknown> | void;
  submitting: boolean;
}) {
  const t = useT();
  const role = ROLE_TONE[preview.role];

  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const checks = useMemo(() => evaluatePassword(password), [password]);
  const matches = password.length > 0 && password === confirm;
  const blocking = !checks.minLength || !matches;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setTouched(true);
    setServerError(null);
    if (blocking) return;
    try {
      await onSubmit({ password, displayName });
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") {
        setServerError(err.message ?? t("account.password.error.too_short"));
      }
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-card card-elevated space-y-5">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/15 dark:bg-violet-500/10 border border-violet-500/30 dark:border-violet-500/20 text-violet-700 dark:text-violet-400 text-[11px] font-medium mb-3">
          <ShieldCheck className="size-3" />
          {preview.invitedByName
            ? t("invite.preview.invited_by", { name: preview.invitedByName })
            : t("invite.preview.invited_by_unknown")}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">
          {t("invite.signup.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("invite.signup.subtitle", { orgName: preview.orgName })}
        </p>
      </div>

      {/* Role + expiry chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={cn("text-[11px] gap-1.5", role.color)}
        >
          <role.icon className="size-3" />
          {t(`members.role.${preview.role}`)}
        </Badge>
        <Badge
          variant="outline"
          className="font-medium text-[11px] gap-1.5 border-amber-500/30 bg-amber-500/15 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"
        >
          <Clock className="size-3" />
          {t("invite.preview.expires_in", {
            when: timeAgo(preview.expiresAt),
          })}
        </Badge>
      </div>

      {/* Two-password explainer — makes clear this is the login password and
          the Master Password is set later at /setup-password. */}
      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-blue-500/[0.08] dark:bg-blue-500/[0.05] border border-blue-500/30 dark:border-blue-500/20">
        <KeyRound className="size-4 text-blue-700 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-blue-900 dark:text-blue-200">
            {t("invite.signup.two_password_notice_title")}
          </p>
          <p className="text-[11px] leading-relaxed text-blue-800/80 dark:text-blue-200/70">
            {t("invite.signup.two_password_notice_desc")}
          </p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {/* Email (readonly) */}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t("invite.signup.email_label")}
          </Label>
          <Input
            value={preview.email}
            readOnly
            disabled
            className="font-mono-secret"
            aria-describedby="invite-email-hint"
          />
          <p
            id="invite-email-hint"
            className="text-[11px] text-muted-foreground"
          >
            {t("invite.signup.email_readonly_hint")}
          </p>
        </div>

        {/* Display name */}
        <div className="space-y-1.5">
          <Label
            htmlFor="invite-display-name"
            className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
          >
            {t("invite.signup.displayName_label")}
          </Label>
          <Input
            id="invite-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("invite.signup.displayName_placeholder")}
            autoComplete="name"
            maxLength={120}
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label
            htmlFor="invite-password"
            className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
          >
            {t("invite.signup.password_label")}
          </Label>
          <div className="relative">
            <Input
              id="invite-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched(true)}
              autoComplete="new-password"
              required
              minLength={10}
              className="pr-10 font-mono-secret"
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
          <p className="text-[11px] text-muted-foreground">
            {t("invite.signup.password_hint")}
          </p>

          {/* Strength meter (only when user has typed something) */}
          {password.length > 0 && (
            <StrengthMeter checks={checks} />
          )}
        </div>

        {/* Confirm */}
        <div className="space-y-1.5">
          <Label
            htmlFor="invite-password-confirm"
            className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
          >
            {t("invite.signup.password_confirm_label")}
          </Label>
          <Input
            id="invite-password-confirm"
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setTouched(true)}
            autoComplete="new-password"
            required
            className="font-mono-secret"
          />
          {touched && confirm.length > 0 && !matches && (
            <p className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1">
              <X className="size-3" />
              {t("invite.signup.policy.match")}
            </p>
          )}
        </div>

        {/* Server error (validation_error from API) */}
        {serverError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
          >
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span className="text-xs">{serverError}</span>
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
          disabled={submitting || blocking}
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("invite.signup.submitting")}
            </>
          ) : (
            <>
              <Lock className="size-4" />
              {t("invite.signup.submit")}
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

function SuccessCard({
  orgName,
  fromSignup,
}: {
  orgName: string;
  fromSignup?: boolean;
}) {
  const t = useT();
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-card card-elevated text-center">
      <div className="size-12 rounded-full bg-emerald-500/15 dark:bg-emerald-500/10 border border-emerald-500/30 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
        <CheckCircle2 className="size-6" />
      </div>
      <h2 className="text-lg font-semibold mb-1">
        {t("invite.success", { orgName })}
      </h2>
      {fromSignup ? (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("invite.signup.success_redirecting")}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {t("invite.preview.subtitle")}
          </p>
          <Button
            render={<a href="/app" />}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {t("invite.go_to_app")} <ArrowRight className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}

function ErrorCard({
  title,
  desc,
  tone,
  icon: Icon,
  primaryHref,
  primaryLabel,
}: {
  title: string;
  desc: string;
  tone: "rose" | "amber";
  icon: React.ComponentType<{ className?: string }>;
  primaryHref: string;
  primaryLabel: string;
}) {
  const iconWrap =
    tone === "rose"
      ? "bg-rose-500/[0.06] dark:bg-rose-500/[0.02] border-rose-500/30 dark:border-rose-500/10 text-rose-700 dark:text-rose-300"
      : "bg-amber-500/15 dark:bg-amber-500/10 border-amber-500/30 dark:border-amber-500/20 text-amber-700 dark:text-amber-400";
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-card card-elevated text-center">
      <div
        className={cn(
          "size-12 rounded-full flex items-center justify-center mx-auto mb-3 border",
          iconWrap,
        )}
      >
        <Icon className="size-6" />
      </div>
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground mb-4">{desc}</p>
      <Button variant="outline" render={<a href={primaryHref} />}>
        {primaryLabel}
      </Button>
    </div>
  );
}

function EmailMismatchCard({
  invitedEmail,
  currentEmail,
}: {
  invitedEmail: string;
  currentEmail: string;
}) {
  const t = useT();
  const { logout } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSwitch = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      // Stay on this URL so the page re-runs the preview after sign-in.
      router.refresh();
      setSigningOut(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-card card-elevated text-center">
      <div className="size-12 rounded-full bg-rose-500/[0.06] dark:bg-rose-500/[0.02] border border-rose-500/30 dark:border-rose-500/10 text-rose-700 dark:text-rose-300 flex items-center justify-center mx-auto mb-3">
        <AlertTriangle className="size-6" />
      </div>
      <h2 className="text-lg font-semibold mb-1">
        {t("invite.error.title.generic")}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("invite.error.email_mismatch", {
          invitedEmail,
          currentEmail,
        })}
      </p>
      <Button
        onClick={handleSwitch}
        disabled={signingOut}
        className="bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {signingOut ? (
          <Loader2 className="size-4 animate-spin" />
        ) : null}{" "}
        {t("invite.sign_out_action")}
      </Button>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-36 shrink-0">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex-1 min-w-0">{value}</div>
    </div>
  );
}
