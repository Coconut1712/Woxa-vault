"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Copy,
  Send as SendIcon,
  CheckCircle2,
  Flame,
  Lock,
  Mail,
  QrCode,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api/client";
import { getItem } from "@/lib/api/items";
import { getItemPassword } from "@/lib/items-overlay";
import { createSend } from "@/lib/api/sends";
import type { ItemFull } from "@/lib/api/types";
import { useT } from "@/lib/i18n/provider";
import { fullMeta } from "@/lib/item-meta";
import {
  encodeSendPayload,
  type SendField,
  type SendFieldKind,
} from "@/lib/send-payload";

export default function NewSendPageWrapper() {
  return (
    <Suspense fallback={null}>
      <NewSendPage />
    </Suspense>
  );
}

/* Field selection identifiers — for which item fields to include in send */
type FieldKey = "password" | "username" | "totp" | "url" | "notes";

/** Map the form's expiry select to minutes for the backend (1–10080). */
const EXPIRES_TO_MINUTES: Record<string, number> = {
  "1h": 60,
  "24h": 24 * 60,
  "7d": 7 * 24 * 60,
  "30d": 30 * 24 * 60,
};

function NewSendPage() {
  const t = useT();
  const params = useSearchParams();
  const itemId = params.get("item");

  // Load the item for the field-picker. GET /items/:id is VIEW-only and returns
  // password:null (view/reveal split), so we additionally reveal the password
  // via getItemPassword below — both count as accessing the item on the backend.
  const [source, setSource] = useState<ItemFull | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  // Revealed password value (view/reveal split). null = not yet revealed / no
  // reveal access / item has no password; the password field is then omitted.
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  // Which item fields the user has chosen to include in the send.
  const [selectedFields, setSelectedFields] = useState<Set<FieldKey>>(
    () => new Set<FieldKey>(),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!itemId) {
        setSource(null);
        setRevealedPassword(null);
        return;
      }
      setSourceLoading(true);
      setRevealedPassword(null);
      try {
        const item = await getItem(itemId);
        if (cancelled) return;
        setSource(item);
        // GET /items/:id returns password:null (view-only). Building a send from
        // an item genuinely accesses the secret, so reveal it via the dedicated
        // endpoint (logs item.reveal — correct). A viewer (403) or a locked
        // vault leaves it unrevealed: the password field is simply omitted from
        // the picker rather than blocking the rest of the send.
        if (item.hasPassword) {
          try {
            const pw = await getItemPassword(itemId);
            if (!cancelled && pw) {
              setRevealedPassword(pw);
              // Default-select the password if the user hasn't picked anything
              // yet. Done in this async callback (not a separate effect) to
              // avoid a synchronous setState-in-effect.
              setSelectedFields((prev) =>
                prev.size === 0 ? new Set<FieldKey>(["password"]) : prev,
              );
            }
          } catch {
            if (!cancelled) setRevealedPassword(null);
          }
        }
      } catch (err) {
        if (cancelled) return;
        const description =
          err instanceof ApiError ? err.message : t("api.error.generic");
        toast.error(t("api.error.reveal_failed"), { description });
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, t]);

  const availableFields = useMemo(() => {
    if (!source) return [];
    // Strip the encrypted-meta header that the item-meta overlay stashes at
    // the top of the notes ciphertext — recipients must never see it.
    const { meta, notes: cleanedNotes } = fullMeta(source);
    const totpSecret = meta.totpSecret;
    const fields: Array<{
      key: FieldKey;
      label: string;
      value: string;
      kind: SendFieldKind;
    }> = [];
    if (revealedPassword)
      fields.push({
        key: "password",
        label: t("send_new.field.password"),
        value: revealedPassword,
        kind: "password",
      });
    if (source.username)
      fields.push({
        key: "username",
        label: t("send_new.field.username"),
        value: source.username,
        kind: "username",
      });
    if (totpSecret)
      fields.push({
        key: "totp",
        label: t("send_new.field.totp"),
        value: totpSecret,
        kind: "totp",
      });
    if (source.url)
      fields.push({
        key: "url",
        label: t("send_new.field.url"),
        value: source.url,
        kind: "url",
      });
    if (cleanedNotes)
      fields.push({
        key: "notes",
        label: t("send_new.field.notes"),
        value: cleanedNotes,
        kind: "notes",
      });
    return fields;
  }, [source, revealedPassword, t]);

  const [email, setEmail] = useState("");
  const [expiresIn, setExpiresIn] = useState("24h");
  const [maxViews, setMaxViews] = useState("1");
  const [passphrase, setPassphrase] = useState("");
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Human-readable preview composed from the selected fields. Also doubles as
  // the "anything selected?" guard for the Generate button. Derived (not state)
  // so it always tracks the current selection without a setState-in-effect.
  const content = useMemo(() => {
    if (!source || availableFields.length === 0) return "";
    return availableFields
      .filter((f) => selectedFields.has(f.key))
      .map((f) => `${f.label}: ${f.value}`)
      .join("\n");
  }, [source, availableFields, selectedFields]);

  const toggleField = (k: FieldKey) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const generate = useCallback(async () => {
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const minutes = EXPIRES_TO_MINUTES[expiresIn] ?? 24 * 60;
      // Build the structured payload from the currently-selected fields so the
      // reveal page can render per-field rows. We always encode (even for raw
      // text-only sends from a future free-form mode) because the decoder on
      // the recipient side falls back to a plain `<pre>` when JSON parsing
      // fails — older sends keep working too.
      const payloadFields: SendField[] = availableFields
        .filter((f) => selectedFields.has(f.key))
        .map((f) => ({ label: f.label, value: f.value, kind: f.kind }));
      const encodedContent = encodeSendPayload({
        v: 1,
        itemTitle: source?.name,
        fields: payloadFields,
      });
      const result = await createSend({
        content: encodedContent,
        expiresInMinutes: minutes,
        maxViews: Number(maxViews) || 1,
        password: usePassphrase && passphrase ? passphrase : undefined,
      });
      setCreated(result.viewUrl);
    } catch (err) {
      let description: string;
      if (err instanceof ApiError) {
        description =
          err.code === "rate_limited"
            ? t("sends.error.rate_limited")
            : err.message;
      } else {
        description = t("api.error.generic");
      }
      toast.error(t("sends.error.create_failed"), { description });
    } finally {
      setSubmitting(false);
    }
  }, [
    availableFields,
    content,
    expiresIn,
    maxViews,
    passphrase,
    selectedFields,
    source,
    submitting,
    t,
    usePassphrase,
  ]);

  const expiresLabel: Record<string, string> = {
    "1h": t("send_new.exp.1h"),
    "24h": t("send_new.exp.24h"),
    "7d": t("send_new.exp.7d"),
    "30d": t("send_new.exp.30d"),
  };

  if (created) {
    return (
      <>
        <Topbar
          title={t("send_new.created_title")}
          subtitle={t("send_new.created_subtitle")}
        />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-8">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="size-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold">{t("send_new.link_ready")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("send_new.link_ready_desc")}
                  </p>
                </div>
              </div>

              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("send_new.secure_url")}
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 px-3 py-2 bg-muted rounded-md text-xs font-mono-secret break-all">
                  {created}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(created);
                    toast.success(t("send_new.link_copied"));
                  }}
                >
                  <Copy className="size-4" /> {t("common.copy")}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6 text-sm">
                <InfoRow
                  label={t("send_new.info.recipient")}
                  value={email || t("sends.anyone_with_link")}
                />
                <InfoRow
                  label={t("send_new.info.max_views")}
                  value={t("send_new.views_count", {
                    n: maxViews,
                    plural: Number(maxViews) > 1 ? "s" : "",
                  })}
                />
                <InfoRow
                  label={t("send_new.info.expires_in")}
                  value={expiresLabel[expiresIn] ?? expiresIn}
                />
                <InfoRow
                  label={t("send_new.info.passphrase")}
                  value={
                    usePassphrase
                      ? t("send_new.passphrase_required")
                      : t("send_new.passphrase_not_set")
                  }
                />
              </div>

              <Separator className="my-5" />

              <div className="space-y-2">
                <Note icon={Flame}>
                  {t("send_new.burn_after_n", {
                    n: maxViews,
                    plural: Number(maxViews) > 1 ? "s" : "",
                  })}
                </Note>
                <Note icon={Lock}>{t("send_new.key_after_hash")}</Note>
                {email && (
                  <Note icon={Mail}>
                    {t("send_new.recipient_must_verify", { email })}
                  </Note>
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <Button variant="outline" className="flex-1">
                  <QrCode className="size-4" /> {t("send_new.show_qr")}
                </Button>
                <Button className="flex-1" render={<Link href="/app/sends" />}>
                  <SendIcon className="size-4" /> {t("send_new.view_all")}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={t("send_new.title")}
        subtitle={t("send_new.subtitle")}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8">
          <Link
            href={source ? `/app/item/${source.id}` : "/app/sends"}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ChevronLeft className="size-4" /> {t("common.back")}
          </Link>

          <Card className="p-6 space-y-5">
            {source && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-md text-sm border border-blue-200">
                <Lock className="size-4" />
                <span>
                  {t("send_new.sending_from", { name: source.name })}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="expires">{t("send_new.expires_in")}</Label>
                <Select
                  value={expiresIn}
                  onValueChange={(v) => v && setExpiresIn(v)}
                >
                  <SelectTrigger id="expires">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">{t("send_new.exp.1h")}</SelectItem>
                    <SelectItem value="24h">{t("send_new.exp.24h")}</SelectItem>
                    <SelectItem value="7d">{t("send_new.exp.7d")}</SelectItem>
                    <SelectItem value="30d">{t("send_new.exp.30d")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="views">{t("send_new.max_views")}</Label>
                <Select
                  value={maxViews}
                  onValueChange={(v) => v && setMaxViews(v)}
                >
                  <SelectTrigger id="views">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t("send_new.mv.1")}</SelectItem>
                    <SelectItem value="3">{t("send_new.mv.3")}</SelectItem>
                    <SelectItem value="5">{t("send_new.mv.5")}</SelectItem>
                    <SelectItem value="10">{t("send_new.mv.10")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("send_new.recipient_email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder="vendor@partner.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("send_new.recipient_hint")}
              </p>
            </div>

            <Separator />

            <div className="flex items-start gap-3">
              <Switch
                checked={usePassphrase}
                onCheckedChange={setUsePassphrase}
                id="passphrase"
              />
              <div className="flex-1 -mt-0.5">
                <Label htmlFor="passphrase" className="font-medium">
                  {t("send_new.add_passphrase")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("send_new.passphrase_hint")}
                </p>
                {usePassphrase && (
                  <Input
                    type="text"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder={t("send_new.passphrase_placeholder")}
                    className="mt-2"
                  />
                )}
              </div>
            </div>

            {(sourceLoading || availableFields.length > 0) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>{t("send_new.fields_title")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("send_new.fields_hint")}
                  </p>
                  <div className="space-y-1.5 mt-2">
                    {sourceLoading ? (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        {t("api.loading")}
                      </div>
                    ) : (
                      availableFields.map((f) => {
                        const checked = selectedFields.has(f.key);
                        return (
                          <label
                            key={f.key}
                            className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                              checked
                                ? "border-brand/40 bg-brand/[0.06]"
                                : "border-line-1 hover:bg-surface-1"
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleField(f.key)}
                              aria-label={f.label}
                            />
                            <span className="text-sm flex-1">{f.label}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/[0.08] dark:bg-amber-500/[0.05] border border-amber-500/30 dark:border-amber-500/20">
              <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <span className="text-xs text-amber-800 dark:text-amber-200/90">
                {t("send_new.audit_warning")}
              </span>
            </div>

            <Separator />

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                render={<Link href="/app/sends" />}
                disabled={submitting}
              >
                {t("common.cancel")}
              </Button>
              <Button onClick={generate} disabled={!content || submitting}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <SendIcon className="size-4" />
                )}{" "}
                {t("send_new.generate")}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Note({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Icon className="size-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
