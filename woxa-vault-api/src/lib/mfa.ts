import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { authenticator } from "otplib";
import { HashAlgorithms } from "@otplib/core";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import { hash, verify, type Algorithm } from "@node-rs/argon2";
import { env } from "@/config/env";

// ---------------------------------------------------------------------------
// MFA (TOTP + backup codes + challenge tokens) — Phase A.
//
// Threat model:
//   Assets:
//     * `users.totp_secret_encrypted` — long-lived TOTP secret. Anyone who
//       reads it can generate valid 6-digit codes for the user.
//     * `user_mfa_backup_codes.code_hash` — 10 single-use bypasses.
//     * `mfaToken` JWT — 5-minute proof-of-password that lets the holder
//       complete the second factor and acquire a real session.
//   Adversaries:
//     * DB-only read (backup leak): TOTP secret is envelope-encrypted under
//       LOCAL_KEK_BASE64. Backup codes are Argon2id-hashed. Both are useless
//       without the env-borne KEK.
//     * Session-thief: cannot ENABLE / DISABLE 2FA without supplying the
//       master password again (the disable/regen routes re-verify).
//     * mfaToken forger: needs the MFA_TOKEN_SECRET. Refusing to boot in
//       production with the dummy default (env.ts guard) closes the obvious
//       deployment footgun.
//   Mitigations:
//     * AES-256-GCM envelope encryption (same construction as itemCrypto)
//       for the TOTP secret. Per-secret IV; auth tag detects tampering.
//     * Argon2id at the same cost as master password (`hashPassword`) for
//       backup codes; verify is a real Argon2 call so timing leaks remain
//       in the 200ms class.
//     * HMAC-SHA-256 over a base64url-encoded JSON header.payload for the
//       mfaToken. We do NOT use a generic JWT library to keep the
//       attack surface minimal — only `HS256`-compatible verification with
//       constant-time tag compare and explicit purpose+exp checks.
//   Residual risk:
//     * mfaToken is not bound to the IP / user-agent that supplied the
//       password. A man-in-the-middle who steals both the cookie chain and
//       the response body in transit could finish the login from another
//       host. TLS terminates this risk; we don't add bind-to-IP because of
//       NAT churn.
//     * In Phase A the secret encryption uses LOCAL_KEK_BASE64. In Phase B
//       this swaps to AWS KMS — the public API of this module does not
//       change.
// ---------------------------------------------------------------------------

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;

let cachedKek: Buffer | null = null;
function getKek(): Buffer {
  if (cachedKek) return cachedKek;
  const raw = env.LOCAL_KEK_BASE64;
  if (!raw || raw === "REPLACE_ME_WITH_BASE64_32_BYTES") {
    throw new Error(
      "LOCAL_KEK_BASE64 is not configured. Generate one with `openssl rand -base64 32` and add it to .env.",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LEN) {
    throw new Error(`LOCAL_KEK_BASE64 must decode to ${KEY_LEN} bytes (got ${buf.length}).`);
  }
  cachedKek = buf;
  return buf;
}

// Encrypt-then-pack: `iv || ciphertext || authTag`, base64-encoded. Single
// column on `users` keeps the schema unchanged from the original Phase A
// design (a separate `totp_secret_iv` would have required another migration).
function packEncryption(iv: Buffer, ciphertext: Buffer, tag: Buffer): string {
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

function unpackEncryption(b64: string): { iv: Buffer; ciphertext: Buffer; tag: Buffer } {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < IV_LEN + 16 + 1) {
    throw new Error("encrypted TOTP secret is too short to be valid");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(IV_LEN, buf.length - 16);
  return { iv, ciphertext, tag };
}

// Encrypt a per-user secret (any string) under LOCAL_KEK. The resulting
// base64 blob is opaque and stored as-is in the user row. Same envelope
// algorithm (AES-256-GCM) as itemCrypto — we use the KEK directly because the
// TOTP secret is per-user, not per-item, so an additional DEK would add no
// real isolation.
export function encryptUserSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKek(), iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return packEncryption(iv, enc, tag);
}

export function decryptUserSecret(b64: string): string {
  const { iv, ciphertext, tag } = unpackEncryption(b64);
  const decipher = createDecipheriv(ALGO, getKek(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238) wrappers
// ---------------------------------------------------------------------------

// Window of 1 = ±1 step (30 s) of clock skew tolerance. Matches the
// REQUIREMENTS US-003 spec.
authenticator.options = {
  window: 1,
  step: 30,
  digits: 6,
  algorithm: HashAlgorithms.SHA1,
};

// 20 bytes of cryptographic randomness → 32-char base32 (no padding). Matches
// the Google Authenticator / 1Password expected key size.
export function generateTotpSecret(): string {
  return encodeBase32LowerCaseNoPadding(randomBytes(20)).toUpperCase();
}

export function buildOtpauthUri(secret: string, userEmail: string): string {
  const issuer = "Woxa Vault";
  const label = `${issuer}:${userEmail}`;
  // Build manually so we control exactly which params land in the URI.
  // Spec: otpauth://totp/<label>?secret=<base32>&issuer=<issuer>&algorithm=SHA1&digits=6&period=30
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

// RFC 6238 §5.2 replay protection: the verifier MUST NOT accept the same OTP a
// second time. `verifyTotpCode` alone is stateless (any code valid in the
// current ±window passes repeatedly for ~60-90 s), so callers that mint
// auth state (session / disable / regenerate) MUST persist the consumed step
// and refuse a step that is <= the last accepted one. This helper returns the
// ABSOLUTE time-step the code matched (so the caller can do a monotonic
// compare-and-set against `users.last_totp_step`), or null when the code is
// invalid. We derive the step from otplib's signed delta:
//   step = floor(now / period) + delta
// `checkDelta` returns 0 for the current step, ±1..±window for skew, or null.
export function checkTotpStep(secret: string, code: string): number | null {
  const trimmed = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) return null;
  try {
    const delta = authenticator.checkDelta(trimmed, secret);
    if (delta === null) return null;
    const period = authenticator.options.step ?? 30;
    return Math.floor(Date.now() / 1000 / period) + delta;
  } catch {
    return null;
  }
}

// Boolean convenience wrapper kept for call sites that only need a yes/no
// answer and do their replay bookkeeping elsewhere (e.g. the "does this look
// like a TOTP vs a backup code?" branch in /disable). Built on checkTotpStep
// so both share one verification path.
export function verifyTotpCode(secret: string, code: string): boolean {
  return checkTotpStep(secret, code) !== null;
}

// ---------------------------------------------------------------------------
// Backup codes
// ---------------------------------------------------------------------------

// F-05: 50 bits of entropy from 7 random bytes (56 bits) → 10 base32 chars
// (RFC 4648 alphabet), grouped as "XXXXX-XXXXX" for readability. We take the
// top 50 bits of the 56-bit pool and discard the remaining 6 — no padding
// character "X" hack is required, and the printed code length is fixed.
// 50 bits ≈ 1.13e15 combinations; combined with the Argon2id verify cost and
// the 10/min/IP+user limit on /auth/2fa/verify-login, online brute-force is
// not viable. We keep the encoded character set restricted to the RFC 4648
// alphabet so neither padding (`=`) nor lowercase/uppercase normalization can
// drift between generation and verification.
const BACKUP_CODE_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function generateBackupCode(): string {
  const bytes = randomBytes(7); // 56 bits, we use the top 50
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  // Walk 10 characters of 5 bits each, starting at the high end of the 50-bit
  // window (bits 49..45, then 44..40, …, 4..0). Discarding the low 6 bits of
  // the random pool is intentional — it keeps every emitted character a pure
  // 5-bit slice of cryptographic randomness.
  for (let i = 0; i < 10; i++) {
    const shift = BigInt((9 - i) * 5);
    const idx = Number((bits >> shift) & 31n);
    out += BACKUP_CODE_BASE32[idx];
  }
  return `${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

export function normalizeBackupCode(input: string): string {
  return input.replace(/[\s-]+/g, "").toUpperCase();
}

// Match argon2 params with master-password hash (lib/password.ts) — same
// security level for all secrets that gate auth. `algorithm` is pinned to
// Argon2id explicitly so a future @node-rs/argon2 default change can't silently
// downgrade backup-code hashing to Argon2i/Argon2d (which weaken the
// side-channel / GPU-resistance balance OWASP recommends for password-class
// secrets).
const ARGON_OPTS = {
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
  // Argon2id (Algorithm.Argon2id === 2). `Algorithm` is an ambient const enum
  // that `isolatedModules` forbids dereferencing at runtime, so we pin the
  // numeric value and `satisfies` it against the enum type for safety.
  algorithm: 2 satisfies Algorithm,
} as const;

export async function hashBackupCode(plain: string): Promise<string> {
  return hash(normalizeBackupCode(plain), ARGON_OPTS);
}

export async function verifyBackupCode(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, normalizeBackupCode(plain), ARGON_OPTS);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// MFA challenge token (mfaToken) — HS256-ish HMAC, NOT a full JWT
// ---------------------------------------------------------------------------

interface MfaTokenPayload {
  sub: string; // user id
  purpose: "mfa_challenge";
  iat: number; // unix seconds
  exp: number; // unix seconds
  // base64url, random 8 bytes. Purely a uniqueness/entropy salt so two tokens
  // minted in the same second for the same user are not byte-identical. NOTE:
  // the verifier does NOT track or consume nonces, so this does NOT by itself
  // prevent token replay within the 5-minute TTL — token single-use is not
  // enforced here. Replay of the second factor it gates is closed downstream:
  // the TOTP `last_totp_step` CAS (see verifyTotpCode/checkTotpStep) and the
  // backup-code single-use `used_at` marker each reject a re-submitted code.
  nonce: string;
}

const TOKEN_TTL_SECONDS = 5 * 60;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

// F-04: SHA-256-normalize the configured secret into a fixed 32-byte HMAC key.
// The HMAC primitive accepts any-length material, but using the raw utf8 bytes
// of the env value meant the effective key entropy depended on whatever string
// the operator pasted in. Normalizing to a 32-byte digest:
//   * keeps the HMAC key at exactly the block size (HMAC-SHA-256: 64 B block,
//     32 B key fits inside without an inner hash pre-pass — fewer surprises);
//   * lets the production-time guard in env.ts mandate a hex-64 input shape
//     while older deployments with arbitrary strings still verify pre-rotation.
// In-process cache: the env value never changes during the lifetime of the
// process, so we hash once and reuse the buffer. Existing in-flight mfaTokens
// signed under the previous code path will fail verification — acceptable
// given the 5-minute TTL on those tokens.
let cachedMfaSecret: Buffer | null = null;
function getMfaSecret(): Buffer {
  if (cachedMfaSecret) return cachedMfaSecret;
  cachedMfaSecret = createHash("sha256").update(env.MFA_TOKEN_SECRET, "utf8").digest();
  return cachedMfaSecret;
}

export function signMfaToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: MfaTokenPayload = {
    sub: userId,
    purpose: "mfa_challenge",
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    nonce: b64url(randomBytes(8)),
  };
  const header = { alg: "HS256", typ: "MFA" };
  const headerPart = b64url(Buffer.from(JSON.stringify(header), "utf8"));
  const payloadPart = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const tag = createHmac("sha256", getMfaSecret())
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  return `${headerPart}.${payloadPart}.${b64url(tag)}`;
}

export interface VerifiedMfaToken {
  userId: string;
  expiresAt: number; // unix seconds
}

export function verifyMfaToken(token: string): VerifiedMfaToken | null {
  if (typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, sigPart] = parts;
  if (!headerPart || !payloadPart || !sigPart) return null;

  const expected = createHmac("sha256", getMfaSecret())
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  let actual: Buffer;
  try {
    actual = b64urlDecode(sigPart);
  } catch {
    return null;
  }
  if (actual.length !== expected.length) return null;
  if (!timingSafeEqual(actual, expected)) return null;

  let payload: MfaTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadPart).toString("utf8"));
  } catch {
    return null;
  }
  if (payload.purpose !== "mfa_challenge") return null;
  if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;

  return { userId: payload.sub, expiresAt: payload.exp };
}

// ---------------------------------------------------------------------------
// mfaToken transport cookie (SSO 2FA handoff)
// ---------------------------------------------------------------------------
// The password login flow returns the mfaToken in the JSON body — the SPA holds
// it in memory and POSTs it back to /auth/2fa/verify-login. The SSO callback is
// a top-level browser navigation (302), so there is no JSON body the frontend
// can read. We therefore stash the SAME mfaToken in a short-lived HttpOnly
// cookie and redirect to the standalone /login/mfa challenge page.
//
// Threat model (delta vs. body transport):
//   Asset: the 5-minute mfaToken (proof-of-first-factor for SSO).
//   Why a cookie and not the URL: putting the token in the redirect query would
//     leak it via browser history, the Referer header on the next navigation,
//     and any access/proxy log on the web origin. A cookie is invisible to all
//     three. HttpOnly also keeps it out of reach of page JS (XSS can't read it),
//     which is acceptable because /login/mfa never needs to read the token in
//     JS — it just POSTs `code`; the browser re-attaches the cookie.
//   Binding: the token itself is HMAC-bound to user.id with a 5-min exp, so the
//     cookie wrapper adds no trust — verify-login still fully validates it.
//   Scope: Path=/ so the cookie is sent on the /auth/2fa/verify-login POST.
//     SameSite=Lax so it survives the top-level GET redirect from Google but is
//     NOT auto-sent on cross-site sub-requests. Max-Age == token TTL so a stale
//     cookie self-expires in lock-step with the token it carries.
//   Residual risk: same as body transport — a network MITM with TLS broken
//     could capture either; TLS terminates this. The cookie does NOT replace
//     the second factor: holding it still requires producing a valid OTP.
export const MFA_PENDING_COOKIE = "mfa_pending";
export const MFA_PENDING_COOKIE_MAX_AGE = TOKEN_TTL_SECONDS; // 300s, == token exp

export function buildMfaPendingCookie(token: string, secure: boolean): string {
  const attrs = [
    `${MFA_PENDING_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MFA_PENDING_COOKIE_MAX_AGE}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildClearMfaPendingCookie(secure: boolean): string {
  const attrs = [
    `${MFA_PENDING_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
