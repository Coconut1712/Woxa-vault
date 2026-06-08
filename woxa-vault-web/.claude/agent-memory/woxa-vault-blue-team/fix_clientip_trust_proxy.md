---
name: fix-clientip-trust-proxy
description: clientIp.ts gates ALL forwarding headers (cf-connecting-ip, fly-client-ip, XFF, x-real-ip) behind TRUST_PROXY; guarded by clientIp.test.ts
metadata:
  type: project
---

Rate-limit IP source lives in `woxa-vault-api/src/lib/clientIp.ts` (`getClientIp`). It is the trusted client-IP for rate-limit bucketing and audit `ipHash` (used in auth.ts, items.ts, vaultRekey.ts).

**Fix shipped (2026-06-04):** `cf-connecting-ip` and `fly-client-ip` were trusted UNCONDITIONALLY before the `TRUST_PROXY` gate, so a direct-to-origin attacker could forge them and rotate rate-limit buckets per request (red-team confirmed 12x login attempts, all 401, no 429). Moved both inside the `if (env.TRUST_PROXY)` block alongside x-forwarded-for / x-real-ip. When TRUST_PROXY is off, only the socket peer (`fromSocket`) is used.

**Why:** edge headers only carry meaning when the request genuinely transited a Cloudflare/Fly edge; without a trusted edge in front they are as forgeable as XFF.

**How to apply:** any new forwarding-header source must be gated behind TRUST_PROXY. `env.TRUST_PROXY` defaults to `false`.

**Regression guard:** `src/lib/clientIp.test.ts` — mocks `@/config/env` and flips `env.TRUST_PROXY` per test (read at call time, not module load). Asserts forged headers collapse to one bucket when off, and are honored in precedence order (cf > fly > xff > x-real-ip) when on. This is the pattern for unit-testing env-gated helpers without spinning the app.
