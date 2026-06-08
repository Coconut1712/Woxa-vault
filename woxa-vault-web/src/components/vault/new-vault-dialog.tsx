"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ShieldCheck,
  Server,
  Sparkles,
  FolderPlus,
  Loader2,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { VaultIcon, colorFor } from "@/components/icon";
import type { ColorKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { createVault } from "@/lib/api/vaults";
import { ApiError } from "@/lib/api/client";
import { useVaults } from "@/lib/vaults/provider";
import { useAuth } from "@/lib/auth/provider";
import { wrapVaultKey, toBase64 } from "@/lib/crypto-client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Navigate to the new vault after creation (defaults to false). */
  navigateOnCreate?: boolean;
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

type EncryptionMode = "zero_knowledge" | "envelope";

interface Template {
  id: string;
  nameKey: string;
  descKey: string;
  folders: string[];
}

const templates: Template[] = [
  {
    id: "empty",
    nameKey: "nv.template.empty",
    descKey: "nv.template.empty_desc",
    folders: [],
  },
  {
    id: "infra",
    nameKey: "nv.template.infra",
    descKey: "nv.template.infra_desc",
    folders: ["AWS", "Databases", "CI/CD", "DNS & Domains", "Third-party"],
  },
  {
    id: "saas",
    nameKey: "nv.template.saas",
    descKey: "nv.template.saas_desc",
    folders: ["Marketing tools", "Design tools", "Analytics", "Communication"],
  },
  {
    id: "finance",
    nameKey: "nv.template.finance",
    descKey: "nv.template.finance_desc",
    folders: ["Payment cards", "Vendors", "Accounting", "Banking"],
  },
];

export function NewVaultDialog({
  open,
  onOpenChange,
  navigateOnCreate = false,
}: Props) {
  const t = useT();
  const router = useRouter();
  const { refresh } = useVaults();
  const { me } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("rocket");
  const [color, setColor] = useState<ColorKey>("violet");
  // Always ZK (v2) — v1 server-side encryption is no longer an option.
  const mode: EncryptionMode = "zero_knowledge";
  const [template, setTemplate] = useState("empty");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setIcon("rocket");
    setColor("violet");
    setTemplate("empty");
  };

  const submit = async () => {
    if (!name.trim() || submitting) return;

    // All vaults are now v2 (ZK). Require the user to have set up their
    // master password (which gives them a public key) before creating a vault.
    if (!me?.publicKey) {
      toast.error(t("nv.error.no_master_password"), {
        description: t("nv.error.no_master_password_desc"),
      });
      return;
    }

    setSubmitting(true);
    try {
      // Always v2: generate a random vault key and wrap it for the creator.
      const vaultKey = window.crypto.getRandomValues(new Uint8Array(32));
      const wrapped = await wrapVaultKey(
        vaultKey,
        Uint8Array.from(atob(me.publicKey), (c) => c.charCodeAt(0)),
      );
      const combined = new Uint8Array(
        wrapped.ephemeralPublicKey.length +
          wrapped.iv.length +
          wrapped.authTag.length +
          wrapped.ciphertext.length,
      );
      let offset = 0;
      combined.set(wrapped.ephemeralPublicKey, offset); offset += wrapped.ephemeralPublicKey.length;
      combined.set(wrapped.iv, offset); offset += wrapped.iv.length;
      combined.set(wrapped.authTag, offset); offset += wrapped.authTag.length;
      combined.set(wrapped.ciphertext, offset);
      const wrappedKey = toBase64(combined);

      const vault = await createVault({
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        iconKey: icon,
        color,
        encryptionVersion: 2,
        wrappedKey,
      });
      toast.success(t("toast.vault_created"), {
        description: t("toast.vault_created_empty", { name: vault.name }),
      });
      await refresh();
      onOpenChange(false);
      setTimeout(reset, 250);
      if (navigateOnCreate) {
        router.push(`/app/vault/${vault.id}`);
      }
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : t("api.error.generic");
      toast.error(t("api.error.create_failed"), { description });
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
            <ShieldCheck className="size-4 text-brand" /> {t("nv.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("nv.subtitle")}
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
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-semibold tracking-tight">
                    {name || t("nv.placeholder_name")}
                  </h3>
                  {mode === "zero_knowledge" && (
                    <Badge
                      variant="outline"
                      className="text-[9px] h-4 px-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-400 gap-1"
                    >
                      <ShieldCheck className="size-2.5" /> {t("vault.encryption.zk_short")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {description || t("nv.description_preview")}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-2">
                  {t("nv.starter_caption", {
                    n:
                      templates.find((tp) => tp.id === template)?.folders
                        .length ?? 0,
                    mode:
                      mode === "zero_knowledge"
                        ? t("nv.zk")
                        : t("nv.server_side"),
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Name + description */}
          <div className="space-y-3">
            <FormField label={t("nv.placeholder_name")} required>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("nv.example_name")}
                className="h-9"
              />
            </FormField>

            <FormField label={t("nv.description")}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder={t("nv.description_placeholder")}
                className="resize-none"
              />
            </FormField>
          </div>

          <Separator className="bg-surface-3" />

          {/* Icon + color */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t("common.icon")}
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
                {t("common.color")}
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

          <Separator className="bg-surface-3" />

          {/* Encryption — always ZK (v2), shown as info badge only */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/[0.06] dark:bg-emerald-500/[0.04] border border-emerald-500/20 dark:border-emerald-500/15">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {t("nv.zk")}
              </p>
              <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70">
                {t("nv.zk_desc")}
              </p>
            </div>
          </div>

          <Separator className="bg-surface-3" />

          {/* Starter template */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t("nv.starter_template")}
              </Label>
              <span className="text-[10px] text-muted-foreground">
                {t("nv.template_hint")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((tp) => (
                <TemplateCard
                  key={tp.id}
                  active={template === tp.id}
                  onClick={() => setTemplate(tp.id)}
                  template={tp}
                />
              ))}
            </div>
          </div>

          {/* Access hint */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-brand/[0.05] border border-brand/15">
            <Sparkles className="size-3.5 text-brand mt-0.5 shrink-0" />
            <div className="text-[11px] text-foreground/80">
              {t("nv.access_hint")}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2 bg-surface-1 shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!name.trim() || submitting}
            onClick={submit}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="size-3.5" />
            )}{" "}
            {t("nv.create_button")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =====================================================================
   ENCRYPTION OPTION
   ===================================================================== */
function EncryptionOption({
  active,
  onClick,
  icon: Icon,
  title,
  badge,
  description,
  color,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: string;
  description: string;
  color: "emerald" | "blue";
}) {
  const styles =
    color === "emerald"
      ? "bg-emerald-500/10 ring-emerald-500/20 text-emerald-400"
      : "bg-blue-500/10 ring-blue-500/20 text-blue-400";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card/40 p-3 text-left transition-all",
        active
          ? "border-brand/40 bg-brand/[0.04]"
          : "border-line-1 hover:border-line-3 hover:bg-surface-1",
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className={cn(
            "size-7 rounded-md ring-1 flex items-center justify-center shrink-0",
            styles,
          )}
        >
          <Icon className="size-3.5" />
        </div>
        <span className="text-sm font-semibold">{title}</span>
        {badge && (
          <Badge
            variant="outline"
            className="text-[9px] h-4 px-1.5 border-brand/30 bg-brand/10 text-brand"
          >
            {badge}
          </Badge>
        )}
        <span
          className={cn(
            "ml-auto size-4 rounded-full ring-1 flex items-center justify-center transition-colors",
            active
              ? "bg-brand ring-brand"
              : "bg-transparent ring-line-3",
          )}
        >
          {active && <Check className="size-2.5 text-brand-foreground" />}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {description}
      </p>
    </button>
  );
}

/* =====================================================================
   TEMPLATE CARD
   ===================================================================== */
function TemplateCard({
  active,
  onClick,
  template,
}: {
  active: boolean;
  onClick: () => void;
  template: Template;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card/40 p-3 text-left transition-all",
        active
          ? "border-brand/40 bg-brand/[0.04]"
          : "border-line-1 hover:border-line-3 hover:bg-surface-1",
      )}
    >
      <div className="flex items-start gap-2 mb-1">
        <span className="text-sm font-semibold flex-1">{t(template.nameKey)}</span>
        <span
          className={cn(
            "size-4 rounded-full ring-1 flex items-center justify-center transition-colors mt-0.5",
            active ? "bg-brand ring-brand" : "bg-transparent ring-line-3",
          )}
        >
          {active && <Check className="size-2.5 text-brand-foreground" />}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
        {t(template.descKey)}
      </p>
      {template.folders.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {template.folders.slice(0, 3).map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface-2 text-[10px] text-muted-foreground"
            >
              <FolderPlus className="size-2.5" /> {f}
            </span>
          ))}
          {template.folders.length > 3 && (
            <span className="text-[10px] text-muted-foreground/70 px-1 py-0.5">
              {t("nv.more_count", { n: template.folders.length - 3 })}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/* =====================================================================
   SHARED FIELD WRAPPER
   ===================================================================== */
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
