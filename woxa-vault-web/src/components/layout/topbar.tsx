"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { CommandPalette } from "./command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { NotificationsPanel } from "./notifications-panel";
import { KeyboardShortcutsTrigger } from "./keyboard-shortcuts";
import { useT } from "@/lib/i18n/provider";

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  const t = useT();
  const [openSearch, setOpenSearch] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpenSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="h-14 shrink-0 border-b border-border/60 glass-strong flex items-center px-6 gap-4 z-20 sticky top-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>

        <button
          onClick={() => setOpenSearch(true)}
          className="hidden md:flex items-center gap-2 px-3 h-8 rounded-lg border border-line-1 bg-surface-1 hover:bg-surface-2 hover:border-line-3 text-sm text-muted-foreground w-72 transition-colors"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left text-xs">
            {t("topbar.search_anything")}
          </span>
          <kbd className="text-[10px] bg-surface-2 border border-line-1 rounded px-1.5 py-0.5 font-mono">
            ⌘K
          </kbd>
        </button>

        <div className="flex items-center gap-1">
          {actions}
          <LanguageToggle />
          <ThemeToggle />
          <NotificationsPanel />
          <KeyboardShortcutsTrigger />
        </div>
      </header>

      <CommandPalette open={openSearch} onOpenChange={setOpenSearch} />
    </>
  );
}
