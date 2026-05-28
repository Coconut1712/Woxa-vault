"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Flame,
  Lock,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  KeyRound,
  X,
  Loader2,
  User,
  Mail,
  Link as LinkIcon,
  FileText,
  Type as TypeIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api/client";
import {
  previewSend,
  revealSend,
  type SendPreview,
} from "@/lib/api/sends";
import { useT } from "@/lib/i18n/provider";
import {
  decodeSendPayload,
  type SendField,
  type SendFieldKind,
  type SendPayload,
} from "@/lib/send-payload";

type Stage = "loading" | "preview" | "passphrase" | "revealed" | "expired" | "notfound";

/** Minutes until the given ISO timestamp (rounded, never negative). */
function minutesUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.round(ms / 60000));
}

export default function RecipientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const t = useT();

  const [stage, setStage] = useState<Stage>("loading");
  const [preview, setPreview] = useState<SendPreview | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealedContent, setRevealedContent] = useState<string | null>(null);
  const [remainingViews, setRemainingViews] = useState(0);
  const [autoCleanIn, setAutoCleanIn] = useState(120);
  const [copiedAll, setCopiedAll] = useState(false);

  // Strip URL fragment from history (AC-031.5) — runs once on mount.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  // Initial preview fetch — surfaces metadata before the user clicks reveal.
  useEffect(() => {
    let cancelled = false;
    setStage("loading");
    previewSend(token)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        if (p.burned) {
          setStage("expired");
          return;
        }
        setStage("preview");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setStage("notfound");
            return;
          }
          if (err.status === 410) {
            setStage("expired");
            return;
          }
        }
        // Unknown error — treat as not-found so the user is never stuck on a spinner.
        setStage("notfound");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Auto-clean countdown after reveal
  useEffect(() => {
    if (stage !== "revealed") return;
    const interval = setInterval(() => {
      setAutoCleanIn((s) => {
        if (s <= 1) {
          setStage("expired");
          setRevealedContent(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  /**
   * Perform a reveal call, transparently retrying once on 425 `send_not_ready`
   * (burn-guard window, ~1s after creation). Otherwise translate the standard
   * error codes into stage transitions or inline messages.
   */
  const performReveal = useCallback(
    async (password?: string): Promise<void> => {
      setRevealing(true);
      setPassphraseError(null);
      try {
        let result;
        try {
          result = await revealSend(token, password ? { password } : {});
        } catch (err) {
          if (err instanceof ApiError && err.status === 425) {
            // Burn-guard: wait then retry once
            await new Promise((r) => setTimeout(r, 2000));
            result = await revealSend(token, password ? { password } : {});
          } else {
            throw err;
          }
        }
        setRevealedContent(result.content);
        setRemainingViews(result.viewsRemaining);
        setStage("revealed");
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === "send_password_required") {
            setStage("passphrase");
            return;
          }
          if (err.code === "send_password_invalid") {
            setStage("passphrase");
            setPassphraseError(t("recip.error.password_invalid"));
            return;
          }
          if (err.status === 410) {
            setStage("expired");
            return;
          }
          if (err.status === 404) {
            setStage("notfound");
            return;
          }
          if (err.code === "rate_limited") {
            toast.error(t("recip.error.rate_limited"));
            return;
          }
        }
        toast.error(t("recip.error.generic"));
      } finally {
        setRevealing(false);
      }
    },
    [token, t],
  );

  const reveal = () => {
    if (preview?.hasPassword) {
      setStage("passphrase");
      return;
    }
    void performReveal();
  };

  const submitPassphrase = (e: React.FormEvent) => {
    e.preventDefault();
    void performReveal(passphrase);
  };

  const senderInitial = "?"; // backend does not expose sender identity to recipient
  const expiresMinutes = useMemo(
    () => (preview ? minutesUntil(preview.expiresAt) : 0),
    [preview],
  );

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-[480px] rounded-full bg-[#6366f1] opacity-[0.08] blur-[120px]" />
        <div className="absolute bottom-0 -right-32 size-[480px] rounded-full bg-[#f43f5e] opacity-[0.05] blur-[120px]" />
      </div>

      <main className="flex-1 flex items-start justify-center p-6 relative z-10">
        <div className="w-full max-w-xl mt-10">
          {/* Brand mark */}
          <div className="flex items-center gap-2 mb-8">
            <div className="size-7 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
              <ShieldCheck className="size-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Woxa Vault
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-semibold tracking-tight mb-1">
            {t("recip.title_someone")}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {t("recip.via_brand")}
          </p>

          {/* Card */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-card card-elevated space-y-5">
            {stage === "loading" && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-3">
                <Loader2 className="size-4 animate-spin" />
                <span>{t("recip.preparing")}</span>
              </div>
            )}

            {stage === "notfound" && (
              <div className="text-center py-6">
                <div className="size-12 rounded-full bg-rose-500/[0.06] dark:bg-rose-500/[0.02] border border-rose-500/30 dark:border-rose-500/10 text-rose-700 dark:text-rose-300 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="size-6" />
                </div>
                <h3 className="font-semibold mb-1">
                  {t("recip.error.not_found_title")}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("recip.error.not_found_desc")}
                </p>
                <Button variant="outline" render={<a href="/" />}>
                  {t("recip.go_to_vault")}
                </Button>
              </div>
            )}

            {stage === "preview" && preview && (
              <>
                {/* Sender bar */}
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-surface-1 border border-line-1">
                  <div className="size-6 rounded-full bg-blue-500/15 dark:bg-blue-500/10 ring-1 ring-blue-500/30 dark:ring-blue-500/20 flex items-center justify-center text-[10px] font-semibold text-blue-700 dark:text-blue-400">
                    {senderInitial}
                  </div>
                  <span className="text-sm">
                    {t("recip.sender_action")}
                  </span>
                </div>

                {/* Warning */}
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/[0.10] dark:bg-amber-500/[0.05] border border-amber-500/40 dark:border-amber-500/25">
                  <AlertTriangle className="size-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200/90">
                    {t("recip.one_shot_warning")}
                  </p>
                </div>

                {/* Info grid */}
                <div className="space-y-3">
                  <InfoRow
                    icon={Clock}
                    label={t("recip.info.expires_in")}
                    value={
                      <Badge
                        variant="outline"
                        className="font-medium text-[11px] gap-1.5 border-amber-500/30 bg-amber-500/15 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      >
                        <span className="size-1.5 rounded-full bg-amber-500" />
                        {t("recip.expires_minutes", { n: expiresMinutes })}
                      </Badge>
                    }
                  />
                  <InfoRow
                    icon={Flame}
                    label={t("recip.info.opens")}
                    value={
                      <span className="text-sm">
                        {t("recip.opens_burn_after_read")}
                      </span>
                    }
                  />
                  <InfoRow
                    icon={KeyRound}
                    label={t("recip.info.passphrase")}
                    value={
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        {preview.hasPassword ? (
                          <Check className="size-3.5 text-emerald-500" />
                        ) : (
                          <X className="size-3.5 text-rose-500" />
                        )}
                        {preview.hasPassword
                          ? t("send_new.passphrase_required")
                          : t("recip.passphrase_not_required")}
                      </span>
                    }
                  />
                  <InfoRow
                    icon={Lock}
                    label={t("recip.info.encryption")}
                    value={
                      <Badge
                        variant="outline"
                        className="font-medium text-[11px] gap-1.5 border-emerald-500/30 bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                      >
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        {t("recip.encryption_value")}
                      </Badge>
                    }
                  />
                </div>

                {/* Action */}
                <Button
                  onClick={reveal}
                  disabled={revealing}
                  className="w-full h-11 bg-blue-600 text-white hover:bg-blue-600/90 dark:bg-brand dark:hover:bg-brand/90 dark:text-brand-foreground dark:shadow-brand"
                >
                  {revealing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Lock className="size-4" />
                  )}{" "}
                  {t("recip.reveal_secret")}
                </Button>
              </>
            )}

            {stage === "passphrase" && (
              <form onSubmit={submitPassphrase} className="space-y-4">
                <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 dark:border-amber-500/20 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <span>{t("recip.passphrase_warning")}</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pw">{t("recip.passphrase")}</Label>
                  <Input
                    id="pw"
                    type="text"
                    autoFocus
                    placeholder={t("recip.passphrase_placeholder")}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                  />
                  {passphraseError && (
                    <p className="text-xs text-rose-700 dark:text-rose-300">
                      {passphraseError}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
                  disabled={passphrase.length < 1 || revealing}
                >
                  {revealing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}{" "}
                  {t("recip.unlock")}
                </Button>
              </form>
            )}

            {stage === "revealed" && revealedContent !== null && (
              <RevealedStage
                content={revealedContent}
                remainingViews={remainingViews}
                autoCleanIn={autoCleanIn}
                copiedAll={copiedAll}
                onCopiedAllChange={setCopiedAll}
              />
            )}

            {stage === "expired" && (
              <div className="text-center py-6">
                <div className="size-12 rounded-full bg-orange-500/15 dark:bg-orange-500/10 border border-orange-500/30 dark:border-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto mb-3">
                  <Flame className="size-6" />
                </div>
                <h3 className="font-semibold mb-1">
                  {t("recip.burned_title")}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("recip.burned_desc")}
                </p>
                <Button variant="outline" render={<a href="/" />}>
                  {t("recip.go_to_vault")}
                </Button>
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="text-xs text-muted-foreground text-center mt-5 leading-relaxed inline-flex items-center justify-center gap-1.5 w-full">
            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{t("recip.footer_security")}</span>
          </p>
        </div>
      </main>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-40 shrink-0">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex-1 min-w-0">{value}</div>
    </div>
  );
}

/**
 * Reveal stage — decodes the structured payload encoded by the new-send page
 * and renders per-field rows. Falls back to a single `<pre>` block when the
 * content is plain text (older sends, direct API usage).
 */
function RevealedStage({
  content,
  remainingViews,
  autoCleanIn,
  copiedAll,
  onCopiedAllChange,
}: {
  content: string;
  remainingViews: number;
  autoCleanIn: number;
  copiedAll: boolean;
  onCopiedAllChange: (v: boolean) => void;
}) {
  const t = useT();
  const payload = useMemo<SendPayload | null>(
    () => decodeSendPayload(content),
    [content],
  );

  const copyAllText = useMemo(() => {
    if (!payload) return content;
    return payload.fields
      .map((f) => `${f.label}: ${f.value}`)
      .join("\n");
  }, [payload, content]);

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(copyAllText);
      onCopiedAllChange(true);
      toast.success(t("recip.copied"));
      setTimeout(() => onCopiedAllChange(false), 1500);
    } catch {
      // ignore — browser blocked clipboard access
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("recip.secret_content")}
        </Label>
        <span className="text-[10px] text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
          <Flame className="size-3" />{" "}
          {t("recip.burned_views_left", { n: remainingViews })}
        </span>
      </div>

      <div className="space-y-2">
        {payload ? (
          payload.fields.length === 0 ? (
            <div className="rounded-lg border border-line-1 bg-surface-1 p-4 text-sm text-muted-foreground text-center">
              {t("recip.empty_payload")}
            </div>
          ) : (
            payload.fields.map((field, idx) => (
              <FieldRow
                key={`${field.label}-${idx}`}
                field={field}
                itemTitle={payload.itemTitle}
              />
            ))
          )
        ) : (
          <PlainContent content={content} />
        )}
      </div>

      <Button
        className="w-full bg-blue-600 text-white hover:bg-blue-600/90 dark:bg-brand dark:hover:bg-brand/90 dark:text-brand-foreground"
        onClick={handleCopyAll}
      >
        {copiedAll ? <Check className="size-4" /> : <Copy className="size-4" />}
        {t("recip.copy_all")}
      </Button>

      <div className="px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 dark:border-amber-500/20 rounded-lg text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
        <Clock className="size-3.5 mt-0.5 shrink-0" />
        <div>{t("recip.auto_clear_caption", { n: autoCleanIn })}</div>
      </div>
    </>
  );
}

/** Map a structured field kind to its lucide icon. */
function iconForKind(kind: SendFieldKind) {
  switch (kind) {
    case "password":
      return Lock;
    case "username":
      return User;
    case "email":
      return Mail;
    case "url":
      return LinkIcon;
    case "notes":
      return FileText;
    case "totp":
      return KeyRound;
    case "text":
    default:
      return TypeIcon;
  }
}

/**
 * One structured field row: icon + label (with optional "from {item}" suffix),
 * mono-formatted value, masked-toggle for password/totp, and per-field copy.
 */
function FieldRow({
  field,
  itemTitle,
}: {
  field: SendField;
  itemTitle?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const isSecret = field.kind === "password" || field.kind === "totp";
  const [revealed, setRevealed] = useState(!isSecret);
  const Icon = iconForKind(field.kind);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      setCopied(true);
      toast.success(t("recip.field_copied", { label: field.label }));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const displayValue = isSecret && !revealed ? "•".repeat(12) : field.value;
  // Notes (and any multi-line value) need wrapping; single-line secrets can
  // break-all so they don't overflow the card on narrow screens.
  const isMultiline = field.kind === "notes" || field.value.includes("\n");

  return (
    <div className="rounded-lg border border-line-1 bg-surface-1 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
          <Icon className="size-3.5 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider font-semibold truncate">
            {field.label}
            {itemTitle ? (
              <span className="text-muted-foreground/70 normal-case tracking-normal font-normal">
                {" "}
                {t("recip.field_from", { item: itemTitle })}
              </span>
            ) : null}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isSecret ? (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={
                revealed
                  ? t("recip.hide_value", { label: field.label })
                  : t("recip.show_value", { label: field.label })
              }
              className="size-6 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
            >
              {revealed ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={copy}
            aria-label={t("recip.copy_field", { label: field.label })}
            className="size-6 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      </div>
      <pre
        className={`text-sm leading-relaxed font-mono-secret ${
          isMultiline ? "whitespace-pre-wrap break-words" : "break-all"
        }`}
      >
        {displayValue}
      </pre>
    </div>
  );
}

/**
 * Backward-compatible plain rendering for sends that aren't structured (older
 * payloads, direct API usage, malformed JSON).
 */
function PlainContent({ content }: { content: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const label = t("recip.secret_content");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success(t("recip.field_copied", { label }));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-lg border border-line-1 bg-surface-1 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={t("recip.copy_field", { label })}
          className="size-6 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0 transition-colors"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      <pre className="text-sm break-all whitespace-pre-wrap leading-relaxed font-mono-secret">
        {content}
      </pre>
    </div>
  );
}
