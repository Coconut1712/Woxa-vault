"use client";

/**
 * VaultLockScreen — fullscreen overlay shown while the vault is locked.
 *
 *  - We do NOT unmount the app shell underneath (per spec / DESIGN.md §15);
 *    the overlay just sits at z-[100] above sidebar+content. Sidebar links
 *    behind it are inert because the overlay covers the whole viewport.
 *  - Submit calls POST /me/verify-password. On 200 we mark the vault unlocked
 *    in-memory — no cookie / session changes happen, which is the whole
 *    point of the verify-only endpoint.
 *  - 401 → constant-time error "incorrect password" (no PII feedback,
 *    field cleared and refocused).
 *  - 429 → inline rate-limited banner + the submit button stays disabled
 *    until a 30s cooldown lapses. We pick a short cooldown because the
 *    backend bucket isn't exposed to the client — better to fail-soft than
 *    let users hammer it.
 *  - 409 password_not_set → edge case for SSO-JIT'd users; route to
 *    /setup-password (SessionGuard will redirect them too, this is a
 *    belt-and-braces).
 *
 * Focus / accessibility:
 *  - role=dialog + aria-modal=true.
 *  - Focus traps within the dialog: Tab cycles inside, ESC is suppressed so
 *    the user can't bypass the gate.
 *  - The password field autofocuses on mount.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, NetworkError } from "@/lib/api/client";
import { verifyPassword } from "@/lib/api/me";
import { getLoginInfo, getKdfSalt } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/provider";
import { useT } from "@/lib/i18n/provider";
import { useVaultLock, type LockReason, persistPrivateKey } from "./lock-provider";
import {
  deriveMasterKey,
  deriveAuthKeyHash,
  decryptPrivateKey,
  fromBase64
} from "@/lib/crypto-client";
import { resolveUnlockKeys } from "@/lib/vault-lock/resolve-unlock-keys";

/**
 * After a 429 we hold submit for this long to avoid spinning the backend
 * bucket. The actual server window may be longer — that's fine; the user
 * will simply hit another 429 and re-arm the cooldown.
 */
const RATE_LIMIT_COOLDOWN_MS = 30 * 1000;

const FORGOT_EMAIL_STORAGE_KEY = "woxa-forgot-email";

export function VaultLockScreen() {
  const t = useT();
  const router = useRouter();
  const { vaultLocked, lockReason, markUnlocked } = useVaultLock();
  const { me, logout } = useAuth();

  // No `mounted` paint-gate (WARN-A). The provider's initial state is read
  // synchronously from sessionStorage, and /app routes are dynamic — there
  // is no SSR overlay to disagree with. Deferring to the first effect would
  // open a one-frame window where the app shell paints unlocked content
  // before the overlay snaps in.

  const titleId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  // Reset the form whenever the overlay re-mounts due to a lock event so
  // stale password text and errors don't carry between sessions.
  useEffect(() => {
    if (vaultLocked) {
      setPassword("");
      setShow(false);
      setSubmitting(false);
      setErrorKey(null);
      setCooldownUntil(null);
    }
  }, [vaultLocked]);

  // Refocus the password input when the cooldown clears.
  useEffect(() => {
    if (!cooldownUntil) return;
    const id = window.setInterval(() => {
      if (Date.now() >= cooldownUntil) {
        setCooldownUntil(null);
        passwordRef.current?.focus();
      } else {
        forceTick((n) => n + 1);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  // Focus trap — keep Tab inside the dialog while it's mounted. ESC is
  // suppressed so users can't sneak past the gate by closing a "modal".
  useEffect(() => {
    if (!vaultLocked) return;
    const container = containerRef.current;
    if (!container) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vaultLocked]);

  const cooldownRemaining = useMemo(() => {
    if (!cooldownUntil) return 0;
    return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  }, [cooldownUntil]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      if (!password) return;
      if (cooldownUntil && Date.now() < cooldownUntil) return;
      setSubmitting(true);
      setErrorKey(null);
      // Snapshot the password locally so we can clear React state (WARN-E)
      // BEFORE awaiting the network call. The plaintext therefore lives in a
      // closure local for one tick instead of being parked in React's fiber
      // state — a memory-dump exfil tool sees a much smaller window.
      const submittedPassword = password;
      setPassword("");
      try {
        // Phase C: Fetch login info to see if we need ZK
        const email = me?.email;
        if (!email) throw new Error("No user email found");
        
        const info = await getLoginInfo(email);

        // ALWAYS derive the master key from the typed Master password + the
        // per-user KDF salt, independent of `requiresZk`. The verify-password
        // endpoint checks the typed password against `user.passwordHash` (the
        // Master password), and the private-key blob in `userKeys` is wrapped
        // with KDF(masterPassword, salt) — so whenever the server returns
        // `res.keys` we can decrypt + persist the private key, regardless of
        // which factor shape the verify payload used.
        //
        // `requiresZk` ONLY decides the verify payload shape:
        //   - true  → send a derived masterAuthKeyHash (zero-knowledge factor)
        //   - false → send the plaintext Master password
        // It does NOT gate private-key persistence (that was the bug: the
        // private key never landed in sessionStorage on the non-ZK branch, so
        // getVaultKey() returned null and v2 saves hit VaultLockedError even
        // though the overlay had cleared).
        const saltB64 = info.kdfSalt ?? (await getKdfSalt(email));
        const salt = fromBase64(saltB64);

        // Derive the master key at most ONCE per unlock. The ZK branch needs it
        // to build the masterAuthKeyHash factor; resolveUnlockKeys needs it to
        // unwrap the private key. deriveMasterKey is Argon2id (expensive), so we
        // derive it here and hand the result to resolveUnlockKeys to avoid a
        // second derivation (the non-ZK branch leaves it undefined and lets the
        // helper derive lazily, since it skips the ZK factor work).
        const masterKey = info.requiresZk
          ? await deriveMasterKey(submittedPassword, salt)
          : undefined;

        const verifyPayload: { password?: string; masterAuthKeyHash?: string; lockReason: LockReason } =
          info.requiresZk && masterKey
            ? {
                lockReason,
                masterAuthKeyHash: await deriveAuthKeyHash(masterKey, salt),
              }
            : { lockReason, password: submittedPassword };

        const res = await verifyPassword(verifyPayload);

        // Persist the private key whenever the server returns a keypair —
        // this is what later lets getVaultKey() unwrap v2 vault keys. Runs on
        // BOTH the ZK and non-ZK branches (the latter was the bug). A decrypt
        // failure here MUST NOT block the unlock: a v1-only user or a user
        // without a keypair must still unlock, and the save path already
        // guards missing keys with VaultLockedError.
        await resolveUnlockKeys(
          { masterPassword: submittedPassword, salt, keys: res.keys, masterKey },
          {
            deriveMasterKey,
            decryptPrivateKey,
            fromBase64,
            persistPrivateKey,
            onDecryptError: (keyErr) =>
              console.error("Failed to decrypt private key on unlock", keyErr),
          },
        );

        // Verify succeeded — the closure local is the last reference; it
        // goes out of scope when this callback returns.
        markUnlocked();
        toast.success(t("vault_lock.unlocked_toast"));
      } catch (err) {
        if (err instanceof NetworkError) {
          setErrorKey("vault_lock.error.generic");
        } else if (err instanceof ApiError) {
          if (err.code === "invalid_credentials" || err.status === 401) {
            setErrorKey("vault_lock.error.invalid");
            // Refocus the field for retry. Password is already cleared above.
            window.setTimeout(() => passwordRef.current?.focus(), 0);
          } else if (err.code === "rate_limited" || err.status === 429) {
            setErrorKey("vault_lock.error.rate_limited");
            setCooldownUntil(Date.now() + RATE_LIMIT_COOLDOWN_MS);
          } else if (
            err.code === "password_not_set" ||
            err.status === 409
          ) {
            setErrorKey("vault_lock.error.password_not_set");
            // Route them through the proper setup flow.
            window.setTimeout(() => router.replace("/setup-password"), 600);
          } else {
            setErrorKey("vault_lock.error.generic");
          }
        } else {
          setErrorKey("vault_lock.error.generic");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [cooldownUntil, lockReason, markUnlocked, password, router, submitting, t],
  );

  const handleForgot = useCallback(() => {
    if (me?.email) {
      try {
        sessionStorage.setItem(FORGOT_EMAIL_STORAGE_KEY, me.email);
      } catch {
        // ignore — forgot-password tolerates a missing pre-fill.
      }
    }
    router.push("/forgot-password");
  }, [me?.email, router]);

  const handleSignOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      router.replace("/");
    }
  }, [logout, router]);

  if (!vaultLocked) return null;

  const initials =
    me?.displayName
      ?.split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("") ?? "?";

  const subtitleKey: Record<LockReason, string> = {
    idle: "vault_lock.subtitle.idle",
    manual: "vault_lock.subtitle.manual",
    sleep: "vault_lock.subtitle.sleep",
    restart: "vault_lock.subtitle.restart",
  };

  const submitDisabled =
    !password ||
    submitting ||
    (cooldownUntil !== null && Date.now() < cooldownUntil);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Backdrop — solid + ambient orbs */}
      <div className="absolute inset-0 bg-background" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 size-[480px] rounded-full bg-[#6366f1] opacity-[0.12] blur-[120px]" />
        <div className="absolute bottom-0 -right-32 size-[480px] rounded-full bg-[#a855f7] opacity-[0.10] blur-[140px]" />
      </div>

      {/* Brand mark */}
      <div className="absolute top-6 left-6 flex items-center gap-2 z-10">
        <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-brand">
          <ShieldCheck className="size-4 text-white" strokeWidth={2.5} />
        </div>
        <span className="font-semibold tracking-tight text-sm">Woxa Vault</span>
      </div>

      {/* Centered card */}
      <div className="relative w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-card card-elevated text-center">
          {/* Big lock icon */}
          <div className="relative mx-auto mb-6 w-fit">
            <div className="size-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mx-auto shadow-brand">
              <Lock className="size-7 text-white" strokeWidth={2.5} />
            </div>
            <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-amber-400 ring-4 ring-card flex items-center justify-center">
              <span className="size-1.5 rounded-full bg-amber-900" />
            </div>
          </div>

          <h1
            id={titleId}
            className="text-xl font-semibold tracking-tight text-gradient mb-1"
          >
            {t("vault_lock.title")}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {t(subtitleKey[lockReason])}
          </p>

          {/* Account identity */}
          {me && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-1 border border-line-1 mb-5 mx-auto w-fit">
              <Avatar className="size-7">
                <AvatarFallback className="text-[10px] bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <div className="text-[11px] font-medium leading-tight">
                  {me.displayName}
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  {me.email}
                </div>
              </div>
            </div>
          )}

          {errorKey && (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-left text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span className="text-xs">
                {errorKey === "vault_lock.error.rate_limited" &&
                cooldownRemaining > 0
                  ? t("vault_lock.error.rate_limited_with_cooldown", {
                      seconds: cooldownRemaining,
                    })
                  : t(errorKey)}
              </span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-3 text-left">
            <div className="space-y-1.5">
              <Label
                htmlFor="vault-lock-password"
                className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
              >
                {t("vault_lock.password_label")}
              </Label>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  id="vault-lock-password"
                  type={show ? "text" : "password"}
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("vault_lock.password_placeholder")}
                  className="h-11 pr-10 font-mono-secret"
                  autoComplete="current-password"
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? t("common.hide") : t("common.show")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded"
                >
                  {show ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 shadow-brand"
              disabled={submitDisabled}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("vault_lock.submitting")}
                </>
              ) : cooldownUntil && cooldownRemaining > 0 ? (
                <>
                  <Sparkles className="size-4 animate-pulse-soft" />
                  {t("vault_lock.cooldown", { seconds: cooldownRemaining })}
                </>
              ) : (
                <>
                  {t("vault_lock.submit")} <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-5 flex items-center justify-center">
            <button
              type="button"
              onClick={handleForgot}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("vault_lock.forgot_password_link")}
            </button>
          </div>
        </div>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            <LogOut className="size-3" /> {t("vault_lock.signout_link")}
          </button>
        </div>
      </div>
    </div>
  );
}
