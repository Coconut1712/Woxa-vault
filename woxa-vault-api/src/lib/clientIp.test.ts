import { afterEach, describe, expect, it, vi } from "vitest";

// `env.TRUST_PROXY` is read at call time inside getClientIp, so we mock the
// config module and flip the flag per test.
vi.mock("@/config/env", () => ({
  env: { TRUST_PROXY: false },
}));

import { env } from "@/config/env";
import { getClientIp } from "@/lib/clientIp";

type Headers = Record<string, string | undefined>;

function makeCtx(headers: Headers, remoteAddress?: string) {
  const lower: Headers = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    req: { header: (k: string) => lower[k.toLowerCase()] },
    env: remoteAddress ? { incoming: { socket: { remoteAddress } } } : undefined,
  };
}

afterEach(() => {
  (env as { TRUST_PROXY: boolean }).TRUST_PROXY = false;
});

describe("getClientIp — TRUST_PROXY disabled (direct-to-origin)", () => {
  it("ignores forged cf-connecting-ip and uses the socket peer (regression: rate-limit evasion)", () => {
    const ctx = makeCtx({ "cf-connecting-ip": "172.16.0.7" }, "10.0.0.1");
    expect(getClientIp(ctx)).toBe("10.0.0.1");
  });

  it("ignores forged fly-client-ip and uses the socket peer", () => {
    const ctx = makeCtx({ "fly-client-ip": "172.16.0.9" }, "10.0.0.1");
    expect(getClientIp(ctx)).toBe("10.0.0.1");
  });

  it("ignores x-forwarded-for and x-real-ip", () => {
    const ctx = makeCtx(
      { "x-forwarded-for": "8.8.8.8", "x-real-ip": "9.9.9.9" },
      "10.0.0.1",
    );
    expect(getClientIp(ctx)).toBe("10.0.0.1");
  });

  it("collapses a rotating attacker to a single bucket regardless of header value", () => {
    const buckets = new Set<string>();
    for (let i = 1; i <= 12; i++) {
      buckets.add(getClientIp(makeCtx({ "cf-connecting-ip": `172.16.0.${i}` }, "10.0.0.1")));
    }
    expect(buckets.size).toBe(1);
    expect([...buckets]).toEqual(["10.0.0.1"]);
  });

  it("falls back to 'unknown' when no socket info is available", () => {
    expect(getClientIp(makeCtx({ "cf-connecting-ip": "172.16.0.7" }))).toBe("unknown");
  });
});

describe("getClientIp — TRUST_PROXY enabled (behind trusted edge)", () => {
  it("prefers cf-connecting-ip over the socket peer", () => {
    (env as { TRUST_PROXY: boolean }).TRUST_PROXY = true;
    const ctx = makeCtx({ "cf-connecting-ip": "203.0.113.5" }, "10.0.0.1");
    expect(getClientIp(ctx)).toBe("203.0.113.5");
  });

  it("prefers fly-client-ip when cf header is absent", () => {
    (env as { TRUST_PROXY: boolean }).TRUST_PROXY = true;
    const ctx = makeCtx({ "fly-client-ip": "203.0.113.6" }, "10.0.0.1");
    expect(getClientIp(ctx)).toBe("203.0.113.6");
  });

  it("honors x-forwarded-for (first hop) when edge headers are absent", () => {
    (env as { TRUST_PROXY: boolean }).TRUST_PROXY = true;
    const ctx = makeCtx({ "x-forwarded-for": "203.0.113.7, 10.0.0.2" }, "10.0.0.1");
    expect(getClientIp(ctx)).toBe("203.0.113.7");
  });
});
