import { env } from "@/config/env";

// ---------------------------------------------------------------------------
// Resolve the caller's IP from forwarding headers.
//
// Threat model:
//   Asset: ability to apply IP-based rate limits and audit IP fingerprints.
//   Adversary: anonymous attacker controlling the `X-Forwarded-For` header.
//   Mitigation: do NOT trust `X-Forwarded-For` / `X-Real-IP` unless the
//     deployment explicitly opted in via `TRUST_PROXY=true`. When trust is
//     not granted, fall back to the connecting peer's socket address so an
//     attacker cannot rotate IPs simply by setting a header. The Cloudflare
//     (`cf-connecting-ip`) and Fly.io (`fly-client-ip`) headers carry meaning
//     ONLY when the request genuinely transited that edge. When the origin is
//     reachable directly (no trusted edge in front), an attacker can forge
//     them just like `X-Forwarded-For`, rotating their rate-limit bucket at
//     will. They are therefore gated behind `TRUST_PROXY` alongside XFF — the
//     operator asserts a trusted edge sets them on the last hop.
//
// Residual risk:
//   * "unknown" fallback when no socket info is available — callers must NOT
//     treat the literal string as a usable IP for anything other than
//     rate-limit bucketing.
//   * In multi-process deployments, the in-memory rate limiter is process-
//     local (DESIGN.md §10 calls out the Redis migration as Phase B). The IP
//     fix above doesn't help that — it just prevents a single attacker from
//     fanning their own counter to 2^32 buckets.
// ---------------------------------------------------------------------------

interface IpRequestCtx {
  req: { header: (k: string) => string | undefined };
  // hono/node-server populates this with `{ incoming: IncomingMessage, ... }`.
  // We type it loosely to keep this helper usable from Workers/Vercel where
  // the binding shape differs.
  env?: unknown;
}

function firstNonEmpty(header: string | undefined): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  return first || null;
}

function fromSocket(c: IpRequestCtx): string | null {
  const bindings = c.env as { incoming?: { socket?: { remoteAddress?: string | null } } } | undefined;
  const remote = bindings?.incoming?.socket?.remoteAddress;
  if (remote && typeof remote === "string" && remote.length > 0) return remote;
  return null;
}

export function getClientIp(c: IpRequestCtx): string {
  if (env.TRUST_PROXY) {
    // Only honor forwarding headers when the operator has explicitly told us
    // we're behind a trusted edge/proxy chain. Without that assertion every
    // one of these can be forged by a client reaching the origin directly,
    // letting an attacker rotate their rate-limit bucket per request.
    //
    // Cloudflare and Fly each terminate the connection at their edge and set
    // their own header naming the original peer; prefer those first.
    const cf = firstNonEmpty(c.req.header("cf-connecting-ip"));
    if (cf) return cf;

    const fly = firstNonEmpty(c.req.header("fly-client-ip"));
    if (fly) return fly;

    const xff = firstNonEmpty(c.req.header("x-forwarded-for"));
    if (xff) return xff;
    const xri = firstNonEmpty(c.req.header("x-real-ip"));
    if (xri) return xri;
  }

  // Fall through to the actual socket address; falls back to "unknown" only
  // when neither the proxy nor the socket reveals an IP.
  return fromSocket(c) ?? "unknown";
}
