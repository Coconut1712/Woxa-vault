"use client";

import { useEffect, useState } from "react";
import { Folder, Check, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VaultIcon, colorFor } from "@/components/icon";
import type { ColorKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useVaults } from "@/lib/vaults/provider";
import { useFolders } from "@/lib/folders/provider";
import { ApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultVaultId?: string;
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

export function NewFolderDialog({
  open,
  onOpenChange,
  defaultVaultId,
}: Props) {
  const tr = useT();
  const { vaults } = useVaults();
  const { create: createFolder } = useFolders();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [color, setColor] = useState<ColorKey>("violet");
  const [vaultId, setVaultId] = useState(defaultVaultId ?? vaults[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setIcon("folder");
    setColor("violet");
  };

  useEffect(() => {
    if (defaultVaultId) setVaultId(defaultVaultId);
    else if (!vaultId && vaults.length) setVaultId(vaults[0].id);
  }, [defaultVaultId, vaults, vaultId]);

  const submit = async () => {
    if (!name.trim() || !vaultId || submitting) return;
    setSubmitting(true);
    try {
      const folder = await createFolder(vaultId, {
        name: name.trim(),
        iconKey: icon,
        color,
      });
      toast.success(tr("toast.folder_created"), {
        description: tr("toast.folder_created_desc", {
          name: folder.name,
          vault: vaults.find((v) => v.id === vaultId)?.name ?? "",
        }),
      });
      onOpenChange(false);
      reset();
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : tr("api.error.generic");
      toast.error(tr("api.error.create_failed"), { description });
    } finally {
      setSubmitting(false);
    }
  };

  const colorStyles = colorFor(color);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg tracking-tight flex items-center gap-2">
            <Folder className="size-4 text-muted-foreground" />
            {tr("nf.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {tr("nf.desc")}
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
                {name || tr("nf.placeholder_name")}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {vaults.find((v) => v.id === vaultId)?.name}
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

          {/* Vault */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {tr("nf.in_vault")}
            </Label>
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
            disabled={!name.trim() || !vaultId || submitting}
            onClick={submit}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {tr("nf.create_button")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
