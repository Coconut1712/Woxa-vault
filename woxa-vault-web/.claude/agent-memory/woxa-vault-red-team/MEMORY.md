# Woxa Vault — Red Team Memory

- [Local stack + fixture setup](setup_local_stack.md) — ports, how to bring up + provision 2 users/2 orgs/items via API for cross-tenant tests
- [Controls that held](controls_that_held.md) — defenses re-confirmed BLOCKED (re-test, don't re-discover)
- [Confirmed-weak: cf-connecting-ip rate-limit evasion](weak_cf_ip_ratelimit.md) — login per-IP limit evadable via spoofed cf-connecting-ip header
- [Where the key checks live](attack_surface_map.md) — pointers to ownership/IDOR/active_org/rate-limit/send-burn logic
