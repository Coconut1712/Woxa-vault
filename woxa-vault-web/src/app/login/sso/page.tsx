"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { startGoogleSso } from "@/lib/api/sso";
import { useT } from "@/lib/i18n/provider";

export default function SSOPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SSOPage />
    </Suspense>
  );
}

function SSOPage() {
  const t = useT();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [redirecting, setRedirecting] = useState(false);

  const handleContinue = () => {
    setRedirecting(true);
    startGoogleSso({ email: email || undefined, next: "/app" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-[480px] rounded-full bg-[#6366f1] opacity-[0.10] blur-[120px]" />
        <div className="absolute bottom-0 -right-32 size-[480px] rounded-full bg-[#a855f7] opacity-[0.06] blur-[120px]" />
      </div>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-card card-elevated relative">
        <div className="flex items-center gap-2 mb-6">
          <div className="size-8 rounded-lg bg-gradient-to-br from-[#7c66ff] to-[#c084fc] flex items-center justify-center shadow-brand">
            <ShieldCheck className="size-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">Woxa Vault</span>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="size-4" /> {t("login.use_different_email")}
        </Link>

        <h2 className="text-xl font-semibold mb-1">
          {t("welcome.continue_google")}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {email
            ? t("sso.signed_in_with_google_for", { email })
            : t("sso.signed_in_with_google")}
        </p>

        <Button
          onClick={handleContinue}
          disabled={redirecting}
          className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
        >
          {redirecting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("sso.redirecting")}
            </>
          ) : (
            <>
              <GoogleIcon />
              {t("sso.continue_google")}
            </>
          )}
        </Button>

        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-surface-3" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("welcome.or")}
          </span>
          <div className="flex-1 h-px bg-surface-3" />
        </div>

        <Button
          variant="outline"
          render={
            <Link
              href={
                email
                  ? `/login/password?email=${encodeURIComponent(email)}`
                  : "/login/password"
              }
            />
          }
          className="w-full h-11 bg-card/40 hover:bg-card border-line-2"
        >
          {t("login.use_password_instead")}
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-6">
          {t("login.login_password_hint")}
        </p>
      </div>
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
