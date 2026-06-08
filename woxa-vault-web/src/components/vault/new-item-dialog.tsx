"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
  Plus,
  X,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import {
  AttachmentsSection,
  type AttachmentsSectionHandle,
} from "@/components/vault/attachments-section";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PasswordInput } from "@/components/vault/password-input";
import { IconTile } from "@/components/icon";
import { itemTypeColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { useVaults } from "@/lib/vaults/provider";
import { useFolders } from "@/lib/folders/provider";
import { createDisplayItem } from "@/lib/items-overlay";
import {
  RotationPolicyField,
  parseRotationDays,
} from "@/components/vault/rotation-badge";
import { useVaultLock } from "@/components/vault-lock/lock-provider";
import { ApiError } from "@/lib/api/client";
import type {
  CardData,
  CustomField,
  DisplayKind,
  IdentityData,
  SshData,
} from "@/lib/item-meta";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultVaultId?: string;
  defaultFolderId?: string;
  onCreated?: () => void | Promise<void>;
}

type Stage = "pick-type" | "form";

interface TypeOption {
  type: DisplayKind;
  descKey: string;
  egKey: string;
}

const typeOptions: ReadonlyArray<TypeOption> = [
  { type: "login", descKey: "ni.type.login.desc", egKey: "ni.type.login.eg" },
  { type: "note", descKey: "ni.type.note.desc", egKey: "ni.type.note.eg" },
  { type: "api_key", descKey: "ni.type.api_key.desc", egKey: "ni.type.api_key.eg" },
  { type: "ssh", descKey: "ni.type.ssh.desc", egKey: "ni.type.ssh.eg" },
  { type: "card", descKey: "ni.type.card.desc", egKey: "ni.type.card.eg" },
  { type: "identity", descKey: "ni.type.identity.desc", egKey: "ni.type.identity.eg" },
];

export function NewItemDialog({
  open,
  onOpenChange,
  defaultVaultId,
  defaultFolderId,
  onCreated,
}: Props) {
  const tr = useT();
  const { vaults } = useVaults();
  const { byVault } = useFolders();
  const { getVaultKey } = useVaultLock();

  const [stage, setStage] = useState<Stage>("pick-type");
  const [kind, setKind] = useState<DisplayKind>("login");
  const [submitting, setSubmitting] = useState(false);
  const attachmentsRef = useRef<AttachmentsSectionHandle | null>(null);

  const [name, setName] = useState("");
  const [vaultId, setVaultId] = useState(defaultVaultId ?? vaults[0]?.id ?? "");
  const [folderId, setFolderId] = useState<string>(defaultFolderId ?? "");
  const [notes, setNotes] = useState("");

  // Common login-ish fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");

  // TOTP + tags + favorite
  const [totpSecret, setTotpSecret] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [favorite, setFavorite] = useState(false);

  // US-060 — per-item rotation window (days). Empty = inherit org default.
  const [rotationDays, setRotationDays] = useState("");

  // Custom fields
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  // Card
  const [card, setCard] = useState<CardData>({});
  // Identity
  const [identity, setIdentity] = useState<IdentityData>({});
  // SSH
  const [ssh, setSsh] = useState<SshData>({});

  useEffect(() => {
    if (defaultVaultId) setVaultId(defaultVaultId);
    else if (!vaultId && vaults.length) setVaultId(vaults[0].id);
  }, [defaultVaultId, vaults, vaultId]);

  useEffect(() => {
    if (defaultFolderId) setFolderId(defaultFolderId);
  }, [defaultFolderId]);

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setStage("pick-type");
        setName("");
        setUsername("");
        setPassword("");
        setUrl("");
        setNotes("");
        setKind("login");
        setTotpSecret("");
        setTagsText("");
        setFavorite(false);
        setRotationDays("");
        setCustomFields([]);
        setCard({});
        setIdentity({});
        setSsh({});
        setFolderId(defaultFolderId ?? "");
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open, defaultFolderId]);

  const folders = byVault(vaultId);

  const submit = async () => {
    if (!name.trim() || submitting) return;
    if (!vaultId) {
      toast.error(tr("api.error.create_failed"), {
        description: tr("vaults.empty.desc"),
      });
      return;
    }
    setSubmitting(true);
    try {
      const tags = tagsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const targetVault = vaults.find(v => v.id === vaultId);
      const vaultKey = targetVault?.encryptionVersion === 2 
        ? await getVaultKey(vaultId) 
        : undefined;

      const created = await createDisplayItem({
        vaultId,
        displayKind: kind,
        name: name.trim(),
        username: username.trim() || undefined,
        password: password || undefined,
        url: url.trim() || undefined,
        notes: notes.trim() || undefined,
        folderId: folderId || null,
        tags,
        favorite,
        totpSecret: totpSecret.trim() || null,
        rotationPolicyDays: parseRotationDays(rotationDays),
        customFields,
        card: kind === "card" ? card : undefined,
        identity: kind === "identity" ? identity : undefined,
        ssh: kind === "ssh" ? ssh : undefined,
        vaultKey: vaultKey ?? undefined,
      });
      toast.success(tr("toast.item_created"), {
        description: tr("toast.item_created_desc", {
          type: tr(`item.types.${kind}`),
          name: created.name,
          vault: vaults.find((v) => v.id === vaultId)?.name ?? "",
        }),
      });
      // Drain any queued attachments now that the item has an id. The
      // section reports its own per-file errors via toast.
      if (attachmentsRef.current && attachmentsRef.current.queuedCount() > 0) {
        await attachmentsRef.current.consumeQueue(created.id);
      }
      await onCreated?.();
      onOpenChange(false);
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.create_failed"), { description });
    } finally {
      setSubmitting(false);
    }
  };

  const addCustomField = () =>
    setCustomFields((prev) => [...prev, { name: "", value: "", type: "text" }]);
  const updateCustomField = (idx: number, patch: Partial<CustomField>) =>
    setCustomFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    );
  const removeCustomField = (idx: number) =>
    setCustomFields((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-2">
            {stage === "form" && (
              <button
                onClick={() => setStage("pick-type")}
                aria-label={tr("common.back")}
                className="size-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors -ml-1"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            <DialogTitle className="text-lg tracking-tight flex items-center gap-2">
              {stage === "pick-type"
                ? tr("ni.title_pick")
                : tr("ni.title_form", { type: tr(`item.types.${kind}`) })}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            {stage === "pick-type"
              ? tr("ni.subtitle_pick")
              : tr("ni.subtitle_form")}
          </DialogDescription>
        </DialogHeader>

        {stage === "pick-type" && (
          <div className="px-6 pb-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              {typeOptions.map((opt) => {
                const isActive = kind === opt.type;
                const color = itemTypeColor[opt.type];
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => {
                      setKind(opt.type);
                      setStage("form");
                    }}
                    className={cn(
                      "group relative rounded-xl border bg-card/40 p-4 text-left transition-all hover:bg-surface-1 hover:border-line-3",
                      isActive
                        ? "border-brand/40 bg-brand/[0.04]"
                        : "border-line-1",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <IconTile type={opt.type} color={color} size="lg" withGlow />
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="text-sm font-semibold tracking-tight mb-0.5">
                          {tr(`item.types.${opt.type}`)}
                        </div>
                        <div className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {tr(opt.descKey)}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-1.5 italic line-clamp-1">
                          {tr("ni.type.eg_prefix")} {tr(opt.egKey)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {stage === "form" && (
          <>
            <div className="px-6 pb-4 space-y-4 overflow-y-auto flex-1">
              {/* Header preview */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-1 border border-line-1">
                <IconTile
                  type={kind}
                  color={itemTypeColor[kind]}
                  size="lg"
                  withGlow
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {name || tr("ni.untitled")}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {tr(`item.types.${kind}`)} ·{" "}
                    {vaults.find((v) => v.id === vaultId)?.name ?? ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFavorite((v) => !v)}
                  aria-label={
                    favorite ? tr("item.unfavorite") : tr("item.favorite")
                  }
                  className={cn(
                    "size-8 rounded-lg flex items-center justify-center transition-colors",
                    favorite
                      ? "bg-amber-500/15 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 dark:border-amber-500/20"
                      : "bg-surface-2 text-muted-foreground hover:text-foreground border border-line-1",
                  )}
                >
                  <Star
                    className={cn(
                      "size-3.5",
                      favorite && "fill-current",
                    )}
                  />
                </button>
              </div>

              {/* Name */}
              <FormField label={tr("common.name")} required>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={placeholderForKind(kind, tr)}
                  className="h-9"
                />
              </FormField>

              {/* Vault + Folder */}
              <div className="grid grid-cols-2 gap-3">
                <FormField label={tr("ni.vault")}>
                  <Select
                    value={vaultId}
                    onValueChange={(v) => v && setVaultId(v)}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {(value: string | null) =>
                          vaults.find((v) => v.id === value)?.name ?? ""
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {vaults.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label={tr("ni.folder")}>
                  <Select
                    value={folderId || "__none__"}
                    onValueChange={(v) => {
                      if (!v) return;
                      setFolderId(v === "__none__" ? "" : v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {(value: string | null) =>
                          !value || value === "__none__"
                            ? tr("ni.no_folder")
                            : folders.find((f) => f.id === value)?.name ?? tr("ni.no_folder")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{tr("ni.no_folder")}</SelectItem>
                      {folders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <Separator className="bg-surface-3" />

              {/* Type-specific fields */}
              {kind === "login" && (
                <div className="space-y-3">
                  <FormField label={tr("ni.username_email")}>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin@iux24.com"
                    />
                  </FormField>

                  <FormField label={tr("item.password")}>
                    <PasswordInput value={password} onChange={setPassword} />
                  </FormField>

                  <FormField label={tr("item.url")}>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={tr("ni.url_placeholder")}
                      className="font-mono-secret text-sm"
                    />
                  </FormField>

                  <FormField label={tr("item.totp")} hint={tr("ni.totp_hint")}>
                    <Input
                      value={totpSecret}
                      onChange={(e) => setTotpSecret(e.target.value)}
                      placeholder={tr("ni.totp_secret")}
                      className="font-mono-secret text-sm"
                    />
                  </FormField>

                  <RotationPolicyField value={rotationDays} onChange={setRotationDays} />
                </div>
              )}

              {kind === "api_key" && (
                <div className="space-y-3">
                  <FormField label={tr("item.api_key.label")}>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Stripe Live · Slack Bot · ..."
                    />
                  </FormField>
                  <FormField label={tr("item.api_key.key")}>
                    <PasswordInput
                      value={password}
                      onChange={setPassword}
                      showStrength={false}
                    />
                  </FormField>
                  <RotationPolicyField value={rotationDays} onChange={setRotationDays} />
                </div>
              )}

              {kind === "ssh" && (
                <div className="space-y-3">
                  <FormField label={tr("item.ssh.private_key")} hint={tr("ni.private_key_hint")}>
                    <Textarea
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----"}
                      rows={5}
                      className="font-mono-secret text-xs resize-none"
                    />
                  </FormField>
                  <FormField label={tr("item.ssh.public_key")}>
                    <Textarea
                      value={ssh.publicKey ?? ""}
                      onChange={(e) =>
                        setSsh((p) => ({ ...p, publicKey: e.target.value }))
                      }
                      rows={2}
                      placeholder="ssh-ed25519 AAAAC3..."
                      className="font-mono-secret text-xs resize-none"
                    />
                  </FormField>
                  <FormField label={tr("item.ssh.passphrase")}>
                    <Input
                      type="password"
                      value={ssh.passphrase ?? ""}
                      onChange={(e) =>
                        setSsh((p) => ({ ...p, passphrase: e.target.value }))
                      }
                      className="font-mono-secret text-sm"
                    />
                  </FormField>
                  <RotationPolicyField value={rotationDays} onChange={setRotationDays} />
                </div>
              )}

              {kind === "card" && (
                <div className="space-y-3">
                  <FormField label={tr("item.card.cardholder")}>
                    <Input
                      value={card.cardholder ?? ""}
                      onChange={(e) =>
                        setCard((p) => ({ ...p, cardholder: e.target.value }))
                      }
                      placeholder={tr("ni.cardholder_placeholder")}
                    />
                  </FormField>
                  <FormField label={tr("item.card.number")}>
                    <Input
                      value={card.cardNumber ?? ""}
                      onChange={(e) =>
                        setCard((p) => ({ ...p, cardNumber: e.target.value }))
                      }
                      placeholder="•••• •••• •••• ••••"
                      className="font-mono-secret text-sm"
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label={tr("item.card.expiry")}>
                      <Input
                        value={card.expiry ?? ""}
                        onChange={(e) =>
                          setCard((p) => ({ ...p, expiry: e.target.value }))
                        }
                        placeholder={tr("item.card.expiry_placeholder")}
                        className="font-mono-secret text-sm"
                      />
                    </FormField>
                    <FormField label={tr("item.card.cvv")}>
                      <Input
                        value={card.cvv ?? ""}
                        onChange={(e) =>
                          setCard((p) => ({ ...p, cvv: e.target.value }))
                        }
                        placeholder="•••"
                        className="font-mono-secret text-sm"
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {kind === "identity" && (
                <div className="space-y-3">
                  <FormField label={tr("item.identity.full_name")}>
                    <Input
                      value={identity.fullName ?? ""}
                      onChange={(e) =>
                        setIdentity((p) => ({ ...p, fullName: e.target.value }))
                      }
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label={tr("item.identity.email")}>
                      <Input
                        type="email"
                        value={identity.email ?? ""}
                        onChange={(e) =>
                          setIdentity((p) => ({ ...p, email: e.target.value }))
                        }
                      />
                    </FormField>
                    <FormField label={tr("item.identity.phone")}>
                      <Input
                        value={identity.phone ?? ""}
                        onChange={(e) =>
                          setIdentity((p) => ({ ...p, phone: e.target.value }))
                        }
                        placeholder={tr("ni.phone_placeholder")}
                      />
                    </FormField>
                  </div>
                  <FormField label={tr("item.identity.address")}>
                    <Textarea
                      value={identity.address ?? ""}
                      onChange={(e) =>
                        setIdentity((p) => ({ ...p, address: e.target.value }))
                      }
                      rows={3}
                      className="resize-none"
                    />
                  </FormField>
                </div>
              )}

              {/* Tags (all kinds) */}
              <FormField label={tr("item.tags")} hint={tr("ni.tags_placeholder")}>
                <Input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="aws, prod, infra"
                />
              </FormField>

              {/* Custom fields */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {tr("item.custom_fields")}
                  </Label>
                  <button
                    type="button"
                    onClick={addCustomField}
                    className="text-[11px] text-brand hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="size-3" /> {tr("ni.add_field")}
                  </button>
                </div>
                {customFields.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/70">
                    {tr("ni.custom_fields_hint")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {customFields.map((cf, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-center"
                      >
                        <Input
                          value={cf.name}
                          onChange={(e) =>
                            updateCustomField(idx, { name: e.target.value })
                          }
                          placeholder={tr("ni.field_name")}
                          className="h-8 text-sm"
                        />
                        <Input
                          value={cf.value}
                          type={cf.type === "secret" ? "password" : "text"}
                          onChange={(e) =>
                            updateCustomField(idx, { value: e.target.value })
                          }
                          placeholder={tr("ni.value")}
                          className={cn(
                            "h-8 text-sm",
                            cf.type === "secret" && "font-mono-secret",
                          )}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateCustomField(idx, {
                              type: cf.type === "secret" ? "text" : "secret",
                            })
                          }
                          aria-label={
                            cf.type === "secret"
                              ? tr("common.show")
                              : tr("common.hide")
                          }
                          title={
                            cf.type === "secret"
                              ? tr("common.show")
                              : tr("common.hide")
                          }
                          className="size-8 rounded-md hover:bg-surface-2 text-muted-foreground flex items-center justify-center"
                        >
                          {cf.type === "secret" ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCustomField(idx)}
                          aria-label={tr("common.remove")}
                          className="size-8 rounded-md hover:bg-rose-500/15 dark:hover:bg-rose-500/10 text-muted-foreground hover:text-rose-700 dark:hover:text-rose-300 flex items-center justify-center"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <FormField label={tr("common.notes")}>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={kind === "note" ? 6 : 3}
                  placeholder={tr("ni.notes_placeholder")}
                  className="resize-none"
                />
              </FormField>

              {/* Attachments (queued until the item is created) */}
              {(kind === "note" || kind === "login") && (
                <AttachmentsSection ref={attachmentsRef} itemId={null} />
              )}

              {/* Security hint */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/[0.08] dark:bg-emerald-500/[0.04] border border-emerald-500/30 dark:border-emerald-500/15">
                <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-[11px] text-emerald-800 dark:text-emerald-200/80">
                  {tr("ni.security_hint")}
                </div>
              </div>
            </div>

            <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2 bg-surface-1 shrink-0">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {tr("common.cancel")}
              </Button>
              <Button
                onClick={submit}
                disabled={!name.trim() || submitting || !vaultId}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {submitting && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {tr("ni.save_item")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function placeholderForKind(
  kind: DisplayKind,
  tr: (k: string) => string,
): string {
  switch (kind) {
    case "login":
      return tr("ni.placeholder_login");
    case "api_key":
      return tr("ni.placeholder_api_key");
    default:
      return tr("ni.placeholder_default");
  }
}

/* =====================================================================
   SHARED COMPONENTS
   ===================================================================== */
function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
        {label}
        {required && <span className="text-rose-400/80 normal-case">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}
