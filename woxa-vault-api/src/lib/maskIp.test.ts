import { describe, expect, it, beforeAll } from "vitest";

// Unit tests for maskIp — the PDPA data-minimization helper that produces a
// coarse display string for the audit log (first two octets/hextets, the rest
// masked with the bullet glyph). The invariant under test: the returned string
// NEVER contains the full address — only the first two segments survive.

beforeAll(() => {
  // env import in ipHash.ts requires a KEK; supply a deterministic one.
  if (
    !process.env.LOCAL_KEK_BASE64 ||
    process.env.LOCAL_KEK_BASE64 === "REPLACE_ME_WITH_BASE64_32_BYTES"
  ) {
    process.env.LOCAL_KEK_BASE64 = Buffer.alloc(32).toString("base64");
  }
});

const BULLET = "•"; // •

async function loadMaskIp() {
  const { maskIp } = await import("@/lib/ipHash");
  return maskIp;
}

describe("maskIp", () => {
  it("IPv4 → keeps first two octets, masks the rest", async () => {
    const maskIp = await loadMaskIp();
    expect(maskIp("203.0.113.45")).toBe(`203.0.${BULLET}.${BULLET}`);
    expect(maskIp("10.0.1.2")).toBe(`10.0.${BULLET}.${BULLET}`);
    expect(maskIp("192.168.5.10")).toBe(`192.168.${BULLET}.${BULLET}`);
  });

  it("IPv4 result never leaks octets 3 or 4", async () => {
    const maskIp = await loadMaskIp();
    const masked = maskIp("203.0.113.45")!;
    expect(masked.includes("113")).toBe(false);
    expect(masked.includes("45")).toBe(false);
  });

  it("IPv6 → keeps first two hextets, masks the rest", async () => {
    const maskIp = await loadMaskIp();
    expect(maskIp("2001:db8:85a3::8a2e:370:7334")).toBe(`2001:db8:${BULLET}`);
    expect(maskIp("fe80:0:0:0:0:0:0:1")).toBe(`fe80:0:${BULLET}`);
    // Leading `::` (empty first hextet) is treated as unparseable → null.
    expect(maskIp("::1")).toBeNull();
  });

  it("IPv6 result never leaks anything past the second hextet", async () => {
    const maskIp = await loadMaskIp();
    const masked = maskIp("2001:db8:85a3::8a2e:370:7334")!;
    expect(masked.includes("85a3")).toBe(false);
    expect(masked.includes("8a2e")).toBe(false);
    expect(masked.includes("7334")).toBe(false);
  });

  it("unknown / empty / unparseable → null", async () => {
    const maskIp = await loadMaskIp();
    expect(maskIp("unknown")).toBeNull();
    expect(maskIp("")).toBeNull();
    expect(maskIp("   ")).toBeNull();
    expect(maskIp("garbage")).toBeNull(); // no dot, no colon
    expect(maskIp("1.2.3")).toBeNull(); // only three octets
    expect(maskIp("1.2.3.4.5")).toBeNull(); // five octets
    expect(maskIp("1..3.4")).toBeNull(); // empty octet
  });
});
