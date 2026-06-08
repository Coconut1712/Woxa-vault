"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  KeyRound,
  CreditCard,
  Check,
  Plus,
  RefreshCw,
  PlayCircle,
  ShieldAlert,
  UserPlus,
  Ban,
  Users as UsersIcon,
  Trash2,
  Plug,
  ShieldCheck,
  Globe,
  Clock,
  Fingerprint,
  UserX,
  AlertTriangle,
  Loader2,
  Construction,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ssoProviders, groupMappings, ssoEvents } from "@/lib/mock/sso";
import { timeAgo, formatDateTime } from "@/lib/format";
import { colorFor } from "@/components/icon";
import { AllowedDomains } from "@/components/vault/allowed-domains";
import {
  ApiErrorState,
  ApiLoadingState,
} from "@/components/shared/api-states";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SectionTitle,
  Card,
  Field,
  IntegrationRow,
  DangerCard,
} from "@/components/settings/primitives";
import { SectionTabs } from "@/components/settings/section-tabs";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { canViewWorkspaceSettings } from "@/lib/auth/permissions";
import { ApiError, VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
  ROTATION_DAYS_MAX,
  ROTATION_DAYS_MIN,
  type WorkspaceSettings,
  type WorkspaceSettingsPatch,
} from "@/lib/api/workspace-settings";
import { parseRotationDays } from "@/components/vault/rotation-badge";
import {
  listMyWorkspaces,
  renameWorkspace,
  slugifyWorkspaceName,
  WORKSPACE_NAME_MAX,
} from "@/lib/api/workspaces";
import {
  connectSlackIntegration,
  disconnectSlackIntegration,
  getWorkspaceIntegrations,
  testSlackIntegration,
  type WorkspaceIntegration,
  type WorkspaceIntegrationId,
} from "@/lib/api/workspace-integrations";
import { startGoogleSso } from "@/lib/api/sso";

type Section =
  | "workspace"
  | "sso"
  | "security"
  | "integrations"
  | "billing";

export default function SettingsPage() {
  const t = useT();
  const router = useRouter();
  const { status, me } = useAuth();
  const [active, setActive] = useState<Section>("workspace");
  // Real active workspace (name + slug) for the rename form + Topbar subtitle.
  // Resolved from GET /me/workspaces by the session's activeOrgId — the same
  // source the workspace switcher uses. null while loading or if the lookup
  // fails (the rename form then renders disabled rather than crashing).
  const [activeWs, setActiveWs] = useState<
    { id: string; name: string; slug: string } | null
  >(null);
  const [wsLoading, setWsLoading] = useState(true);

  // Below-admin (member/guest) must not reach Workspace Settings. The backend
  // mirrors this with admin-only mutations; here we redirect direct-URL access
  // to /app once we know the role. While auth is still loading we render a quiet
  // splash so protected content never flashes.
  const allowed = canViewWorkspaceSettings(me?.role ?? null);
  useEffect(() => {
    if (status === "authenticated" && me && !allowed) {
      router.replace("/app");
    }
  }, [status, me, allowed, router]);

  useEffect(() => {
    if (status !== "authenticated" || !me) return;
    let alive = true;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const list = await listMyWorkspaces(ctrl.signal);
        if (!alive) return;
        const found =
          (me.activeOrgId
            ? list.find((w) => w.id === me.activeOrgId)
            : undefined) ??
          list[0] ??
          null;
        if (found)
          setActiveWs({ id: found.id, name: found.name, slug: found.slug });
      } catch {
        // Leave activeWs null; the rename form degrades to disabled inputs.
      } finally {
        if (alive) setWsLoading(false);
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [status, me]);

  if (status !== "authenticated" || !me || !allowed) {
    return <BootSplash label={t("auth.checking_session")} />;
  }

  const sections = [
    { id: "workspace" as const, label: t("settings.workspace"), icon: Building2 },
    { id: "sso" as const, label: t("settings.sso"), icon: KeyRound },
    { id: "security" as const, label: t("settings.security_policy"), icon: ShieldCheck },
    { id: "integrations" as const, label: t("settings.integrations"), icon: Plug },
    { id: "billing" as const, label: t("settings.billing"), icon: CreditCard },
  ];

  return (
    <>
      <Topbar
        title={t("settings.workspace_settings")}
        subtitle={t("settings.workspace_subtitle", { name: activeWs?.name ?? "" })}
        actions={
          <Badge
            variant="outline"
            className="text-[10px] gap-1 border-violet-500/20 bg-violet-500/10 text-violet-300"
          >
            <ShieldAlert className="size-2.5" /> {t("status.admin_only")}
          </Badge>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <SectionTabs<Section>
          tabs={sections}
          active={active}
          onChange={setActive}
        />

        <div className="max-w-3xl mx-auto px-8 py-8">
          {active === "workspace" && (
            <WorkspaceSection
              key={activeWs ? activeWs.id : "loading"}
              workspace={activeWs}
              loading={wsLoading}
              canEdit={me.role === "owner" || me.role === "admin"}
              onRenamed={(name, slug) =>
                setActiveWs((p) => (p ? { ...p, name, slug } : p))
              }
            />
          )}
          {active === "sso" && <SsoSection />}
          {active === "security" && <SecurityPolicySection />}
          {active === "integrations" && (
            <IntegrationsSection
              canEdit={me.role === "owner" || me.role === "admin"}
              onGoToSso={() => setActive("sso")}
            />
          )}
          {active === "billing" && <BillingSection />}
        </div>
      </div>
    </>
  );
}

/* =====================================================================
   WORKSPACE SETTINGS CONTROLLER
   Single GET load that hydrates every backend-backed control, plus a
   per-field PATCH that copies the require2fa gold-standard pattern:
   optimistic merge → re-sync from the PATCH response → revert + toast on
   403 forbidden / 429 rate_limited / generic.
   ===================================================================== */
function useWorkspaceSettingsController() {
  const t = useT();
  const { me } = useAuth();
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Owner + admin only may MUTATE; everyone else reads policies as read-only.
  // UX gate only — the backend is the boundary and a 403 still reverts.
  const canEdit = me?.role === "owner" || me?.role === "admin";

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await getWorkspaceSettings(signal);
      setSettings(next);
      setLoadFailed(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Recover on unlock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => void load();
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [load]);

  // Apply an optimistic merge locally, persist the partial, then re-sync from
  // the server's full response. Returns true on success, false on failure
  // (caller may run side effects only on success).
  const patch = useCallback(
    async (
      body: WorkspaceSettingsPatch,
      optimistic: (prev: WorkspaceSettings) => WorkspaceSettings,
      onSuccess?: (next: WorkspaceSettings) => void,
    ): Promise<boolean> => {
      if (saving || settings === null) return false;
      const prev = settings;
      setSettings(optimistic(prev));
      setSaving(true);
      try {
        const next = await updateWorkspaceSettings(body);
        setSettings(next);
        onSuccess?.(next);
        return true;
      } catch (err) {
        setSettings(prev);
        if (err instanceof ApiError) {
          if (err.code === "forbidden" || err.status === 403) {
            toast.error(t("secpol.require_2fa.error_forbidden"));
          } else if (err.code === "rate_limited" || err.status === 429) {
            toast.error(t("secpol.require_2fa.error_rate_limited"));
          } else {
            toast.error(t("secpol.require_2fa.error_generic"));
          }
        } else {
          toast.error(t("secpol.require_2fa.error_generic"));
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [settings, saving, t],
  );

  return { settings, loadFailed, saving, canEdit, patch };
}

/* =====================================================================
   WORKSPACE
   ===================================================================== */
function WorkspaceSection({
  workspace: ws,
  loading,
  canEdit,
  onRenamed,
}: {
  workspace: { id: string; name: string; slug: string } | null;
  loading: boolean;
  canEdit: boolean;
  onRenamed: (name: string, slug: string) => void;
}) {
  const t = useT();
  const { refresh } = useAuth();
  const currentName = ws?.name ?? "";
  // Seeded once from the loaded name; the parent re-keys this component by
  // workspace id, so a fresh load remounts and re-seeds without a sync effect.
  const [draft, setDraft] = useState(currentName);
  const [saving, setSaving] = useState(false);

  const trimmed = draft.trim();
  const dirty = !!ws && trimmed.length > 0 && trimmed !== currentName.trim();
  const canSave =
    canEdit && dirty && !saving && trimmed.length <= WORKSPACE_NAME_MAX;
  // Best-effort preview of the auto-derived slug while the name is edited; the
  // server is authoritative and may append a suffix on a uniqueness collision.
  const slugPreview = dirty ? slugifyWorkspaceName(trimmed) : ws?.slug ?? "";

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const renamed = await renameWorkspace({ name: trimmed });
      onRenamed(renamed.name, renamed.slug);
      setDraft(renamed.name);
      toast.success(t("settings.rename.success", { name: renamed.name }));
      // Keep the session view consistent; /me-derived surfaces and the
      // workspace switcher re-read the name + slug on their next load.
      await refresh();
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === "forbidden" || err.status === 403)
      ) {
        toast.error(t("settings.rename.error_forbidden"));
      } else if (err instanceof ApiError && err.code === "validation_error") {
        toast.error(t("settings.rename.error_invalid"));
      } else {
        toast.error(t("settings.rename.error_generic"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title={t("settings.workspace")}
        description={t("settings.workspace_desc", { name: currentName })}
      />

      <Card>
        <h3 className="text-sm font-semibold mb-4">{t("settings.general")}</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("settings.workspace_name")}>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={WORKSPACE_NAME_MAX}
              disabled={!canEdit || loading || !ws || saving}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
            />
          </Field>
          <Field label={t("settings.slug")}>
            <Input value={slugPreview} disabled />
          </Field>
        </div>
        {canEdit && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("settings.slug_auto_hint")}
          </p>
        )}
        {canEdit && (
          <div className="mt-4 flex items-center justify-end gap-2">
            {dirty && !saving && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(currentName)}
              >
                {t("common.cancel")}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={!canSave}
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {t("common.save_changes")}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-muted-foreground" />
              {t("settings.sso")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.sso_summary")}
            </p>
          </div>
          <Button variant="outline" size="sm">
            {t("settings.open_sso")}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-muted-foreground" />
              {t("settings.security_policy")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.security_policy_desc")}
            </p>
          </div>
          <Button variant="outline" size="sm">
            {t("settings.open_security_policy")}
          </Button>
        </div>
      </Card>

      <DangerCard
        title={t("danger.delete_workspace")}
        description={t("danger.delete_workspace_desc")}
        actionLabel={t("danger.delete_workspace")}
      />
    </div>
  );
}

/* =====================================================================
   SECURITY POLICY — workspace-wide auth & session rules
   ===================================================================== */
function SecurityPolicySection() {
  const t = useT();
  const { me } = useAuth();
  const { settings, loadFailed, saving, canEdit, patch } =
    useWorkspaceSettingsController();

  const require2fa = settings?.require2fa ?? null;
  const autoLock = settings ? String(settings.autoLockMinutes) : "";

  const toggleRequire2fa = (next: boolean) => {
    void patch(
      { require2fa: next },
      (prev) => ({ ...prev, require2fa: next }),
      () => {
        toast.success(
          next
            ? t("secpol.require_2fa.toast_enabled")
            : t("secpol.require_2fa.toast_disabled"),
        );
        // Heads-up: an admin who enables the policy while having no 2FA of their
        // own will be forced through /setup-2fa on their next guard pass.
        if (next && me && me.twoFactorEnabled === false) {
          toast.warning(t("secpol.require_2fa.self_enroll_warning"));
        }
      },
    );
  };

  const changeAutoLock = (value: string) => {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes === settings?.autoLockMinutes) return;
    void patch(
      { autoLockMinutes: minutes },
      (prev) => ({ ...prev, autoLockMinutes: minutes }),
      () => toast.success(t("secpol.auto_lock.toast_saved")),
    );
  };

  // US-060 — org default rotation window. Local draft committed on blur so the
  // input doesn't PATCH on every keystroke; null clears the default.
  const [rotationDraft, setRotationDraft] = useState<string | null>(null);
  const rotationValue =
    rotationDraft ??
    (settings?.rotationDefaultDays ? String(settings.rotationDefaultDays) : "");

  const commitRotationDefault = () => {
    if (!settings) return;
    const next = parseRotationDays(rotationValue);
    setRotationDraft(null);
    if (next === (settings.rotationDefaultDays ?? null)) return;
    void patch(
      { rotationDefaultDays: next },
      (prev) => ({ ...prev, rotationDefaultDays: next }),
      () => toast.success(t("rotation.org_default.toast_saved")),
    );
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title={t("settings.security_policy")}
        description={t("settings.security_policy_rules")}
      />

      {/* Authentication */}
      <Card>
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
          <Fingerprint className="size-3.5 text-muted-foreground" />
          {t("secpol.auth")}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("secpol.auth_desc")}
        </p>
        <div className="space-y-3 divide-y divide-line-1">
          <PreviewPolicyRow
            title={t("secpol.require_sso")}
            description={t("secpol.require_sso_preview_desc")}
          />
          <LivePolicyRow
            title={t("secpol.require_2fa")}
            description={t("secpol.require_2fa_desc")}
            value={require2fa}
            saving={saving}
            loadFailed={loadFailed}
            canEdit={canEdit}
            onChange={toggleRequire2fa}
          />
          <PreviewPolicyRow
            title={t("secpol.require_passkey")}
            description={t("secpol.require_passkey_desc")}
          />
        </div>
      </Card>

      {/* Sessions */}
      <Card>
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
          <Clock className="size-3.5 text-muted-foreground" />
          {t("secpol.sessions")}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("secpol.sessions_desc")}
        </p>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium flex items-center gap-1.5">
                {t("secpol.auto_lock")}
                {saving && (
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("secpol.auto_lock_desc")}
              </div>
              {loadFailed && (
                <div className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                  <AlertTriangle className="size-3 shrink-0" />
                  {t("secpol.require_2fa.load_error")}
                </div>
              )}
            </div>
            <Select
              value={autoLock}
              onValueChange={(v) => v && changeAutoLock(v)}
              disabled={!canEdit || !settings || loadFailed || saving}
            >
              <SelectTrigger className="w-32 h-9">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("secpol.minute_one")}</SelectItem>
                <SelectItem value="5">{t("secpol.minutes", { n: 5 })}</SelectItem>
                <SelectItem value="15">{t("secpol.minutes", { n: 15 })}</SelectItem>
                <SelectItem value="30">{t("secpol.minutes", { n: 30 })}</SelectItem>
                <SelectItem value="60">{t("secpol.hour_one")}</SelectItem>
                <SelectItem value="90">{t("secpol.minutes", { n: 90 })}</SelectItem>
                <SelectItem value="120">{t("secpol.hours", { n: 2 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator className="bg-surface-3" />

          {/* US-060 — org-wide default password-rotation window. */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium flex items-center gap-1.5">
                {t("rotation.org_default.title")}
                {saving && (
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("rotation.org_default.desc")}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number"
                inputMode="numeric"
                min={ROTATION_DAYS_MIN}
                max={ROTATION_DAYS_MAX}
                value={rotationValue}
                onChange={(e) => setRotationDraft(e.target.value)}
                onBlur={commitRotationDefault}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                disabled={!canEdit || !settings || loadFailed || saving}
                placeholder={t("rotation.org_default.placeholder")}
                className="w-32 h-9"
              />
              <span className="text-xs text-muted-foreground">
                {t("rotation.policy.unit")}
              </span>
            </div>
          </div>

          <Separator className="bg-surface-3" />

          <div className="flex items-start gap-3 opacity-60">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium flex items-center gap-1.5">
                {t("secpol.max_session")}
                <Badge
                  variant="outline"
                  className="text-[9px] h-4 px-1.5 border-line-2 bg-surface-1 text-muted-foreground"
                >
                  {t("common.preview")}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("secpol.max_session_desc")}
              </div>
            </div>
            <Select value="12" disabled>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12">{t("secpol.hours", { n: 12 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Access controls */}
      <Card>
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
          <UserX className="size-3.5 text-muted-foreground" />
          {t("secpol.access")}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("secpol.access_desc")}
        </p>
        <div className="space-y-3 divide-y divide-line-1">
          <PreviewPolicyRow
            title={t("secpol.block_guest")}
            description={t("secpol.block_guest_desc")}
          />
          <PreviewPolicyRow
            title={t("secpol.restrict_export")}
            description={t("secpol.restrict_export_desc")}
          />
        </div>
      </Card>

      {/* Network policy (advanced) */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Globe className="size-3.5 text-muted-foreground" /> {t("secpol.ip_allow")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("secpol.ip_allow_desc")}
            </p>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] border-amber-500/20 bg-amber-500/10 text-amber-400"
          >
            {t("secpol.enterprise_plan")}
          </Badge>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="size-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{t("secpol.compliance")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("secpol.compliance_desc")}{" "}
              <a href="#" className="underline">{t("secpol.generate_report")}</a>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* Live, role-gated workspace-policy toggle row.
   - value === null  → still loading the workspace settings.
   - loadFailed       → GET failed; show a read-only error hint.
   - canEdit          → owner/admin only; otherwise read-only switch + hint. */
function LivePolicyRow({
  title,
  description,
  value,
  saving,
  loadFailed,
  canEdit,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean | null;
  saving: boolean;
  loadFailed: boolean;
  canEdit: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useT();
  const loading = value === null && !loadFailed;
  const disabled = !canEdit || loading || loadFailed || saving;

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
          {title}
          {value === true && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            >
              {t("common.enforced")}
            </Badge>
          )}
          {saving && (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          )}
          {!canEdit && !loadFailed && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 border-line-2 bg-surface-1 text-muted-foreground"
            >
              {t("common.read_only")}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{description}</div>
        {!canEdit && !loadFailed && (
          <div className="text-[11px] text-muted-foreground mt-1">
            {t("secpol.require_2fa.read_only_hint")}
          </div>
        )}
        {loadFailed && (
          <div className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 mt-1">
            <AlertTriangle className="size-3 shrink-0" />
            {t("secpol.require_2fa.load_error")}
          </div>
        )}
      </div>
      <Switch
        checked={value === true}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={title}
      />
    </div>
  );
}

/* Static preview row for a policy that has NO backend yet. The switch is inert
   (disabled, off) and a "Preview" badge makes clear it does not persist — the
   page never lies about what saves. */
function PreviewPolicyRow({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const t = useT();
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 opacity-60">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {title}
          <Badge
            variant="outline"
            className="text-[9px] h-4 px-1.5 border-line-2 bg-surface-1 text-muted-foreground"
          >
            {t("common.preview")}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={false} disabled aria-label={title} />
    </div>
  );
}

/* =====================================================================
   SSO & PROVISIONING
   ===================================================================== */
function SsoSection() {
  const t = useT();
  // SSO domain-enforcement (allowedDomains / requireSso / jitEnabled) all hang
  // off the unbuilt verified per-org domain binding (org_domains / AC-006.2), so
  // none can be presented as a live, enforced control yet. We only READ the
  // backend list to show it read-only; nothing here issues a PATCH.
  const { settings, loadFailed } = useWorkspaceSettingsController();

  const available = ssoProviders.filter((p) => p.status === "available");

  const allowedDomains = settings?.sso.allowedDomains ?? null;

  return (
    <div className="space-y-6">
      <SectionTitle
        title={t("sso.title")}
        description={t("sso.subtitle")}
      />

      <Card>
        <AllowedDomains
          domains={allowedDomains}
          loading={settings === null && !loadFailed}
          loadFailed={loadFailed}
        />
        <p className="text-[10px] text-muted-foreground mt-4 pt-3 border-t border-line-1">
          {t("sso.domain_enforcement_pending")}
        </p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-1">{t("sso.provisioning_behavior")}</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("sso.provisioning_desc_prefix")}{" "}
          <span className="text-foreground">{t("settings.security_policy")}</span>.
        </p>
        <div className="space-y-3 divide-y divide-line-1">
          <PreviewPolicyRow
            title={t("sso.jit")}
            description={t("sso.jit_preview_desc")}
          />
          <PreviewPolicyRow
            title={t("sso.auto_deprovision")}
            description={t("sso.auto_deprovision_desc")}
          />
        </div>
      </Card>

      <div className="rounded-2xl border border-dashed border-line-2 bg-surface-1 px-4 py-3 flex items-center gap-2">
        <ShieldAlert className="size-3.5 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          {t("sso.preview_section_note")}
        </p>
      </div>

      <div className="space-y-6 opacity-70 pointer-events-none select-none" aria-hidden>
        <Card>
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center shrink-0">
            <GoogleMark />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-semibold">Google Workspace</h3>
              <Badge
                variant="outline"
                className="text-[10px] border-line-2 bg-surface-1 text-muted-foreground gap-1"
              >
                {t("common.preview")}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              <code className="font-mono-secret">@iux24.com</code> ·{" "}
              {t("sso.members_last_sync", { n: 12, when: timeAgo("2026-05-13T13:55:00Z") })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                <RefreshCw className="size-3.5" /> {t("sso.sync_now")}
              </Button>
              <Button variant="outline" size="sm">
                <PlayCircle className="size-3.5" /> {t("sso.test_login")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 ml-auto"
              >
                <Ban className="size-3.5" /> {t("common.disconnect")}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">{t("sso.group_mapping")}</h3>
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> {t("sso.add_mapping")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {t("sso.group_mapping_desc")}
        </p>

        <div className="rounded-xl border border-line-1 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-line-1 bg-surface-1">
              <tr>
                <th className="text-left font-semibold px-3 py-2">
                  {t("sso.col.google_group")}
                </th>
                <th className="text-left font-semibold px-3 py-2">{t("sso.col.woxa_team")}</th>
                <th className="text-left font-semibold px-3 py-2">{t("sso.col.members")}</th>
                <th className="text-left font-semibold px-3 py-2">{t("sso.col.auto_sync")}</th>
                <th className="text-left font-semibold px-3 py-2">{t("sso.col.last_sync")}</th>
                <th className="w-10 px-3" />
              </tr>
            </thead>
            <tbody>
              {groupMappings.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-line-1 last:border-b-0 hover:bg-surface-1"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-md bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center">
                        <UsersIcon className="size-3 text-blue-400" />
                      </div>
                      <code className="font-mono-secret text-xs">
                        {m.groupName}
                      </code>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className="text-[10px] border-line-1 bg-surface-1 font-medium"
                    >
                      {m.teamName}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                    {m.memberCount}
                  </td>
                  <td className="px-3 py-2.5">
                    <Switch defaultChecked={m.autoSync} />
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                    {timeAgo(m.lastSyncedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      aria-label={t("common.remove")}
                      className="size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 flex items-center justify-center"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-1">{t("sso.default_jit_role")}</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("sso.default_jit_desc")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("sso.default_role")}>
            <Select defaultValue="member">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">{t("sso.role.member")}</SelectItem>
                <SelectItem value="guest">{t("sso.role.guest")}</SelectItem>
                <SelectItem value="admin">{t("sso.role.admin")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("sso.initial_vault")}>
            <Select defaultValue="none">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("sso.vault.none")}</SelectItem>
                <SelectItem value="shared">{t("sso.vault.shared")}</SelectItem>
                <SelectItem value="onboarding">
                  {t("sso.vault.onboarding")}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-1">{t("sso.add_provider")}</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("sso.add_provider_desc")}
        </p>
        <div className="space-y-2">
          {available.map((p) => {
            const c = colorFor(p.color);
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface-1 border border-line-1"
              >
                <div
                  className={`size-9 rounded-lg ring-1 flex items-center justify-center font-semibold text-xs ${c.bg} ${c.ring} ${c.text}`}
                >
                  {p.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("sso.enterprise_sso_desc")}
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  {t("common.connect")}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{t("sso.recent_events")}</h3>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            {t("sso.view_full_audit")} →
          </Button>
        </div>
        <div className="space-y-1.5 divide-y divide-white/[0.04]">
          {ssoEvents.map((ev) => (
            <SsoEventRow key={ev.id} event={ev} />
          ))}
        </div>
      </Card>

      <DangerCard
        title={t("sso.disconnect_title")}
        description={t("sso.disconnect_desc")}
        actionLabel={t("common.disconnect")}
      />
      </div>
    </div>
  );
}

function SsoEventRow({ event }: { event: (typeof ssoEvents)[number] }) {
  const styles: Record<
    typeof event.type,
    { icon: React.ComponentType<{ className?: string }>; color: string }
  > = {
    "login.success": {
      icon: Check,
      color: "bg-emerald-500/10 ring-emerald-500/20 text-emerald-400",
    },
    "login.blocked": {
      icon: Ban,
      color: "bg-rose-500/10 ring-rose-500/20 text-rose-400",
    },
    "jit.provisioned": {
      icon: UserPlus,
      color: "bg-violet-500/10 ring-violet-500/20 text-violet-400",
    },
    "group.synced": {
      icon: RefreshCw,
      color: "bg-blue-500/10 ring-blue-500/20 text-blue-400",
    },
    "group.removed": {
      icon: Trash2,
      color: "bg-amber-500/10 ring-amber-500/20 text-amber-400",
    },
    "domain.rejected": {
      icon: ShieldAlert,
      color: "bg-rose-500/10 ring-rose-500/20 text-rose-400",
    },
  };
  const s = styles[event.type];
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0">
      <div
        className={`size-7 rounded-md ring-1 flex items-center justify-center shrink-0 ${s.color}`}
      >
        <s.icon className="size-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm">
          <span className="font-medium">{event.email}</span>
          <span className="text-muted-foreground"> · {event.detail}</span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
          <span className="font-mono-secret">{event.type}</span>
          <span>·</span>
          <span>{formatDateTime(event.timestamp)}</span>
          {event.ip && (
            <>
              <span>·</span>
              <span className="font-mono-secret">{event.ip}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.31v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.83Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

/* =====================================================================
   WORKSPACE INTEGRATIONS — GET/PATCH /workspace/integrations*
   ===================================================================== */
const INTEGRATION_UI: Record<
  WorkspaceIntegrationId,
  {
    name: string;
    description: string;
    color: "blue" | "emerald" | "violet" | "cyan" | "fuchsia" | "rose";
  }
> = {
  google_workspace: {
    name: "Google Workspace",
    description: "intg.google_workspace_desc",
    color: "blue",
  },
  slack: {
    name: "Slack",
    description: "intg.slack_desc",
    color: "emerald",
  },
  github: {
    name: "GitHub",
    description: "intg.github_desc",
    color: "violet",
  },
  microsoft_entra: {
    name: "Microsoft Entra ID",
    description: "intg.entra_desc",
    color: "cyan",
  },
  datadog: {
    name: "Datadog",
    description: "intg.datadog_desc",
    color: "fuchsia",
  },
  pagerduty: {
    name: "PagerDuty",
    description: "intg.pagerduty_desc",
    color: "rose",
  },
};

function IntegrationsSection({
  canEdit,
  onGoToSso,
}: {
  canEdit: boolean;
  onGoToSso: () => void;
}) {
  const t = useT();
  const [integrations, setIntegrations] = useState<WorkspaceIntegration[] | null>(
    null,
  );
  const [platformSso, setPlatformSso] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [slackOpen, setSlackOpen] = useState(false);
  const [slackUrl, setSlackUrl] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getWorkspaceIntegrations(signal);
      if (signal?.aborted) return;
      setIntegrations(res.integrations);
      setPlatformSso(res.platform.googleSsoConfigured);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof ApiError) setLoadError(err);
      else setLoadError(new ApiError(0, "network_error", String(err)));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const handleApiError = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.code === "forbidden" || err.status === 403) {
        toast.error(t("intg.error_forbidden"));
      } else if (err.code === "rate_limited" || err.status === 429) {
        toast.error(t("secpol.require_2fa.error_rate_limited"));
      } else {
        toast.error(t("intg.error_generic"));
      }
    } else {
      toast.error(t("intg.error_generic"));
    }
  };

  const openSlackDialog = () => {
    setSlackUrl("");
    setSlackOpen(true);
  };

  const saveSlack = async () => {
    const trimmed = slackUrl.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await connectSlackIntegration({ webhookUrl: trimmed });
      setIntegrations(res.integrations);
      setPlatformSso(res.platform.googleSsoConfigured);
      setSlackOpen(false);
      toast.success(t("intg.slack_connect_success"));
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const disconnectSlack = async () => {
    setBusy(true);
    try {
      const res = await disconnectSlackIntegration();
      setIntegrations(res.integrations);
      setPlatformSso(res.platform.googleSsoConfigured);
      toast.success(t("intg.slack_disconnect_success"));
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const testSlack = async () => {
    setBusy(true);
    try {
      await testSlackIntegration();
      toast.success(t("intg.slack_test_success"));
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const renderRow = (item: WorkspaceIntegration) => {
    const meta = INTEGRATION_UI[item.id];
    const handlers =
      item.id === "google_workspace"
        ? {
            onConnect: () => onGoToSso(),
            onConfigure: () => onGoToSso(),
            onTest: () => startGoogleSso({ next: "/app/settings" }),
          }
        : item.id === "slack"
          ? {
              onConnect: openSlackDialog,
              onConfigure: openSlackDialog,
              onDisconnect: () => void disconnectSlack(),
              onTest: () => void testSlack(),
            }
          : {};

    return (
      <IntegrationRow
        key={item.id}
        name={meta.name}
        description={t(meta.description)}
        color={meta.color}
        status={item.status}
        summary={item.summary}
        canManage={canEdit}
        busy={busy}
        {...handlers}
      />
    );
  };

  const connected =
    integrations?.filter((i) => i.status === "connected") ?? [];
  const available =
    integrations?.filter(
      (i) => i.status === "available" || i.status === "unavailable",
    ) ?? [];
  const comingSoon =
    integrations?.filter((i) => i.status === "coming_soon") ?? [];

  return (
    <div className="space-y-6">
      <SectionTitle
        title={t("intg.workspace_title")}
        description={t("intg.workspace_desc")}
      />

      {loading && <ApiLoadingState variant="page" />}

      {!loading && loadError && (
        <ApiErrorState
          error={loadError}
          variant="page"
          onRetry={() => void load()}
        />
      )}

      {!loading && !loadError && integrations && (
        <>
          {!platformSso && (
            <div className="rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="size-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                {t("intg.platform_sso_missing")}
              </p>
            </div>
          )}

          <Card>
            <h3 className="text-sm font-semibold mb-4">
              {t("intg.connected_section")}
            </h3>
            {connected.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("intg.empty_connected")}
              </p>
            ) : (
              <div className="space-y-2">{connected.map(renderRow)}</div>
            )}
          </Card>

          {available.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold mb-4">
                {t("intg.available_section")}
              </h3>
              <div className="space-y-2">{available.map(renderRow)}</div>
            </Card>
          )}

          {comingSoon.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold mb-4">
                {t("intg.coming_soon_section")}
              </h3>
              <div className="space-y-2">{comingSoon.map(renderRow)}</div>
            </Card>
          )}
        </>
      )}

      <Dialog
        open={slackOpen}
        onOpenChange={(open) => {
          if (!open) setSlackOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("intg.slack_dialog_title")}</DialogTitle>
            <DialogDescription>{t("intg.slack_dialog_desc")}</DialogDescription>
          </DialogHeader>
          <Field label={t("intg.slack_webhook_label")}>
            <Input
              value={slackUrl}
              onChange={(e) => setSlackUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              className="font-mono-secret text-sm"
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlackOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void saveSlack()}
              disabled={busy || slackUrl.trim().length === 0}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {t("common.connect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =====================================================================
   BILLING — under development (no mock data)
   ===================================================================== */
function BillingSection() {
  const t = useT();
  return (
    <div className="space-y-6">
      <SectionTitle
        title={t("billing.title")}
        description={t("billing.subtitle")}
      />

      <Card>
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-xl bg-surface-2 ring-1 ring-line-1 flex items-center justify-center shrink-0">
            <Construction className="size-6 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold mb-1">
              {t("billing.under_development_title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("billing.under_development_desc")}
            </p>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] border-line-2 bg-surface-1 text-muted-foreground shrink-0"
          >
            {t("common.coming_soon")}
          </Badge>
        </div>
      </Card>
    </div>
  );
}

/* Quiet splash shown while AuthProvider boots OR while a below-admin user is
   being redirected away — keeps protected settings content from flashing. */
function BootSplash({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background">
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
