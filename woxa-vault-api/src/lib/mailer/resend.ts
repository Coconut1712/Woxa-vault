import { Resend } from "resend";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Resend-backed outbound email — Phase A focus is invite delivery so admins
// don't have to copy/paste an acceptUrl from the API response.
//
// Threat model (mail layer):
//   Asset: the invite acceptUrl. Anyone with this URL can claim the
//     pre-provisioned `org_members` row for the invited email (the accept
//     handler still re-checks that the session email matches the invitation
//     email, but the URL alone lets an attacker enumerate which orgs invited
//     a given recipient).
//   Adversaries:
//     * Logs reader / observability backend: anyone with read access to Loki
//       or Sentry. Defended by NEVER logging the acceptUrl or token from this
//       module. We log `to: redactedEmail + invitationId` only.
//     * Resend webhook receiver: out of scope here — Resend stores the email
//       body. We accept this risk: the recipient's mailbox provider holds the
//       same content. The acceptUrl is single-recipient by design.
//     * HTML injection in template (inviter spoofs an "Accept" CTA pointing
//       at attacker.com): defended by escaping every dynamic field before it
//       lands in the HTML string. Plaintext fallback escapes nothing because
//       it doesn't render markup.
//   Residual risk:
//     * If Resend's transport fails AND we are in dev fallback mode, we DO
//       console.log the acceptUrl — that's the whole point of the fallback.
//       Production is gated on RESEND_API_KEY at startup (env.ts) so the
//       fallback can never run in prod.
// ---------------------------------------------------------------------------

let cached: Resend | null = null;
function getClient(): Resend | null {
  if (cached) return cached;
  if (!env.RESEND_API_KEY) return null;
  cached = new Resend(env.RESEND_API_KEY);
  return cached;
}

// `a***@example.com` — preserves the domain (useful for ops debugging which
// tenant an invite went to) while masking the local part. Single-char local
// parts still expose that one char (it's already public in the address) so
// the redaction shape stays consistent. Falls back to a fully-masked address
// if the input doesn't look like an email at all.
export function redactEmail(addr: string): string {
  const at = addr.indexOf("@");
  if (at <= 0 || at === addr.length - 1) return "***";
  const local = addr.slice(0, at);
  const domain = addr.slice(at + 1);
  return `${local[0] ?? ""}***@${domain}`;
}

// RFC 5322-ish — defense-in-depth check. Zod has already validated the body
// at the route layer; this is a belt for the Resend call so a bug elsewhere
// can't push a garbage `to` into the transport.
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(addr: string): boolean {
  return typeof addr === "string" && addr.length <= 254 && EMAIL_RX.test(addr);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// F-07: subject-line sanitizer. Strip ASCII control bytes (\x00-\x1F and DEL
// \x7F) so a hostile inviter or org name can't inject CR/LF into the SMTP
// Subject header — RFC 5322 folding rules would otherwise let an attacker
// append arbitrary headers (e.g. a fake `Bcc:`). We also cap each component
// to keep the assembled subject within typical MUA display widths and
// prevent a 4 KB org name from blowing past Resend's header limits.
function sanitizeForSubject(input: string, maxLen = 60): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x1F\x7F]/g, "").slice(0, maxLen);
}

export interface InviteEmailInput {
  to: string;
  inviterName: string;
  orgName: string;
  acceptUrl: string;
  expiresAt: Date;
  role: string;
  invitationId: string;
}

export interface InviteEmailResult {
  sent: boolean;
  // Stable string so callers can put it into the API response without
  // leaking transport internals.
  errorCode?: "transport_failed" | "invalid_recipient" | "not_configured";
}

function renderHtml(input: InviteEmailInput): string {
  const inviter = escapeHtml(input.inviterName);
  const org = escapeHtml(input.orgName);
  const role = escapeHtml(input.role);
  const url = escapeHtml(input.acceptUrl);
  const expires = escapeHtml(input.expiresAt.toUTCString());
  // Single-purpose transactional template. No tracking pixels, no embedded
  // images. The CTA href is the only link we render; the plaintext fallback
  // duplicates it below for clients that strip the button.
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f6fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr><td style="font-size:20px;font-weight:600;color:#0f172a;padding-bottom:8px;">Woxa Vault</td></tr>
            <tr><td style="font-size:16px;line-height:24px;color:#334155;padding-top:8px;">
              <p style="margin:0 0 16px 0;">Hi,</p>
              <p style="margin:0 0 16px 0;">
                <strong>${inviter}</strong> invited you to join the
                <strong>${org}</strong> workspace on Woxa Vault as a <strong>${role}</strong>.
              </p>
              <p style="margin:0 0 24px 0;">
                Click the button below to accept the invitation and set up your account.
              </p>
              <p style="margin:0 0 24px 0;text-align:center;">
                <a href="${url}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">
                  Accept invitation
                </a>
              </p>
              <p style="margin:0 0 8px 0;font-size:14px;color:#64748b;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px 0;font-size:13px;word-break:break-all;color:#475569;">
                ${url}
              </p>
              <p style="margin:0 0 16px 0;font-size:13px;color:#64748b;">
                This invitation expires on <strong>${expires}</strong>.
              </p>
            </td></tr>
            <tr><td style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#94a3b8;">
              If you didn't expect this email, you can safely ignore it.
              No account will be created until you click the link above.
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText(input: InviteEmailInput): string {
  // Plaintext mirrors the HTML structure. No escaping needed — text renderers
  // don't interpret markup. We DO keep the URL on its own line so MUA
  // link-detection picks it up cleanly.
  return [
    "Woxa Vault",
    "",
    `Hi,`,
    "",
    `${input.inviterName} invited you to join the ${input.orgName} workspace on Woxa Vault as a ${input.role}.`,
    "",
    "Accept the invitation:",
    input.acceptUrl,
    "",
    `This invitation expires on ${input.expiresAt.toUTCString()}.`,
    "",
    "If you didn't expect this email, you can safely ignore it.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 2FA security alert (DESIGN.md §20 "login alerts" / session-thief residual).
//
// Sent best-effort AFTER the enable/disable transaction commits. This is a
// detective control: a session-thief who manages to flip a victim's 2FA gets
// surfaced to the real account owner out-of-band (their mailbox) even if the
// in-app session was hijacked. The mail carries NO secret material — no TOTP
// secret, no backup codes, no session token. Only: which change happened, a
// coarse `ipHash` prefix for the user to recognize/deny, and when. Failure to
// send must never roll back or fail the 2FA change itself (caller wraps in
// try/catch and ignores the result).
// ---------------------------------------------------------------------------
export interface TwoFactorChangedInput {
  to: string;
  action: "enabled" | "disabled";
  // Hashed client IP (never the raw IP). We render only a short prefix so the
  // user gets a weak "was this me?" signal without us shipping a reversible
  // locator. Optional — null when the request had no derivable peer IP.
  ipHash: string | null;
  at: Date;
}

function renderTwoFactorChangedHtml(input: TwoFactorChangedInput): string {
  const verb = input.action === "enabled" ? "enabled" : "disabled";
  const when = escapeHtml(input.at.toUTCString());
  // Only a short, non-reversible prefix of the already-hashed IP.
  const ipFragment = input.ipHash ? escapeHtml(input.ipHash.slice(0, 12)) : "unknown";
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f6fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr><td style="font-size:20px;font-weight:600;color:#0f172a;padding-bottom:8px;">Woxa Vault</td></tr>
            <tr><td style="font-size:16px;line-height:24px;color:#334155;padding-top:8px;">
              <p style="margin:0 0 16px 0;">Hi,</p>
              <p style="margin:0 0 16px 0;">
                Two-factor authentication was <strong>${verb}</strong> on your Woxa Vault account.
              </p>
              <p style="margin:0 0 16px 0;font-size:14px;color:#64748b;">
                When: <strong>${when}</strong><br/>
                Request fingerprint: <code>${ipFragment}</code>
              </p>
              <p style="margin:0 0 16px 0;color:#b91c1c;">
                If this wasn't you, change your master password immediately and contact your workspace administrator.
              </p>
            </td></tr>
            <tr><td style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#94a3b8;">
              This is an automated security alert. We never include codes or secrets in these messages.
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderTwoFactorChangedText(input: TwoFactorChangedInput): string {
  const verb = input.action === "enabled" ? "enabled" : "disabled";
  const ipFragment = input.ipHash ? input.ipHash.slice(0, 12) : "unknown";
  return [
    "Woxa Vault — security alert",
    "",
    `Two-factor authentication was ${verb} on your Woxa Vault account.`,
    "",
    `When: ${input.at.toUTCString()}`,
    `Request fingerprint: ${ipFragment}`,
    "",
    "If this wasn't you, change your master password immediately and contact your workspace administrator.",
    "",
    "This is an automated security alert. We never include codes or secrets in these messages.",
  ].join("\n");
}

export async function sendTwoFactorChangedEmail(
  input: TwoFactorChangedInput,
): Promise<InviteEmailResult> {
  const redactedTo = redactEmail(input.to);
  const baseLog = { to: redactedTo, action: input.action };

  if (!isValidEmail(input.to)) {
    logger.warn(baseLog, "[mailer] invalid recipient address — skipping 2FA alert");
    return { sent: false, errorCode: "invalid_recipient" };
  }

  const subject = `Two-factor authentication ${input.action} on your Woxa Vault account`;
  const html = renderTwoFactorChangedHtml(input);
  const text = renderTwoFactorChangedText(input);
  const client = getClient();

  if (!client) {
    logger.warn(baseLog, "[mailer] RESEND_API_KEY not configured — 2FA alert not sent (dev)");
    return { sent: false, errorCode: "not_configured" };
  }

  try {
    const result = await client.emails.send({
      from: env.MAIL_FROM,
      to: input.to,
      subject,
      html,
      text,
    });
    if (result.error) {
      logger.error({ ...baseLog, errorName: result.error.name }, "[mailer] Resend rejected 2FA alert");
      return { sent: false, errorCode: "transport_failed" };
    }
    logger.info(baseLog, "[mailer] 2FA alert sent");
    return { sent: true };
  } catch (err) {
    logger.error({ ...baseLog, err }, "[mailer] Resend transport threw (2FA alert)");
    return { sent: false, errorCode: "transport_failed" };
  }
}

export async function sendInviteEmail(input: InviteEmailInput): Promise<InviteEmailResult> {
  const redactedTo = redactEmail(input.to);
  const baseLog = { to: redactedTo, invitationId: input.invitationId };

  if (!isValidEmail(input.to)) {
    logger.warn(baseLog, "[mailer] invalid recipient address — skipping send");
    return { sent: false, errorCode: "invalid_recipient" };
  }

  const subject = `${sanitizeForSubject(input.inviterName)} invited you to ${sanitizeForSubject(input.orgName)} on Woxa Vault`;
  const html = renderHtml(input);
  const text = renderText(input);
  const client = getClient();

  if (!client) {
    // Dev fallback: stamp the rendered text body to stdout so a developer can
    // copy the link. DO NOT log the acceptUrl as a structured field — we
    // print the entire body as a `console` line which keeps it out of the
    // pino redact-able JSON pipeline.
    logger.warn(baseLog, "[mailer] RESEND_API_KEY not configured — printing email to console (dev only)");
    // eslint-disable-next-line no-console
    console.log("===== Woxa Vault (DEV) invite email =====");
    // eslint-disable-next-line no-console
    console.log(`To: ${input.to}`);
    // eslint-disable-next-line no-console
    console.log(`Subject: ${subject}`);
    // eslint-disable-next-line no-console
    console.log(text);
    // eslint-disable-next-line no-console
    console.log("==========================================");
    return { sent: false, errorCode: "not_configured" };
  }

  try {
    const result = await client.emails.send({
      from: env.MAIL_FROM,
      to: input.to,
      subject,
      html,
      text,
    });
    if (result.error) {
      logger.error(
        { ...baseLog, errorName: result.error.name },
        "[mailer] Resend rejected invite email",
      );
      return { sent: false, errorCode: "transport_failed" };
    }
    logger.info(baseLog, "[mailer] invite email sent");
    return { sent: true };
  } catch (err) {
    logger.error({ ...baseLog, err }, "[mailer] Resend transport threw");
    return { sent: false, errorCode: "transport_failed" };
  }
}
