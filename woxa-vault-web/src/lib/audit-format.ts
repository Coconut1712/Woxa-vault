/**
 * Shared audit-label formatting — used by BOTH the per-item activity section
 * (`item-activity-section.tsx`) and the full audit page (`app/audit/page.tsx`)
 * so the two surfaces never drift.
 *
 * Most actions map straight to an `audit.action.*` i18n key. Share / role-change
 * / revoke / member actions are richer: the backend attaches `metadata`
 * (grantee / revoked / target email, from→to roles) so we render the email +
 * role transition inline instead of a generic label. `metadata` is read
 * defensively and we fall back to the plain action label when a field is missing.
 *
 * The action code list mirrors the real backend audit codes 1:1 — the action
 * filter on the audit page is derived from `Object.keys(actionLabelKey)`, so any
 * code missing here would be unfilterable and any fake code would list an action
 * the backend never emits.
 */

import type { AuditEvent } from "@/lib/api/audit";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Maps every real backend action code → an `audit.action.*` i18n key. Grouped by
 * prefix to match how the backend namespaces events. Unmapped codes fall back to
 * a prettified version of the raw code (see `prettyAction`), so a newly-added
 * backend code degrades gracefully instead of breaking.
 */
export const actionLabelKey: Record<string, string> = {
  // 2FA
  "2fa.enabled": "audit.action.2fa_enabled",
  "2fa.disabled": "audit.action.2fa_disabled",
  "2fa.enroll_started": "audit.action.2fa_enroll_started",
  "2fa.backup_code_used": "audit.action.2fa_backup_code_used",
  "2fa.backup_codes_regenerated": "audit.action.2fa_backup_codes_regenerated",
  "2fa.login_verified": "audit.action.2fa_login_verified",
  "2fa.login_failed": "audit.action.2fa_login_failed",

  // Account
  "account.password_setup": "audit.action.account_password_setup",
  "account.password_reset_via_recovery":
    "audit.action.account_password_reset_recovery",
  "account.password_reset_failed": "audit.action.account_password_reset_failed",
  "account.profile_updated": "audit.action.account_profile_updated",
  "account.recovery_kit_generated": "audit.action.account_recovery_kit_generated",
  "account.recovery_kit_regenerated":
    "audit.action.account_recovery_kit_regenerated",
  "account.recovery_kit_regenerate_failed":
    "audit.action.account_recovery_kit_regenerate_failed",
  "account.sessions_revoked": "audit.action.account_sessions_revoked",
  "account.sessions_revoke_failed": "audit.action.account_sessions_revoke_failed",
  "account.vault_unlock_success": "audit.action.vault_unlock_success",
  "account.vault_unlock_failed": "audit.action.vault_unlock_failed",

  // Auth
  "auth.login.success": "audit.action.auth_login_success",
  "auth.login.failed": "audit.action.auth_login_failed",
  "auth.login.mfa_required": "audit.action.auth_login_mfa_required",
  "auth.logout": "audit.action.auth_logout",
  "auth.register": "audit.action.auth_register",
  "auth.register.failed": "audit.action.auth_register_failed",
  "auth.sso.login.failed": "audit.action.auth_sso_login_failed",

  // Attachment
  "attachment.uploaded": "audit.action.attachment_uploaded",
  "attachment.downloaded": "audit.action.attachment_downloaded",
  "attachment.deleted": "audit.action.attachment_deleted",

  // Item
  "item.create": "audit.action.item_create",
  "item.update": "audit.action.item_update",
  "item.delete": "audit.action.item_delete",
  "item.view": "audit.action.item_view",
  "item.reveal": "audit.action.item_reveal",
  "item.restore": "audit.action.item_restore",
  "item.purge": "audit.action.item_purge",
  "item.share": "audit.action.item_share",
  "item.role_change": "audit.action.item_role_change",
  "item.revoke": "audit.action.item_revoke",

  // Folder
  "folder.create": "audit.action.folder_create",
  "folder.update": "audit.action.folder_update",
  "folder.delete": "audit.action.folder_delete",
  "folder.share": "audit.action.folder_share",
  "folder.role_change": "audit.action.folder_role_change",
  "folder.revoke": "audit.action.folder_revoke",

  // Vault
  "vault.create": "audit.action.vault_create",
  "vault.update": "audit.action.vault_update",
  "vault.delete": "audit.action.vault_delete",
  "vault.share": "audit.action.vault_share",
  "vault.role_change": "audit.action.vault_role_change",
  "vault.revoke": "audit.action.vault_revoke",
  "vault.access_denied_locked": "audit.action.vault_access_denied_locked",

  // Member
  "member.invite": "audit.action.member_invite",
  "member.invite_resent": "audit.action.member_invite_resent",
  "member.invite_revoked": "audit.action.member_invite_revoked",
  "member.invite_accepted": "audit.action.member_invite_accepted",
  "member.remove": "audit.action.member_remove",
  "member.role_change": "audit.action.member_role_change",

  // Import
  "import.start": "audit.action.import_start",
  "import.complete": "audit.action.import_complete",

  // Team

  "team.create": "audit.action.team_create",
  "team.update": "audit.action.team_update",
  "team.delete": "audit.action.team_delete",
  "team.member_add": "audit.action.team_member_add",
  "team.member_remove": "audit.action.team_member_remove",
  "team.view": "audit.action.team_view",
  "team.list_viewed": "audit.action.team_list_viewed",

  // Send
  "send.create": "audit.action.send_create",
  "send.burn": "audit.action.send_burn",
  "send.reveal_deferred": "audit.action.send_reveal_deferred",
  "send.reveal_failed": "audit.action.send_reveal_failed",

  // Access Request
  "access_request.created": "audit.action.access_request_created",
  "access_request.approved": "audit.action.access_request_approved",
  "access_request.denied": "audit.action.access_request_denied",

  // Workspace
  "workspace.created": "audit.action.workspace_created",
  "workspace.switched": "audit.action.workspace_switched",
  "workspace.security_policy_updated": "audit.action.workspace_policy_update",
  "workspace.ownership_transferred": "audit.action.workspace_ownership_transferred",
  "workspace.ownership_transfer_failed":
    "audit.action.workspace_ownership_transfer_failed",

  // Trash
  "trash.empty": "audit.action.trash_empty",
};

/** Turn an unmapped dotted code like "item.foo_bar" → "Item foo bar". */
export function prettyAction(action: string): string {
  return action
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** The base label for an action (no metadata enrichment). */
export function baseActionLabel(action: string, t: Translate): string {
  return actionLabelKey[action] ? t(actionLabelKey[action]) : prettyAction(action);
}

/** Read a string field off the opaque `metadata` bag, or null when absent. */
function metaString(
  metadata: AuditEvent["metadata"],
  key: string,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Translate a role name via the existing role keys, falling back to the raw role
 * string when unmapped. Tries vault/item/folder grant roles (`role.*`:
 * manager/editor/user/viewer) first, then workspace member roles
 * (`members.role.*`: owner/admin/member/guest), so both role-change families
 * read naturally.
 */
function roleLabel(role: string, t: Translate): string {
  const grant = t(`role.${role}`);
  if (grant !== `role.${role}`) return grant;
  const member = t(`members.role.${role}`);
  if (member !== `members.role.${role}`) return member;
  return role;
}

/**
 * Build the human-readable label for an audit event. Share / role-change /
 * revoke (item/folder/vault) and member.* actions render the relevant email and
 * role transition from `metadata`; everything else uses the base action label.
 * Falls back to the base label whenever the expected metadata fields are absent.
 */
export function formatAuditLabel(ev: AuditEvent, t: Translate): string {
  const { action, metadata, targetName } = ev;

  // ---- Member (workspace-level) -------------------------------------------
  if (action === "member.role_change") {
    const who = targetName ?? metaString(metadata, "targetEmail");
    const from = metaString(metadata, "from");
    const to = metaString(metadata, "to");
    if (who && from && to) {
      return t("audit.detail.member_role_changed", {
        who,
        from: roleLabel(from, t),
        to: roleLabel(to, t),
      });
    }
  }

  if (action === "member.remove") {
    const who = targetName ?? metaString(metadata, "targetEmail");
    const removedRole = metaString(metadata, "removedRole");
    if (who && removedRole) {
      return t("audit.detail.member_removed", {
        who,
        role: roleLabel(removedRole, t),
      });
    }
    if (who) return t("audit.detail.member_removed_simple", { who });
  }

  if (action === "member.invite") {
    const who = targetName;
    const role = metaString(metadata, "role");
    if (who && role) {
      return t("audit.detail.member_invited", {
        who,
        role: roleLabel(role, t),
      });
    }
    if (who) return t("audit.detail.member_invited_simple", { who });
  }

  if (
    action === "member.invitation_accepted" ||
    action === "member.invite_resent" ||
    action === "member.invite_revoked"
  ) {
    const who = targetName ?? metaString(metadata, "targetEmail");
    if (who) {
      return `${baseActionLabel(action, t)}: ${who}`;
    }
  }

  // ---- Team ---------------------------------------------------------------
  if (action === "team.member_add") {
    const who = metaString(metadata, "userEmail") ?? metaString(metadata, "userId");
    const team = targetName;
    if (who && team) {
      return t("audit.detail.team_member_added", { who, team });
    }
  }

  if (action === "team.member_remove") {
    const who = metaString(metadata, "userEmail") ?? metaString(metadata, "userId");
    const team = targetName;
    if (who && team) {
      return t("audit.detail.team_member_removed", { who, team });
    }
  }

  // ---- Item / Folder / Vault grants ---------------------------------------
  if (action.endsWith(".share")) {
    const email = metaString(metadata, "granteeEmail");
    if (email) return t("audit.detail.shared_with", { email });
  }

  if (action.endsWith(".role_change")) {
    const email = metaString(metadata, "granteeEmail");
    const from = metaString(metadata, "from");
    const to = metaString(metadata, "to");
    if (email && from && to) {
      return t("audit.detail.role_changed", {
        email,
        from: roleLabel(from, t),
        to: roleLabel(to, t),
      });
    }
  }

  if (action.endsWith(".revoke")) {
    const email =
      metaString(metadata, "granteeEmail") ?? metaString(metadata, "revokedEmail");
    if (email) return t("audit.detail.revoked", { email });
  }

  return baseActionLabel(action, t);
}
