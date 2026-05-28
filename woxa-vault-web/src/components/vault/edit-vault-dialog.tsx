"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { VaultIcon, colorFor } from "@/components/icon";
import type { ColorKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { updateVault } from "@/lib/api/vaults";
import { ApiError } from "@/lib/api/client";
import { useVaults } from "@/lib/vaults/provider";
import type { Vault, VaultSummary, VaultUpdateInput } from "@/lib/api/types";

interface Props {
  /** Accepts either VaultSummary (from list) or full Vault (from detail). */
  vault: VaultSummary | Vault;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (vault: Vault) => void;
}

const iconChoices = [
  "rocket",
  "flask",
  "users",
  "lock",
  "megaphone",
  "cloud",
  "database",
  "plug",
  "settings",
  "globe",
  "folder",
];

const colorChoices: ColorKey[] = [
  "violet",
  "blue",
  "emerald",
  "amber",
  "rose",
  "fuchsia",
  "cyan",
  "indigo",
];

export function EditVaultDialog({ vault, open, onOpenChange, onUpdated }: Props) {
  const tr = useT();
  const { refresh } = useVaults();
  const initialColor: ColorKey = (vault.color ?? "violet") as ColorKey;
  const initialIcon = vault.iconKey ?? "folder";

  const [name, setName] = useState(vault.name);
  const [description, setDescription] = useState(vault.description ?? "");
  const [icon, setIcon] = useState<string>(initialIcon);
  const [color, setColor] = useState<ColorKey>(initialColor);
  const [submitting, setSubmitting] = useState(false);

  // Re-sync when reopening or when the underlying vault changes
  useEffect(() => {
    if (open) {
      setName(vault.name);
      setDescription(vault.description ?? "");
      setIcon(vault.iconKey ?? "folder");
      setColor((vault.color ?? "violet") as ColorKey);
    }
  }, [open, vault]);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const originalDescription = (vault.description ?? "").trim();

  const diff: VaultUpdateInput = {};
  if (trimmedName && trimmedName !== vault.name) diff.name = trimmedName;
  if (trimmedDescription !== originalDescription) {
    diff.description = trimmedDescription ? trimmedDescription : null;
  }
  if (icon !== (vault.iconKey ?? "folder")) diff.iconKey = icon;
  if (color !== (vault.color ?? "violet")) diff.color = color;

  const hasChanges = Object.keys(diff).length > 0;
  const canSubmit = !!trimmedName && hasChanges && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const next = await updateVault(vault.id, diff);
      toast.success(tr("vault.updated_toast"), {
        description: tr("vault.updated_toast_desc", { name: next.name }),
      });
      await refresh();
      onUpdated?.(next);
      onOpenChange(false);
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.save_failed"), { description });
    } finally {
      setSubmitting(false);
    }
  };

  const c = colorFor(color);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-lg tracking-tight flex items-center gap-2">
            <Pencil className="size-4 text-brand" /> {tr("vault.edit.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {tr("vault.edit.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4 space-y-5 overflow-y-auto flex-1">
          {/* Live preview */}
          <div className="relative rounded-2xl border border-border bg-card p-4 overflow-hidden">
            <div
              className={cn(
                "absolute -top-12 -right-12 size-32 rounded-full blur-3xl opacity-30",
                c.bg,
              )}
            />
            <div className="relative flex items-start gap-3">
              <div
                className={cn(
                  "size-12 rounded-2xl ring-1 flex items-center justify-center",
                  c.bg,
                  c.ring,
                )}
              >
                <VaultIcon name={icon} className={cn("size-6", c.text)} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold tracking-tight">
                  {trimmedName || vault.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {trimmedDescription || tr("nv.description_preview")}
                </p>
              </div>
            </div>
          </div>

          {/* Name + description */}
          <div className="space-y-3">
            <FormField label={tr("nv.placeholder_name")} required>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tr("nv.example_name")}
                className="h-9"
              />
            </FormField>

            <FormField label={tr("nv.description")}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder={tr("nv.description_placeholder")}
                className="resize-none"
              />
            </FormField>
          </div>

          <Separator className="bg-surface-3" />

          {/* Icon + color */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {tr("common.icon")}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {iconChoices.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    aria-label={i}
                    className={cn(
                      "size-9 rounded-lg ring-1 flex items-center justify-center transition-all",
                      icon === i
                        ? cn(c.bg, c.ring, "ring-2")
                        : "bg-surface-1 ring-line-1 hover:ring-line-3",
                    )}
                  >
                    <VaultIcon
                      name={i}
                      className={cn(
                        "size-4",
                        icon === i ? c.text : "text-muted-foreground",
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {tr("common.color")}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {colorChoices.map((col) => {
                  const cs = colorFor(col);
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setColor(col)}
                      aria-label={col}
                      className={cn(
                        "size-9 rounded-lg ring-1 flex items-center justify-center transition-all",
                        cs.bg,
                        cs.ring,
                        color === col && "ring-2",
                      )}
                    >
                      {color === col && (
                        <Check className={cn("size-4", cs.text)} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-2 bg-surface-1 shrink-0">
          <span className="text-[11px] text-muted-foreground">
            {hasChanges ? "" : tr("vault.edit.no_changes")}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {tr("common.cancel")}
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={submit}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Pencil className="size-3.5" />
              )}{" "}
              {tr("vault.edit.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
        {label}
        {required && <span className="text-rose-400/80 normal-case">*</span>}
      </Label>
      {children}
    </div>
  );
}
