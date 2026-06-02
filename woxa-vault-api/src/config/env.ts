import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Load .env at process startup; safe to call multiple times.
loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().url(),

  // Redis connection for cross-instance rate limiting (DESIGN.md §10 / NFR-012).
  // Optional: when unset the rate limiter falls back to a per-instance in-memory
  // sliding window, so dev/test/CI boot without a Redis dependency.
  // Example: redis://localhost:6379
  REDIS_URL: z.string().url().optional(),

  SESSION_COOKIE_NAME: z.string().default("woxa_session"),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  SESSION_COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  // Trust forwarding headers (X-Forwarded-For / X-Real-IP) from upstream
  // proxies. MUST be `false` (default) unless the deployment terminates TLS
  // behind a proxy chain that strips/normalizes those headers (Cloudflare,
  // Fly.io, an AWS ALB, etc.). When false the API derives the peer IP from
  // the socket address only — this prevents anonymous callers from spoofing
  // their IP and bypassing rate limits. CF-Connecting-IP and Fly-Client-IP
  // are always preferred when present (Cloudflare/Fly inject these and they
  // cannot be set by upstream clients).
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // TODO(KMS): replace with AWS KMS key id in production (DESIGN.md §6).
  LOCAL_KEK_BASE64: z.string().optional(),

  // --- Object storage (attachments) ---
  // Phase A: local filesystem adapter (DESIGN.md §8 R2/S3 deferred to Phase B).
  // Files are encrypted before being written, so a leaked directory still
  // requires LOCAL_KEK_BASE64 to decrypt.
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/attachments"),
  // Per-file ciphertext cap (REQUIREMENTS.md FR-038 = 25 MB).
  ATTACHMENT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
  // Aggregate ciphertext cap per item (sum of attachments.size_bytes). Round
  // 2 picks 100 MB conservatively — DESIGN.md does not pin a value yet.
  ATTACHMENT_ITEM_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * 1024 * 1024),

  // --- Google Workspace SSO ---
  // Empty values are allowed in dev so the API still boots without configured
  // OAuth credentials; the SSO endpoints return a 503 at request time.
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional(),
  // Empty = no domain restriction (dev convenience; backend logs a warn).
  // Otherwise a comma-separated allow-list of workspace domains.
  GOOGLE_OAUTH_ALLOWED_DOMAIN: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    ),
  // Where the backend sends the browser after a successful SSO callback.
  // Default matches the dev frontend. Should be set to https://vault.iux24.com
  // in production.
  WEB_BASE_URL: z.string().default("http://localhost:3000"),

  // --- Outbound email (Resend) ---
  // RESEND_API_KEY may be empty in dev — the mailer falls back to a
  // console.log of the rendered email body so an inviting admin can still
  // copy the link. In production an empty value triggers a startup error
  // (see the post-parse guard below).
  RESEND_API_KEY: z.string().optional(),
  // Verified Resend sender. Must include the friendly name + "<addr>".
  MAIL_FROM: z.string().default("Woxa Vault <noreply@iux24.com>"),

  // --- 2FA challenge token (mfaToken) signing key ---
  // Used to sign the short-lived MFA challenge JWT returned by /auth/login
  // when TOTP is enabled. MUST differ from any session signing material so
  // a leaked mfaToken cannot be repurposed as a session cookie.
  //
  // Bonus-tightening: enforce a hex-64 (i.e. 32 random bytes) shape so the
  // operator can't paste a weak / low-entropy string. The exact placeholder
  // `REPLACE_ME_WITH_HEX_64_CHARS` is left out of the regex on purpose so
  // it parses cleanly in dev (the production guard below refuses it).
  // Generate with: openssl rand -hex 32
  MFA_TOKEN_SECRET: z
    .string()
    .refine(
      (v) => v === "REPLACE_ME_WITH_HEX_64_CHARS" || /^[0-9a-f]{64}$/i.test(v),
      "MFA_TOKEN_SECRET must be 64 hex characters (32 random bytes). Generate with: openssl rand -hex 32",
    )
    .default(
      // Dev-only default — overridden in any non-trivial environment via .env.
      // Production guard below refuses to boot with this exact value.
      "REPLACE_ME_WITH_HEX_64_CHARS",
    ),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("[env] invalid environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Production-only guards:
//   * RESEND_API_KEY missing → refuse to boot. Silent fallback would mean
//     production invitations never reach users.
//   * MFA_TOKEN_SECRET left at the placeholder → refuse to boot. The default
//     value is publicly documented in .env.example and signing real MFA
//     challenges with it would let any attacker forge a post-password gate.
if (parsed.data.NODE_ENV === "production") {
  const fatal: string[] = [];
  if (!parsed.data.RESEND_API_KEY) fatal.push("RESEND_API_KEY is required in production");
  if (parsed.data.MFA_TOKEN_SECRET === "REPLACE_ME_WITH_HEX_64_CHARS") {
    fatal.push("MFA_TOKEN_SECRET must be set to a random value in production");
  }
  // LOCAL_KEK_BASE64 is the root of Phase A envelope encryption — it wraps
  // every per-item DEK, the per-user TOTP secret, and one-time-send content.
  // It is `optional()` in the schema so dev / CI can boot without it, but a
  // production process that starts WITHOUT a valid KEK only fails much later
  // (a lazy throw the first time getKek() runs, e.g. on 2FA enroll), turning a
  // config mistake into a runtime 500. Fail fast at boot instead: require it,
  // confirm it base64-decodes to exactly 32 bytes (AES-256), and reject the
  // documented placeholder.
  const kek = parsed.data.LOCAL_KEK_BASE64;
  if (!kek) {
    fatal.push("LOCAL_KEK_BASE64 is required in production");
  } else if (kek === "REPLACE_ME_WITH_BASE64_32_BYTES") {
    fatal.push("LOCAL_KEK_BASE64 must be set to a random value in production (not the placeholder)");
  } else if (Buffer.from(kek, "base64").length !== 32) {
    fatal.push("LOCAL_KEK_BASE64 must decode to exactly 32 bytes (AES-256). Generate with: openssl rand -base64 32");
  }
  if (fatal.length > 0) {
    // eslint-disable-next-line no-console
    console.error("[env] refusing to boot in production:", fatal.join("; "));
    process.exit(1);
  }
} else if (!parsed.data.RESEND_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "[env] RESEND_API_KEY is not set — outbound email will be logged to the console (dev fallback).",
  );
}

export const env = parsed.data;
export type Env = typeof env;
