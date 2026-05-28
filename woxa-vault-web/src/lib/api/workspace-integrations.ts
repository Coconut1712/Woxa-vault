/**
 * Workspace integrations — see /API_CONTRACT.md ("Workspace integrations").
 */

import { apiFetch } from "./client";

export type WorkspaceIntegrationId =
  | "google_workspace"
  | "slack"
  | "github"
  | "microsoft_entra"
  | "datadog"
  | "pagerduty";

export type WorkspaceIntegrationStatus =
  | "connected"
  | "available"
  | "coming_soon"
  | "unavailable";

export interface WorkspaceIntegration {
  id: WorkspaceIntegrationId;
  status: WorkspaceIntegrationStatus;
  summary: string | null;
  connectedAt: string | null;
}

export interface WorkspaceIntegrationsResponse {
  integrations: WorkspaceIntegration[];
  platform: { googleSsoConfigured: boolean };
}

export async function getWorkspaceIntegrations(
  signal?: AbortSignal,
): Promise<WorkspaceIntegrationsResponse> {
  return apiFetch<WorkspaceIntegrationsResponse>("/workspace/integrations", {
    signal,
  });
}

export async function connectSlackIntegration(input: {
  webhookUrl: string;
}): Promise<WorkspaceIntegrationsResponse> {
  return apiFetch<WorkspaceIntegrationsResponse>("/workspace/integrations/slack", {
    method: "PATCH",
    body: input,
  });
}

export async function disconnectSlackIntegration(): Promise<WorkspaceIntegrationsResponse> {
  return apiFetch<WorkspaceIntegrationsResponse>("/workspace/integrations/slack", {
    method: "PATCH",
    body: { disconnect: true },
  });
}

export async function testSlackIntegration(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/workspace/integrations/slack/test", {
    method: "POST",
  });
}
