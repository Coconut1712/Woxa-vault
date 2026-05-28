"use client";

import { Globe, AlertTriangle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/provider";

/**
 * Allowed email-domain list — READ-ONLY PREVIEW.
 *
 * The backend stores domain strings under `sso.allowedDomains`, but enforcement
 * (`ssoDomainAllowed`) is NOT a real verified allow-list yet: it depends on the
 * per-org verified domain binding (`org_domains` table / AC-006.2) which isn't
 * built, and the current check has a cross-tenant DoS. Until that lands we must
 * not present this as a live control that "enforces" anything — so this renders
 * the server's current list read-only with a "Preview" badge and issues NO
 * add/remove writes (no PATCH). When the verification workflow exists this can
 * become a real controlled add/remove list again.
 */
export function AllowedDomains({
  domains,
  loading,
  loadFailed,
}: {
  /** Normalized domains from the backend; `null` while still loading. */
  domains: string[] | null;
  loading: boolean;
  loadFailed: boolean;
}) {
  const t = useT();
  const list = domains ?? [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Globe className="size-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("domains.title")}</h3>
        <Badge
          variant="outline"
          className="text-[9px] h-4 px-1.5 border-line-2 bg-surface-1 text-muted-foreground"
        >
          {t("common.preview")}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {t("domains.preview_desc")}
      </p>

      {loadFailed && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 mb-3">
          <AlertTriangle className="size-3 shrink-0" />
          {t("domains.load_error")}
        </div>
      )}

      <div className="space-y-2 opacity-60">
        {loading && (
          <div className="rounded-xl border border-line-1 bg-surface-1 px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" /> {t("api.loading")}
          </div>
        )}

        {!loading && list.length === 0 && !loadFailed && (
          <div className="rounded-xl border border-dashed border-line-2 bg-surface-1 px-3 py-4 text-center text-xs text-muted-foreground">
            {t("domains.empty_preview")}
          </div>
        )}

        {list.map((domain) => (
          <DomainRow key={domain} domain={domain} />
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
   DOMAIN ROW — a single allowed-domain string (read-only)
   ===================================================================== */
function DomainRow({ domain }: { domain: string }) {
  return (
    <div className="rounded-xl border border-line-1 bg-surface-1">
      <div className="flex items-center gap-3 p-3">
        <div className="size-8 rounded-lg ring-1 bg-surface-2 ring-line-1 flex items-center justify-center shrink-0 text-muted-foreground">
          <Globe className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-mono-secret text-sm font-medium">{domain}</span>
        </div>
      </div>
    </div>
  );
}
