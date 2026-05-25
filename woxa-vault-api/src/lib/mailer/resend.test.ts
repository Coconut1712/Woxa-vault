import { describe, expect, it, beforeAll, vi } from "vitest";

beforeAll(() => {
  // Keep this in step with src/lib/mfa.test.ts — env.ts hard-fails without
  // a DATABASE_URL even if the test doesn't touch the DB.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgres://woxa:woxa_local_dev@localhost:5433/woxa_vault";
  }
  if (!process.env.LOCAL_KEK_BASE64 || process.env.LOCAL_KEK_BASE64 === "REPLACE_ME_WITH_BASE64_32_BYTES") {
    process.env.LOCAL_KEK_BASE64 = Buffer.alloc(32).toString("base64");
  }
});

describe("lib/mailer/resend", () => {
  it("redacts the email local-part while preserving the domain", async () => {
    const { redactEmail } = await import("./resend");
    expect(redactEmail("alice@example.com")).toBe("a***@example.com");
    expect(redactEmail("x@example.com")).toBe("x***@example.com");
    expect(redactEmail("a@b.co")).toBe("a***@b.co");
    expect(redactEmail("garbage")).toBe("***");
    expect(redactEmail("@nope")).toBe("***");
  });

  it("flags invalid email addresses", async () => {
    const { isValidEmail } = await import("./resend");
    expect(isValidEmail("alice@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a@b.")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("falls back to console.log when RESEND_API_KEY is not configured", async () => {
    // Force dev fallback. The mailer module caches its client lazily, so we
    // ensure RESEND_API_KEY is empty BEFORE importing.
    delete process.env.RESEND_API_KEY;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { sendInviteEmail } = await import("./resend");
    const result = await sendInviteEmail({
      to: "alice@example.com",
      inviterName: "Alice <admin>",
      orgName: "Woxa & Co",
      acceptUrl: "https://vault.example.com/invite/abcdef",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      role: "member",
      invitationId: "00000000-0000-0000-0000-000000000000",
    });
    expect(result.sent).toBe(false);
    expect(result.errorCode).toBe("not_configured");

    // No console.log call should ever serialize the acceptUrl as a structured
    // field. We only use plain console.log lines in dev fallback.
    const calls = logSpy.mock.calls.map((args) => args.join(" "));
    expect(calls.some((line) => line.includes("Subject: Alice"))).toBe(true);
    logSpy.mockRestore();
  });
});
