"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface SectionTab<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface Props<T extends string> {
  tabs: SectionTab<T>[];
  active: T;
  onChange: (id: T) => void;
}

/** Horizontal scrollable tab strip — used by settings/account pages */
export function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
}: Props<T>) {
  return (
    <div className="sticky top-0 glass-strong z-10">
      <div className="max-w-3xl mx-auto px-8 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative inline-flex items-center gap-2 h-11 px-3 text-sm transition-colors whitespace-nowrap",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="size-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <Badge
                  variant="outline"
                  className="text-[9px] h-4 px-1 ml-0.5 font-normal border-line-1 bg-surface-1 text-muted-foreground"
                >
                  {tab.badge}
                </Badge>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-brand" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
