---
name: weak-cf-ip-ratelimit
description: Confirmed-exploitable — login/kdf-salt per-IP rate limits evadable via spoofed cf-connecting-ip header (unconditionally trusted)
metadata:
  type: project
---

# Rate-limit evasion via cf-connecting-ip / fly-client-ip (Medium)

**Status:** EXPLOITED 2026-06-04. NOT yet fixed (verify before re-reporting).

`lib/clientIp.ts:getClientIp` honors `cf-connecting-ip` and `fly-client-ip` **unconditionally** (before the `TRUST_PROXY` check), on the rationale that only Cloudflare/Fly edges can set them. But on a deployment NOT behind those edges (or where a client reaches the origin directly), ANY client can forge these headers.

**Why:** all IP-keyed rate limits derive their key from `getClientIp(c)`. Rotating `cf-connecting-ip` per request rotates the bucket key → unlimited budget.

**Proven impact:**
- `login:ip:<ip>` AND `login:<ip>:<email>` both evaded (the per-email login key INCLUDES the ip → spoofing rotates it too). 12/12 unknown-email login probes reached the Argon2 verify with zero 429s.
- Unbounded **user-enumeration** probing on /auth/login and /auth/kdf-salt.
- Known-account brute-force still CAPPED by the durable 5-attempt DB lock (`users.failed_login_count` → `locked_until`) — that backstop is per-account and header-independent, so credential brute-force on a real account is bounded.

**NOT evadable this way:** `pwreset:email:${email}` (recovery reset) is keyed on email only, no IP → spoofing doesn't help there (only 3 of 9 got through, email cap held).

**How to apply / hand-off to blue team:** gate the cf/fly header trust behind an explicit allowlist or `TRUST_PROXY`/`TRUSTED_EDGE` flag (same pattern already used for X-Forwarded-For), OR add a per-account/per-email rate key that never includes the IP for login + kdf-salt. CWE-290 (auth bypass by spoofing), OWASP API4:2023.
