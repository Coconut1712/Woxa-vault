"use client";

import { useMemo, useState } from "react";
import {
  Mail,
  X,
  Send,
  AlertTriangle,
  ShieldCheck,
  Check,
  Crown,
  ShieldCheck as ShieldIcon,
  Users as UsersIcon,
  UserCog,
  FileSearch,
  Sparkles,
  Globe,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { workspace } from "@/lib/mock/data";
import { teams } from "@/lib/mock/access";
import { allowedDomains } from "@/lib/mock/sso";
import type { MemberRole } from "@/lib/mock/members";
import { colorFor } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const roleIconColor: Record<
  MemberRole,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }
> = {
  owner: {
    icon: Crown,
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  admin: {
    icon: ShieldIcon,
    color: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  },
  auditor: {
    icon: FileSearch,
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  member: {
    icon: UsersIcon,
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  guest: {
    icon: UserCog,
    color: "bg-muted text-muted-foreground border-line-1",
  },
};

interface InviteEntry {
  email: string;
  /** "external" if domain is NOT in the allowlist */
  status: "valid" | "invalid" | "external";
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMembersDialog({ open, onOpenChange }: Props) {
  const t = useT();
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [input, setInput] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");

  const verifiedDomains = useMemo(
    () =>
      allowedDomains
        .filter((d) => d.status === "verified")
        .map((d) => d.domain),
    [],
  );

  const externalCount = invites.filter((i) => i.status === "external").length;
  const invalidCount = invites.filter((i) => i.status === "invalid").length;

  const checkStatus = (email: string): InviteEntry["status"] => {
    if (!EMAIL_REGEX.test(email)) return "invalid";
    const domain = email.split("@")[1]?.toLowerCase();
    if (!verifiedDomains.includes(domain)) return "external";
    return "valid";
  };

  const addEmails = (raw: string) => {
    const parts = raw
      .split(/[\s,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    setInvites((prev) => {
      const existing = new Set(prev.map((i) => i.email));
      const next = [...prev];
      for (const e of parts) {
        if (existing.has(e)) continue;
        next.push({ email: e, status: checkStatus(e) });
        existing.add(e);
      }
      return next;
    });
    setInput("");
  };

  const removeInvite = (email: string) => {
    setInvites((prev) => prev.filter((i) => i.email !== email));
  };

  const toggleTeam = (id: string) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setInvites([]);
    setInput("");
    setRole("member");
    setSelectedTeams(new Set());
    setMessage("");
  };

  const validInvites = invites.filter(
    (i) => i.status === "valid" || (i.status === "external" && role === "guest"),
  );

  const send = () => {
    if (validInvites.length === 0) {
      toast.error(t("invite.err_no_valid"));
      return;
    }
    if (invites.some((i) => i.status === "external") && role !== "guest") {
      toast.error(t("invite.err_external"), {
        description: t("invite.err_external_desc"),
      });
      return;
    }
    toast.success(
      t("invite.sent_success", {
        n: validInvites.length,
        who: validInvites.length === 1 ? t("ptype.user") : t("ptype.user"),
      }),
      {
        description: t("invite.sent_desc"),
      },
    );
    onOpenChange(false);
    setTimeout(reset, 250);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-lg tracking-tight flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            {t("invite.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("invite.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4 space-y-5 overflow-y-auto flex-1">
          {/* Email tag input */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t("invite.email_addresses")}
            </Label>

            <div className="rounded-lg border border-line-2 bg-card/40 px-2 py-1.5 min-h-24 focus-within:border-line-3 transition-colors">
              <div className="flex flex-wrap gap-1.5">
                {invites.map((inv) => (
                  <EmailChip
                    key={inv.email}
                    invite={inv}
                    onRemove={() => removeInvite(inv.email)}
                  />
                ))}
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" ||
                      e.key === "," ||
                      e.key === " " ||
                      e.key === "Tab"
                    ) {
                      if (input.trim()) {
                        e.preventDefault();
                        addEmails(input);
                      }
                    }
                    if (e.key === "Backspace" && !input && invites.length) {
                      removeInvite(invites[invites.length - 1].email);
                    }
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (/[,;\n\s]/.test(text)) {
                      e.preventDefault();
                      addEmails(text);
                    }
                  }}
                  onBlur={() => input.trim() && addEmails(input)}
                  placeholder={
                    invites.length ? "" : t("invite.email_placeholder")
                  }
                  className="flex-1 min-w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground py-1 px-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <p className="text-muted-foreground">{t("invite.paste_hint")}</p>
              {invites.length > 0 && (
                <span className="text-muted-foreground tabular-nums">
                  {t("invite.valid_count", {
                    valid: validInvites.length,
                    total: invites.length,
                  })}
                </span>
              )}
            </div>

            {/* Validation warnings */}
            {invalidCount > 0 && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/[0.05] border border-rose-500/15 text-xs">
                <AlertTriangle className="size-3.5 text-rose-400 mt-0.5 shrink-0" />
                <span className="text-rose-300">
                  {t(
                    invalidCount === 1
                      ? "invite.invalid_count"
                      : "invite.invalid_count_plural",
                    { n: invalidCount },
                  )}
                </span>
              </div>
            )}
            {externalCount > 0 && role !== "guest" && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/[0.08] dark:bg-amber-500/[0.05] border border-amber-500/30 dark:border-amber-500/15 text-xs">
                <Globe className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-amber-800 dark:text-amber-200/90">
                  {t(
                    externalCount === 1
                      ? "invite.external_warning"
                      : "invite.external_warning_plural",
                    { n: externalCount, domain: workspace.domain },
                  )}
                </div>
              </div>
            )}
          </div>

          <Separator className="bg-surface-3" />

          {/* Role picker */}
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t("invite.role")}
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["admin", "auditor", "member", "guest"] as MemberRole[]).map(
                (r) => {
                  const cfg = roleIconColor[r];
                  const active = role === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={cn(
                        "rounded-xl border bg-card/40 p-3 text-left transition-all",
                        active
                          ? "border-brand/40 bg-brand/[0.04]"
                          : "border-line-1 hover:border-line-3 hover:bg-surface-1",
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className={cn(
                            "size-6 rounded-md ring-1 flex items-center justify-center shrink-0",
                            cfg.color,
                          )}
                        >
                          <cfg.icon className="size-3" />
                        </div>
                        {active && (
                          <Check className="size-3.5 text-brand ml-auto" />
                        )}
                      </div>
                      <span className="text-xs font-semibold block">
                        {t(`members.role.${r}`)}
                      </span>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-1 line-clamp-2">
                        {t(`invite.role.${r}.desc`)}
                      </p>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          <Separator className="bg-surface-3" />

          {/* Team assignment (only relevant for member/admin) */}
          {role !== "guest" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {t("invite.add_to_teams")}
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {t("invite.selected_count", { n: selectedTeams.size })}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {teams.map((team) => {
                  const c = colorFor(team.color);
                  const active = selectedTeams.has(team.id);
                  return (
                    <button
                      key={team.id}
                      onClick={() => toggleTeam(team.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium transition-all border",
                        active
                          ? cn(c.bg, c.ring, c.text, "border-transparent")
                          : "border-line-1 bg-surface-1 text-foreground/80 hover:bg-surface-2",
                      )}
                    >
                      {active && <Check className="size-3" />}
                      <UsersIcon className="size-3" />
                      {team.name}
                      <span className="text-[10px] opacity-60 tabular-nums">
                        {team.memberCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {role !== "guest" && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-500/[0.08] dark:bg-blue-500/[0.04] border border-blue-500/30 dark:border-blue-500/15 text-[11px]">
              <Sparkles className="size-3.5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="text-blue-800 dark:text-blue-200/80">
                {t("invite.teams_hint")}
              </div>
            </div>
          )}

          {role === "guest" && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/[0.08] dark:bg-amber-500/[0.04] border border-amber-500/30 dark:border-amber-500/15 text-[11px]">
              <ShieldCheck className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-amber-800 dark:text-amber-200/80">
                {t("invite.guest_hint")}
              </div>
            </div>
          )}

          <Separator className="bg-surface-3" />

          {/* Optional message */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t("invite.personal_message")}
            </Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder={t("invite.message_placeholder")}
              className="resize-none"
              maxLength={300}
            />
            <p className="text-[10px] text-muted-foreground text-right tabular-nums">
              {message.length} / 300
            </p>
          </div>
        </div>

        <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-2 bg-surface-1 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            <span>{t("invite.hmac_hint")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={send}
              disabled={validInvites.length === 0}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Send className="size-3.5" />
              {validInvites.length > 0
                ? t("invite.send_n", { n: validInvites.length, plural: "" })
                : t("common.send_invites")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =====================================================================
   EMAIL CHIP
   ===================================================================== */
function EmailChip({
  invite,
  onRemove,
}: {
  invite: InviteEntry;
  onRemove: () => void;
}) {
  const t = useT();
  const styles = {
    valid:
      "border-line-2 bg-surface-2 text-foreground",
    external:
      "border-amber-500/20 bg-amber-500/10 text-amber-300",
    invalid: "border-rose-500/20 bg-rose-500/10 text-rose-300",
  } as const;
  const icon =
    invite.status === "invalid"
      ? AlertTriangle
      : invite.status === "external"
        ? Globe
        : null;
  const Icon = icon;
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 pl-1.5 pr-1 gap-1 font-mono-secret text-xs",
        styles[invite.status],
      )}
    >
      {Icon && <Icon className="size-2.5" />}
      <span className="font-mono-secret">{invite.email}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${t("common.remove")} ${invite.email}`}
        className="rounded hover:bg-surface-3 p-0.5"
      >
        <X className="size-2.5" />
      </button>
    </Badge>
  );
}
