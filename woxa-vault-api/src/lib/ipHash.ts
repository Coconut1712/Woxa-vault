import { createHmac } from "node:crypto";
import { env } from "@/config/env";

// Hash IP for audit log so we can correlate without storing raw IP
// (DESIGN.md §7.5 — `ip_hash BYTEA NOT NULL`).
// Key derived from LOCAL_KEK_BASE64 so rotating it crypto-shreds prior hashes.
const HMAC_KEY = Buffer.from(env.LOCAL_KEK_BASE64 ?? "woxa-dev-fallback-key", "base64");

export function hashIp(ip: string): string {
  return createHmac("sha256", HMAC_KEY).update(ip).digest("hex");
}
