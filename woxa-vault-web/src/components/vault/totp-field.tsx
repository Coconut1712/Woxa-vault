"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

function fakeTotp(seed: string, period: number): string {
  let hash = 0;
  const input = seed + Math.floor(Date.now() / 1000 / period);
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 1_000_000)
    .toString()
    .padStart(6, "0");
}

export function TotpField({ secret }: { secret: string }) {
  const t = useT();
  const period = 30;
  const [code, setCode] = useState(() => fakeTotp(secret, period));
  const [remaining, setRemaining] = useState(
    period - (Math.floor(Date.now() / 1000) % period),
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const i = setInterval(() => {
      const r = period - (Math.floor(Date.now() / 1000) % period);
      setRemaining(r);
      if (r === period) setCode(fakeTotp(secret, period));
    }, 250);
    return () => clearInterval(i);
  }, [secret]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(t("totp.copied"));
    setTimeout(() => setCopied(false), 1500);
  };

  const progress = (remaining / period) * 100;
  const urgent = remaining < 5;

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
        {t("totp.label")}
      </label>
      <div className="flex items-center gap-1">
        <div className="flex-1 px-3 py-2 bg-surface-1 border border-line-1 rounded-lg flex items-center gap-3">
          <span
            className={`font-mono-secret text-xl tabular-nums tracking-[0.2em] font-semibold ${urgent ? "text-rose-400" : "text-foreground"}`}
          >
            {code.slice(0, 3)} {code.slice(3)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={`text-[11px] tabular-nums ${urgent ? "text-rose-400" : "text-muted-foreground"}`}
            >
              {remaining}s
            </span>
            <div className="size-5 relative">
              <svg className="size-5 -rotate-90" viewBox="0 0 20 20">
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-line-2"
                />
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={`${(progress / 100) * 50.265} 50.265`}
                  className={urgent ? "text-rose-400" : "text-brand"}
                  style={{ transition: "stroke-dasharray 250ms linear" }}
                />
              </svg>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          aria-label={t("totp.aria.copy_code")}
        >
          {copied ? (
            <Check className="size-4 text-emerald-400" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
