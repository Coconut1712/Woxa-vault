import { Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RecoveryKitBanner } from "@/components/auth/recovery-kit-banner";
import { VaultLockProvider } from "@/components/vault-lock/lock-provider";
import { VaultLockScreen } from "@/components/vault-lock/lock-screen";
import { SessionGuard } from "@/lib/auth/session-guard";
import { VaultsProvider } from "@/lib/vaults/provider";
import { FoldersProvider } from "@/lib/folders/provider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionGuard>
      <VaultsProvider>
        <FoldersProvider>
          <VaultLockProvider>
            <div className="flex h-screen w-full overflow-hidden">
              <Suspense
                fallback={
                  <div className="w-64 shrink-0 bg-sidebar border-r border-sidebar-border" />
                }
              >
                <Sidebar />
              </Suspense>
              <main className="flex-1 flex flex-col overflow-hidden min-w-0">
                <RecoveryKitBanner />
                {children}
              </main>
            </div>
            <VaultLockScreen />
          </VaultLockProvider>
        </FoldersProvider>
      </VaultsProvider>
    </SessionGuard>
  );
}
