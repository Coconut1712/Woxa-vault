"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

interface CountdownTimerProps {
  expiresAt: string | Date | null;
  className?: string;
  showLabel?: boolean;
}

export function CountdownTimer({
  expiresAt,
  className,
  showLabel = true,
}: CountdownTimerProps) {
  const t = useT();
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft(null);
      setIsExpired(false);
      return;
    }

    const target = new Date(expiresAt).getTime();

    const update = () => {
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft(t("requests.countdown.expired"));
        setIsExpired(true);
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      const parts = [];
      if (d > 0) parts.push(`${d}${t("requests.modal.duration_days").charAt(0).toLowerCase()}`);
      if (h > 0 || d > 0) parts.push(`${h}${t("requests.modal.duration_hours").charAt(0).toLowerCase()}`);
      
      // Always show minutes and seconds if less than a day
      const minStr = m.toString().padStart(2, "0");
      const secStr = s.toString().padStart(2, "0");
      
      if (d === 0) {
        parts.push(`${minStr}:${secStr}`);
      } else {
        parts.push(`${m}${t("requests.modal.duration_minutes").charAt(0).toLowerCase()}`);
      }

      setTimeLeft(parts.join(" "));
      setIsExpired(false);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt, t]);

  if (!expiresAt) {
    if (!showLabel) return null;
    return (
      <div className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium", className)}>
        <Clock className="size-3.5" />
        {t("requests.countdown.permanent")}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums px-2 py-1 rounded-md border transition-colors",
        isExpired
          ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
          : "bg-amber-500/10 text-amber-600 border-amber-500/20",
        className
      )}
    >
      <Clock className={cn("size-3.5", !isExpired && "animate-pulse")} />
      {showLabel && <span className="opacity-70 font-medium">{t("requests.countdown.expires_in")}</span>}
      <span>{timeLeft}</span>
    </div>
  );
}
