/**
 * Structured payload for one-time sends.
 *
 * ## Why this exists
 *
 * The backend `POST /sends` accepts a single opaque `content: string`. The
 * frontend, however, wants to render a per-field reveal page (icon, label,
 * value, per-field copy) instead of a single blob. To stay within the
 * existing wire contract we JSON-encode the structured payload here and
 * decode it on the recipient page.
 *
 * Older sends — and sends created outside the UI (e.g. via the API
 * directly) — won't parse as JSON. The reveal page treats those as a plain
 * string and falls back to the legacy `<pre>` rendering, so this layer is
 * additive and backward compatible.
 */
export type SendFieldKind =
  | "password"
  | "username"
  | "email"
  | "url"
  | "notes"
  | "totp"
  | "text";

export interface SendField {
  /** Field display label, e.g. "Password" / "Username" / "Notes". */
  label: string;
  /** Raw value the recipient will copy — no label prefix, no decoration. */
  value: string;
  /** Drives the icon + mono styling on the reveal row. */
  kind: SendFieldKind;
}

export interface SendPayload {
  /** Schema version. Bump if shape changes; decoder rejects unknown versions. */
  v: 1;
  /** Optional source item name, shown as "(from {itemTitle})" beside the label. */
  itemTitle?: string;
  /** Ordered list of fields to render. Empty fields are skipped at encode time. */
  fields: SendField[];
}

const VALID_KINDS: SendFieldKind[] = [
  "password",
  "username",
  "email",
  "url",
  "notes",
  "totp",
  "text",
];

/**
 * Serialize a structured payload into the opaque `content` string that
 * `POST /sends` accepts. Empty fields are dropped so the reveal page never
 * renders blank rows.
 */
export function encodeSendPayload(payload: SendPayload): string {
  const cleaned: SendPayload = {
    v: 1,
    itemTitle: payload.itemTitle,
    fields: payload.fields.filter((f) => f.value && f.value.length > 0),
  };
  return JSON.stringify(cleaned);
}

/**
 * Try to decode a reveal response as a structured payload. Returns null when
 * the content is not JSON, not a `v:1` envelope, or has an invalid shape —
 * callers should then fall back to rendering `content` as plain text so
 * pre-overlay sends and direct-API sends keep working.
 */
export function decodeSendPayload(content: string): SendPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.v !== 1) return null;
  if (!Array.isArray(obj.fields)) return null;

  const fields: SendField[] = [];
  for (const raw of obj.fields) {
    if (!raw || typeof raw !== "object") return null;
    const f = raw as Record<string, unknown>;
    if (typeof f.label !== "string") return null;
    if (typeof f.value !== "string") return null;
    if (typeof f.kind !== "string") return null;
    if (!VALID_KINDS.includes(f.kind as SendFieldKind)) return null;
    fields.push({
      label: f.label,
      value: f.value,
      kind: f.kind as SendFieldKind,
    });
  }

  const itemTitle =
    typeof obj.itemTitle === "string" && obj.itemTitle.length > 0
      ? obj.itemTitle
      : undefined;

  return { v: 1, itemTitle, fields };
}
