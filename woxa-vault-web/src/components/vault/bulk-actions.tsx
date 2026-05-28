"use client";

import { useState } from "react";
import { Trash2, FolderInput, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n/provider";
import { bulkItems } from "@/lib/api/items";
import { toast } from "sonner";
import { useFolders } from "@/lib/folders/provider";

interface BulkActionsBarProps {
  selectedIds: string[];
  vaultId: string;
  onClear: () => void;
  onComplete: () => void;
}

export function BulkActionsBar({ selectedIds, vaultId, onClear, onComplete }: BulkActionsBarProps) {
  const t = useT();
  const { byVault } = useFolders();
  const folders = byVault(vaultId);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  const n = selectedIds.length;

  const handleBulkDelete = async () => {
    setBusy(true);
    try {
      const res = await bulkItems("delete", selectedIds);
      if (res.failed.length === 0) {
        toast.success(t("bulk.success.deleted", { n: res.success.length }));
      } else {
        toast.info(t("bulk.partial_success", { s: res.success.length, f: res.failed.length }));
      }
      onComplete();
      setDeleteOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleBulkMove = async () => {
    setBusy(true);
    try {
      const folderId = targetFolderId === "none" ? null : targetFolderId;
      const res = await bulkItems("move", selectedIds, { folderId });
      if (res.failed.length === 0) {
        toast.success(t("bulk.success.moved", { n: res.success.length }));
      } else {
        toast.info(t("bulk.partial_success", { s: res.success.length, f: res.failed.length }));
      }
      onComplete();
      setMoveOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-surface-1 border border-line-3 shadow-2xl rounded-2xl flex items-center gap-2 p-2 pl-4 min-w-[320px] backdrop-blur-md">
          <div className="flex-1 text-sm font-semibold">
            {t("bulk.selected", { n })}
          </div>
          
          <div className="h-6 w-px bg-line-2 mx-1" />

          <Button 
            variant="ghost" 
            size="sm" 
            className="h-9 px-3 text-xs gap-1.5"
            onClick={() => setMoveOpen(true)}
          >
            <FolderInput className="size-3.5" />
            {t("bulk.action.move")}
          </Button>

          <Button 
            variant="ghost" 
            size="sm" 
            className="h-9 px-3 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" />
            {t("bulk.action.delete")}
          </Button>

          <div className="h-6 w-px bg-line-2 mx-1" />

          <button 
            onClick={onClear}
            className="size-8 rounded-lg hover:bg-surface-3 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulk.delete.title", { n })}</DialogTitle>
            <DialogDescription>{t("bulk.delete.desc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} loading={busy}>
              {t("bulk.delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulk.move.title", { n })}</DialogTitle>
            <DialogDescription>{t("bulk.move.select_folder")}</DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Select value={targetFolderId} onValueChange={setTargetFolderId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.none") || "None"}</SelectItem>
                {folders.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleBulkMove} loading={busy}>
              {t("bulk.move.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
