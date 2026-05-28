"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Plus, X, Star } from "lucide-react";
import { toast } from "sonner";

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
import { IconTile } from "@/components/icon";
import { AttachmentsSection } from "@/components/vault/attachments-section";
import { useVaults } from "@/lib/vaults/provider";
import { useFolders } from "@/lib/folders/provider";
import { updateDisplayItem } from "@/lib/items-overlay";
import { useVaultLock } from "@/components/vault-lock/lock-provider";
import type { DisplayItemFull } from "@/lib/items-overlay";
import { ApiError } from "@/lib/api/client";
import { itemTypeColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type {
  CardData,
  CustomField,
  IdentityData,
  ItemMeta,
  SshData,
} from "@/lib/item-meta";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: DisplayItemFull;
  onSaved?: () => void | Promise<void>;
}

export function EditItemDialog({ open, onOpenChange, item, onSaved }: Props) {
  const tr = useT();
  const { vaults } = useVaults();
  const { byVault } = useFolders();
  const { getVaultKey } = useVaultLock();

  const [name, setName] = useState(item.name);
  const [notes, setNotes] = useState(item.notesPlain);
  const [username, setUsername] = useState(item.username ?? "");
  const [password, setPassword] = useState(item.password ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [folderId, setFolderId] = useState<string>(item.folderId ?? "");
  const [tagsText, setTagsText] = useState(item.displayTags.join(", "));
  const [favorite, setFavorite] = useState(item.displayFavorite);
  const [totpSecret, setTotpSecret] = useState(item.totpSecret ?? "");
  const [customFields, setCustomFields] = useState<CustomField[]>(
    item.customFields,
  );
  const [card, setCard] = useState<CardData>(item.card ?? {});
  const [identity, setIdentity] = useState<IdentityData>(item.identity ?? {});
  const [ssh, setSsh] = useState<SshData>(item.ssh ?? {});

  // Re-sync state when the underlying item changes (e.g., reopen after refetch)
  useEffect(() => {
    if (open) {
      setName(item.name);
      setNotes(item.notesPlain);
      setUsername(item.username ?? "");
      setPassword(item.password ?? "");
      setUrl(item.url ?? "");
      setShowPw(false);
      setFolderId(item.folderId ?? "");
      setTagsText(item.displayTags.join(", "));
      setFavorite(item.displayFavorite);
      setTotpSecret(item.totpSecret ?? "");
      setCustomFields(item.customFields);
      setCard(item.card ?? {});
      setIdentity(item.identity ?? {});
      setSsh(item.ssh ?? {});
    }
  }, [open, item]);

  const targetVault = vaults.find((v) => v.id === item.vaultId);
  const folders = byVault(item.vaultId);
  const kind = item.displayKind;

  const save = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);

    const tags = tagsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const nextMeta: ItemMeta = {
      displayKind: kind,
      folderId: folderId || null,
      tags,
      favorite,
      totpSecret: totpSecret.trim() || null,
      customFields,
      card: kind === "card" ? card : undefined,
      identity: kind === "identity" ? identity : undefined,
      ssh: kind === "ssh" ? ssh : undefined,
    };

    try {
      const vaultKey = targetVault?.encryptionVersion === 2
        ? await getVaultKey(item.vaultId)
        : undefined;

      await updateDisplayItem(item, {
        name,
        notes,
        username,
        password,
        url,
        meta: nextMeta,
      }, vaultKey ?? undefined);
      toast.success(tr("item.edit_dialog.saved"), {
        description: tr("item.edit_dialog.saved_desc", {
          name: name.trim(),
          vault: targetVault?.name ?? "",
        }),
      });
      await onSaved?.();
      onOpenChange(false);
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.save_failed"), { description });
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
          <DialogTitle className="text-lg tracking-tight">
            {tr("item.edit_dialog.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {tr("item.edit_dialog.subtitle")}
          </DialogDescription>
        </DialogHeader>

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
                {name || item.name}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {tr(`item.types.${kind}`)} ·{" "}
                {targetVault?.name ?? item.vaultId}
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
              <Star className={cn("size-3.5", favorite && "fill-current")} />
            </button>
          </div>

          <FormField label={tr("common.name")} required>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
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

          {kind === "login" && (
            <>
              <Separator className="bg-surface-3" />
              <div className="space-y-3">
                <FormField label={tr("ni.username_email")}>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </FormField>

                <FormField label={tr("item.password")}>
                  <div className="relative">
                    <Input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPw ? "text" : "password"}
                      className="pr-10 font-mono-secret text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? tr("common.hide") : tr("common.show")}
                      className="absolute right-1 top-1/2 -translate-y-1/2 size-7 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center"
                    >
                      {showPw ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </button>
                  </div>
                </FormField>

                <FormField label={tr("item.url")}>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
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
              </div>
            </>
          )}

          {kind === "api_key" && (
            <>
              <Separator className="bg-surface-3" />
              <FormField label={tr("item.api_key.label")}>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </FormField>
              <FormField label={tr("item.api_key.key")}>
                <div className="relative">
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPw ? "text" : "password"}
                    className="pr-10 font-mono-secret text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? tr("common.hide") : tr("common.show")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 size-7 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center"
                  >
                    {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </FormField>
            </>
          )}

          {kind === "ssh" && (
            <>
              <Separator className="bg-surface-3" />
              <FormField label={tr("item.ssh.private_key")}>
                <Textarea
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  rows={5}
                  className="font-mono-secret text-xs resize-none"
                />
              </FormField>
              <FormField label={tr("item.ssh.public_key")}>
                <Textarea
                  value={ssh.publicKey ?? ""}
                  onChange={(e) => setSsh((p) => ({ ...p, publicKey: e.target.value }))}
                  rows={2}
                  className="font-mono-secret text-xs resize-none"
                />
              </FormField>
              <FormField label={tr("item.ssh.passphrase")}>
                <Input
                  type="password"
                  value={ssh.passphrase ?? ""}
                  onChange={(e) => setSsh((p) => ({ ...p, passphrase: e.target.value }))}
                  className="font-mono-secret text-sm"
                />
              </FormField>
            </>
          )}

          {kind === "card" && (
            <>
              <Separator className="bg-surface-3" />
              <FormField label={tr("item.card.cardholder")}>
                <Input
                  value={card.cardholder ?? ""}
                  onChange={(e) => setCard((p) => ({ ...p, cardholder: e.target.value }))}
                />
              </FormField>
              <FormField label={tr("item.card.number")}>
                <Input
                  value={card.cardNumber ?? ""}
                  onChange={(e) => setCard((p) => ({ ...p, cardNumber: e.target.value }))}
                  className="font-mono-secret text-sm"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={tr("item.card.expiry")}>
                  <Input
                    value={card.expiry ?? ""}
                    onChange={(e) => setCard((p) => ({ ...p, expiry: e.target.value }))}
                    className="font-mono-secret text-sm"
                  />
                </FormField>
                <FormField label={tr("item.card.cvv")}>
                  <Input
                    value={card.cvv ?? ""}
                    onChange={(e) => setCard((p) => ({ ...p, cvv: e.target.value }))}
                    type="password"
                    className="font-mono-secret text-sm"
                  />
                </FormField>
              </div>
            </>
          )}

          {kind === "identity" && (
            <>
              <Separator className="bg-surface-3" />
              <FormField label={tr("item.identity.full_name")}>
                <Input
                  value={identity.fullName ?? ""}
                  onChange={(e) => setIdentity((p) => ({ ...p, fullName: e.target.value }))}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={tr("item.identity.email")}>
                  <Input
                    type="email"
                    value={identity.email ?? ""}
                    onChange={(e) => setIdentity((p) => ({ ...p, email: e.target.value }))}
                  />
                </FormField>
                <FormField label={tr("item.identity.phone")}>
                  <Input
                    value={identity.phone ?? ""}
                    onChange={(e) => setIdentity((p) => ({ ...p, phone: e.target.value }))}
                  />
                </FormField>
              </div>
              <FormField label={tr("item.identity.address")}>
                <Textarea
                  value={identity.address ?? ""}
                  onChange={(e) => setIdentity((p) => ({ ...p, address: e.target.value }))}
                  rows={3}
                  className="resize-none"
                />
              </FormField>
            </>
          )}

          <Separator className="bg-surface-3" />

          <FormField label={tr("item.tags")}>
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
            {customFields.map((cf, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-center"
              >
                <Input
                  value={cf.name}
                  onChange={(e) => updateCustomField(idx, { name: e.target.value })}
                  placeholder={tr("ni.field_name")}
                  className="h-8 text-sm"
                />
                <Input
                  value={cf.value}
                  type={cf.type === "secret" ? "password" : "text"}
                  onChange={(e) => updateCustomField(idx, { value: e.target.value })}
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
                  aria-label={cf.type === "secret" ? tr("common.show") : tr("common.hide")}
                  title={cf.type === "secret" ? tr("common.show") : tr("common.hide")}
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

          <Separator className="bg-surface-3" />

          <FormField label={tr("common.notes")}>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={kind === "note" ? 8 : 3}
              className="resize-none"
            />
          </FormField>

          {(kind === "note" || kind === "login") && (
            <>
              <Separator className="bg-surface-3" />
              <AttachmentsSection itemId={item.id} />
            </>
          )}
        </div>

        <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2 bg-surface-1 shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr("common.cancel")}
          </Button>
          <Button
            onClick={save}
            disabled={!name.trim() || submitting}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {tr("item.edit_dialog.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
