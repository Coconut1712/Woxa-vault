import { AtSign, Globe, User as UserIcon, Users as UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { colorFor } from "@/components/icon";
import type { ColorKey } from "@/lib/types";
import type { PrincipalType } from "@/lib/mock/access";

interface Props {
  type: PrincipalType;
  name: string;
  color?: ColorKey;
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: { tile: "size-6 rounded-md text-[9px]", icon: "size-3" },
  md: { tile: "size-8 rounded-lg text-[11px]", icon: "size-3.5" },
  lg: { tile: "size-10 rounded-xl text-sm", icon: "size-4" },
};

/** Renders the right kind of avatar for a principal:
 *  - user/external → initials in colored bg
 *  - team          → Users icon
 *  - domain        → AtSign icon
 */
export function PrincipalAvatar({
  type,
  name,
  color = "violet",
  size = "md",
}: Props) {
  const c = colorFor(color);
  const sz = sizeStyles[size];

  let content: React.ReactNode;
  switch (type) {
    case "team":
      content = <UsersIcon className={cn(sz.icon, c.text)} />;
      break;
    case "domain":
      content = <Globe className={cn(sz.icon, c.text)} />;
      break;
    case "external":
      content = <AtSign className={cn(sz.icon, c.text)} />;
      break;
    case "user":
    default:
      // Show initials for users
      if (name.includes("@")) {
        content = <UserIcon className={cn(sz.icon, c.text)} />;
      } else {
        content = (
          <span className={cn("font-semibold", c.text)}>
            {name
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
        );
      }
      break;
  }

  return (
    <div
      className={cn(
        "ring-1 flex items-center justify-center shrink-0",
        sz.tile,
        c.bg,
        c.ring,
      )}
    >
      {content}
    </div>
  );
}
