"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { colorFor } from "@/components/icon";
import { useT } from "@/lib/i18n/provider";
import {
  discoverWorkspace,
  domainFromEmail,
  type DiscoveredWorkspace,
} from "@/lib/mock/sso";

/**
 * Email validation lives client-side only. The work email never leaves the
 * browser except as the `email` query param into /login/password (same-origin)
 * and into the mock discovery lookup. We cap length to avoid pathological input
 * and reject anything that isn't a plausible `local@domain.tld` address.
 */
const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  if (value.length < 3 || value.length > EMAIL_MAX) return false;
  return EMAIL_RE.test(value);
}

/** Debounce window for the (mock) domain → workspace lookup. */
const LOOKUP_DEBOUNCE_MS = 400;

export default function WelcomeOnboardingWrapper() {
  return (
    <Suspense fallback={null}>
      <WelcomeOnboarding />
    </Suspense>
  );
}

/**
 * Same-origin redirect target check — mirrors `sanitizeNext` in sso.ts.
 * Allowlist regex (not prefix-only) closes protocol-relative / encoded /
 * control-char bypasses. TODO(follow-up): extract a shared helper in
 * src/lib/ and migrate /login/password + sso lib consumers to kill drift.
 */
const NEXT_RE = /^\/(?!\/)[A-Za-z0-9_\-./~?&=#%@:+,]*$/;
function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (value.length > 256) return null;
  return NEXT_RE.test(value) ? value : null;
}

type LookupState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "found"; workspace: DiscoveredWorkspace }
  | { status: "none" };

function WelcomeOnboarding() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const nextHop = safeNext(params.get("next"));

  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });

  // Track the most recent lookup so a stale (slower) response can't overwrite a
  // newer one when the user keeps typing.
  const lookupSeq = useRef(0);

  const trimmed = email.trim();
  const validEmail = isValidEmail(trimmed);
  const showInvalid = touched && trimmed.length > 0 && !validEmail;

  // Debounced workspace discovery. Only fires for syntactically valid emails;
  // resets to idle otherwise so we never show a stale result card.
  useEffect(() => {
    if (!validEmail || !domainFromEmail(trimmed)) {
      lookupSeq.current += 1;
      setLookup({ status: "idle" });
      return;
    }

    const seq = ++lookupSeq.current;
    setLookup({ status: "searching" });

    const timer = window.setTimeout(() => {
      // TODO(api): swap discoverWorkspace() for GET /workspaces/discover —
      // must be rate-limited + constant-time (enumeration surface).
      void discoverWorkspace(trimmed).then((workspace) => {
        if (seq !== lookupSeq.current) return;
        setLookup(
          workspace
            ? { status: "found", workspace }
            : { status: "none" },
        );
      });
    }, LOOKUP_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [trimmed, validEmail]);

  const goToLogin = () => {
    if (!validEmail) {
      setTouched(true);
      return;
    }
    const search = new URLSearchParams({ email: trimmed });
    if (nextHop) search.set("next", nextHop);
    router.push(`/login/password?${search.toString()}`);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    goToLogin();
  };

  const createWorkspaceHref = nextHop
    ? `/setup?next=${encodeURIComponent(nextHop)}`
    : "/setup";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-[480px] rounded-full bg-[#6366f1] opacity-[0.10] blur-[120px]" />
        <div className="absolute bottom-0 -right-32 size-[480px] rounded-full bg-[#a855f7] opacity-[0.06] blur-[120px]" />
      </div>

      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-card card-elevated relative">
        <div className="flex items-center gap-2 mb-8">
          <div className="size-8 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
            <ShieldCheck className="size-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">Woxa Vault</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight mb-1.5">
          {t("onboarding.title")}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {t("onboarding.subtitle")}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="work-email">{t("onboarding.email_label")}</Label>
            <Input
              id="work-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              placeholder={t("onboarding.email_placeholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              autoFocus
              required
              aria-invalid={showInvalid ? true : undefined}
              className="h-11"
            />
            {showInvalid && (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300"
              >
                <AlertCircle className="size-3.5 shrink-0" />
                {t("onboarding.invalid_email")}
              </p>
            )}
          </div>

          {lookup.status === "searching" && (
            <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-surface-1 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin shrink-0" />
              {t("onboarding.searching")}
            </div>
          )}

          {lookup.status === "found" && (
            <WorkspaceCard workspace={lookup.workspace} />
          )}

          {lookup.status === "none" && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/[0.06] dark:bg-amber-500/[0.03] px-4 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300"
            >
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span>{t("onboarding.no_match")}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={!validEmail}
            className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
          >
            {t("onboarding.continue")} <ArrowRight className="size-4" />
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">
            {t("onboarding.or")}
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <Button
          variant="outline"
          className="w-full h-11"
          render={<Link href={createWorkspaceHref} />}
        >
          <Building2 className="size-4" /> {t("onboarding.create_workspace")}
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-8 leading-relaxed">
          {t("onboarding.no_google_prefix")}{" "}
          <Link
            href={
              validEmail
                ? `/login/password?email=${encodeURIComponent(trimmed)}`
                : "/login/password"
            }
            className="text-brand hover:underline"
          >
            {t("onboarding.use_password_link")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: DiscoveredWorkspace }) {
  const t = useT();
  const styles = colorFor(workspace.color);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line-2 bg-surface-1 px-4 py-3">
      <div
        aria-label={t("onboarding.aria_workspace_avatar")}
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold uppercase ring-1 ${styles.bg} ${styles.ring} ${styles.text}`}
      >
        {workspace.initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{workspace.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {t("onboarding.workspace_members", {
            domain: workspace.domain,
            count: workspace.memberCount,
          })}
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-500/[0.08] dark:bg-emerald-500/[0.04] px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
        {t("onboarding.workspace_active")}
      </span>
    </div>
  );
}
