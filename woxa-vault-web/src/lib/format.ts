import { formatDistanceToNow, format } from "date-fns";
import { th as thLocale } from "date-fns/locale";

/**
 * Internal current-locale storage. Updated by I18nProvider via setFormatLocale()
 * so plain (non-React) call sites can stay locale-aware without prop-drilling.
 */
type LocaleKey = "en" | "th";
let currentLocale: LocaleKey = "en";
const localeMap = { en: undefined, th: thLocale } as const;

export function setFormatLocale(l: LocaleKey) {
  currentLocale = l;
}

export function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: localeMap[currentLocale],
    });
  } catch {
    return iso;
  }
}

export function formatDate(iso: string) {
  return format(new Date(iso), "MMM d, yyyy", {
    locale: localeMap[currentLocale],
  });
}

export function formatDateTime(iso: string) {
  return format(new Date(iso), "MMM d, yyyy HH:mm", {
    locale: localeMap[currentLocale],
  });
}

export const itemTypeLabel: Record<string, string> = {
  login: "Login",
  api_key: "API key",
  ssh: "SSH key",
  note: "Secure note",
  card: "Payment card",
  identity: "Identity",
};

export const itemTypeColor: Record<
  string,
  "violet" | "blue" | "emerald" | "amber" | "rose" | "fuchsia" | "cyan" | "indigo"
> = {
  login: "blue",
  api_key: "violet",
  ssh: "emerald",
  note: "amber",
  card: "rose",
  identity: "cyan",
};
