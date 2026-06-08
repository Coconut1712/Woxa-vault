"use client";

/**
 * MigrateRekeyDialog — the destructive, client-driven vault key rotation flow
 * (Phase C Wave-3b). Rotates a vault's key + re-encrypts every item after a
 * member was revoked (`rekeyPending`). Vault manager+. Needs the CURRENT vault
 * key, so the vault must be unlocked first.
 *
 * It builds the payload entirely client-side (fetch member public keys, gen a
 * fresh vault key, wrap to every enrolled member, re-encrypt every item +
 * recompute blind-index terms) then POSTs it. Members WITHOUT an enrolled ZK
 * public key cannot be wrapped — we surface them as a hard warning the admin must
 * acknowledge, because they lose access after the rotation.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, RotateCw } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  listVaultMemberKeys,
  rekeyVault,
  type VaultMemberKey,
} from "@/lib/api/vaults";
import { buildRekeyPayload, type SkippedMember } from "@/lib/vault-rekey";
import { ApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultId: string;
  vaultName: string;
  /** Current vault keyVersion (echoed as expectedKeyVersion). */
  keyVersion: number;
  /** Current vault key — REQUIRED to decrypt items before re-encrypting. */
  oldVaultKey: Uint8Array | null;
  onDone: () => void | Promise<void>;
}

type Phase = "confirm" | "running";

export function MigrateRekeyDialog({
  open,
  onOpenChange,
  vaultId,
  vaultName,
  keyVersion,
  oldVaultKey,
  onDone,
}: Props) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("confirm");
  const [memberKeys, setMemberKeys] = useState<VaultMemberKey[] | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoadError(null);
    setMemberKeys(null);
    try {
      const keys = await listVaultMemberKeys(vaultId);
      setMemberKeys(keys);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err : new ApiError(0, "network_error", "Network error"),
      );
    }
  }, [vaultId]);

  useEffect(() => {
    if (open) {
      setPhase("confirm");
      setAcknowledged(false);
      void loadKeys();
    }
  }, [open, loadKeys]);

  const skipped: SkippedMember[] = (memberKeys ?? [])
    .filter((m) => !m.publicKey)
    .map((m) => ({ userId: m.userId, email: m.email }));
  const hasSkipped = skipped.length > 0;
  const enrolledCount = (memberKeys ?? []).filter((m) => m.publicKey).length;

  const run = async () => {
    if (!memberKeys || !oldVaultKey) return;
    setPhase("running");
    try {
      const { payload, itemCount } = await buildRekeyPayload(
        vaultId,
        keyVersion,
        memberKeys,
        oldVaultKey,
      );

      await rekeyVault(vaultId, payload);
      toast.success(t("rekey.toast_done"), {
        description: t("rekey.toast_done_desc", { name: vaultName, n: itemCount }),
      });
      await onDone();
      onOpenChange(false);
    } catch (err) {
      setPhase("confirm");
      let description = t("api.error.generic");
      if (err instanceof ApiError) {
        if (err.code === "rekey_conflict") {
          description = t("rekey.error_conflict");
          void loadKeys();
        } else if (err.code === "rekey_not_zk") {
          description = t("rekey.error_not_zk");
        } else if (err.code === "forbidden" || err.status === 403) {
          description = t("rekey.error_forbidden");
        } else {
          description = err.message;
        }
      }
      toast.error(t("rekey.error_title"), { description });
    }
  };

  // We need the current vault key (to decrypt items). If it's missing the vault
  // is locked — block with a clear hint instead of crashing.
  const lockedForRekey = !oldVaultKey;
  const canRun =
    phase === "confirm" &&
    memberKeys !== null &&
    !loadError &&
    !lockedForRekey &&
    (!hasSkipped || acknowledged);

  return (
    <Dialog open={open} onOpenChange={(o) => phase !== "running" && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCw className="size-4 text-amber-600 dark:text-amber-400" />
            {t("rekey.title")}
          </DialogTitle>
          <DialogDescription>
            {t("rekey.desc", { name: vaultName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Locked vault */}
          {lockedForRekey && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/15 dark:bg-amber-500/10 px-3 py-2.5 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <p className="text-xs">{t("rekey.locked_hint")}</p>
            </div>
          )}

          {/* Load state */}
          {!loadError && memberKeys === null && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
              <Loader2 className="size-3.5 animate-spin" />
              {t("rekey.loading_members")}
            </div>
          )}

          {loadError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2.5 text-rose-700 dark:text-rose-300">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <div className="text-xs">
                <p>{t("rekey.members_load_error")}</p>
                <button
                  type="button"
                  onClick={() => void loadKeys()}
                  className="underline mt-1"
                >
                  {t("common.retry")}
                </button>
              </div>
            </div>
          )}

          {/* Member summary */}
          {memberKeys !== null && !loadError && (
            <p className="text-xs text-muted-foreground">
              {t("rekey.member_summary", { n: enrolledCount })}
            </p>
          )}

          {/* Skipped-member warning — admin must acknowledge */}
          {hasSkipped && !lockedForRekey && (
            <div className="rounded-lg border border-rose-500/30 dark:border-rose-500/10 bg-rose-500/[0.06] dark:bg-rose-500/[0.02] px-3 py-2.5 text-rose-700 dark:text-rose-300">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <div className="text-xs space-y-1">
                  <p className="font-medium">
                    {t("rekey.skipped_warning", { n: skipped.length })}
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {skipped.map((m) => (
                      <li key={m.userId} className="break-all">
                        {m.email}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="accent-rose-600"
                />
                {t("rekey.skipped_ack")}
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={phase === "running"}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => void run()}
            disabled={!canRun}
            className="bg-amber-600 text-white hover:bg-amber-600/90"
          >
            {phase === "running" && <Loader2 className="size-3.5 animate-spin" />}
            {t("rekey.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
