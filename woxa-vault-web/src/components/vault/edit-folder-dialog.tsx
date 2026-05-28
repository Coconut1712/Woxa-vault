"use client";

import { useEffect, useState } from "react";
import { Check, Folder, Loader2, Pencil } from "lucide-react";
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
import { VaultIcon, colorFor } from "@/components/icon";
import type { ColorKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useVaults } from "@/lib/vaults/provider";
import { useFolders, type Folder as FolderModel } from "@/lib/folders/provider";
import { ApiError } from "@/lib/api/client";
import type { FolderUpdateInput } from "@/lib/api/types";
import { useT } from "@/lib/i18n/provider";

interface Props {
  folder: FolderModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (folder: FolderModel) => void;
}

const iconChoices = [
  "folder",
  "cloud",
  "database",
  "plug",
  "settings",
  "globe",
  "rocket",
  "flask",
  "lock",
  "users",
  "megaphone",
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

export function EditFolderDialog({ folder, open, onOpenChange, onUpdated }: Props) {
  const tr = useT();
  const { vaults } = useVaults();
  const { update: updateFolder } = useFolders();

  const initialColor: ColorKey = folder.color ?? "violet";
  const [name, setName] = useState(folder.name);
  const [icon, setIcon] = useState<string>(folder.iconKey ?? "folder");
  const [color, setColor] = useState<ColorKey>(initialColor);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(folder.name);
      setIcon(folder.iconKey ?? "folder");
      setColor(folder.color ?? "violet");
    }
  }, [open, folder]);

  const trimmedName = name.trim();
  const hasChanges =
    (trimmedName !== "" && trimmedName !== folder.name) ||
    icon !== (folder.iconKey ?? "folder") ||
    color !== (folder.color ?? "violet");
  const canSubmit = !!trimmedName && hasChanges && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    const patch: FolderUpdateInput = {};
    if (trimmedName !== folder.name) patch.name = trimmedName;
    if (icon !== (folder.iconKey ?? "folder")) patch.iconKey = icon;
    if (color !== (folder.color ?? "violet")) patch.color = color;
    setSubmitting(true);
    try {
      const next = await updateFolder(folder.vaultId, folder.id, patch);
      toast.success(tr("folder.updated_toast"), {
        description: tr("folder.updated_toast_desc", { name: next.name }),
      });
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

  const colorStyles = colorFor(color);
  const parentVault = vaults.find((v) => v.id === folder.vaultId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg tracking-tight flex items-center gap-2">
            <Pencil className="size-4 text-brand" /> {tr("folder.edit.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {tr("folder.edit.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4 space-y-4">
          {/* Preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-1 border border-line-1">
            <div
              className={cn(
                "size-10 rounded-xl ring-1 flex items-center justify-center",
                colorStyles.bg,
                colorStyles.ring,
              )}
            >
              <VaultIcon
                name={icon}
                className={cn("size-5", colorStyles.text)}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {trimmedName || folder.name}
              </div>
              <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                <Folder className="size-3" />
                {parentVault?.name ?? ""}
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {tr("nf.placeholder_name")}
            </Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("nf.example_name")}
              className="h-9"
            />
          </div>

          {/* Icon picker */}
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
                      ? cn(colorStyles.bg, colorStyles.ring, "ring-2")
                      : "bg-surface-1 ring-line-1 hover:ring-line-3",
                  )}
                >
                  <VaultIcon
                    name={i}
                    className={cn(
                      "size-4",
                      icon === i ? colorStyles.text : "text-muted-foreground",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {tr("common.color")}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {colorChoices.map((cc) => {
                const cs = colorFor(cc);
                return (
                  <button
                    key={cc}
                    type="button"
                    onClick={() => setColor(cc)}
                    aria-label={cc}
                    className={cn(
                      "size-8 rounded-lg ring-1 flex items-center justify-center transition-all",
                      cs.bg,
                      cs.ring,
                      color === cc && "ring-2",
                    )}
                  >
                    {color === cc && (
                      <Check className={cn("size-3.5", cs.text)} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2 bg-surface-1">
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
            {tr("folder.edit.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
