"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  ShieldCheck,
  EyeOff,
  Building2,
  Zap,
  ScrollText,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { asSsoErrorCode, startGoogleSso } from "@/lib/api/sso";
import { useT } from "@/lib/i18n/provider";

export default function WelcomePageWrapper() {
  return (
    <Suspense fallback={null}>
      <WelcomePage />
    </Suspense>
  );
}

function WelcomePage() {
  const router = useRouter();
  const t = useT();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [dismissedError, setDismissedError] = useState(false);

  const ssoError = asSsoErrorCode(params.get("error"));
  const showError = ssoError && !dismissedError;

  // Carry through the `next` hop so post-login redirects honor the original
  // destination (e.g. `/invite/<token>`). Anything that isn't a same-origin
  // path is dropped server-side.
  const nextHop = params.get("next") ?? undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const search = new URLSearchParams({ email });
    if (nextHop) search.set("next", nextHop);
    router.push(`/login/password?${search.toString()}`);
  };

  const handleGoogle = () => {
    setRedirecting(true);
    startGoogleSso({ email: email || undefined, next: nextHop ?? "/app" });
  };

  return (
    <div className="min-h-screen flex w-full relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 size-[480px] rounded-full bg-[#6366f1] opacity-[0.12] blur-[120px]" />
        <div className="absolute top-1/2 -right-32 size-[600px] rounded-full bg-[#a855f7] opacity-[0.08] blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 size-[400px] rounded-full bg-[#0ea5e9] opacity-[0.06] blur-[120px]" />
      </div>

      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col w-1/2 p-12 relative z-10">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-base font-semibold tracking-tight">
            Woxa Vault
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-lg">
          <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-line-2 bg-surface-1 backdrop-blur-sm w-fit mb-6">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
            <span className="text-foreground/70">{t("welcome.pre_release")}</span>
          </div>

          <h1 className="text-5xl font-semibold leading-[1.05] mb-5 text-gradient">
            {t("welcome.headline_1")}
            <br />
            <span className="text-gradient-brand">
              {t("welcome.headline_2")}
            </span>
          </h1>
          <p className="text-foreground/60 leading-relaxed text-base mb-10 max-w-md">
            {t("welcome.subhead")}
          </p>

          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Feature
              icon={EyeOff}
              color="violet"
              title={t("welcome.feature.zk.title")}
              desc={t("welcome.feature.zk.desc")}
            />
            <Feature
              icon={Building2}
              color="blue"
              title={t("welcome.feature.sso.title")}
              desc={t("welcome.feature.sso.desc")}
            />
            <Feature
              icon={Zap}
              color="amber"
              title={t("welcome.feature.send.title")}
              desc={t("welcome.feature.send.desc")}
            />
            <Feature
              icon={ScrollText}
              color="emerald"
              title={t("welcome.feature.audit.title")}
              desc={t("welcome.feature.audit.desc")}
            />
          </div>
        </div>

        <div className="text-xs text-foreground/30 tracking-wide">
          © 2026 Woxa · Security as default, not afterthought
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col relative z-10 lg:border-l lg:border-line-1">
        <div className="lg:hidden flex items-center gap-2 p-6 border-b border-line-1">
          <Logo />
          <span className="text-base font-semibold tracking-tight">
            Woxa Vault
          </span>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold mb-2 tracking-tight">
                {t("welcome.welcome_back")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t("welcome.sub_back")}
              </p>
            </div>

            {showError ? (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
              >
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{t("sso.error.title")}</div>
                  <div className="text-xs opacity-90">
                    {t(`sso.error.${ssoError}`)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={t("sso.error.dismiss")}
                  className="ml-2 text-rose-700/70 hover:text-rose-700 dark:text-rose-300/70 dark:hover:text-rose-300"
                  onClick={() => setDismissedError(true)}
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : null}

            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-xs uppercase tracking-wider text-muted-foreground"
                >
                  {t("welcome.work_email")}
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@iux24.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                  className="h-11 bg-card/40 border-line-2"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
                disabled={!email}
              >
                {t("common.continue")} <ArrowRight className="size-4" />
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="flex-1 h-px bg-surface-3" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("welcome.or")}
              </span>
              <div className="flex-1 h-px bg-surface-3" />
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleGoogle}
              disabled={redirecting}
              className="w-full h-11 bg-card/40 hover:bg-card border-line-2"
            >
              {redirecting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("sso.redirecting")}
                </>
              ) : (
                <>
                  <GoogleIcon />
                  {t("welcome.continue_google")}
                </>
              )}
            </Button>

            <div className="mt-6 text-center">
              <Link
                href={
                  nextHop
                    ? `/signup?next=${encodeURIComponent(nextHop)}`
                    : "/signup"
                }
                className="text-xs text-brand hover:underline font-medium"
              >
                {t("signup.from_welcome_link")} →
              </Link>
            </div>

            <p className="text-[11px] text-muted-foreground text-center mt-6 leading-relaxed">
              {t("welcome.terms")}
            </p>

            <div className="mt-10 pt-6 border-t border-line-1 text-center">
              <span className="text-xs text-muted-foreground">
                {t("welcome.recipient_link")}{" "}
              </span>
              <Link
                href="/s/demo-token"
                className="text-xs text-brand hover:underline"
              >
                {t("welcome.open_recipient")} →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-[0_4px_16px_rgb(139_92_246/0.4)]">
      <ShieldCheck className="size-4 text-white" strokeWidth={2.5} />
    </div>
  );
}

function Feature({
  icon: Icon,
  color,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: "violet" | "blue" | "amber" | "emerald";
  title: string;
  desc: string;
}) {
  const colors = {
    violet: "bg-violet-500/10 ring-violet-500/20 text-violet-400",
    blue: "bg-blue-500/10 ring-blue-500/20 text-blue-400",
    amber: "bg-amber-500/10 ring-amber-500/20 text-amber-400",
    emerald: "bg-emerald-500/10 ring-emerald-500/20 text-emerald-400",
  };
  return (
    <div className="border border-line-1 bg-surface-1 rounded-xl p-3.5 backdrop-blur-sm">
      <div
        className={`size-8 rounded-lg ring-1 flex items-center justify-center mb-2.5 ${colors[color]}`}
      >
        <Icon className="size-4" />
      </div>
      <div className="text-sm font-medium mb-0.5">{title}</div>
      <div className="text-xs text-foreground/40">{desc}</div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.31v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.83Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
