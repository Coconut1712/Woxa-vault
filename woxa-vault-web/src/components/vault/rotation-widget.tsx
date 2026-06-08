"use client";

/**
 * RotationWidget — the dashboard "N secrets need rotation" feed (US-060 /
 * AC-060.2). Pulls GET /items/rotation-due (counts + the due/overdue items the
 * caller can reach), decrypts any v2 (ZK) item names client-side with the vault
 * key, and links each row to its item detail. Hidden entirely when nothing is
 * due (an empty card would be noise).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RotateCw, ChevronRight } from "lucide-react";

import { IconTile } from "@/components/icon";
import { RotationBadge } from "@/components/vault/rotation-badge";
import { itemTypeColor } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useVaultLock } from "@/components/vault-lock/lock-provider";
import { VAULT_UNLOCKED_EVENT } from "@/lib/api/client";
import { listRotationDue, type RotationDueItem } from "@/lib/api/items";
import { decryptZkName, ZK_LOCKED_PLACEHOLDER } from "@/lib/items-overlay";
import type { DisplayKind } from "@/lib/item-meta";

interface Row extends RotationDueItem {
  displayName: string;
}

export function RotationWidget() {
  const t = useT();
  const { getVaultKey } = useVaultLock();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState({ due: 0, overdue: 0, total: 0 });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await listRotationDue(signal);
        if (signal?.aborted) return;
        setCounts(res.counts);
        // Decrypt v2 (ZK) item names with each vault's key; v1 rows pass through.
        // A locked vault yields the 🔒 placeholder rather than a blank row.
        const keyCache = new Map<string, Uint8Array | null>();
        const decorated = await Promise.all(
          res.items.map(async (it) => {
            if (!it.nameCiphertext) {
              return { ...it, displayName: it.name };
            }
            let key = keyCache.get(it.vaultId);
            if (key === undefined) {
              key = await getVaultKey(it.vaultId);
              keyCache.set(it.vaultId, key);
            }
            const name = key
              ? (await decryptZkName(it.nameCiphertext, it.nameIv, key)) ??
                ZK_LOCKED_PLACEHOLDER
              : ZK_LOCKED_PLACEHOLDER;
            return { ...it, displayName: name };
          }),
        );
        if (signal?.aborted) return;
        setRows(decorated);
      } catch {
        // A failed load (e.g. no active org) just hides the widget — it's a
        // best-effort dashboard accent, never a blocking error.
        if (!signal?.aborted) {
          setRows([]);
          setCounts({ due: 0, overdue: 0, total: 0 });
        }
      }
    },
    [getVaultKey],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnlocked = () => void load();
    window.addEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
    return () => window.removeEventListener(VAULT_UNLOCKED_EVENT, onUnlocked);
  }, [load]);

  // Nothing due (or still loading) → render nothing, so the dashboard stays calm.
  if (rows === null || counts.total === 0) return null;

  return (
    <section>
      <div className="rounded-2xl border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/[0.06] dark:bg-amber-500/[0.04] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-amber-500/20 dark:border-amber-500/10">
          <div className="size-9 rounded-xl bg-amber-500/15 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <RotateCw className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {t("rotation.widget.summary", { n: counts.total })}
            </h3>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/70">
              {counts.overdue > 0 && t("rotation.widget.overdue", { n: counts.overdue })}
              {counts.overdue > 0 && counts.due > 0 && " · "}
              {counts.due > 0 && t("rotation.widget.due", { n: counts.due })}
            </p>
          </div>
        </div>
        <div className="divide-y divide-amber-500/10 dark:divide-amber-500/[0.06]">
          {rows.slice(0, 5).map((row) => (
            <Link
              key={row.id}
              href={`/app/item/${row.id}`}
              className="group flex items-center gap-3 px-5 py-3 hover:bg-amber-500/[0.05] dark:hover:bg-amber-500/[0.03] transition-colors"
            >
              <IconTile
                type={row.type as DisplayKind}
                color={itemTypeColor[row.type as DisplayKind]}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {row.displayName}
                  </span>
                  <RotationBadge status={row.rotationStatus} dueAt={row.rotationDueAt} />
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {row.vaultName}
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
