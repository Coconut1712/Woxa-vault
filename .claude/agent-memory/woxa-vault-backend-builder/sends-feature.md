---
name: sends-feature
description: One-time send feature decisions and AC mapping — server-side envelope encryption (Phase A), burn-guard heuristic, list endpoint cannot rebuild share URL
metadata:
  type: project
---

One-time send (DESIGN.md §6.3 + §7.4, REQUIREMENTS Epic 4) is implemented as **server-side envelope encryption** in Phase A — NOT the zero-knowledge fragment-key flow yet.

**Why:** The fully zero-knowledge variant (URL fragment carries random key, server cannot decrypt) requires the web client to encrypt before POST. Frontend is still mock-data; coordinating that flip-over is deferred. Tracked as "Pending / future rounds" in API_CONTRACT.md.

**How to apply:**
- DB stores `content_ciphertext + iv + wrapped_dek` (same envelope pattern as `items`). `LOCAL_KEK_BASE64` env wraps the per-send DEK.
- Raw token is **not** stored — only `token_hash = SHA-256(token)`. Consequence: `GET /sends` (list) returns `tokenHashPreview` (12 hex chars) as a display ID; it cannot rebuild a working share URL. The share URL must be captured at the `POST /sends` response time. Frontend list page accordingly should NOT pretend it has a copy-link button.
- AC-032.4 burn-guard lives in [[sends-feature]] reveal handler: any reveal within 1s of creation and with `viewCount === 0` returns `425 send_not_ready` and does NOT increment view_count. Bot/link-preview protection. Audit row `send.reveal_deferred` is emitted (`success: false`).
- Atomic burn lives in a single `UPDATE ... WHERE view_count < max_views AND burned_at IS NULL AND expires_at > now() RETURNING *`. The `CASE WHEN view_count+1 >= max_views THEN now() ELSE NULL END` expression sets `burned_at` in the same round-trip. If RETURNING is empty, the caller lost the race — respond `410 send_burned`.

**AC mapping:**
- AC-030 (create) → `POST /sends`
- AC-031 (recipient view) → `GET /s/:token` preview + `POST /s/:token/reveal`
- AC-031.5 (strip fragment) → frontend `history.replaceState` (already done)
- AC-032.4 (burn-guard) → 425 `send_not_ready`
- AC-033.1 (manage sends) → `GET /sends`
- AC-033.3 (burn now) → `DELETE /sends/:id`

**Open follow-ups for Phase B/C:**
- Zero-knowledge flip — client encrypts, server-side `content_ciphertext/iv/dek` columns become opaque (key in URL fragment never reaches the server). Will need a request-body shape change but the table can stay.
- Recipient email lock (`recipient_email_hash` HMAC) — schema field exists in DESIGN.md but not yet in the table.
- Source-item linkage (`source_item_id`) — schema field in DESIGN.md but not yet in the table; needed for "sent one-time copy of <item>" audit linkage.
