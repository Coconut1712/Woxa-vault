import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/lib/i18n/provider";
import { AuthProvider } from "@/lib/auth/provider";
import type { Locale } from "@/lib/i18n/translations";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Woxa Secret Vault",
  description: "Secure secret sharing for teams · Zero-knowledge by design",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const stored = cookieStore.get("woxa-locale")?.value;
  const initialLocale: Locale = stored === "th" ? "th" : "en";

  // Per-request CSP nonce minted in proxy.ts. Passed to next-themes so its
  // inline no-flash theme script carries the nonce and passes a strict
  // (enforced) script-src. Undefined in the rare static-render path.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang={initialLocale}
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <I18nProvider initialLocale={initialLocale}>
            <AuthProvider>
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster position="bottom-right" />
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
