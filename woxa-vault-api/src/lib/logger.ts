import pino from "pino";
import { env } from "@/config/env";

// pino redact list — DESIGN.md §6: never log secrets, DEKs, master passwords,
// recovery phrases, or session tokens. Expand as new sensitive fields appear.
// CRITICAL-6: keep this list in sync with every plaintext one-time secret the
// API ever returns or accepts. If a reverse-proxy turns on body capture, this
// list is the last line of defense against credentials hitting Loki/Sentry.
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.master_password',
  'req.body.recoveryCode',
  'req.body.recovery_code',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.master_password',
  '*.master_auth_hash',
  '*.dek',
  '*.dek_plaintext',
  '*.recovery_phrase',
  '*.recoveryCode',
  '*.recovery_code',
  '*.session_token',
  '*.sessionToken',
  '*.refresh_token',
  '*.refreshToken',
  '*.invitationToken',
  '*.invitation_token',
  '*.token',
  // MFA / 2FA secrets — TOTP plaintext, backup-code plaintext, the mfaToken
  // JWT, and the qr data-URL (contains the embedded secret).
  '*.mfaToken',
  '*.totpSecret',
  '*.totp_secret',
  '*.secret',
  '*.backupCodes',
  '*.backup_codes',
  '*.otpauthUri',
  '*.qrDataUrl',
  '*.acceptUrl',
  '*.accept_url',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  base: { service: "woxa-vault-api" },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});
