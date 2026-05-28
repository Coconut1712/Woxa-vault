import { apiFetch } from "./client";
import type { ImportJob, ImportItem } from "./types";

export async function listImportJobs() {
  return apiFetch<{ jobs: ImportJob[] }>("/imports");
}

export async function getImportJob(id: string) {
  return apiFetch<{ job: ImportJob }>(`/imports/${id}`);
}

export async function getImportItems(id: string) {
  return apiFetch<{ items: ImportItem[] }>(`/imports/${id}/items`);
}

export async function startImport(source: string, file: File) {
  const formData = new FormData();
  formData.append("source", source);
  formData.append("file", file);

  return apiFetch<{ job: ImportJob }>("/imports", {
    method: "POST",
    body: formData,
  });
}

export async function confirmImport(id: string, config: {
  targetVaultId: string;
  targetFolderId?: string | null;
  conflictPolicy: "skip" | "overwrite" | "append";
}) {
  return apiFetch<{ ok: boolean; message: string }>(`/imports/${id}/confirm`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}
