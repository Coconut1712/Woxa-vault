# Red-Team Memory — Woxa Secret Vault

- [Stack + fixture setup](stack_and_fixtures.md) — ports, how to mint sessions by seeding DB rows (sha256(token)=session id), fast 2-tenant cross-tenant fixtures
- [Controls that held](controls_that_held.md) — defenses verified strong across rounds (re-test, don't re-discover): IDOR, active_org re-validation, RBAC, ZK DB-leak, audit, rate-limit fix
- [Known weak / by-design gaps](weak_and_bydesign.md) — delete gate is frontend-only; ZK accepts unvalidated ciphertext (by design); LOCAL_KEK scope
- [Where the checks live](check_locations.md) — file:line of ownership/RBAC/active-org/rate-limit/ZK seams for fast targeting
