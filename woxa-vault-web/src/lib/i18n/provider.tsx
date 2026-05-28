"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { tr, type Locale } from "./translations";
import { setFormatLocale } from "@/lib/format";

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nState | null>(null);

const STORAGE_KEY = "woxa-locale";
const COOKIE_KEY = "woxa-locale";

function writeCookie(value: Locale) {
  try {
    // 1 year, root path, no need for secure since this is non-sensitive UI prefs
    document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  } catch {
    // ignore
  }
}

export function I18nProvider({
  children,
  initialLocale = "en",
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  // Server renders with `initialLocale` (read from cookie in the root layout).
  // Client hydrates with the exact same value — no mismatch.
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Sync the format helpers' locale immediately on render so date strings
  // produced during this render pass use the correct language.
  setFormatLocale(locale);

  // After mount, reconcile with localStorage in case it diverged from the cookie
  // (e.g. user cleared cookies). Also writes the cookie so subsequent SSR matches.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if ((stored === "en" || stored === "th") && stored !== locale) {
        setLocaleState(stored);
        writeCookie(stored);
      } else {
        writeCookie(locale);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep <html lang> in sync
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
    writeCookie(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      tr(key, locale, vars),
    [locale],
  );

  const value = useMemo<I18nState>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be inside <I18nProvider>");
  return ctx;
}

/** Convenience hook returning just the `t` function */
export function useT() {
  return useI18n().t;
}
