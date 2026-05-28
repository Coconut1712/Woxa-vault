import { apiFetch } from "./client";

export type AccessRequestStatus = "pending" | "approved" | "denied" | "expired" | "cancelled";
export type AccessRequestTarget = "item" | "vault" | "folder";

export interface AccessRequest {
  id: string;
  orgId: string;
  requesterId: string;
  targetType: AccessRequestTarget;
  targetId: string;
  targetName: string | null;
  requestedRole: string;
  durationMinutes: number | null;
  reason: string;
  status: AccessRequestStatus;
  approverId: string | null;
  approvedRole: string | null;
  approvedDurationMinutes: number | null;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  accessExpiresAt: string | null;
  requesterEmail?: string;
  requesterDisplayName?: string;
}

export interface CreateAccessRequestInput {
  targetType: AccessRequestTarget;
  targetId: string;
  requestedRole: string;
  durationMinutes?: number | null;
  reason: string;
}

export interface DecideAccessRequestInput {
  status: "approved" | "denied";
  approvedRole?: string;
  approvedDurationMinutes?: number | null;
  decisionReason?: string;
}

/** POST /access-requests — Create a new access request. */
export async function createAccessRequest(input: CreateAccessRequestInput): Promise<{ request: AccessRequest }> {
  return apiFetch<{ request: AccessRequest }>("/access-requests", {
    method: "POST",
    body: input,
  });
}

/** GET /access-requests — List requests for current user/org. */
export async function listAccessRequests(): Promise<{ requests: AccessRequest[] }> {
  return apiFetch<{ requests: AccessRequest[] }>("/access-requests");
}

/** POST /access-requests/:id/decide — Approve or deny a request. */
export async function decideAccessRequest(id: string, input: DecideAccessRequestInput): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/access-requests/${id}/decide`, {
    method: "POST",
    body: input,
  });
}
