"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Send,
  Edit2,
  ExternalLink,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  Star,
  Tag as TagIcon,
  Folder as FolderIcon,
  UserPlus,
  Eye,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShareDialog } from "@/components/vault/share-dialog";
import { MemberAvatars } from "@/components/vault/member-avatars";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SecretField } from "@/components/vault/secret-field";
import { TotpField } from "@/components/vault/totp-field";
import { EditItemDialog } from "@/components/vault/edit-item-dialog";
import { RequestAccessDialog } from "@/components/vault/request-access-dialog";
import { CountdownTimer } from "@/components/shared/countdown-timer";
import { AttachmentsSection } from "@/components/vault/attachments-section";
import { ItemActivitySection } from "@/components/vault/item-activity-section";
import { IconTile } from "@/components/icon";
import {
  ApiErrorState,
  ApiLoadingState,
} from "@/components/shared/api-states";
import {
  deleteDisplayItem,
  getDisplayItem,
  getItemPassword,
  getDisplayItemMembers,
  toggleFavorite,
  type DisplayItemFull,
  type VaultMember,
} from "@/lib/items-overlay";
import { getVault } from "@/lib/api/vaults";
import { ApiError, VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import type { Vault, VaultRole } from "@/lib/api/types";
import { useVaults } from "@/lib/vaults/provider";
import { useFolders } from "@/lib/folders/provider";
import { formatDateTime, itemTypeColor } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { useVaultLock } from "@/components/vault-lock/lock-provider";
import {
  canWriteVaultData,
  canEditItemRole,
  canRevealItem,
  canShareResourceRole,
  isWorkspaceAdmin,
  canViewAuditLog,
} from "@/lib/auth/permissions";

export default function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const tr = useT();
  const router = useRouter();
  const { me } = useAuth();
  const { refresh: refreshVaults, vaults } = useVaults();
  const { byVault } = useFolders();
  const { getVaultKey } = useVaultLock();

  const [item, setItem] = useState<DisplayItemFull | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [itemError, setItemError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<VaultMember[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  // The item snapshot handed to EditItemDialog — same as `item` but with the
  // password prefilled (fetched on demand, since `getDisplayItem` omits it).
  const [editItem, setEditItem] = useState<DisplayItemFull | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  // On-demand password reveal. `GET /items/:id` no longer returns the password
  // (it's always null), so opening the item logs `item.view` only. We fetch the
  // real secret via `GET /items/:id/password` (logs `item.reveal`) the FIRST
  // time the user shows/copies it OR opens edit, then cache it for this open
  // session so we log exactly ONE reveal per item-open. The promise itself is
  // memoized so a near-simultaneous show+copy reuses one in-flight request.
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const revealPromiseRef = useRef<Promise<string | null> | null>(null);

  // Reset the reveal cache whenever the item id changes (new open session).
  useEffect(() => {
    setRevealedPassword(null);
    revealPromiseRef.current = null;
  }, [id]);

  const revealPassword = useCallback(async (): Promise<string | null> => {
    if (revealedPassword !== null) return revealedPassword;
    if (!revealPromiseRef.current) {
      revealPromiseRef.current = (async () => {
        if (!item) return null;
        const vaultKey = vault?.encryptionVersion === 2 
          ? await getVaultKey(item.vaultId) 
          : undefined;
        return getItemPassword(id, undefined, vaultKey ?? undefined);
      })();
    }
    const pw = await revealPromiseRef.current;
    setRevealedPassword(pw ?? "");
    return pw ?? "";
  }, [id, revealedPassword, item, vault, getVaultKey]);

  const loadItem = useCallback(async () => {
    setLoading(true);
    setItemError(null);
    try {
      // We need vault context to know if it's ZK before calling getDisplayItem
      // (or let getDisplayItem handle it by fetching vault internally)
      const apiItems = await import("@/lib/api/items"); // direct fetch to avoid overlay
      const itemRow = await apiItems.getItem(id);

      const targetVault = vaults.find((v) => v.id === itemRow.vaultId);
      const vaultKey =
        targetVault?.encryptionVersion === 2
          ? await getVaultKey(itemRow.vaultId)
          : undefined;

      const [fetched, detail, memberRes] = await Promise.all([
        getDisplayItem(id, undefined, vaultKey ?? undefined),
        getVault(itemRow.vaultId),
        getDisplayItemMembers(id),
      ]);

      setItem(fetched);
      setVault(detail.vault);
      setMembers(memberRes.members);
    } catch (err) {
      if (err instanceof ApiError) setItemError(err);
      else setItemError(new ApiError(0, "network_error", "Network error"));
    } finally {
      setLoading(false);
    }
  }, [id, vaults, getVaultKey]);

  // GET /items/:id writes an `item.view` audit event server-side on every call
  // (the password reveal is now a separate on-demand call). React StrictMode
  // (dev) double-invokes effects, which would log the view twice. Guard so we
  // fetch exactly once per item id on mount; legitimate reloads (after edit)
  // call loadItem() directly and are unaffected.
  const revealedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (revealedIdRef.current === id) return;
    revealedIdRef.current = id;
    void loadItem();
  }, [id, loadItem]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => void loadItem();
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [loadItem]);

  const handleDelete = useCallback(async () => {
    if (!item) return;
    try {
      await deleteDisplayItem(item.id);
      toast.success(tr("item.deleted_toast"), { description: item.name });
      setDeleteOpen(false);
      await refreshVaults();
      router.push(`/app/vault/${item.vaultId}`);
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.delete_failed"), { description });
    }
  }, [item, refreshVaults, router, tr]);

  // Editing needs the current password to prefill the form, but `getDisplayItem`
  // no longer returns it. Reuse the cached reveal if we have one; otherwise
  // fetch it now (this logs an `item.reveal`, which is correct — editing
  // accesses the secret). If the fetch fails, open edit with a blank password
  // so the dialog still works and the user can retype.
  const handleOpenEdit = useCallback(async () => {
    if (!item) return;
    let password = revealedPassword;
    if (password === null && item.hasPassword) {
      try {
        password = await revealPassword();
      } catch {
        password = "";
      }
    }
    setEditItem({ ...item, password: password ?? "" });
    setEditOpen(true);
  }, [item, revealedPassword, revealPassword]);

  const handleEditSaved = useCallback(async () => {
    await loadItem();
    await refreshVaults();
  }, [loadItem, refreshVaults]);

  const handleToggleFavorite = useCallback(async () => {
    if (!item) return;
    try {
      // Guests may favorite, but read-only: persist client-side only (no
      // PATCH /items, which the backend blocks for them).
      const next = await toggleFavorite(item.id, {
        persist: canWriteVaultData(me?.role ?? null),
      });
      setItem(next);
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.save_failed"), { description });
    }
  }, [item, tr, me]);

  if (loading) {
    return (
      <>
        <Topbar title={tr("item.reveal_loading")} />
        <div className="flex-1 overflow-y-auto">
          <ApiLoadingState label={tr("item.reveal_loading")} />
        </div>
      </>
    );
  }

  if (itemError || !item) {
    const err =
      itemError ?? new ApiError(404, "not_found", tr("api.error.not_found_desc"));
    return (
      <>
        <Topbar title={tr("api.error.title")} />
        <div className="flex-1 overflow-y-auto">
          <ApiErrorState error={err} onRetry={loadItem} />
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/app")}
            >
              {tr("dash.your_vaults")}
            </Button>
          </div>
        </div>
      </>
    );
  }

  // Org-role gate: guests are read-only ANYWHERE (no edit/delete/send/share),
  // regardless of their vault/item role. ANDed into every write affordance.
  const canWrite = canWriteVaultData(me?.role ?? null);

  // Per-item "most specific wins" effective role. Prefer the wire value; fall
  // back to the vault role when the wire omitted it (legacy responses).
  const effectiveRole =
    item.effectiveRole ?? vault?.role ?? item.displayEffectiveRole;

  // Auditor role cannot request access to secrets (strict metadata-only).
  const isAuditor = me?.role === "auditor";
  const canRequest = !isAuditor;

  // An effective viewer gets metadata-only (backend returns null secrets).
  const isViewOnly = !canRevealItem(effectiveRole);

  // Edit/delete: effective role manager|editor|user AND org-write.
  const canEdit = canEditItemRole(effectiveRole) && canWrite;
  // Share: effective editor|manager OR the item's creator. AND org-write.
  const canManageItemMembers =
    canWrite &&
    (canShareResourceRole(effectiveRole) || item.createdBy.id === me?.id);
  // Auditor can see who has access for compliance, but cannot manage.
  const canOpenShare = canManageItemMembers || isAuditor;
  const canViewMembers = canWrite || isAuditor;

  // Creating a one-time send is a write op (POST /sends → 403 for guests) and
  // requires reveal access to the secret.
  const canSend = canWrite && !isViewOnly;
  // Per-item activity feed: mirrors GET /items/:id/activity (200 only for an
  // effective vault MANAGER OR an org admin/owner/auditor). Editor/user/viewer must NOT
  // see it and we skip the fetch for them (it would 403).
  const canSeeActivity =
    effectiveRole === "manager" || canViewAuditLog(me?.role ?? null);
  // The "View full audit log" link goes to /app/audit, which is admin-only and
  // redirects non-admins. So a manager who is just an org member sees the
  // per-item list but NOT the link; only admins/owners see both.
  const canViewFullAuditLog = canViewAuditLog(me?.role ?? null);
  const vaultName = vault?.name ?? "";
  const kind = item.displayKind;
  const folder = byVault(item.vaultId).find((f) => f.id === item.folderId);

  return (
    <>
      <Topbar
        title={item.name}
        subtitle={tr("item.subtitle", {
          type: tr(`item.types.${kind}`),
          vault: vaultName,
        })}
        actions={
          <>
            {/* Favorite is available to ALL roles incl. guest (read-only users
                persist it client-side only). */}
            <Button
              variant="ghost"
              size="icon"
              disabled={isAuditor}
              onClick={handleToggleFavorite}
              aria-label={
                item.displayFavorite
                  ? tr("item.unfavorite")
                  : tr("item.favorite")
              }
              title={
                item.displayFavorite
                  ? tr("item.unfavorite")
                  : tr("item.favorite")
              }
              className={
                item.displayFavorite
                  ? "text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 dark:hover:bg-amber-500/10"
                  : ""
              }
            >
              <Star
                className={`size-4 ${item.displayFavorite ? "fill-current" : ""}`}
              />
            </Button>
            {canViewMembers && (
              <MemberAvatars
                members={members}
                onClick={() => setShareOpen(true)}
              />
            )}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleOpenEdit()}
              >
                <Edit2 className="size-3.5" /> {tr("item.edit")}
              </Button>
            )}
            {canManageItemMembers && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
              >
                <UserPlus className="size-3.5" /> {tr("item.share")}
              </Button>
            )}
            {canSend && (
              <Button
                size="sm"
                render={<Link href={`/app/sends/new?item=${item.id}`} />}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Send className="size-3.5" /> {tr("item.send_one_time")}
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteOpen(true)}
                aria-label={tr("item.delete.button")}
                className="text-rose-700 dark:text-rose-300 hover:bg-rose-500/15 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          <Link
            href={`/app/vault/${item.vaultId}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6"
          >
            <ChevronLeft className="size-3.5" />
            {tr("item.back_to", { name: vaultName })}
          </Link>

          <div className="flex items-start gap-4 mb-8 pb-6 border-b border-border">
            <IconTile
              type={kind}
              color={itemTypeColor[kind]}
              size="xl"
              withGlow
            />
            <div className="flex-1 min-w-0 mt-1">
              {item.expiresAt && (
                <div className="mb-3">
                  <CountdownTimer expiresAt={item.expiresAt} />
                </div>
              )}
              <h1 className="text-2xl font-semibold mb-2 tracking-tight">
                {item.name}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className="border-line-2 bg-surface-1 text-foreground/80"
                >
                  {tr(`item.types.${kind}`)}
                </Badge>
                {folder && (
                  <Badge
                    variant="outline"
                    className="border-line-2 bg-surface-1 text-foreground/80 gap-1"
                  >
                    <FolderIcon className="size-2.5" /> {folder.name}
                  </Badge>
                )}
                {item.displayTags.length > 0 &&
                  item.displayTags.map((tagText) => (
                    <Badge
                      key={tagText}
                      variant="outline"
                      className="border-line-2 bg-surface-1 text-foreground/70 gap-1"
                    >
                      <TagIcon className="size-2.5" />
                      {tagText}
                    </Badge>
                  ))}
                <span className="text-xs text-muted-foreground ml-1">
                  ·{" "}
                  {tr("item.updated_at", {
                    when: formatDateTime(item.updatedAt),
                  })}
                </span>
              </div>
            </div>
          </div>

          {isViewOnly && (
            <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 px-4 py-3">
              <div className="flex items-start gap-3 min-w-0">
                <Eye className="size-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    {tr("item.readonly_notice")}
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                    {tr("item.readonly_notice_desc")}
                  </p>
                </div>
              </div>
              {canRequest && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRequestOpen(true)}
                  className="shrink-0 border-amber-500/30 bg-transparent text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                >
                  <Lock className="size-3.5" /> {tr("requests.button")}
                </Button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main panel */}
            <div className="lg:col-span-2 space-y-4">
              {(kind === "login" || kind === "api_key" || kind === "ssh") && (
                <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-6">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                    {tr("item.credentials")}
                  </h2>
                  <div className="space-y-4">
                    {kind === "api_key" && item.username && (
                      <SecretField
                        label={tr("item.api_key.label")}
                        value={item.username}
                        type="text"
                      />
                    )}
                    {kind === "login" && item.username && (
                      <SecretField
                        label={tr("item.username")}
                        value={item.username}
                        type="text"
                      />
                    )}
                    {item.hasPassword && isViewOnly ? (
                      <ViewOnlyField
                        label={
                          kind === "api_key"
                            ? tr("item.api_key.key")
                            : kind === "ssh"
                              ? tr("item.ssh.private_key")
                              : tr("item.password")
                        }
                        placeholder={tr("item.readonly_secret")}
                      />
                    ) : item.hasPassword ? (
                      <SecretField
                        label={
                          kind === "api_key"
                            ? tr("item.api_key.key")
                            : kind === "ssh"
                              ? tr("item.ssh.private_key")
                              : tr("item.password")
                        }
                        value={revealedPassword ?? undefined}
                        onReveal={revealPassword}
                        monospace
                      />
                    ) : null}
                    {kind === "login" && item.url && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                          {tr("item.url")}
                        </label>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 px-3 py-2 bg-surface-1 border border-line-1 hover:border-line-3 rounded-lg text-sm text-brand hover:underline truncate transition-colors"
                        >
                          {item.url}
                          <ExternalLink className="size-3.5 shrink-0" />
                        </a>
                      </div>
                    )}
                    {kind === "login" && item.totpSecret && (
                      <TotpField secret={item.totpSecret} />
                    )}
                    {kind === "ssh" && item.ssh?.publicKey && (
                      <SecretField
                        label={tr("item.ssh.public_key")}
                        value={item.ssh.publicKey}
                        type="text"
                        monospace
                      />
                    )}
                    {kind === "ssh" && item.ssh?.passphrase && (
                      <SecretField
                        label={tr("item.ssh.passphrase")}
                        value={item.ssh.passphrase}
                        monospace
                      />
                    )}
                  </div>
                </div>
              )}

              {kind === "card" && item.card && (
                <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-6">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                    {tr("item.types.card")}
                  </h2>
                  <div className="space-y-4">
                    {item.card.cardholder && (
                      <SecretField
                        label={tr("item.card.cardholder")}
                        value={item.card.cardholder}
                        type="text"
                      />
                    )}
                    {item.card.cardNumber && (
                      <SecretField
                        label={tr("item.card.number")}
                        value={item.card.cardNumber}
                        monospace
                      />
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      {item.card.expiry && (
                        <SecretField
                          label={tr("item.card.expiry")}
                          value={item.card.expiry}
                          type="text"
                          monospace
                        />
                      )}
                      {item.card.cvv && (
                        <SecretField
                          label={tr("item.card.cvv")}
                          value={item.card.cvv}
                          monospace
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {kind === "identity" && item.identity && (
                <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-6">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                    {tr("item.types.identity")}
                  </h2>
                  <div className="space-y-4">
                    {item.identity.fullName && (
                      <SecretField
                        label={tr("item.identity.full_name")}
                        value={item.identity.fullName}
                        type="text"
                      />
                    )}
                    {item.identity.email && (
                      <SecretField
                        label={tr("item.identity.email")}
                        value={item.identity.email}
                        type="text"
                      />
                    )}
                    {item.identity.phone && (
                      <SecretField
                        label={tr("item.identity.phone")}
                        value={item.identity.phone}
                        type="text"
                      />
                    )}
                    {item.identity.address && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                          {tr("item.identity.address")}
                        </label>
                        <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/80 leading-relaxed px-3 py-2 bg-surface-1 border border-line-1 rounded-lg">
                          {item.identity.address}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {item.customFields.length > 0 && (
                <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-6">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                    {tr("item.custom_fields")}
                  </h2>
                  <div className="space-y-4">
                    {item.customFields.map((cf, idx) => (
                      <SecretField
                        key={`${cf.name}-${idx}`}
                        label={cf.name || tr("ni.field_name")}
                        value={cf.value}
                        type={cf.type}
                        monospace={cf.type === "secret"}
                      />
                    ))}
                  </div>
                </div>
              )}

              {item.notesPlain && (
                <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-6">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {tr("item.notes")}
                  </h2>
                  <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/80 leading-relaxed">
                    {item.notesPlain}
                  </pre>
                </div>
              )}

              {/* Attachments need a reveal to download; an effective viewer
                  would 403, so hide the section entirely for view-only access. */}
              {(kind === "note" || kind === "login") && !isViewOnly && (
                <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-6">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {tr("items.attachments.title")}
                  </h2>
                  <AttachmentsSection
                    itemId={item.id}
                    hideUpload
                    hideDelete={!canEdit}
                  />
                </div>
              )}

              {canSeeActivity && (
                <ItemActivitySection
                  itemId={item.id}
                  showFullLogLink={canViewFullAuditLog}
                />
              )}
            </div>

            {/* Side panel */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />{" "}
                  {tr("item.security")}
                </h3>
                <ul className="space-y-2.5 text-sm">
                  <SecurityRow
                    label={tr("item.security.encryption")}
                    value={
                      vault && vault.encryptionVersion >= 2
                        ? tr("item.encryption.zk")
                        : tr("item.encryption.envelope")
                    }
                  />
                  <SecurityRow
                    label={tr("item.security.strength")}
                    value={tr("item.security.strong")}
                    status="good"
                  />
                </ul>
              </div>

              {canEdit && (
                <div className="rounded-2xl border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300 mb-3">
                    {tr("item.danger_zone")}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                    className="w-full text-rose-700 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 hover:bg-rose-500/15 dark:hover:bg-rose-500/10 justify-start"
                  >
                    <Trash2 className="size-3.5" /> {tr("item.delete.button")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editItem && (
        <EditItemDialog
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o);
            if (!o) setEditItem(null);
          }}
          item={editItem}
          onSaved={handleEditSaved}
        />
      )}

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        resourceKind="item"
        resourceId={item.id}
        resourceName={item.name}
        canManage={canManageItemMembers}
        currentUserId={me?.id}
        initialMembers={members}
        onMembersChange={setMembers}
      />

      <RequestAccessDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        targetId={item.id}
        targetName={item.name}
        targetType="item"
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("item.delete.title")}</DialogTitle>
            <DialogDescription>
              {tr("item.delete.desc", { name: item.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {tr("common.cancel")}
            </Button>
            <Button
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              onClick={handleDelete}
            >
              <Trash2 className="size-3.5" /> {tr("item.delete.button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ViewOnlyField({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-1 border border-dashed border-line-2 rounded-lg text-sm text-muted-foreground">
        <Eye className="size-3.5 shrink-0" />
        <span className="italic">{placeholder}</span>
      </div>
    </div>
  );
}

function SecurityRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status?: "good";
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`flex items-center gap-1 ${status === "good" ? "text-emerald-600 dark:text-emerald-400" : ""}`}
      >
        {status === "good" && <CheckCircle2 className="size-3" />}
        {value}
      </span>
    </li>
  );
}
