import { describe, expect, it } from "vitest";
import {
  buildIntegrationCatalog,
  mergeSlackIntegration,
  readOrgSlackIntegration,
  slackWebhookSchema,
} from "./orgIntegrations";

const SLACK_URL = "https://hooks.slack.com/services/T000/B000/XXXXXXXX";

describe("orgIntegrations", () => {
  it("readOrgSlackIntegration returns null for missing/invalid webhook", () => {
    expect(readOrgSlackIntegration({})).toBeNull();
    expect(
      readOrgSlackIntegration({
        integrations: { slack: { webhookUrl: "http://evil.example" } },
      }),
    ).toBeNull();
  });

  it("mergeSlackIntegration round-trips a valid webhook", () => {
    const merged = mergeSlackIntegration(
      { require2fa: true },
      { webhookUrl: SLACK_URL, connectedAt: "2026-05-01T00:00:00.000Z" },
    );
    const slack = readOrgSlackIntegration(merged);
    expect(slack?.webhookUrl).toBe(SLACK_URL);
    expect(merged.require2fa).toBe(true);
  });

  it("mergeSlackIntegration disconnect removes slack but keeps other keys", () => {
    const base = mergeSlackIntegration({}, {
      webhookUrl: SLACK_URL,
      connectedAt: "2026-05-01T00:00:00.000Z",
    });
    const cleared = mergeSlackIntegration(base, null);
    expect(readOrgSlackIntegration(cleared)).toBeNull();
    expect("integrations" in cleared).toBe(false);
  });

  it("buildIntegrationCatalog marks google connected when domains exist", () => {
    const list = buildIntegrationCatalog({
      settings: { sso: { allowedDomains: ["iux24.com"] } },
      googleSsoConfigured: true,
    });
    const google = list.find((i) => i.id === "google_workspace");
    expect(google?.status).toBe("connected");
    expect(google?.summary).toContain("1 allowed");
  });

  it("slackWebhookSchema rejects non-Slack URLs", () => {
    expect(slackWebhookSchema.safeParse("https://example.com/hook").success).toBe(
      false,
    );
    expect(slackWebhookSchema.safeParse(SLACK_URL).success).toBe(true);
  });
});
