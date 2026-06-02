"use client";

import { AtSign } from "lucide-react";
import { colorFor } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { VaultMember } from "@/lib/api/types";

interface Props {
  members: VaultMember[];
  onClick: () => void;
}

export function MemberAvatars({ members = [], onClick }: Props) {
  const tr = useT();
  const list = members || [];
  const visible = list.slice(0, 3);
  const overflow = list.length - visible.length;

  return (
    <button
      onClick={onClick}
      aria-label={tr("item.manage_access")}
      title={tr("vault.access_grants_aria", { n: list.length })}
      className="flex items-center -space-x-1.5 hover:opacity-90 transition-opacity"
    >
      {visible.map((m) => (
        <StackedAvatar key={m.userId} name={m.displayName || m.email} />
      ))}
      {overflow > 0 && (
        <span className="size-6 rounded-full bg-surface-2 ring-2 ring-background flex items-center justify-center text-[9px] text-muted-foreground font-semibold tabular-nums">
          +{overflow}
        </span>
      )}
    </button>
  );
}

function StackedAvatar({ name }: { name: string }) {
  const c = colorFor("violet");
  return (
    <span
      title={name}
      className={cn(
        "size-6 rounded-full ring-2 ring-background flex items-center justify-center",
        c.bg,
      )}
    >
      {looksLikeEmail(name) ? (
        <AtSign className={cn("size-3", c.text)} />
      ) : (
        <span className={cn("text-[9px] font-semibold leading-none", c.text)}>
          {name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
      )}
    </span>
  );
}

function looksLikeEmail(s: string): boolean {
  return s.includes("@") && !s.includes(" ");
}
