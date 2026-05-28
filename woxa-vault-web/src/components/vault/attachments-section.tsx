"use client";

/**
 * AttachmentsSection
 *
 * A reusable block for the Secure Note (and Login) form/detail surface that
 * wraps `src/lib/api/attachments.ts`. Two modes:
 *
 *  - `itemId` provided (edit/detail): uploads/deletes hit the backend
 *    immediately and the list refreshes after each mutation.
 *  - `itemId` null (new-item flow): the section runs in "queued" mode. Files
 *    chosen here are kept in a local queue; the parent form drains the queue
 *    AFTER the item is created (see `consumeQueue` on the imperative handle).
 *
 * Constraints mirrored from the contract (see /API_CONTRACT.md):
 *   - 25 MB per file → 413 attachment_too_large
 *   - 100 MB per item aggregate → 413 attachment_item_quota_exceeded
 *   - MIME allow-list → 415 attachment_mime_not_allowed
 *
 * Errors are surfaced via the parent toast (sonner). The component itself
 * just renders state; mutations bubble through `onAfterUpload` / `onAfterDelete`
 * so the page can refresh dependent UI.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  Download,
  FileArchive,
  FileCode,
  FileImage,
  FileKey,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type Attachment,
  deleteAttachment,
  downloadAttachment,
  listAttachments,
  uploadAttachment,
} from "@/lib/api/attachments";
import { ApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const MAX_PER_FILE_BYTES = 25 * 1024 * 1024;

interface Props {
  /** Existing item id. `null` puts the section in queued mode. */
  itemId: string | null;
  /** When true, hides the upload drop-zone (still allows delete + download). */
  hideUpload?: boolean;
  /** When true, hides destructive controls (delete + queue-remove). */
  hideDelete?: boolean;
  /** Optional className for the wrapper. */
  className?: string;
}

/** Imperative API used by the new-item dialog to drain the queue after save. */
export interface AttachmentsSectionHandle {
  /** Number of files currently queued (waiting for an item id). */
  queuedCount: () => number;
  /**
   * Upload all queued files against the given item id. Returns true if every
   * file succeeded, false if any failed (toast is shown for each failure).
   */
  consumeQueue: (newItemId: string) => Promise<boolean>;
}

export const AttachmentsSection = forwardRef<
  AttachmentsSectionHandle,
  Props
>(function AttachmentsSection(
  { itemId, hideUpload, hideDelete, className },
  ref,
) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queued, setQueued] = useState<File[]>([]);

  const queueLabel = useMemo(() => {
    if (queued.length === 0) return null;
    return queued.length === 1
      ? t("items.attachments.queued", { n: 1 })
      : t("items.attachments.queued_plural", { n: queued.length });
  }, [queued.length, t]);

  const loadList = useCallback(
    async (signal?: AbortSignal) => {
      if (!itemId) {
        setAttachments([]);
        setListError(null);
        return;
      }
      setLoading(true);
      setListError(null);
      try {
        const list = await listAttachments(itemId, signal);
        setAttachments(list);
      } catch (err) {
        if (signal?.aborted) return;
        setListError(t("items.attachments.error.list_failed"));
        if (!(err instanceof ApiError && err.code === "not_found")) {
          toast.error(t("items.attachments.error.list_failed"));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [itemId, t],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void loadList(ctrl.signal);
    return () => ctrl.abort();
  }, [loadList]);

  const runUpload = useCallback(
    async (file: File, targetItemId: string): Promise<boolean> => {
      if (file.size > MAX_PER_FILE_BYTES) {
        toast.error(t("items.attachments.error.too_large"), {
          description: file.name,
        });
        return false;
      }
      setUploading(file.name);
      try {
        await uploadAttachment(targetItemId, file);
        toast.success(t("items.attachments.toast.uploaded"), {
          description: file.name,
        });
        return true;
      } catch (err) {
        const description = file.name;
        if (err instanceof ApiError) {
          if (err.code === "attachment_too_large") {
            toast.error(t("items.attachments.error.too_large"), { description });
          } else if (err.code === "attachment_item_quota_exceeded") {
            toast.error(t("items.attachments.error.quota_exceeded"), {
              description,
            });
          } else if (err.code === "attachment_mime_not_allowed") {
            toast.error(t("items.attachments.error.mime_not_allowed"), {
              description,
            });
          } else {
            toast.error(t("items.attachments.error.upload_failed"), {
              description: err.message || description,
            });
          }
        } else {
          toast.error(t("items.attachments.error.upload_failed"), {
            description,
          });
        }
        return false;
      } finally {
        setUploading(null);
      }
    },
    [t],
  );

  const acceptFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      if (!itemId) {
        // Queued mode — accept all and let the parent drain on save.
        // Filter out oversize here so we don't ask the user to wait then fail.
        const accepted: File[] = [];
        for (const f of list) {
          if (f.size > MAX_PER_FILE_BYTES) {
            toast.error(t("items.attachments.error.too_large"), {
              description: f.name,
            });
            continue;
          }
          accepted.push(f);
        }
        if (accepted.length === 0) return;
        setQueued((prev) => [...prev, ...accepted]);
        return;
      }
      // Live mode — upload each sequentially so backend quota math stays sane.
      for (const f of list) {
        const ok = await runUpload(f, itemId);
        if (ok) await loadList();
      }
    },
    [itemId, runUpload, loadList, t],
  );

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void acceptFiles(files);
    }
    // Reset so picking the same file twice still fires onChange.
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (hideUpload) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      void acceptFiles(files);
    }
  };

  const handleDelete = useCallback(
    async (att: Attachment) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm(t("items.attachments.delete_confirm"))
      ) {
        return;
      }
      try {
        await deleteAttachment(att.id);
        toast.success(t("items.attachments.toast.deleted"), {
          description: att.filename,
        });
        await loadList();
      } catch (err) {
        toast.error(t("items.attachments.error.delete_failed"), {
          description:
            err instanceof ApiError ? err.message : att.filename,
        });
      }
    },
    [loadList, t],
  );

  const removeFromQueue = (idx: number) =>
    setQueued((prev) => prev.filter((_, i) => i !== idx));

  useImperativeHandle(
    ref,
    () => ({
      queuedCount: () => queued.length,
      consumeQueue: async (newItemId: string) => {
        if (queued.length === 0) return true;
        let allOk = true;
        for (const file of queued) {
          const ok = await runUpload(file, newItemId);
          if (!ok) allOk = false;
        }
        setQueued([]);
        return allOk;
      },
    }),
    [queued, runUpload],
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <Paperclip className="size-3" />
          {t("items.attachments.title")}
        </label>
        <span className="text-[10px] text-muted-foreground/70">
          {t("items.attachments.limit_hint")}
        </span>
      </div>

      {!hideUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
            dragOver
              ? "border-brand/40 bg-brand/[0.04]"
              : "border-line-2 bg-surface-1 hover:border-line-3",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={handleInputChange}
            disabled={uploading !== null}
          />
          <div className="flex flex-col items-center gap-2">
            <div className="size-9 rounded-lg bg-surface-2 flex items-center justify-center text-muted-foreground">
              <Upload className="size-4" />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("items.attachments.drop_hint")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading !== null}
            >
              {uploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("items.attachments.uploading", { name: uploading })}
                </>
              ) : (
                <>
                  <Paperclip className="size-3.5" />
                  {t("items.attachments.choose_file")}
                </>
              )}
            </Button>
            {!itemId && (
              <p className="text-[10px] text-muted-foreground/70">
                {t("items.attachments.available_after_save")}
              </p>
            )}
            {queueLabel && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                {queueLabel}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Queued (pre-save) list */}
      {queued.length > 0 && (
        <ul className="space-y-1.5">
          {queued.map((file, idx) => (
            <li
              key={`${file.name}-${idx}`}
              className="flex items-center gap-3 rounded-lg border border-line-1 bg-surface-1 px-3 py-2"
            >
              <FileIcon mimeType={file.type} className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{file.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {humanSize(file.size)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFromQueue(idx)}
                aria-label={t("items.attachments.delete")}
                title={t("items.attachments.delete")}
                className="size-7 rounded-md hover:bg-rose-500/15 dark:hover:bg-rose-500/10 text-muted-foreground hover:text-rose-700 dark:hover:text-rose-300 flex items-center justify-center"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Live (server) list */}
      {itemId && (
        <div>
          {loading ? (
            <div className="text-[11px] text-muted-foreground py-2 flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              {t("api.loading")}
            </div>
          ) : listError ? (
            <p className="text-[11px] text-rose-700 dark:text-rose-300">
              {listError}
            </p>
          ) : attachments.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/80">
              {t("items.attachments.empty")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {attachments.map((att) => (
                <li
                  key={att.id}
                  className="flex items-center gap-3 rounded-lg border border-line-1 bg-surface-1 px-3 py-2"
                >
                  <FileIcon
                    mimeType={att.mimeType}
                    className="size-4 text-muted-foreground shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{att.filename}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {humanSize(att.sizeBytes)} · {att.mimeType}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadAttachment(att.id, att.filename)}
                    aria-label={t("items.attachments.download")}
                    title={t("items.attachments.download")}
                    className="size-7 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center"
                  >
                    <Download className="size-3.5" />
                  </button>
                  {!hideDelete && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(att)}
                      aria-label={t("items.attachments.delete")}
                      title={t("items.attachments.delete")}
                      className="size-7 rounded-md hover:bg-rose-500/15 dark:hover:bg-rose-500/10 text-muted-foreground hover:text-rose-700 dark:hover:text-rose-300 flex items-center justify-center"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});

/* ============================== helpers ============================== */

function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function FileIcon({
  mimeType,
  className,
}: {
  mimeType: string;
  className?: string;
}) {
  const m = mimeType.toLowerCase();
  if (m.startsWith("image/")) return <FileImage className={className} />;
  if (
    m === "application/zip" ||
    m === "application/x-7z-compressed" ||
    m === "application/x-tar" ||
    m === "application/gzip"
  ) {
    return <FileArchive className={className} />;
  }
  if (
    m === "application/x-pem-file" ||
    m === "application/pkix-cert" ||
    m === "application/x-x509-ca-cert" ||
    m === "application/pgp-keys" ||
    m.endsWith("/x-pem") ||
    m.endsWith("certificate")
  ) {
    return <FileKey className={className} />;
  }
  if (m.startsWith("text/") || m === "application/json" || m === "application/xml") {
    return <FileCode className={className} />;
  }
  return <FileText className={className} />;
}
