"use client";

/**
 * Password field with a configurable secure generator (US-012 / AC-012.3) and
 * an inline strength meter (AC-012.4).
 *
 * - Generation uses `window.crypto.getRandomValues` only — never Math.random.
 *   The length (8-128) and which charsets are drawn from are user-configurable
 *   via the options popover. At least one charset is always enabled.
 * - The meter reuses the shared `StrengthMeter` / `evaluatePassword` from the
 *   auth flow so item passwords are scored identically to Master Passwords.
 *
 * Shared by the create (new-item) and edit item dialogs.
 */

import { useMemo, useState } from "react";
import { Eye, EyeOff, Sparkles, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  StrengthMeter,
  evaluatePassword,
} from "@/components/auth/password-policy";
import { useT } from "@/lib/i18n/provider";

/** Charset groups the generator can draw from. Ambiguous glyphs are dropped. */
const GEN_CHARSETS = {
  uppercase: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lowercase: "abcdefghijkmnpqrstuvwxyz",
  numbers: "23456789",
  symbols: "!#$%&*+-=?@",
} as const;

type GenCharset = keyof typeof GEN_CHARSETS;

interface GenConfig {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

const DEFAULT_GEN_CONFIG: GenConfig = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};

/** Uniform random index in [0, max) via crypto, rejecting modulo bias. */
function secureIndex(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max;
  const arr = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(arr);
    n = arr[0];
  } while (n >= limit);
  return n % max;
}

/**
 * Generate a password from the active charsets using `window.crypto`.
 * Guarantees at least one character from every enabled set, then fills the
 * rest from the combined pool and securely shuffles.
 */
export function generatePassword(config: GenConfig): string {
  const active: GenCharset[] = (
    ["uppercase", "lowercase", "numbers", "symbols"] as GenCharset[]
  ).filter((k) => config[k]);
  if (active.length === 0) return "";

  const pool = active.map((k) => GEN_CHARSETS[k]).join("");
  const length = Math.max(config.length, active.length);
  const out: string[] = [];

  for (const k of active) {
    const set = GEN_CHARSETS[k];
    out.push(set[secureIndex(set.length)]);
  }
  for (let i = out.length; i < length; i++) {
    out.push(pool[secureIndex(pool.length)]);
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = secureIndex(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

export function PasswordInput({
  value,
  onChange,
  showStrength = true,
}: {
  value: string;
  onChange: (v: string) => void;
  showStrength?: boolean;
}) {
  const tr = useT();
  const [show, setShow] = useState(false);
  const [config, setConfig] = useState<GenConfig>(DEFAULT_GEN_CONFIG);

  const checks = useMemo(() => evaluatePassword(value), [value]);

  const enabledCount =
    (config.uppercase ? 1 : 0) +
    (config.lowercase ? 1 : 0) +
    (config.numbers ? 1 : 0) +
    (config.symbols ? 1 : 0);

  const toggle = (key: GenCharset) => {
    if (config[key] && enabledCount === 1) return; // keep at least one on
    setConfig((c) => ({ ...c, [key]: !c[key] }));
  };

  const generate = () => {
    const out = generatePassword(config);
    if (!out) return;
    onChange(out);
    setShow(true);
    toast.success(tr("toast.strong_pw"));
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={show ? "text" : "password"}
          placeholder="••••••••"
          className="pr-28 font-mono-secret text-sm"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <Popover>
            <PopoverTrigger
              aria-label={tr("gen.options")}
              title={tr("gen.options")}
              className="size-7 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center"
            >
              <SlidersHorizontal className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {tr("gen.length")}
                  </Label>
                  <span className="text-xs font-medium tabular-nums">
                    {config.length}
                  </span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={128}
                  value={config.length}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, length: Number(e.target.value) }))
                  }
                  aria-label={tr("gen.length")}
                  className="w-full accent-brand cursor-pointer"
                />
              </div>

              <div className="space-y-2 pt-1">
                <GenToggle
                  label={tr("gen.uppercase")}
                  checked={config.uppercase}
                  onCheckedChange={() => toggle("uppercase")}
                />
                <GenToggle
                  label={tr("gen.lowercase")}
                  checked={config.lowercase}
                  onCheckedChange={() => toggle("lowercase")}
                />
                <GenToggle
                  label={tr("gen.numbers")}
                  checked={config.numbers}
                  onCheckedChange={() => toggle("numbers")}
                />
                <GenToggle
                  label={tr("gen.symbols")}
                  checked={config.symbols}
                  onCheckedChange={() => toggle("symbols")}
                />
              </div>

              <Button
                type="button"
                onClick={generate}
                className="w-full h-8 bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Sparkles className="size-3.5" /> {tr("gen.generate")}
              </Button>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={generate}
            aria-label={tr("toast.strong_pw")}
            title={tr("toast.strong_pw")}
            className="size-7 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-brand flex items-center justify-center"
          >
            <Sparkles className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? tr("common.hide") : tr("common.show")}
            className="size-7 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center"
          >
            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      </div>
      {showStrength && value.length > 0 && <StrengthMeter checks={checks} />}
    </div>
  );
}

function GenToggle({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: () => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer">
      <span className="text-xs text-foreground/90">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
