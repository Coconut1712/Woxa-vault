import { z } from "zod";
import { readOrgPolicy } from "@/lib/orgPolicy";

// ---------------------------------------------------------------------------
// Workspace integrations — stored in `organizations.settings.integrations`
// (jsonb), alongside the security-policy keys owned by orgPolicy.ts.
//
// Only Slack is persisted here for now. Google Workspace status is DERIVED
// from the existing `sso.allowedDomains` policy (no duplicate storage).
// ---------------------------------------------------------------------------

const SLACK_WEBHOOK_RE =
  /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;

export const slackWebhookSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((v) => SLACK_WEBHOOK_RE.test(v), {
    message: "Must be a valid Slack incoming webhook URL",
  });

export interface OrgSlackIntegration {
  webhookUrl: string;
  connectedAt: string;
}

export interface OrgIntegrationsBlob {
  slack: OrgSlackIntegration | null;
}

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

export interface WorkspaceIntegrationView {
  id: WorkspaceIntegrationId;
  status: WorkspaceIntegrationStatus;
  /** Non-secret display hint (domain count, masked webhook tail, …). */
  summary: string | null;
  connectedAt: string | null;
}

function safeIntegrationsObject(
  settings: unknown,
): Record<string, unknown> | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const raw = (settings as Record<string, unknown>).integrations;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Read the Slack block from settings; never throws. */
export function readOrgSlackIntegration(settings: unknown): OrgSlackIntegration | null {
  const integrations = safeIntegrationsObject(settings);
  if (!integrations) return null;
  const slack = integrations.slack;
  if (!slack || typeof slack !== "object" || Array.isArray(slack)) return null;
  const row = slack as Record<string, unknown>;
  const webhookUrl = typeof row.webhookUrl === "string" ? row.webhookUrl.trim() : "";
  if (!webhookUrl || !SLACK_WEBHOOK_RE.test(webhookUrl)) return null;
  const connectedAt =
    typeof row.connectedAt === "string" && row.connectedAt.length > 0
      ? row.connectedAt
      : new Date(0).toISOString();
  return { webhookUrl, connectedAt };
}

/** Mask a webhook URL for display — never echo the full secret. */
export function maskSlackWebhook(url: string): string {
  const tail = url.slice(-8);
  return `••••${tail}`;
}

/** Merge a Slack patch into the settings blob (preserves unrelated keys). */
export function mergeSlackIntegration(
  existingSettings: unknown,
  slack: OrgSlackIntegration | null,
): Record<string, unknown> {
  const base =
    existingSettings && typeof existingSettings === "object" && !Array.isArray(existingSettings)
      ? { ...(existingSettings as Record<string, unknown>) }
      : {};
  const integrations =
    base.integrations &&
    typeof base.integrations === "object" &&
    !Array.isArray(base.integrations)
      ? { ...(base.integrations as Record<string, unknown>) }
      : {};
  if (slack === null) {
    delete integrations.slack;
  } else {
    integrations.slack = slack;
  }
  if (Object.keys(integrations).length === 0) {
    const { integrations: _drop, ...rest } = base;
    return rest;
  }
  return { ...base, integrations };
}

export function buildIntegrationCatalog(opts: {
  settings: unknown;
  googleSsoConfigured: boolean;
}): WorkspaceIntegrationView[] {
  const policy = readOrgPolicy(opts.settings);
  const slack = readOrgSlackIntegration(opts.settings);
  const domainCount = policy.sso.allowedDomains.length;

  const googleStatus: WorkspaceIntegrationStatus = !opts.googleSsoConfigured
    ? "unavailable"
    : domainCount > 0
      ? "connected"
      : "available";

  const googleSummary = !opts.googleSsoConfigured
    ? null
    : domainCount > 0
      ? `${domainCount} allowed domain${domainCount === 1 ? "" : "s"}`
      : null;

  return [
    {
      id: "google_workspace",
      status: googleStatus,
      summary: googleSummary,
      connectedAt: domainCount > 0 ? null : null,
    },
    {
      id: "slack",
      status: slack ? "connected" : "available",
      summary: slack ? maskSlackWebhook(slack.webhookUrl) : null,
      connectedAt: slack?.connectedAt ?? null,
    },
    {
      id: "github",
      status: "coming_soon",
      summary: null,
      connectedAt: null,
    },
    {
      id: "microsoft_entra",
      status: "coming_soon",
      summary: null,
      connectedAt: null,
    },
    {
      id: "datadog",
      status: "coming_soon",
      summary: null,
      connectedAt: null,
    },
    {
      id: "pagerduty",
      status: "coming_soon",
      summary: null,
      connectedAt: null,
    },
  ];
}
