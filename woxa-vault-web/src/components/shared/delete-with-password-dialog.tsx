"use client";

// Component นี้ wrap delete action ทุกชนิดด้วย master password gate
// ผู้ใช้ต้องพิมพ์ master password ถูกต้องก่อนถึงจะ confirm ลบได้
// ใช้ POST /me/verify-password ซึ่งมีอยู่แล้วใน src/lib/api/me.ts
//
// รองรับทั้ง zero-knowledge (ZK) และ non-ZK accounts โดย mirror logic จาก
// src/components/vault-lock/lock-screen.tsx: ถ้า requiresZk ให้ derive
// masterAuthKeyHash ด้วย server-issued salt, ไม่งั้นส่ง plaintext password.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AlertCircle, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, NetworkError } from "@/lib/api/client";
import { verifyPassword } from "@/lib/api/me";
import { getLoginInfo, getKdfSalt } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/provider";
import { useT } from "@/lib/i18n/provider";
import { deriveMasterKey, deriveAuthKeyHash, fromBase64 } from "@/lib/crypto-client";

/**
 * Short client-side cooldown after a 429 to avoid hammering the backend
 * bucket. The server window may be longer — that's fine, the user simply hits
 * another 429 and re-arms the cooldown.
 */
const RATE_LIMIT_COOLDOWN_SECONDS = 30;

interface DeleteWithPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title, e.g. t("vault.delete.title"). */
  title: string;
  /** Dialog body, e.g. t("vault.delete.desc", { name }). */
  description: string;
  /** Confirm button label. Defaults to t("common.delete"). */
  confirmLabel?: string;
  /** Parent's loading state — keeps the confirm button disabled mid-action. */
  busy?: boolean;
  /**
   * Called once the master password verifies AND the user confirms. Run the
   * actual delete here. If it throws, the dialog surfaces a toast and stays
   * open for retry.
   */
  onConfirmed: () => void | Promise<void>;
}

export function DeleteWithPasswordDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy,
  onConfirmed,
}: DeleteWithPasswordDialogProps) {
  const t = useT();
  const { me } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Reset all transient state whenever the dialog opens/closes so nothing
  // leaks between invocations (and the plaintext field never persists).
  useEffect(() => {
    if (open) {
      setPassword("");
      setShow(false);
      setVerifying(false);
      setErrorKey(null);
      setCooldown(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Tick the rate-limit cooldown down to zero, then refocus the field.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((n) => {
        if (n <= 1) {
          window.clearInterval(id);
          window.setTimeout(() => inputRef.current?.focus(), 0);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const busyAll = verifying || !!busy;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (busyAll) return;
      if (!password) return;
      if (cooldown > 0) return;

      setVerifying(true);
      setErrorKey(null);
      // Snapshot the plaintext locally and clear React state before awaiting,
      // so it lives in a closure local for one tick rather than fiber state.
      const submitted = password;
      setPassword("");

      try {
        const email = me?.email;
        if (!email) throw new Error("No user email found");

        const info = await getLoginInfo(email);
        const payload: { password?: string; masterAuthKeyHash?: string } = {};

        if (info.requiresZk) {
          const saltB64 = info.kdfSalt ?? (await getKdfSalt(email));
          const salt = fromBase64(saltB64);
          const masterKey = await deriveMasterKey(submitted, salt);
          payload.masterAuthKeyHash = await deriveAuthKeyHash(masterKey, salt);
        } else {
          payload.password = submitted;
        }

        await verifyPassword(payload);
      } catch (err) {
        // Verification failed — surface inline, keep dialog open.
        if (err instanceof NetworkError) {
          setErrorKey("api.error.generic");
        } else if (err instanceof ApiError) {
          if (err.code === "invalid_credentials" || err.status === 401) {
            setErrorKey("delete_confirm.wrong_password");
            window.setTimeout(() => inputRef.current?.focus(), 0);
          } else if (err.code === "rate_limited" || err.status === 429) {
            setErrorKey("delete_confirm.rate_limited");
            setCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
          } else if (err.code === "password_not_set" || err.status === 409) {
            toast.error(t("delete_confirm.no_password"));
            onOpenChange(false);
          } else {
            setErrorKey("api.error.generic");
          }
        } else {
          setErrorKey("api.error.generic");
        }
        setVerifying(false);
        return;
      }

      // Password verified — run the actual delete.
      try {
        await onConfirmed();
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : t("api.error.generic"),
        );
        setVerifying(false);
        window.setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      setVerifying(false);
    },
    [busyAll, cooldown, me?.email, onConfirmed, onOpenChange, password, t],
  );

  const confirmDisabled = !password || busyAll || cooldown > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="delete-confirm-password"
              className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"
            >
              {t("delete_confirm.password_label")}
            </Label>
            <div className="relative">
              <Input
                ref={inputRef}
                id="delete-confirm-password"
                type={show ? "text" : "password"}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("delete_confirm.password_placeholder")}
                className="h-10 pr-10 font-mono-secret"
                autoComplete="current-password"
                disabled={busyAll}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? t("common.hide") : t("common.show")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded"
                tabIndex={-1}
              >
                {show ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {errorKey ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2 text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span className="text-xs">
                {errorKey === "delete_confirm.rate_limited" && cooldown > 0
                  ? t("delete_confirm.rate_limited", { n: cooldown })
                  : t(errorKey)}
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {t("delete_confirm.hint")}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busyAll}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              disabled={confirmDisabled}
            >
              {verifying ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              {confirmLabel ?? t("common.delete")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
