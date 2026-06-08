import { createHmac } from "node:crypto";
import { env } from "@/config/env";
import { getClientIp } from "@/lib/clientIp";

// Hash IP for audit log so we can correlate without storing raw IP
// (DESIGN.md §7.5 — `ip_hash BYTEA NOT NULL`).
// Key derived from LOCAL_KEK_BASE64 so rotating it crypto-shreds prior hashes.
const HMAC_KEY = Buffer.from(env.LOCAL_KEK_BASE64 ?? "woxa-dev-fallback-key", "base64");

export function hashIp(ip: string): string {
  return createHmac("sha256", HMAC_KEY).update(ip).digest("hex");
}

// Glyph used for masked octets/hextets. Single source so the frontend can
// match on it if needed.
const MASK = "•"; // U+2022 BULLET (•)

// Produce a COARSE, privacy-preserving display string for the audit log:
// first two octets (IPv4) or first two hextets (IPv6), the rest masked.
//
// PDPA data minimization (REQUIREMENTS §privacy): we MUST NOT persist the full
// IP. This returns ONLY the first two segments — the remainder is replaced with
// the bullet glyph and the raw tail is discarded, never stored. The exact IP
// lives nowhere; the HMAC `hashIp` stays for correlation/rate-limiting.
//
//   "203.0.113.45"               -> "203.0.•.•"
//   "2001:db8:85a3::8a2e:370"    -> "2001:db8:•"
//   "unknown" / "" / garbage     -> null
export function maskIp(ip: string): string | null {
  if (!ip || ip === "unknown") return null;
  const trimmed = ip.trim();
  if (trimmed === "") return null;

  // IPv6 if it contains a colon (covers compressed `::` forms too).
  if (trimmed.includes(":")) {
    const hextets = trimmed.split(":");
    if (hextets.length < 2 || !hextets[0] || !hextets[1]) return null;
    return `${hextets[0]}:${hextets[1]}:${MASK}`;
  }

  // IPv4: exactly four dotted octets.
  const octets = trimmed.split(".");
  if (octets.length !== 4 || octets.some((o) => o === "")) return null;
  return `${octets[0]}.${octets[1]}.${MASK}.${MASK}`;
}

// Resolve the caller IP ONCE and derive both audit columns:
//   * `ipHash`   — HMAC for correlation / exact-IP confirmation (never reversible)
//   * `ipMasked` — coarse display string (first two segments), full IP discarded
// Spread this into every `auditEvents` insert so the two columns can't drift.
export function clientIpAuditFields(
  c: Parameters<typeof getClientIp>[0],
): { ipHash: string; ipMasked: string | null } {
  const ip = getClientIp(c);
  return { ipHash: hashIp(ip), ipMasked: maskIp(ip) };
}
