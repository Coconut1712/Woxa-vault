"use client";

import { useEffect, useState } from "react";
import {
  HelpCircle,
  Command,
  Search,
  Plus,
  Send,
  Lock,
  Star,
  ArrowRight,
  Sun,
  Moon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/provider";

interface Shortcut {
  keys: string[];
  labelKey: string;
  descKey?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface ShortcutGroup {
  titleKey: string;
  shortcuts: Shortcut[];
}

const groups: ShortcutGroup[] = [
  {
    titleKey: "ks.group.nav",
    shortcuts: [
      {
        keys: ["⌘", "K"],
        labelKey: "ks.cmd_palette",
        descKey: "ks.cmd_palette_desc",
        icon: Search,
      },
      { keys: ["G", "H"], labelKey: "ks.goto_home" },
      { keys: ["G", "V"], labelKey: "ks.goto_last_vault" },
      { keys: ["G", "F"], labelKey: "ks.goto_favorites", icon: Star },
      { keys: ["G", "S"], labelKey: "ks.goto_sends", icon: Send },
      { keys: ["?"], labelKey: "ks.show_dialog", icon: HelpCircle },
    ],
  },
  {
    titleKey: "ks.group.items",
    shortcuts: [
      { keys: ["N"], labelKey: "ks.new_item", icon: Plus },
      { keys: ["⌘", "S"], labelKey: "ks.send_copy", icon: Send },
      { keys: ["⌘", "C"], labelKey: "ks.copy_password" },
      { keys: ["⌘", "⇧", "C"], labelKey: "ks.copy_username" },
      { keys: ["⌘", "⏎"], labelKey: "ks.open_url", icon: ArrowRight },
      { keys: ["F"], labelKey: "ks.toggle_fav", icon: Star },
      { keys: ["E"], labelKey: "ks.edit_current" },
      { keys: ["⌘", "⌫"], labelKey: "ks.move_trash" },
    ],
  },
  {
    titleKey: "ks.group.vault",
    shortcuts: [
      {
        keys: ["⌘", "⌥", "L"],
        labelKey: "ks.lock_vault",
        descKey: "ks.lock_vault_desc",
        icon: Lock,
      },
      { keys: ["⌘", "⇧", "N"], labelKey: "ks.new_vault" },
      { keys: ["⌘", "/"], labelKey: "ks.focus_search" },
    ],
  },
  {
    titleKey: "ks.group.appearance",
    shortcuts: [
      { keys: ["⌘", "⇧", "L"], labelKey: "ks.theme_light", icon: Sun },
      { keys: ["⌘", "⇧", "D"], labelKey: "ks.theme_dark", icon: Moon },
    ],
  },
  {
    titleKey: "ks.group.general",
    shortcuts: [
      { keys: ["Esc"], labelKey: "ks.esc" },
      { keys: ["⏎"], labelKey: "ks.enter" },
      { keys: ["Tab"], labelKey: "ks.tab" },
      { keys: ["⇧", "Tab"], labelKey: "ks.shift_tab" },
    ],
  },
];

export function KeyboardShortcutsTrigger() {
  const t = useT();
  const [open, setOpen] = useState(false);

  // Global "?" shortcut to open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("topbar.shortcuts")}
        title={t("topbar.shortcuts_hint")}
        className="size-8 rounded-md hover:bg-accent flex items-center justify-center text-foreground transition-colors"
      >
        <HelpCircle className="size-4" />
      </button>

      <KeyboardShortcutsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-lg tracking-tight flex items-center gap-2">
            <Command className="size-4 text-muted-foreground" />
            {t("ks.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("ks.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 overflow-y-auto flex-1 space-y-6">
          {groups.map((group) => (
            <section key={group.titleKey}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 sticky top-0 bg-popover py-1">
                {t(group.titleKey)}
              </h3>
              <div className="rounded-xl border border-line-1 bg-surface-1 divide-y divide-line-1 overflow-hidden">
                {group.shortcuts.map((s) => (
                  <ShortcutRow key={s.labelKey} shortcut={s} />
                ))}
              </div>
            </section>
          ))}

          <div className="rounded-xl border border-brand/15 bg-brand/[0.04] p-3 flex items-start gap-2">
            <Command className="size-3.5 text-brand mt-0.5 shrink-0" />
            <div className="text-[11px] text-foreground/80 leading-relaxed">
              {t("ks.platform_hint")}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {shortcut.icon && (
        <div className="size-7 rounded-md bg-surface-2 border border-line-1 flex items-center justify-center shrink-0">
          <shortcut.icon className="size-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm">{t(shortcut.labelKey)}</div>
        {shortcut.descKey && (
          <div className="text-[11px] text-muted-foreground">
            {t(shortcut.descKey)}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {shortcut.keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-[10px] text-muted-foreground/60">+</span>
            )}
            <Kbd>{k}</Kbd>
          </span>
        ))}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-mono rounded border border-line-2 bg-surface-2 text-foreground/80 font-medium">
      {children}
    </kbd>
  );
}
