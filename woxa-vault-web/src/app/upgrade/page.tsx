"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, Rocket, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/provider";
import { useT } from "@/lib/i18n/provider";
import { setupPassword } from "@/lib/api/me";
import { persistPrivateKey } from "@/components/vault-lock/lock-provider";
import { 
  deriveMasterKey, 
  deriveAuthKeyHash, 
  generateUserKeypair, 
  encryptPrivateKey,
  toBase64
} from "@/lib/crypto-client";

export default function UpgradePage() {
  const t = useT();
  const router = useRouter();
  const { me, refresh } = useAuth();

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If already migrated, go to app
  useEffect(() => {
    if (me?.isZeroKnowledge) {
      router.replace("/app");
    }
  }, [me, router]);

  const handleUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me || busy || !password) return;

    setBusy(true);
    try {
      // Phase C: Generate ZK Keys from existing password
      // The user enters their CURRENT master password to derive the keys.
      const masterKey = await deriveMasterKey(password, me.id);
      const masterAuthKeyHash = await deriveAuthKeyHash(masterKey, me.id);
      
      const { publicKey, privateKey } = generateUserKeypair();
      const encrypted = await encryptPrivateKey(privateKey, masterKey);

      await setupPassword({ 
        password, // Re-sending current password is fine as we are updating the hash to ZK format
        masterAuthKeyHash,
        publicKey: toBase64(publicKey),
        encryptedPrivateKey: toBase64(encrypted.ciphertext),
        privateKeyIv: toBase64(encrypted.iv),
        privateKeyAuthTag: toBase64(encrypted.authTag),
      });

      persistPrivateKey(privateKey);
      toast.success(t("upgrade.success_toast") || "Security upgrade complete!");
      
      await refresh();
      router.push("/app");
    } catch (err: any) {
      toast.error(err.message || "Upgrade failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full p-8 space-y-6 shadow-2xl border-border/50">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="size-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-2">
            <Rocket className="size-8 text-brand" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("upgrade.title") || "Security Upgrade Required"}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("upgrade.desc") || "We've improved our encryption to Zero-Knowledge. To continue, please enter your Master Password one last time to secure your keys locally."}
          </p>
        </div>

        <form onSubmit={handleUpgrade} className="space-y-4">
          <div className="space-y-1.5">
            <Input
              type="password"
              placeholder={t("item.password") || "Master Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="h-11"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 font-semibold"
            disabled={busy || !password}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <ShieldCheck className="size-4 mr-2" />
            )}
            {t("upgrade.button") || "Upgrade Security"}
          </Button>
        </form>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-2 border border-line-1">
          <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
          <p className="text-[10px] text-muted-foreground italic">
            {t("upgrade.hint") || "After this upgrade, Woxa administrators will never be able to see your passwords, even in their database."}
          </p>
        </div>
      </Card>
    </div>
  );
}
