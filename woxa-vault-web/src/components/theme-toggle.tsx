"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

interface Props {
  /** "icon" — compact icon button · "row" — full-width menu row */
  variant?: "icon" | "row";
}

export function ThemeToggle({ variant = "icon" }: Props) {
  const t = useT();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme ?? "system") : "light";
  const ActiveIcon =
    resolvedTheme === "dark" ? Moon : current === "system" ? Monitor : Sun;

  if (variant === "row") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent text-sm text-left transition-colors"
            />
          }
        >
          <ActiveIcon className="size-4 text-muted-foreground" />
          <span className="flex-1">{t("topbar.theme.toggle")}</span>
          <span className="text-[11px] text-muted-foreground capitalize">
            {t(`topbar.theme.${current}`)}
          </span>
        </DropdownMenuTrigger>
        <ThemeOptions current={current} onSelect={setTheme} />
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("topbar.theme.toggle")}
        className="size-8 rounded-md hover:bg-accent flex items-center justify-center text-foreground transition-colors"
      >
        <ActiveIcon className="size-4" />
      </DropdownMenuTrigger>
      <ThemeOptions current={current} onSelect={setTheme} />
    </DropdownMenu>
  );
}

function ThemeOptions({
  current,
  onSelect,
}: {
  current: string;
  onSelect: (t: string) => void;
}) {
  const t = useT();
  return (
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuGroup>
        <ThemeRow
          icon={Sun}
          label={t("topbar.theme.light")}
          value="light"
          active={current === "light"}
          onSelect={onSelect}
        />
        <ThemeRow
          icon={Moon}
          label={t("topbar.theme.dark")}
          value="dark"
          active={current === "dark"}
          onSelect={onSelect}
        />
        <ThemeRow
          icon={Monitor}
          label={t("topbar.theme.system")}
          value="system"
          active={current === "system"}
          onSelect={onSelect}
        />
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

function ThemeRow({
  icon: Icon,
  label,
  value,
  active,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  active: boolean;
  onSelect: (v: string) => void;
}) {
  return (
    <DropdownMenuItem onClick={() => onSelect(value)}>
      <Icon className="size-4" />
      <span className="flex-1">{label}</span>
      {active && <Check className={cn("size-3.5 text-brand")} />}
    </DropdownMenuItem>
  );
}
