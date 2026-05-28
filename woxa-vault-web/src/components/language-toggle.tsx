"use client";

import { Languages, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const label = locale === "th" ? "ไทย" : "EN";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("topbar.language")}
        title={t("topbar.language")}
        className="h-8 px-2 rounded-md hover:bg-accent flex items-center gap-1 text-foreground transition-colors text-xs font-medium"
      >
        <Languages className="size-4" />
        <span className="tabular-nums">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setLocale("en")}>
            <span className="text-base leading-none">🇬🇧</span>
            <span className="flex-1">English</span>
            {locale === "en" && <Check className="size-3.5 text-brand" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocale("th")}>
            <span className="text-base leading-none">🇹🇭</span>
            <span className="flex-1">ไทย</span>
            {locale === "th" && <Check className="size-3.5 text-brand" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
