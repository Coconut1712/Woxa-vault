"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  Key,
  Loader2,
  LogOut,
  Monitor,
  Plug,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  User,
  UserCog,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApiErrorState,
  ApiLoadingState,
} from "@/components/shared/api-states";
import {
  SectionTitle,
  Card,
  Field,
  NotificationRow,
  SecurityMethod,
  IntegrationRow,
  DangerCard,
} from "@/components/settings/primitives";
import { SectionTabs } from "@/components/settings/section-tabs";
import { RecoveryKitModal } from "@/components/auth/recovery-kit-modal";
import { TwoFactorCard } from "@/components/auth/two-factor-card";
import { ApiError } from "@/lib/api/client";
import {
  getMe,
  regenerateRecoveryKit,
  revokeOtherSessions,
  updateProfile,
  type MeUser,
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings,
} from "@/lib/api/me";
import type { OrgRole } from "@/lib/api/members";
import { useAuth } from "@/lib/auth/provider";
import { formatDate, formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

type Section = "profile" | "security" | "notifications" | "integrations";

const ACCOUNT_SECTIONS = new Set<Section>([
  "profile",
  "security",
  "notifications",
  "integrations",
]);

function sectionFromTabParam(value: string | null): Section | null {
  if (!value || !ACCOUNT_SECTIONS.has(value as Section)) return null;
  return value as Section;
}

const ROLE_TONE: Record<
  OrgRole,
  { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  owner: {
    icon: Crown,
    color:
      "bg-amber-500/15 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/20",
  },
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

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountPageContent />
    </Suspense>
  );
}

function AccountPageContent() {
  const t = useT();
  const searchParams = useSearchParams();
  const [active, setActive] = useState<Section>("profile");

  const [me, setMe] = useState<MeUser | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await getMe(signal);
      if (signal?.aborted) return;
      setMe(next);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof ApiError) {
        setLoadError(err);
      } else {
        setLoadError(new ApiError(0, "network_error", String(err)));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  useEffect(() => {
    const tab = sectionFromTabParam(searchParams.get("tab"));
    if (tab) setActive(tab);
  }, [searchParams]);

  const sections = [
    { id: "profile" as const, label: t("settings.profile"), icon: User },
    {
      id: "security" as const,
      label: t("settings.security_2fa"),
      icon: ShieldCheck,
    },
    {
      id: "notifications" as const,
      label: t("settings.notifications"),
      icon: Bell,
    },
    {
      id: "integrations" as const,
      label: t("settings.personal_integrations"),
      icon: Plug,
    },
  ];

  return (
    <>
      <Topbar
        title={t("settings.account_settings")}
        subtitle={t("settings.account_subtitle", { email: me?.email ?? "—" })}
      />

      <div className="flex-1 overflow-y-auto">
        <SectionTabs<Section>
          tabs={sections}
          active={active}
          onChange={setActive}
        />

        <div className="max-w-3xl mx-auto px-8 py-8">
          {loading && <ApiLoadingState variant="page" />}

          {!loading && loadError && (
            <ApiErrorState
              error={loadError}
              variant="page"
              onRetry={() => void load()}
            />
          )}

          {!loading && !loadError && me && (
            <>
              {active === "profile" && (
                <ProfileSection me={me} onUpdated={setMe} />
              )}
              {active === "security" && (
                <SecuritySection me={me} onUpdated={setMe} />
              )}
              {active === "notifications" && <NotificationsSection />}
              {active === "integrations" && <IntegrationsSection />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* =====================================================================
   PROFILE — wired to GET /me + PATCH /me
   ===================================================================== */
function ProfileSection({
  me,
  onUpdated,
}: {
  me: MeUser;
  onUpdated: (next: MeUser) => void;
}) {
  const t = useT();
  const { refresh: refreshAuth } = useAuth();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(me.displayName);
  }, [me.displayName]);

  const trimmed = displayName.trim();
  const dirty = trimmed !== me.displayName;
  const invalid = trimmed.length === 0;

  const initials = me.displayName
    ? me.displayName
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : me.email[0]?.toUpperCase() ?? "?";

  const role = me.role ? ROLE_TONE[me.role] : null;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !dirty || invalid) return;
    setSaving(true);
    setError(null);
    try {
      const next = await updateProfile({ displayName: trimmed });
      onUpdated(next);
      await refreshAuth();
      toast.success(t("account.profile.saved"));
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") {
        setError(t("account.profile.error.empty_name"));
      } else {
        toast.error(t("account.error.update_failed"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title={t("account.profile.section_title")}
        description={t("account.profile.section_desc")}
      />

      <Card>
        <form className="space-y-6" onSubmit={handleSave} noValidate>
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarFallback className="text-base bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {me.displayName || me.email}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {me.email}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t("account.profile.displayName_label")}>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("invite.signup.displayName_placeholder")}
                maxLength={120}
                aria-invalid={invalid || undefined}
              />
              {error && (
                <p className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1 mt-1">
                  <AlertCircle className="size-3" />
                  {error}
                </p>
              )}
            </Field>
            <Field label={t("account.profile.email_label")}>
              <Input value={me.email} disabled />
              <p className="text-[11px] text-muted-foreground mt-1">
                {t("account.profile.email_readonly_hint")}
              </p>
            </Field>

            <Field label={t("account.profile.role_label")}>
              {role && me.role ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "h-9 px-3 text-xs gap-1.5 w-fit",
                    role.color,
                  )}
                >
                  <role.icon className="size-3.5" />
                  {t(`members.role.${me.role}`)}
                </Badge>
              ) : (
                <div className="h-9 inline-flex items-center text-sm text-muted-foreground">
                  {t("account.profile.role_none")}
                </div>
              )}
            </Field>

            <Field label={t("account.profile.created_at_label")}>
              <div className="h-9 inline-flex items-center text-sm tabular-nums">
                {formatDate(me.createdAt)}
              </div>
            </Field>

            <Field label={t("account.profile.last_login_label")}>
              <div className="h-9 inline-flex items-center text-sm tabular-nums">
                {me.lastLoginAt
                  ? formatDateTime(me.lastLoginAt)
                  : t("account.profile.last_login_never")}
              </div>
            </Field>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={saving || !dirty || invalid}
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("account.profile.saving")}
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  {t("account.profile.save")}
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      <DangerCard
        title={t("danger.delete_account")}
        description={t("danger.delete_account_desc")}
        actionLabel={t("danger.delete_account")}
      />
    </div>
  );
}

/* =====================================================================
   SECURITY — Recovery Kit (wired) + 2FA + Sessions
   ===================================================================== */
function SecuritySection({
  me,
  onUpdated,
}: {
  me: MeUser;
  onUpdated: (next: MeUser) => void;
}) {
  const t = useT();
  const { refresh: refreshAuth } = useAuth();
  const [passkeysEnabled, setPasskeysEnabled] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const next = await getMe();
      onUpdated(next);
    } catch {
      // non-fatal; the next render of /me will reconcile.
    }
    // Keep the AuthProvider's `me` in sync so the rest of the app reflects
    // the new 2FA state (e.g. the lock overlay, settings nav).
    void refreshAuth();
  }, [onUpdated, refreshAuth]);

  return (
    <div className="space-y-6">
      <SectionTitle
        title={t("settings.security_2fa")}
        description={t("settings.security_2fa_desc")}
      />

      <RecoveryKitCard me={me} onUpdated={onUpdated} />

      <TwoFactorCard me={me} onChanged={() => void refreshMe()} />

      <Card>
        <h3 className="text-sm font-semibold mb-1">
          {t("account.other_methods")}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("settings.2fa_required_by_policy")}
        </p>

        <div className="space-y-2">
          <SecurityMethod
            icon={ShieldCheck}
            color="violet"
            title={t("settings.passkeys_title")}
            description={t("settings.passkeys_desc")}
            enabled={passkeysEnabled}
            onToggle={() => setPasskeysEnabled((v) => !v)}
            extra={t("settings.passkeys_count")}
          />
        </div>

        <Separator className="my-4 bg-surface-3" />

        <Button variant="outline" size="sm">
          <Plus className="size-3.5" /> {t("settings.add_method")}
        </Button>
      </Card>

      <SessionsCard />
    </div>
  );
}

/* =====================================================================
   Recovery Kit card — wired to POST /me/recovery-kit/regenerate
   ===================================================================== */
function RecoveryKitCard({
  me,
  onUpdated,
}: {
  me: MeUser;
  onUpdated: (next: MeUser) => void;
}) {
  const t = useT();
  const { refresh: refreshAuth } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const resetDialog = useCallback(() => {
    setPassword("");
    setShowPassword(false);
    setInlineError(null);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (password.length === 0) {
      setInlineError(t("account.recovery_kit.error.invalid_password"));
      return;
    }
    setSubmitting(true);
    setInlineError(null);
    try {
      const res = await regenerateRecoveryKit({ password });
      setRecoveryCode(res.recoveryCode);
      setConfirmOpen(false);
      resetDialog();
      // Pull a fresh /me so the status row reflects the new generation time.
      try {
        const next = await getMe();
        onUpdated(next);
      } catch {
        // non-fatal
      }
      void refreshAuth();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials" || err.status === 401) {
          setInlineError(t("account.recovery_kit.error.invalid_password"));
        } else if (err.code === "rate_limited" || err.status === 429) {
          toast.error(t("account.recovery_kit.error.rate_limited"));
          setInlineError(t("account.recovery_kit.error.rate_limited"));
        } else {
          setInlineError(t("account.recovery_kit.error.regenerate_failed"));
        }
      } else {
        setInlineError(t("account.recovery_kit.error.regenerate_failed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Key className="size-4 text-muted-foreground" />
              {t("account.recovery_kit.section_title")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              {t("account.recovery_kit.subtitle")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetDialog();
              setConfirmOpen(true);
            }}
          >
            <RefreshCw className="size-3.5" />
            {t("account.recovery_kit.regenerate")}
          </Button>
        </div>

        <RecoveryKitStatus me={me} />
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (submitting) return;
          setConfirmOpen(next);
          if (!next) resetDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("account.recovery_kit.regenerate_confirm_title")}
            </DialogTitle>
            <DialogDescription>
              {t("account.recovery_kit.regenerate_confirm_desc")}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={handleSubmit}
            noValidate
            id="recovery-kit-regen-form"
          >
            <Field label={t("account.recovery_kit.regenerate_password_label")}>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  autoFocus
                  className="pr-10 font-mono-secret"
                  aria-invalid={inlineError ? true : undefined}
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
              {inlineError && (
                <p className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1 mt-1">
                  <AlertCircle className="size-3" />
                  {inlineError}
                </p>
              )}
            </Field>
          </form>

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                resetDialog();
              }}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              form="recovery-kit-regen-form"
              type="submit"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={submitting || password.length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("account.recovery_kit.regenerating")}
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" />
                  {t("account.recovery_kit.regenerate")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {recoveryCode && (
        <RecoveryKitModal
          recoveryCode={recoveryCode}
          context="regenerate"
          onConfirm={() => setRecoveryCode(null)}
        />
      )}
    </>
  );
}

function RecoveryKitStatus({ me }: { me: MeUser }) {
  const t = useT();
  if (me.hasRecoveryKit && me.recoveryKitCreatedAt) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="size-6 rounded-full bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
          <CheckCircle2 className="size-3.5" />
        </span>
        <span className="text-muted-foreground">
          {t("account.recovery_kit.status_active", {
            when: formatDateTime(me.recoveryKitCreatedAt),
          })}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="size-6 rounded-full bg-rose-500/[0.10] dark:bg-rose-500/[0.04] text-rose-700 dark:text-rose-300 flex items-center justify-center">
        <AlertTriangle className="size-3.5" />
      </span>
      <span className="text-rose-700 dark:text-rose-300">
        {t("account.recovery_kit.status_missing")}
      </span>
    </div>
  );
}

/* =====================================================================
   Sessions card — POST /me/sessions/revoke-all
   ===================================================================== */
function SessionsCard() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const resetDialog = () => {
    setPassword("");
    setShowPassword(false);
    setInlineError(null);
  };

  const handleRevoke = async (e: FormEvent) => {
    e.preventDefault();
    if (revoking) return;
    if (password.length === 0) return;
    setRevoking(true);
    setInlineError(null);
    try {
      // Backend now requires current-password confirmation (defense-in-depth
      // against stolen-session takeover).
      const res = await revokeOtherSessions({ password });
      if (res.revokedCount > 0) {
        toast.success(
          t("account.sessions.revoked", { count: res.revokedCount }),
        );
      } else {
        toast.info(t("account.sessions.revoked_none"));
      }
      setOpen(false);
      resetDialog();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials" || err.status === 401) {
          setInlineError(t("account.sessions.error.invalid_password"));
        } else if (err.code === "rate_limited" || err.status === 429) {
          toast.error(t("account.sessions.error.rate_limited"));
          setInlineError(t("account.sessions.error.rate_limited"));
        } else {
          setInlineError(t("account.error.update_failed"));
        }
      } else {
        setInlineError(t("account.error.update_failed"));
      }
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Monitor className="size-4 text-muted-foreground" />
              {t("account.sessions.section_title")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              {t("account.sessions.subtitle")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-rose-700 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 hover:bg-rose-500/15 dark:hover:bg-rose-500/10 border-rose-500/30 dark:border-rose-500/15"
            onClick={() => setOpen(true)}
          >
            <LogOut className="size-3.5" />
            {t("account.sessions.revoke_all")}
          </Button>
        </div>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
            resetDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("account.sessions.revoke_confirm_title")}
            </DialogTitle>
            <DialogDescription>
              {t("account.sessions.revoke_confirm")}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            id="sessions-revoke-form"
            onSubmit={handleRevoke}
            noValidate
          >
            <Field label={t("account.sessions.password_label")}>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (inlineError) setInlineError(null);
                  }}
                  autoComplete="current-password"
                  required
                  autoFocus
                  className="pr-10 font-mono-secret"
                  aria-invalid={inlineError ? true : undefined}
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
              {inlineError && (
                <p className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1 mt-1">
                  <AlertCircle className="size-3" />
                  {inlineError}
                </p>
              )}
            </Field>
          </form>

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setOpen(false);
                resetDialog();
              }}
              disabled={revoking}
            >
              {t("common.cancel")}
            </Button>
            <Button
              form="sessions-revoke-form"
              type="submit"
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              disabled={revoking || password.length === 0}
            >
              {revoking ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("account.sessions.revoking")}
                </>
              ) : (
                <>
                  <LogOut className="size-3.5" />
                  {t("account.sessions.revoke_all")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* =====================================================================
   NOTIFICATIONS (functional settings)
   ===================================================================== */
function NotificationsSection() {
  const t = useT();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await getNotificationSettings(signal);
      if (!signal?.aborted) setSettings(res);
    } catch (err) {
      if (!signal?.aborted) setLoadError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const patch = async (key: keyof NotificationSettings, value: boolean) => {
    if (busy || !settings) return;
    setBusy(true);
    const prev = { ...settings };
    setSettings((s) => (s ? { ...s, [key]: value } : null));

    try {
      await updateNotificationSettings({ [key]: value });
    } catch {
      setSettings(prev);
      toast.error(t("api.error.save_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title={t("settings.notifications")}
        description={t("account.notif_desc")}
      />

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">
            {t("settings.notifications_email")}
          </h3>
          {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {loadError && (
            <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
              <AlertTriangle className="size-3" />
              {t("api.error.load_failed")}
            </div>
          )}
        </div>
        <div className="space-y-3 divide-y divide-line-1">
          <NotificationRow
            title={t("settings.notif.new_login")}
            description={t("settings.notif.new_login_desc")}
            recommended
            checked={settings?.newLogin}
            onChange={(v) => patch("newLogin", v)}
            disabled={loading || busy}
          />
          <NotificationRow
            title={t("settings.notif.send_received")}
            description={t("settings.notif.send_received_desc")}
            checked={settings?.sendReceived}
            onChange={(v) => patch("sendReceived", v)}
            disabled={loading || busy}
          />
          <NotificationRow
            title={t("settings.notif.send_expired")}
            description={t("settings.notif.send_expired_desc")}
            defaultChecked
            disabled
          />
          <NotificationRow
            title={t("settings.notif.vault_shared")}
            description={t("settings.notif.vault_shared_desc")}
            checked={settings?.vaultShared}
            onChange={(v) => patch("vaultShared", v)}
            disabled={loading || busy}
          />
          <NotificationRow
            title={t("settings.notif.rotation")}
            description={t("settings.notif.rotation_desc")}
            defaultChecked
            disabled
          />
          <NotificationRow
            title={t("settings.notif.weekly")}
            description={t("settings.notif.weekly_desc")}
            disabled
          />
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-4">
          {t("settings.notifications_in_app")}
        </h3>
        <div className="space-y-3 divide-y divide-line-1">
          <NotificationRow
            title={t("settings.notif.mentions")}
            description={t("settings.notif.mentions_desc")}
            defaultChecked
            disabled
          />
          <NotificationRow
            title={t("settings.notif.sounds")}
            description={t("settings.notif.sounds_desc")}
            disabled
          />
        </div>
      </Card>
    </div>
  );
}


/* =====================================================================
   PERSONAL INTEGRATIONS (mock copy preserved)
   ===================================================================== */
function IntegrationsSection() {
  const t = useT();
  return (
    <div className="space-y-6">
      <SectionTitle
        title={t("settings.personal_integrations")}
        description={t("account.integrations_desc")}
      />

      <Card>
        <h3 className="text-sm font-semibold mb-1">
          {t("account.browser_extension")}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("account.browser_extension_desc")}
        </p>
        <div className="space-y-2">
          <IntegrationRow
            name="Chrome"
            description={t("account.install_chrome")}
            color="blue"
            status="coming_soon"
          />
          <IntegrationRow
            name="Firefox"
            description={t("account.install_firefox")}
            color="amber"
            status="coming_soon"
          />
          <IntegrationRow
            name="Edge"
            description={t("account.install_edge")}
            color="cyan"
            status="coming_soon"
          />
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-1">{t("account.cli_mobile")}</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("account.cli_mobile_desc")}
        </p>
        <div className="space-y-2">
          <IntegrationRow
            name="CLI"
            description={t("account.cli_install_desc")}
            color="violet"
            status="coming_soon"
          />
          <IntegrationRow
            name={t("account.ios_app")}
            description={t("account.ios_app_desc")}
            color="emerald"
            status="coming_soon"
          />
          <IntegrationRow
            name={t("account.android_app")}
            description={t("account.android_app_desc")}
            color="rose"
            status="coming_soon"
          />
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-1">{t("account.api_tokens")}</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("account.api_tokens_desc")}
        </p>
        <div className="flex items-center justify-between p-3 rounded-lg bg-surface-1 border border-line-1">
          <div>
            <div className="text-sm font-medium">{t("account.no_tokens_yet")}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("account.workspace_tokens_hint")}
            </div>
          </div>
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> {t("account.new_token")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
