import {
  Rocket,
  FlaskConical,
  Users,
  Lock,
  Megaphone,
  Cloud,
  Database,
  Plug,
  Settings,
  Globe,
  KeyRound,
  Code2,
  FileText,
  CreditCard,
  IdCard,
  Folder,
  type LucideIcon,
} from "lucide-react";

import type { ColorKey, ItemType } from "@/lib/types";
import { cn } from "@/lib/utils";

const iconMap: Record<string, LucideIcon> = {
  rocket: Rocket,
  flask: FlaskConical,
  users: Users,
  lock: Lock,
  megaphone: Megaphone,
  cloud: Cloud,
  database: Database,
  plug: Plug,
  settings: Settings,
  globe: Globe,
  folder: Folder,
};

export function VaultIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name] ?? Folder;
  return <Icon className={className} />;
}

const itemTypeIconMap: Record<ItemType, LucideIcon> = {
  login: KeyRound,
  api_key: Code2,
  ssh: Database,
  note: FileText,
  card: CreditCard,
  identity: IdCard,
};

export function ItemTypeIcon({
  type,
  className,
}: {
  type: ItemType;
  className?: string;
}) {
  const Icon = itemTypeIconMap[type];
  return <Icon className={className} />;
}

const colorStyles: Record<
  ColorKey,
  { bg: string; ring: string; text: string; glow: string }
> = {
  violet: {
    bg: "bg-violet-500/15 dark:bg-violet-500/10",
    ring: "ring-violet-500/30 dark:ring-violet-500/20",
    text: "text-violet-600 dark:text-violet-400",
    glow: "shadow-[0_0_24px_-8px_rgb(139_92_246/0.6)]",
  },
  blue: {
    bg: "bg-blue-500/15 dark:bg-blue-500/10",
    ring: "ring-blue-500/30 dark:ring-blue-500/20",
    text: "text-blue-600 dark:text-blue-400",
    glow: "shadow-[0_0_24px_-8px_rgb(59_130_246/0.6)]",
  },
  emerald: {
    bg: "bg-emerald-500/15 dark:bg-emerald-500/10",
    ring: "ring-emerald-500/30 dark:ring-emerald-500/20",
    text: "text-emerald-600 dark:text-emerald-400",
    glow: "shadow-[0_0_24px_-8px_rgb(16_185_129/0.6)]",
  },
  amber: {
    bg: "bg-amber-500/15 dark:bg-amber-500/10",
    ring: "ring-amber-500/30 dark:ring-amber-500/20",
    text: "text-amber-600 dark:text-amber-400",
    glow: "shadow-[0_0_24px_-8px_rgb(245_158_11/0.6)]",
  },
  rose: {
    bg: "bg-rose-500/15 dark:bg-rose-500/10",
    ring: "ring-rose-500/30 dark:ring-rose-500/20",
    text: "text-rose-600 dark:text-rose-400",
    glow: "shadow-[0_0_24px_-8px_rgb(244_63_94/0.6)]",
  },
  fuchsia: {
    bg: "bg-fuchsia-500/15 dark:bg-fuchsia-500/10",
    ring: "ring-fuchsia-500/30 dark:ring-fuchsia-500/20",
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    glow: "shadow-[0_0_24px_-8px_rgb(217_70_239/0.6)]",
  },
  cyan: {
    bg: "bg-cyan-500/15 dark:bg-cyan-500/10",
    ring: "ring-cyan-500/30 dark:ring-cyan-500/20",
    text: "text-cyan-600 dark:text-cyan-400",
    glow: "shadow-[0_0_24px_-8px_rgb(6_182_212/0.6)]",
  },
  indigo: {
    bg: "bg-indigo-500/15 dark:bg-indigo-500/10",
    ring: "ring-indigo-500/30 dark:ring-indigo-500/20",
    text: "text-indigo-600 dark:text-indigo-400",
    glow: "shadow-[0_0_24px_-8px_rgb(99_102_241/0.6)]",
  },
};

interface IconTileProps {
  name?: string;
  type?: ItemType;
  color?: ColorKey;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  withGlow?: boolean;
}

const sizes = {
  sm: { tile: "size-7 rounded-md", icon: "size-3.5" },
  md: { tile: "size-9 rounded-lg", icon: "size-4" },
  lg: { tile: "size-11 rounded-xl", icon: "size-5" },
  xl: { tile: "size-14 rounded-2xl", icon: "size-6" },
};

/** Colored icon tile — replaces emoji icons throughout the app */
export function IconTile({
  name,
  type,
  color = "violet",
  size = "md",
  className,
  withGlow = false,
}: IconTileProps) {
  const styles = colorStyles[color];
  const sz = sizes[size];

  return (
    <div
      className={cn(
        "flex items-center justify-center ring-1 shrink-0",
        sz.tile,
        styles.bg,
        styles.ring,
        withGlow && styles.glow,
        className,
      )}
    >
      {type ? (
        <ItemTypeIcon type={type} className={cn(sz.icon, styles.text)} />
      ) : (
        <VaultIcon name={name ?? "folder"} className={cn(sz.icon, styles.text)} />
      )}
    </div>
  );
}

export function colorFor(color: ColorKey) {
  return colorStyles[color];
}
