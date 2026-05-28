"use client";

import { useRouter } from "next/navigation";
import {
  Send,
  History,
  Plus,
  Settings,
  Star,
} from "lucide-react";
import { VaultIcon, colorFor } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import {
  canEditItemRole,
  canViewAuditLog,
  canViewWorkspaceSettings,
  canWriteVaultData,
} from "@/lib/auth/permissions";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

// Vaults are live via VaultsProvider. Items would belong here too, but there
// is no global /search endpoint in round 2, so item suggestions are omitted
// rather than rendered against a stale mock dataset.
import { useVaults } from "@/lib/vaults/provider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const router = useRouter();
  const t = useT();
  const { vaults } = useVaults();
  const { me } = useAuth();

  // Org-role gating mirrors the sidebar: guests can't create items/sends, and
  // audit/settings are admin-only.
  const role = me?.role ?? null;
  const canWrite = canWriteVaultData(role);
  // "New item" needs a vault where the caller is manager|editor (user is use-only).
  const canCreateItem = canWrite && vaults.some((v) => canEditItemRole(v.role));
  const showAudit = canViewAuditLog(role);
  const showSettings = canViewWorkspaceSettings(role);
  const showGoTo = showAudit || showSettings;

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("cmd.search_placeholder")} />
      <CommandList>
        <CommandEmpty>{t("cmd.no_results")}</CommandEmpty>

        <CommandGroup heading={t("cmd.quick_actions")}>
          {canCreateItem && (
            <CommandItem onSelect={() => go("/app/new")}>
              <Plus /> {t("vault.new_item")}
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
          )}
          {canWrite && (
            <CommandItem onSelect={() => go("/app/sends/new")}>
              <Send /> {t("cmd.send_copy")}
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem onSelect={() => go("/app/favorites")}>
            <Star /> {t("nav.favorites")}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t("cmd.vaults")}>
          {vaults.map((v) => {
            const c = colorFor(v.color ?? "violet");
            return (
              <CommandItem
                key={v.id}
                onSelect={() => go(`/app/vault/${v.id}`)}
              >
                <div
                  className={cn(
                    "size-5 rounded-md flex items-center justify-center ring-1",
                    c.bg,
                    c.ring,
                  )}
                >
                  <VaultIcon
                    name={v.iconKey ?? "folder"}
                    className={cn("size-3", c.text)}
                  />
                </div>
                <span>{v.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("cmd.n_items", { n: v.itemCount })}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {showGoTo && (
          <>
            <CommandSeparator />

            <CommandGroup heading={t("cmd.go_to")}>
              {showAudit && (
                <CommandItem onSelect={() => go("/app/audit")}>
                  <History /> {t("nav.audit_log")}
                </CommandItem>
              )}
              {showSettings && (
                <CommandItem onSelect={() => go("/app/settings")}>
                  <Settings /> {t("nav.settings")}
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
