"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

/* =====================================================================
   SHARED SETTINGS PAGE BUILDING BLOCKS
   ===================================================================== */

export function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card card-elevated shadow-card p-5">
      {children}
    </div>
  );
}

export function Field({
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

export function NotificationRow({
  title,
  description,
  defaultChecked,
  recommended,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  defaultChecked?: boolean;
  recommended?: boolean;
  checked?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [internalOn, setInternalOn] = useState(defaultChecked ?? false);

  const isOn = checked !== undefined ? checked : internalOn;
  const handleToggle = (v: boolean) => {
    if (onChange) onChange(v);
    else setInternalOn(v);
  };

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {title}
          {recommended && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            >
              {t("common.recommended")}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={isOn} onCheckedChange={handleToggle} disabled={disabled} />
    </div>
  );
}

export function PolicyRow({
  title,
  description,
  defaultChecked,
  locked,
}: {
  title: string;
  description: string;
  defaultChecked?: boolean;
  locked?: boolean;
}) {
  const t = useT();
  const [on, setOn] = useState(defaultChecked ?? false);
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {title}
          {locked && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 border-line-1 bg-surface-1 text-muted-foreground"
            >
              {t("common.enforced")}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={on} onCheckedChange={setOn} disabled={locked} />
    </div>
  );
}

export function PolicyRowControlled({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SecurityMethod({
  icon: Icon,
  color,
  title,
  description,
  enabled,
  onToggle,
  extra,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: "emerald" | "violet" | "blue";
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  extra?: string;
}) {
  const t = useT();
  const styles = {
    emerald: "bg-emerald-500/10 ring-emerald-500/20 text-emerald-400",
    violet: "bg-violet-500/10 ring-violet-500/20 text-violet-400",
    blue: "bg-blue-500/10 ring-blue-500/20 text-blue-400",
  };
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-1 border border-line-1">
      <div
        className={cn(
          "size-9 rounded-lg ring-1 flex items-center justify-center shrink-0",
          styles[color],
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {title}
          {enabled && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            >
              <Check className="size-2.5" />
              {t("common.on")}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{description}</div>
        {extra && (
          <div className="text-[10px] text-muted-foreground mt-1">{extra}</div>
        )}
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} />
    </div>
  );
}

export function IntegrationRow({
  name,
  description,
  color,
  status,
  summary,
  canManage,
  busy,
  onConnect,
  onConfigure,
  onDisconnect,
  onTest,
}: {
  name: string;
  description: string;
  color:
    | "violet"
    | "blue"
    | "emerald"
    | "amber"
    | "rose"
    | "fuchsia"
    | "cyan";
  status: "connected" | "available" | "coming_soon" | "unavailable";
  summary?: string | null;
  canManage?: boolean;
  busy?: boolean;
  onConnect?: () => void;
  onConfigure?: () => void;
  onDisconnect?: () => void;
  onTest?: () => void;
}) {
  const t = useT();
  const styles: Record<typeof color, string> = {
    violet: "bg-violet-500/10 ring-violet-500/20 text-violet-400",
    blue: "bg-blue-500/10 ring-blue-500/20 text-blue-400",
    emerald: "bg-emerald-500/10 ring-emerald-500/20 text-emerald-400",
    amber: "bg-amber-500/10 ring-amber-500/20 text-amber-400",
    rose: "bg-rose-500/10 ring-rose-500/20 text-rose-400",
    fuchsia: "bg-fuchsia-500/10 ring-fuchsia-500/20 text-fuchsia-400",
    cyan: "bg-cyan-500/10 ring-cyan-500/20 text-cyan-400",
  };

  const connected = status === "connected";
  const comingSoon = status === "coming_soon";
  const unavailable = status === "unavailable";
  const actionsDisabled = !canManage || busy || comingSoon || unavailable;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-1 border border-line-1">
      <div
        className={cn(
          "size-9 rounded-lg ring-1 flex items-center justify-center font-semibold text-xs shrink-0",
          styles[color],
        )}
      >
        {name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
          {name}
          {connected && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            >
              <Check className="size-2.5" /> {t("common.connected")}
            </Badge>
          )}
          {comingSoon && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 border-line-2 bg-surface-1 text-muted-foreground"
            >
              {t("common.coming_soon")}
            </Badge>
          )}
          {unavailable && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            >
              {t("intg.unavailable")}
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">{description}</div>
        {summary && (
          <div className="text-[10px] text-muted-foreground mt-0.5 font-mono-secret">
            {summary}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {connected && onTest && (
          <Button
            variant="outline"
            size="sm"
            disabled={actionsDisabled}
            onClick={() => onTest()}
          >
            {t("intg.test")}
          </Button>
        )}
        {connected && onDisconnect && (
          <Button
            variant="ghost"
            size="sm"
            className="text-rose-700 dark:text-rose-400"
            disabled={actionsDisabled}
            onClick={() => onDisconnect()}
          >
            {t("common.disconnect")}
          </Button>
        )}
        {connected && onConfigure ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={actionsDisabled}
            onClick={() => onConfigure()}
          >
            {t("common.configure")}
          </Button>
        ) : !connected && onConnect ? (
          <Button
            variant="outline"
            size="sm"
            disabled={actionsDisabled}
            onClick={() => onConnect()}
          >
            {t("common.connect")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function DangerCard({
  title,
  description,
  actionLabel,
}: {
  title: string;
  description: string;
  actionLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-rose-500/30 dark:border-rose-500/15 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-300">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
            {description}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-rose-700 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 hover:bg-rose-500/15 dark:hover:bg-rose-500/10 shrink-0"
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
