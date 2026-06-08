/**
 * One-time send endpoints — see /API_CONTRACT.md ("Endpoints — Sends").
 *
 * Key reminders from the contract:
 *  - POST /sends returns `token` + `viewUrl` ONCE. The list endpoint exposes
 *    only `tokenHashPreview` (first 12 hex chars of SHA-256), which is NOT
 *    enough to reconstruct the share URL. Keep the created URL in the
 *    new-send page state and surface it there only.
 *  - DELETE /sends/:id is idempotent → 204 even for an already-burned send.
 *  - POST /s/:token/reveal is rate-limited (10/min/IP/token) and may return
 *    425 `send_not_ready` within the first ~1s after creation (burn-guard
 *    against link-preview bots). Frontend should wait ~2s and retry.
 */

import { apiFetch } from "./client";

/** Status of a send as returned by the list endpoint. */
export type SendStatus = "active" | "burned" | "expired";

/** Row shape returned by GET /sends. NO raw token — display-only preview. */
export interface SendSummary {
  id: string;
  /** First 12 hex chars of SHA-256(token). Display-only; cannot rebuild URL. */
  tokenHashPreview: string;
  hasPassword: boolean;
  maxViews: number;
  viewCount: number;
  expiresAt: string;
  createdAt: string;
  burnedAt: string | null;
  status: SendStatus;
}

export interface SendCreateInput {
  /** Plaintext payload — backend encrypts at rest. */
  content: string;
  /** 1–10080 minutes. */
  expiresInMinutes: number;
  /** Optional, defaults to 1 on the backend. */
  maxViews?: number;
  /** Optional gate; omit or empty string → no password. */
  password?: string;
  /**
   * Optional source item this send was built from. When supplied and the
   * caller can access it, the backend logs the create audit against the item
   * (targetType:'item') so "Created send" appears in that item's activity.
   */
  itemId?: string;
}

/**
 * Returned ONCE by POST /sends. `token` + `viewUrl` cannot be recovered later —
 * store them in component state and surface in the "Link is ready" UI.
 */
export interface SendCreated {
  id: string;
  token: string;
  viewUrl: string;
  expiresAt: string;
}

/** Public metadata for the reveal page, returned by GET /s/:token. */
export interface SendPreview {
  token: string;
  hasPassword: boolean;
  expiresAt: string;
  maxViews: number;
  viewsRemaining: number;
  burned: boolean;
  createdAt: string;
}

/** Decrypted payload returned by POST /s/:token/reveal. */
export interface SendRevealResult {
  content: string;
  viewsRemaining: number;
  burned: boolean;
}

interface SendListResponse {
  sends: SendSummary[];
}

interface SendCreatedResponse {
  send: SendCreated;
}

interface SendPreviewResponse {
  send: SendPreview;
}

/** POST /sends — auth, rate-limited 10/min/user. Token only revealed here. */
export async function createSend(
  input: SendCreateInput,
): Promise<SendCreated> {
  const res = await apiFetch<SendCreatedResponse>("/sends", {
    method: "POST",
    body: input,
  });
  return res.send;
}

/** GET /sends — list the caller's own sends. */
export async function listSends(signal?: AbortSignal): Promise<SendSummary[]> {
  const res = await apiFetch<SendListResponse>("/sends", { signal });
  return res.sends;
}

/** DELETE /sends/:id — manual burn, idempotent → 204. */
export async function burnSend(id: string): Promise<void> {
  await apiFetch<void>(`/sends/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** GET /s/:token — public metadata for the reveal page (no auth). */
export async function previewSend(
  token: string,
  signal?: AbortSignal,
): Promise<SendPreview> {
  const res = await apiFetch<SendPreviewResponse>(
    `/s/${encodeURIComponent(token)}`,
    { signal },
  );
  return res.send;
}

/**
 * POST /s/:token/reveal — public; consumes one view on success.
 * On 425 `send_not_ready`, wait ~2s then retry (burn-guard, rare in practice).
 */
export async function revealSend(
  token: string,
  body: { password?: string } = {},
): Promise<SendRevealResult> {
  return apiFetch<SendRevealResult>(
    `/s/${encodeURIComponent(token)}/reveal`,
    { method: "POST", body },
  );
}
