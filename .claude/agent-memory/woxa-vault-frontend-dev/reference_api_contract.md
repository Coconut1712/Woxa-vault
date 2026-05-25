---
name: reference-api-contract
description: Pointer to the shared API contract document used by both frontend and backend agents
metadata:
  type: reference
---

`/Users/woxa/Projects/Woxa-vault/API_CONTRACT.md` is the agreed contract between `woxa-vault-web` and `woxa-vault-api`. Edit there first before changing client or server shapes.

Round-1 endpoints (auth-only): `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /health`.
Round-2 endpoints (finalized 2026-05-18, backend implementing): Google SSO (`GET /auth/sso/google/{start,callback}`), Vaults (`/vaults`, `/vaults/:id` GET/POST/PATCH/DELETE), Items (`/vaults/:vaultId/items`, `/items/:id` GET/PATCH/DELETE).

Error envelope: `{ error: { code, message } }`. Known codes: `invalid_credentials`, `unauthorized`, `rate_limited`, `validation_error`, `internal_error`, `forbidden`, `not_found`, `vault_not_empty`. SSO uses redirect-only codes (`sso_state_mismatch`, `sso_domain_forbidden`, `sso_email_unverified`, `sso_provider_error`, `sso_internal_error`) delivered via `?error=` on the landing URL.

User / vault / item shapes are documented in the file itself — frontend types live in `src/lib/api/types.ts` and mirror them exactly.

Sends / audit / members / workspace endpoints remain pending; those pages stay on `src/lib/mock/data.ts`.
