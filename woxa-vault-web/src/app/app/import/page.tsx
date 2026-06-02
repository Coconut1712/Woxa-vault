"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  FileUp, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  ChevronLeft, 
  Database,
  Search,
  Check
} from "lucide-react";
import { toast } from "sonner";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useT } from "@/lib/i18n/provider";
import { useVaults } from "@/lib/vaults/provider";
import { useFolders } from "@/lib/folders/provider";
import { startImport, getImportJob, getImportItems, confirmImport } from "@/lib/api/import";
import type { ImportJob, ImportItem } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type Step = "source" | "upload" | "review" | "config" | "executing";

const SOURCES = [
  { id: "1password", label: "import.source.1password", icon: "1P" },
  { id: "bitwarden", label: "import.source.bitwarden", icon: "BW" },
  { id: "lastpass", label: "import.source.lastpass", icon: "LP" },
  { id: "generic_csv", label: "import.source.generic_csv", icon: "CSV" },
];

export default function ImportPage() {
  const t = useT();
  const router = useRouter();
  const { vaults } = useVaults();
  const { byVault: foldersByVault } = useFolders();

  const [step, setStep] = useState<Step>("source");
  const [source, setSource] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [previewItems, setPreviewItems] = useState<ImportItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [config, setConfig] = useState({
    targetVaultId: "",
    targetFolderId: null as string | null,
    conflictPolicy: "skip" as "skip" | "overwrite" | "append",
  });

  // Set default vault
  useEffect(() => {
    if (vaults.length > 0 && !config.targetVaultId) {
      setConfig(prev => ({ ...prev, targetVaultId: vaults[0].id }));
    }
  }, [vaults, config.targetVaultId]);

  const handleSourceSelect = (id: string) => {
    setSource(id);
    setStep("upload");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    
    setLoading(true);
    try {
      const { job } = await startImport(source, selectedFile);
      setJob(job);
      const { items } = await getImportItems(job.id);
      setPreviewItems(items);
      setStep("review");
    } catch (err: any) {
      toast.error(t("import.upload.error") + ": " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!job) return;
    setLoading(true);
    try {
      await confirmImport(job.id, config);
      setStep("executing");
      pollStatus(job.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const { job } = await getImportJob(id);
        setJob(job);
        if (job.status === "completed" || job.status === "failed") {
          clearInterval(interval);
        }
      } catch (err) {
        clearInterval(interval);
      }
    }, 2000);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <Topbar title={t("import.title")} />
      
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("import.title")}</h1>
            <p className="text-muted-foreground">{t("import.subtitle")}</p>
          </div>

          {/* Wizard Progress */}
          <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground overflow-x-auto pb-2">
            <WizardStep label={t("import.source.select")} active={step === "source"} completed={!!source} />
            <ChevronRight className="size-4 shrink-0" />
            <WizardStep label={t("import.upload.title")} active={step === "upload"} completed={!!file} />
            <ChevronRight className="size-4 shrink-0" />
            <WizardStep label={t("import.review.title")} active={step === "review"} completed={previewItems.length > 0} />
            <ChevronRight className="size-4 shrink-0" />
            <WizardStep label={t("import.config.title")} active={step === "config"} completed={step === "executing"} />
          </div>

          <Card className="p-0 overflow-hidden border-border/50 shadow-lg">
            {step === "source" && (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SOURCES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSourceSelect(s.id)}
                    className="flex items-center gap-4 p-4 rounded-xl border-2 border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="size-12 rounded-lg bg-muted flex items-center justify-center font-bold text-lg group-hover:bg-primary/10 group-hover:text-primary">
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{t(s.label)}</div>
                      <div className="text-sm text-muted-foreground truncate">{s.id}.export</div>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground group-hover:text-primary" />
                  </button>
                ))}
              </div>
            )}

            {step === "upload" && (
              <div className="p-12 flex flex-col items-center justify-center space-y-4">
                <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileUp className="size-8 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-semibold">{t("import.upload.title")}</h3>
                  <p className="text-muted-foreground max-w-sm">{t("import.upload.desc")}</p>
                </div>
                <div className="w-full max-w-sm pt-4">
                  <Input 
                    type="file" 
                    onChange={handleFileUpload} 
                    disabled={loading}
                    className="cursor-pointer"
                  />
                  {loading && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      {t("common.loading") || "Processing..."}
                    </div>
                  )}
                </div>
                <Button variant="ghost" onClick={() => setStep("source")}>
                  {t("common.back") || "Back"}
                </Button>
              </div>
            )}

            {step === "review" && (
              <div className="flex flex-col h-[500px]">
                <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="size-4 text-primary" />
                    <span className="font-medium">
                      {t("import.review.desc", { n: previewItems.length })}
                    </span>
                  </div>
                  <Button onClick={() => setStep("config")} size="sm">
                    {t("common.next") || "Next"}
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b z-10">
                      <tr>
                        <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Username</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">URL</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {previewItems.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                          <td className="p-3 font-medium">{item.data.name}</td>
                          <td className="p-3 text-muted-foreground">{item.data.username || "—"}</td>
                          <td className="p-3 text-muted-foreground truncate max-w-[200px]">{item.data.url || "—"}</td>
                          <td className="p-3">
                            <Badge variant="secondary" className="capitalize">
                              {item.data.type}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {step === "config" && (
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{t("import.config.vault")}</label>
                    <Select 
                      value={config.targetVaultId} 
                      onValueChange={(v) => setConfig(prev => ({ ...prev, targetVaultId: v ?? "" }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {vaults.map(v => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{t("import.config.folder")}</label>
                    <Select 
                      value={config.targetFolderId || "none"} 
                      onValueChange={(v) => setConfig(prev => ({ ...prev, targetFolderId: v === "none" ? null : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {foldersByVault(config.targetVaultId).map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{t("import.config.conflict")}</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <ConflictOption 
                        label={t("import.config.conflict.skip")} 
                        active={config.conflictPolicy === "skip"} 
                        onClick={() => setConfig(prev => ({ ...prev, conflictPolicy: "skip" }))}
                      />
                      <ConflictOption 
                        label={t("import.config.conflict.overwrite")} 
                        active={config.conflictPolicy === "overwrite"} 
                        onClick={() => setConfig(prev => ({ ...prev, conflictPolicy: "overwrite" }))}
                      />
                      <ConflictOption 
                        label={t("import.config.conflict.append")} 
                        active={config.conflictPolicy === "append"} 
                        onClick={() => setConfig(prev => ({ ...prev, conflictPolicy: "append" }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <Button variant="ghost" onClick={() => setStep("review")}>
                    {t("common.back") || "Back"}
                  </Button>
                  <Button onClick={handleConfirm} disabled={loading}>
                    {loading ? "..." : t("import.execute.btn")}
                  </Button>
                </div>
              </div>
            )}

            {step === "executing" && job && (
              <div className="p-12 flex flex-col items-center justify-center space-y-6">
                {job.status === "processing" ? (
                  <>
                    <div className="size-20 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl font-bold">{t("import.status.processing")}</h3>
                      <p className="text-muted-foreground">
                        {job.stats.created + job.stats.failed} / {job.stats.total} items processed
                      </p>
                    </div>
                  </>
                ) : job.status === "completed" ? (
                  <>
                    <div className="size-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="size-10 text-emerald-500" />
                    </div>
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl font-bold">{t("import.status.completed")}</h3>
                      <div className="flex flex-wrap justify-center gap-2 pt-2">
                        <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/5">
                          {t("import.result.success", { n: job.stats.created })}
                        </Badge>
                        {job.stats.failed > 0 && (
                          <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/5">
                            {t("import.result.failed", { n: job.stats.failed })}
                          </Badge>
                        )}
                        {job.stats.skipped > 0 && (
                          <Badge variant="outline" className="text-muted-foreground">
                            {t("import.result.skipped", { n: job.stats.skipped })}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button onClick={() => router.push("/app")}>
                      {t("common.done") || "Done"}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="size-20 rounded-full bg-destructive/10 flex items-center justify-center">
                      <AlertCircle className="size-10 text-destructive" />
                    </div>
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl font-bold">{t("import.status.failed")}</h3>
                      <p className="text-destructive max-w-md mx-auto">
                        {job.errorLog?.[0]?.message || "An unexpected error occurred"}
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => setStep("source")}>
                      {t("common.retry") || "Retry"}
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

function WizardStep({ label, active, completed }: { label: string; active: boolean; completed: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 whitespace-nowrap pb-2 border-b-2 transition-all",
      active ? "text-primary border-primary" : "border-transparent",
      completed && !active ? "text-emerald-500" : ""
    )}>
      <div className={cn(
        "size-5 rounded-full flex items-center justify-center text-[10px] font-bold border",
        active ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30",
        completed ? "bg-emerald-500 border-emerald-500 text-white" : ""
      )}>
        {completed ? <Check className="size-3" /> : null}
      </div>
      {label}
    </div>
  );
}

function ConflictOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-3 rounded-lg border text-sm font-medium transition-all text-center",
        active 
          ? "bg-primary/10 border-primary text-primary shadow-sm" 
          : "hover:bg-muted border-border text-muted-foreground"
      )}
    >
      {label}
    </button>
  );
}
