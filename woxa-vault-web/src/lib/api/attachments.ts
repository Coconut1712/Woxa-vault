/**
 * Attachment endpoints — see /API_CONTRACT.md ("Endpoints — Attachments").
 *
 * Backend rules at a glance (mirror these in UI gating before calling):
 *  - Per-file cap: 25 MB → 413 `attachment_too_large`
 *  - Per-item aggregate cap: 100 MB → 413 `attachment_item_quota_exceeded`
 *  - MIME allow-list (docs/images/archives/keys/certs) → 415 `attachment_mime_not_allowed`
 *
 * IMPORTANT: do NOT set `Content-Type` for the multipart upload — the browser
 * must own that header so the boundary is correct. We call fetch directly here
 * instead of routing through `apiFetch` for that reason.
 */

import { API_BASE_URL, ApiError, NetworkError } from "./client";

export interface Attachment {
  id: string;
  itemId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string | null;
}

interface AttachmentListResponse {
  attachments: Attachment[];
}

interface AttachmentSingleResponse {
  attachment: Attachment;
}

/** GET /items/:id/attachments */
export async function listAttachments(
  itemId: string,
  signal?: AbortSignal,
): Promise<Attachment[]> {
  const res = await safeFetch(
    `${API_BASE_URL}/items/${encodeURIComponent(itemId)}/attachments`,
    { method: "GET", credentials: "include", signal, cache: "no-store" },
  );
  const parsed = await parseJson(res);
  if (!res.ok) throw toApiError(res.status, parsed);
  return ((parsed as AttachmentListResponse | null)?.attachments ?? []).slice();
}

/**
 * POST /items/:id/attachments (multipart, field "file")
 *
 * Optional `onProgress` (0..1) hooks XHR's upload-progress event so the form
 * can render a progress bar. `fetch` doesn't expose upload progress yet, so we
 * fall back to XHR only when the caller asks for it.
 */
export async function uploadAttachment(
  itemId: string,
  file: File,
  options?: {
    signal?: AbortSignal;
    onProgress?: (fraction: number) => void;
  },
): Promise<Attachment> {
  const url = `${API_BASE_URL}/items/${encodeURIComponent(itemId)}/attachments`;
  const formData = new FormData();
  formData.append("file", file, file.name);

  if (!options?.onProgress) {
    const res = await safeFetch(url, {
      method: "POST",
      credentials: "include",
      body: formData,
      signal: options?.signal,
      cache: "no-store",
    });
    const parsed = await parseJson(res);
    if (!res.ok) throw toApiError(res.status, parsed);
    const payload = parsed as AttachmentSingleResponse | null;
    if (!payload?.attachment) {
      throw new ApiError(res.status, "internal_error", "Empty upload response");
    }
    return payload.attachment;
  }

  // XHR fallback so we can report upload progress to the caller.
  return await new Promise<Attachment>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const fraction = e.total > 0 ? e.loaded / e.total : 0;
      options.onProgress?.(Math.min(1, Math.max(0, fraction)));
    };
    xhr.onload = () => {
      const text = xhr.responseText ?? "";
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const payload = parsed as AttachmentSingleResponse | null;
        if (!payload?.attachment) {
          reject(
            new ApiError(xhr.status, "internal_error", "Empty upload response"),
          );
          return;
        }
        resolve(payload.attachment);
      } else {
        reject(toApiError(xhr.status, parsed));
      }
    };
    xhr.onerror = () =>
      reject(new NetworkError("Upload failed — network error"));
    xhr.onabort = () => reject(new NetworkError("Upload aborted"));

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener("abort", () => xhr.abort(), {
        once: true,
      });
    }

    xhr.send(formData);
  });
}

/**
 * Returns the absolute URL the browser should navigate to in order to download
 * the attachment. The endpoint streams the binary back with a
 * `Content-Disposition` header so the browser saves it directly.
 *
 * The browser sends the session cookie automatically (`credentials: "include"`
 * for the SameSite=Lax session cookie applies to top-level navigations).
 */
export function attachmentDownloadUrl(id: string): string {
  return `${API_BASE_URL}/attachments/${encodeURIComponent(id)}/download`;
}

/**
 * Trigger a browser download via a temporary anchor element. The user gets the
 * native save dialog because the backend sets Content-Disposition.
 */
export function downloadAttachment(id: string, filename?: string): void {
  if (typeof window === "undefined") return;
  const a = document.createElement("a");
  a.href = attachmentDownloadUrl(id);
  if (filename) a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** DELETE /attachments/:id */
export async function deleteAttachment(id: string): Promise<void> {
  const res = await safeFetch(
    `${API_BASE_URL}/attachments/${encodeURIComponent(id)}`,
    { method: "DELETE", credentials: "include", cache: "no-store" },
  );
  if (res.status === 204) return;
  const parsed = await parseJson(res);
  if (!res.ok) throw toApiError(res.status, parsed);
}

/* ------------------------------------------------------------------ */
/* internals                                                           */
/* ------------------------------------------------------------------ */

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new NetworkError(
      err instanceof Error ? err.message : "Failed to reach the server",
    );
  }
}

async function parseJson(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toApiError(status: number, parsed: unknown): ApiError {
  const envelope = isErrorEnvelope(parsed) ? parsed.error : null;
  return new ApiError(
    status,
    envelope?.code ?? defaultCodeForStatus(status),
    envelope?.message ?? `Request failed with status ${status}`,
  );
}

function isErrorEnvelope(
  value: unknown,
): value is { error: { code?: string; message?: string } } {
  if (!value || typeof value !== "object") return false;
  const err = (value as { error?: unknown }).error;
  return !!err && typeof err === "object";
}

function defaultCodeForStatus(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 413) return "attachment_too_large";
  if (status === 415) return "attachment_mime_not_allowed";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "internal_error";
  if (status >= 400) return "bad_request";
  return "unknown_error";
}
