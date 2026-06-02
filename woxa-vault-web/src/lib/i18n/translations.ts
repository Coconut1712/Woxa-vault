/* =====================================================================
   TRANSLATIONS DICTIONARY
   en = English (default)
   th = ไทย
   ===================================================================== */

export type Locale = "en" | "th";

type Dict = Record<string, { en: string; th: string }>;

export const translations: Dict = {
  /* ---- common ---- */
  "common.save": { en: "Save", th: "บันทึก" },
  "common.save_changes": { en: "Save changes", th: "บันทึกการเปลี่ยนแปลง" },
  "common.cancel": { en: "Cancel", th: "ยกเลิก" },
  "common.system": { en: "System", th: "ระบบ" },
  "common.close": { en: "Close", th: "ปิด" },
  "common.create": { en: "Create", th: "สร้าง" },
  "common.done": { en: "Done", th: "เสร็จสิ้น" },
  "common.delete": { en: "Delete", th: "ลบ" },
  "common.remove": { en: "Remove", th: "เอาออก" },
  "common.restore": { en: "Restore", th: "กู้คืน" },
  "common.edit": { en: "Edit", th: "แก้ไข" },
  "common.share": { en: "Share", th: "แชร์" },
  "common.invite": { en: "Invite", th: "เชิญ" },
  "common.export": { en: "Export", th: "ส่งออก" },
  "common.import": { en: "Import", th: "นำเข้า" },
  "common.search": { en: "Search", th: "ค้นหา" },
  "common.filter": { en: "Filter", th: "กรอง" },
  "common.filters": { en: "Filters", th: "ตัวกรอง" },
  "common.clear": { en: "Clear", th: "ล้าง" },
  "common.clear_all": { en: "Clear all", th: "ล้างทั้งหมด" },
  "common.continue": { en: "Continue", th: "ดำเนินการต่อ" },
  "common.back": { en: "Back", th: "ย้อนกลับ" },
  "common.next": { en: "Next", th: "ถัดไป" },
  "common.copy": { en: "Copy", th: "คัดลอก" },
  "common.copied": { en: "Copied", th: "คัดลอกแล้ว" },
  "common.send": { en: "Send", th: "ส่ง" },
  "common.send_invites": { en: "Send invites", th: "ส่งคำเชิญ" },
  "common.required": { en: "Required", th: "จำเป็น" },
  "common.recommended": { en: "Recommended", th: "แนะนำ" },
  "common.enforced": { en: "Enforced", th: "บังคับใช้" },
  "common.active": { en: "Active", th: "ใช้งานอยู่" },
  "common.pending": { en: "Pending", th: "รอดำเนินการ" },
  "common.verified": { en: "Verified", th: "ยืนยันแล้ว" },
  "common.connected": { en: "Connected", th: "เชื่อมต่อแล้ว" },
  "common.configure": { en: "Configure", th: "กำหนดค่า" },
  "common.connect": { en: "Connect", th: "เชื่อมต่อ" },
  "common.disconnect": { en: "Disconnect", th: "ยกเลิกการเชื่อมต่อ" },
  "common.show": { en: "Show", th: "แสดง" },
  "common.hide": { en: "Hide", th: "ซ่อน" },
  "common.reveal": { en: "Reveal", th: "เปิดดู" },
  "common.unlock": { en: "Unlock", th: "ปลดล็อค" },
  "common.lock": { en: "Lock", th: "ล็อค" },
  "common.signin": { en: "Sign in", th: "เข้าสู่ระบบ" },
  "common.signout": { en: "Sign out", th: "ออกจากระบบ" },
  "common.signout_instead": { en: "Sign out instead", th: "ออกจากระบบแทน" },
  "common.add": { en: "Add", th: "เพิ่ม" },
  "common.upload_photo": { en: "Upload photo", th: "อัพโหลดรูปภาพ" },
  "common.download_pdf": { en: "Download PDF", th: "ดาวน์โหลด PDF" },
  "common.download_all": { en: "Download all", th: "ดาวน์โหลดทั้งหมด" },
  "common.view_all": { en: "View all", th: "ดูทั้งหมด" },
  "common.more_filters": { en: "More filters", th: "ตัวกรองเพิ่มเติม" },
  "common.no_results": { en: "No results", th: "ไม่พบผลลัพธ์" },
  "common.no_matches": { en: "No matches", th: "ไม่พบรายการที่ตรงกัน" },
  "common.never": { en: "Never", th: "ไม่กำหนด" },
  "common.permanent": { en: "Permanent", th: "ถาวร" },
  "common.confirm": { en: "Confirm", th: "ยืนยัน" },
  "common.processing": { en: "Processing…", th: "กำลังดำเนินการ…" },
  "common.optional": { en: "Optional", th: "ระบุหรือไม่ก็ได้" },
  "common.minute": { en: "1 minute", th: "1 นาที" },
  "common.minutes": { en: "{n} minutes", th: "{n} นาที" },
  "common.hour": { en: "1 hour", th: "1 ชั่วโมง" },
  "common.hours": { en: "{n} hours", th: "{n} ชั่วโมง" },
  "common.day": { en: "1 day", th: "1 วัน" },
  "common.days": { en: "{n} days", th: "{n} วัน" },
  "common.tags": { en: "Tags", th: "แท็ก" },
  "common.notes": { en: "Notes", th: "บันทึก" },
  "common.icon": { en: "Icon", th: "ไอคอน" },
  "common.color": { en: "Color", th: "สี" },
  "common.more": { en: "More actions", th: "การกระทำเพิ่มเติม" },
  "common.name": { en: "Name", th: "ชื่อ" },
  "common.email": { en: "Email", th: "อีเมล" },
  "common.role": { en: "Role", th: "บทบาท" },
  "common.status": { en: "Status", th: "สถานะ" },
  "common.this_device": { en: "This device", th: "อุปกรณ์นี้" },
  "common.last_changed": { en: "Last changed {when}", th: "เปลี่ยนเมื่อ {when}" },
  "common.added_when": { en: "Added {when}", th: "เพิ่มเมื่อ {when}" },
  "common.this_action_cannot_be_undone": {
    en: "This action cannot be undone.",
    th: "การกระทำนี้ไม่สามารถย้อนกลับได้",
  },
  "common.revoke": { en: "Revoke", th: "เพิกถอน" },
  "common.resend": { en: "Resend", th: "ส่งซ้ำ" },
  "common.update": { en: "Update", th: "อัพเดต" },
  "common.full_name": { en: "Full name", th: "ชื่อเต็ม" },
  "common.language": { en: "Language", th: "ภาษา" },
  "common.timezone": { en: "Timezone", th: "เขตเวลา" },
  "common.phone": { en: "Phone", th: "โทรศัพท์" },
  "common.address": { en: "Address", th: "ที่อยู่" },

  /* ---- nav (sidebar) ---- */
  "nav.home": { en: "Home", th: "หน้าหลัก" },
  "nav.favorites": { en: "Favorites", th: "รายการโปรด" },
  "nav.one_time_sends": { en: "One-time Sends", th: "การส่งครั้งเดียว" },
  "nav.vaults": { en: "Vaults", th: "ตู้นิรภัย" },
  "nav.audit_log": { en: "Audit log", th: "ประวัติการใช้งาน" },
  "nav.import": { en: "Import", th: "นำเข้าข้อมูล" },
  "nav.members": { en: "Members", th: "สมาชิก" },

  "nav.trash": { en: "Trash", th: "ถังขยะ" },
  "nav.settings": { en: "Settings", th: "ตั้งค่า" },
  "nav.account_settings": { en: "Account settings", th: "ตั้งค่าบัญชี" },
  "nav.workspace_settings": { en: "Workspace settings", th: "ตั้งค่าเวิร์กสเปซ" },
  "nav.lock_vault": { en: "Lock vault", th: "ล็อคตู้นิรภัย" },
  "nav.new_vault": { en: "New vault", th: "ตู้นิรภัยใหม่" },
  "nav.add_workspace": { en: "Add workspace", th: "เพิ่มเวิร์กสเปซ" },
  "nav.no_folders_yet": { en: "No folders yet", th: "ยังไม่มีโฟลเดอร์" },

  /* ---- topbar ---- */
  "topbar.search_anything": { en: "Search anything…", th: "ค้นหา…" },
  "topbar.notifications": { en: "Notifications", th: "การแจ้งเตือน" },
  "topbar.notifications_n_new": {
    en: "Notifications ({n} new)",
    th: "การแจ้งเตือน (ใหม่ {n})",
  },
  "topbar.shortcuts": { en: "Keyboard shortcuts", th: "ปุ่มลัด" },
  "topbar.shortcuts_hint": {
    en: "Keyboard shortcuts · press ?",
    th: "ปุ่มลัด · กด ?",
  },
  "topbar.theme.light": { en: "Light", th: "สว่าง" },
  "topbar.theme.dark": { en: "Dark", th: "มืด" },
  "topbar.theme.system": { en: "System", th: "ตามระบบ" },
  "topbar.theme.toggle": { en: "Toggle theme", th: "สลับธีม" },
  "topbar.language": { en: "Language", th: "ภาษา" },

  /* ---- vault status ---- */
  "status.unlocked": { en: "Vault unlocked", th: "ตู้นิรภัยปลดล็อคแล้ว" },
  "status.locked": { en: "Vault locked", th: "ตู้นิรภัยล็อค" },
  "status.zero_knowledge": { en: "Zero-knowledge", th: "Zero-knowledge" },
  "status.admin_only": { en: "Admin only", th: "เฉพาะแอดมิน" },

  /* ---- welcome page ---- */
  "welcome.headline_1": { en: "Your team's secrets,", th: "ความลับของทีมคุณ" },
  "welcome.headline_2": {
    en: "encrypted by default.",
    th: "เข้ารหัสโดยอัตโนมัติ",
  },
  "welcome.subhead": {
    en: "Stop sharing credentials on Slack, LINE, or Google Docs. Vault keeps every secret zero-knowledge encrypted, audited, and revocable in seconds.",
    th: "เลิกแชร์รหัสผ่านทาง Slack, LINE หรือ Google Docs ระบบเก็บความลับแบบ zero-knowledge, มี audit log, และเพิกถอนได้ในไม่กี่วินาที",
  },
  "welcome.feature.zk.title": { en: "Zero-knowledge", th: "Zero-knowledge" },
  "welcome.feature.zk.desc": {
    en: "Even we can't read it",
    th: "แม้แต่เราก็อ่านไม่ได้",
  },
  "welcome.feature.sso.title": { en: "Google SSO", th: "Google SSO" },
  "welcome.feature.sso.desc": {
    en: "Domain restricted",
    th: "จำกัดตามโดเมน",
  },
  "welcome.feature.send.title": {
    en: "One-time sends",
    th: "ส่งครั้งเดียว",
  },
  "welcome.feature.send.desc": {
    en: "Burns after read",
    th: "ทำลายตัวเองหลังเปิดอ่าน",
  },
  "welcome.feature.audit.title": { en: "Audit trail", th: "บันทึกการใช้งาน" },
  "welcome.feature.audit.desc": {
    en: "Every action logged",
    th: "บันทึกทุก action",
  },
  "welcome.work_email": { en: "Work email", th: "อีเมลที่ทำงาน" },
  "welcome.welcome_back": { en: "Welcome back", th: "ยินดีต้อนรับกลับ" },
  "welcome.sub_back": {
    en: "Sign in with your work email. We'll route you to the right method.",
    th: "เข้าสู่ระบบด้วยอีเมลที่ทำงาน เราจะนำคุณไปยังวิธีการที่เหมาะสม",
  },
  "welcome.or": { en: "Or", th: "หรือ" },
  "welcome.continue_google": {
    en: "Continue with Google Workspace",
    th: "ดำเนินการต่อด้วย Google Workspace",
  },
  "welcome.terms": {
    en: "By continuing, you agree to our Terms and Privacy Policy.",
    th: "การดำเนินการต่อแสดงว่าคุณยอมรับข้อกำหนดและนโยบายความเป็นส่วนตัวของเรา",
  },
  "welcome.recipient_link": {
    en: "Received a one-time link?",
    th: "ได้รับลิงก์ครั้งเดียว?",
  },
  "welcome.open_recipient": {
    en: "Open recipient page",
    th: "เปิดหน้าผู้รับ",
  },
  "welcome.pre_release": {
    en: "Pre-release · iux24 team",
    th: "เวอร์ชันก่อนเปิดตัว · ทีม iux24",
  },
  "welcome.copyright": {
    en: "© 2026 Woxa · Security as default, not afterthought",
    th: "© 2026 Woxa · ความปลอดภัยเป็นพื้นฐาน ไม่ใช่เรื่องเสริม",
  },

  /* ---- login pages ---- */
  "login.continuing_google": {
    en: "Continuing with Google…",
    th: "กำลังดำเนินการกับ Google…",
  },
  "login.verifying_with": {
    en: "Verifying {email} with Google Workspace",
    th: "กำลังตรวจสอบ {email} กับ Google Workspace",
  },
  "login.redirecting": {
    en: "Redirecting to Google…",
    th: "กำลังนำทางไปยัง Google…",
  },
  "login.requesting_oauth": {
    en: "Requesting OAuth with hd=iux24.com",
    th: "ขอ OAuth ด้วย hd=iux24.com",
  },
  "login.server_verify": {
    en: "Server will re-verify domain (defense in depth)",
    th: "เซิร์ฟเวอร์จะตรวจสอบโดเมนซ้ำอีกครั้ง (defense in depth)",
  },
  "login.google_verified": {
    en: "Google sign-in verified",
    th: "ยืนยัน Google sign-in แล้ว",
  },
  "login.almost_there": { en: "Almost there", th: "ใกล้เสร็จแล้ว" },
  "login.preparing_vault": {
    en: "Preparing your vault…",
    th: "กำลังเตรียมตู้นิรภัยของคุณ…",
  },
  "login.domain_matches": {
    en: "Domain matches @iux24.com",
    th: "โดเมนตรงกับ @iux24.com",
  },
  "login.user_authorized": { en: "User authorized", th: "ผู้ใช้ผ่านการอนุญาต" },
  "login.loading_workspace": {
    en: "Loading workspace…",
    th: "กำลังโหลดเวิร์กสเปซ…",
  },
  "login.workspace_loaded": { en: "Workspace loaded", th: "โหลดเวิร์กสเปซแล้ว" },
  "login.unlocking_vault": {
    en: "Unlocking vault…",
    th: "กำลังปลดล็อคตู้นิรภัย…",
  },
  "login.decrypting_keys": {
    en: "Decrypting vault keys in your browser",
    th: "กำลังถอดรหัสกุญแจตู้นิรภัยในเบราว์เซอร์",
  },
  "login.fetched_keys": {
    en: "Fetched encrypted keys",
    th: "ดึงกุญแจที่เข้ารหัสแล้ว",
  },
  "login.deriving_session": {
    en: "Deriving session key",
    th: "กำลังสร้างคีย์เซสชัน",
  },
  "login.use_different_email": {
    en: "Use a different email",
    th: "ใช้อีเมลอื่น",
  },
  "login.signing_in_as": {
    en: "Signing in as {email}",
    th: "เข้าสู่ระบบในชื่อ {email}",
  },
  // Sign-in form (login password — the email/account credential, NOT the
  // Master Password that unlocks the vault). The login password IS sent to the
  // server, so copy here must not claim it stays local / is never sent.
  "login.password_label": { en: "Password", th: "รหัสผ่าน" },
  "login.password_placeholder": {
    en: "Your password",
    th: "รหัสผ่านของคุณ",
  },
  "login.sign_in": { en: "Sign in", th: "เข้าสู่ระบบ" },
  "login.signing_in": { en: "Signing in…", th: "กำลังเข้าสู่ระบบ…" },
  "login.secure_connection": {
    en: "Sent over a secure connection",
    th: "ส่งผ่านการเชื่อมต่อที่ปลอดภัย",
  },
  "login.login_password_hint": {
    en: "This is your account password. You'll unlock your vault with your Master Password after signing in.",
    th: "นี่คือรหัสผ่านสำหรับเข้าสู่ระบบของบัญชี คุณจะปลดล็อก vault ด้วย Master Password หลังเข้าสู่ระบบ",
  },
  "login.forgot_password": { en: "Forgot password?", th: "ลืมรหัสผ่าน?" },
  "login.welcome_back": { en: "Welcome back", th: "ยินดีต้อนรับกลับ" },
  "login.error.invalid_credentials": {
    en: "Incorrect email or password.",
    th: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  },
  "login.error.rate_limited": {
    en: "Too many attempts. Please wait a moment and try again.",
    th: "พยายามเข้าระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  },
  "login.error.network": {
    en: "Can't reach the server. Check your connection and try again.",
    th: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง",
  },
  "login.error.generic": {
    en: "Something went wrong. Please try again.",
    th: "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง",
  },
  "login.sso_unavailable_title": {
    en: "SSO is not available yet",
    th: "ยังไม่เปิดให้ใช้ SSO",
  },
  "login.sso_unavailable_for": {
    en: "Single sign-on for {email} isn't connected to this environment yet.",
    th: "Single sign-on สำหรับ {email} ยังไม่ได้เชื่อมต่อกับสภาพแวดล้อมนี้",
  },
  "login.sso_unavailable_desc": {
    en: "Single sign-on isn't connected to this environment yet.",
    th: "Single sign-on ยังไม่ได้เชื่อมต่อกับสภาพแวดล้อมนี้",
  },
  "login.sso_coming_soon_detail": {
    en: "SSO will arrive in a later release. For now, please sign in with your password.",
    th: "SSO จะเปิดใช้งานในเวอร์ชันถัดไป สำหรับตอนนี้กรุณาเข้าสู่ระบบด้วยรหัสผ่านของคุณ",
  },
  "login.use_password_instead": {
    en: "Use password instead",
    th: "ใช้รหัสผ่านแทน",
  },
  "welcome.sso_coming_soon": {
    en: "SSO will be available in a later release",
    th: "SSO จะเปิดใช้งานในเวอร์ชันถัดไป",
  },
  "auth.checking_session": {
    en: "Checking your session…",
    th: "กำลังตรวจสอบเซสชัน…",
  },
  "auth.signing_out": { en: "Signing out…", th: "กำลังออกจากระบบ…" },
  "auth.signed_out": { en: "Signed out", th: "ออกจากระบบแล้ว" },
  "auth.signed_out_desc": {
    en: "Your session has ended.",
    th: "เซสชันของคุณสิ้นสุดแล้ว",
  },

  /* ---- dashboard ---- */
  "dash.title": { en: "Home", th: "หน้าหลัก" },
  "dash.subtitle": {
    en: "Your vault at a glance",
    th: "ภาพรวมตู้นิรภัยของคุณ",
  },
  "dash.greeting": {
    en: "Good evening, {name}.",
    th: "สวัสดีตอนเย็น คุณ{name}",
  },
  "dash.activity_caption": {
    en: "Last activity {when} · {n} members",
    th: "กิจกรรมล่าสุด {when} · สมาชิก {n} คน",
  },
  "dash.activity_caption_simple": {
    en: "Last activity {when}",
    th: "กิจกรรมล่าสุด {when}",
  },
  "dash.your_vaults": { en: "Your vaults", th: "ตู้นิรภัยของคุณ" },
  "dash.workspace_vaults": {
    en: "Workspace's vaults",
    th: "ตู้นิรภัยในเวิร์กสเปซ",
  },
  "dash.workspace_vaults_hint": {
    en: "Other vaults in this workspace. You can see they exist but not what's inside.",
    th: "ตู้นิรภัยอื่นในเวิร์กสเปซนี้ — เห็นว่ามีอยู่ แต่เปิดดูข้างในไม่ได้",
  },
  "dash.workspace_vaults_locked": {
    en: "You're not a member of this vault",
    th: "คุณไม่ได้เป็นสมาชิกของตู้นิรภัยนี้",
  },
  "dash.not_a_member": { en: "Not a member", th: "ไม่ได้เป็นสมาชิก" },
  "dash.member_count": {
    en: "{n} members",
    th: "สมาชิก {n} คน",
  },
  "dash.recently_used": { en: "Recently used", th: "ใช้งานล่าสุด" },
  "dash.favorites": { en: "Favorites", th: "รายการโปรด" },
  "dash.recent_activity": { en: "Recent activity", th: "กิจกรรมล่าสุด" },
  "dash.view_all": { en: "View all", th: "ดูทั้งหมด" },
  "dash.stat.total": { en: "Total items", th: "รายการทั้งหมด" },
  "dash.stat.total_hint": { en: "across 5 vaults", th: "ใน 5 ตู้นิรภัย" },
  "dash.stat.sends": { en: "Active sends", th: "การส่งที่ใช้งาน" },
  "dash.stat.sends_hint": { en: "2 expire today", th: "หมดอายุวันนี้ 2 รายการ" },
  "dash.stat.members": { en: "Members", th: "สมาชิก" },
  "dash.stat.members_hint": {
    en: "last invited 3d ago",
    th: "เชิญล่าสุดเมื่อ 3 วันก่อน",
  },
  "dash.stat.audit": { en: "Audit events", th: "เหตุการณ์ตรวจสอบ" },
  "dash.stat.audit_hint": { en: "last 7 days", th: "7 วันล่าสุด" },
  "dash.new_item": { en: "New item", th: "รายการใหม่" },
  "dash.action.viewed": { en: "viewed", th: "เปิดดู" },
  "dash.action.copied_password": {
    en: "copied password from",
    th: "คัดลอกรหัสผ่านจาก",
  },
  "dash.action.created": { en: "created", th: "สร้าง" },
  "dash.action.updated": { en: "updated", th: "อัพเดต" },
  "dash.action.deleted": { en: "deleted", th: "ลบ" },
  "dash.action.sent_one_time": {
    en: "sent one-time copy of",
    th: "ส่งสำเนาครั้งเดียวของ",
  },
  "dash.action.signed_in": { en: "signed in via", th: "เข้าสู่ระบบผ่าน" },
  "dash.action.added_member": {
    en: "added a member to",
    th: "เพิ่มสมาชิกใน",
  },

  /* ---- items / vaults ---- */
  "vault.new_item": { en: "New item", th: "รายการใหม่" },
  "vault.new_folder": { en: "New folder", th: "โฟลเดอร์ใหม่" },
  "vault.new_vault": { en: "New vault", th: "ตู้นิรภัยใหม่" },
  "vault.share": { en: "Share", th: "แชร์" },
  "vault.filter_in_vault": {
    en: "Filter in this vault…",
    th: "กรองในตู้นิรภัยนี้…",
  },
  "vault.items_count": { en: "{n} items", th: "{n} รายการ" },
  "vault.folders_count": { en: "{n} folders", th: "{n} โฟลเดอร์" },
  "vault.grants_count": { en: "{n} access grants", th: "{n} สิทธิ์การเข้าถึง" },
  "vault.no_match.title": { en: "No items match", th: "ไม่มีรายการที่ตรงกัน" },
  "vault.no_match.desc": {
    en: "Try a different filter, or create a new item.",
    th: "ลองเปลี่ยนตัวกรอง หรือสร้างรายการใหม่",
  },
  "vault.send_one_time": { en: "Send one-time", th: "ส่งครั้งเดียว" },
  "vault.manage_access": { en: "Manage access", th: "จัดการสิทธิ์เข้าถึง" },
  "vault.folder_pill": { en: "Folder", th: "โฟลเดอร์" },
  "vault.critical_only": { en: "Critical only", th: "เฉพาะที่สำคัญ" },
  "vault.encryption.zk_short": { en: "ZK", th: "ZK" },
  "vault.zk_badge": { en: "Zero-knowledge", th: "Zero-knowledge" },
  "vault.in_folder": { en: "in {name}", th: "ในโฟลเดอร์ {name}" },
  "vault.subtitle_folder": {
    en: "{desc} · in {folder}",
    th: "{desc} · ในโฟลเดอร์ {folder}",
  },
  "vault.favorites": { en: "Favorites", th: "รายการโปรด" },
  "vault.critical": { en: "Critical", th: "สำคัญ" },
  "vault.folder_btn": { en: "Folder", th: "โฟลเดอร์" },
  "vault.access_grants_aria": {
    en: "{n} access grants",
    th: "{n} สิทธิ์การเข้าถึง",
  },

  /* ---- favorites ---- */
  "fav.title": { en: "Favorites", th: "รายการโปรด" },
  "fav.subtitle": {
    en: "{n} items you've starred",
    th: "{n} รายการที่คุณติดดาว",
  },
  "fav.filter": { en: "Filter favorites…", th: "กรองรายการโปรด…" },
  "fav.empty.title": { en: "No favorites yet", th: "ยังไม่มีรายการโปรด" },
  "fav.empty.desc": {
    en: "Star items you use often to access them quickly here.",
    th: "ติดดาวรายการที่ใช้บ่อย เพื่อเข้าถึงได้รวดเร็วที่นี่",
  },
  "fav.browse": { en: "Browse vaults", th: "เลือกดูตู้นิรภัย" },
  "fav.no_match_query": {
    en: 'No favorites match "{query}"',
    th: 'ไม่พบรายการโปรดที่ตรงกับ "{query}"',
  },
  "fav.remove_from_favorites": {
    en: "Remove from favorites",
    th: "เอาออกจากรายการโปรด",
  },

  /* ---- sends ---- */
  "sends.title": { en: "One-time Sends", th: "การส่งครั้งเดียว" },
  "sends.subtitle": {
    en: "Share secrets with people outside your team. Self-destructing links.",
    th: "แชร์ความลับให้คนนอกทีม ลิงก์ทำลายตัวเอง",
  },
  "nav.requests": { en: "Requests", th: "การขอสิทธิ์" },
  "nav.teams": { en: "Teams", th: "ทีม" },
  "sends.new": { en: "New send", th: "ส่งใหม่" },
  "sends.stat.active": { en: "Active", th: "ใช้งานอยู่" },
  "sends.stat.burned": { en: "Burned", th: "ถูกทำลาย" },
  "sends.stat.expired": { en: "Expired", th: "หมดอายุ" },
  "sends.all": { en: "All sends", th: "การส่งทั้งหมด" },
  "sends.total_count": { en: "{n} total", th: "{n} รายการ" },

  /* ---- Access Requests ---- */
  "requests.title": { en: "Access Requests", th: "การขอสิทธิ์เข้าถึง" },
  "requests.subtitle": {
    en: "Manage permission requests for vaults and items.",
    th: "จัดการการขอสิทธิ์เข้าถึงตู้นิรภัยและรายการต่างๆ",
  },
  "requests.tab.inbox": { en: "Inbox", th: "รอการอนุมัติ" },
  "requests.tab.outbox": { en: "My Requests", th: "คำขอของฉัน" },
  "requests.button": { en: "Request access", th: "ขอสิทธิ์เข้าถึง" },
  "requests.empty.title": { en: "No requests yet", th: "ยังไม่มีการขอสิทธิ์" },
  "requests.empty.desc": {
    en: "When someone requests access to a resource, it will appear here.",
    th: "เมื่อมีคนขอสิทธิ์เข้าถึงทรัพยากร รายการจะปรากฏที่นี่",
  },
  "requests.empty.inbox_title": { en: "No pending requests", th: "ไม่มีคำขอที่ค้างอยู่" },
  "requests.empty.inbox_desc": {
    en: "You have no requests waiting for your approval.",
    th: "คุณไม่มีคำขอเข้าถึงที่รอการอนุมัติในขณะนี้",
  },
  "requests.empty.outbox_title": { en: "No requests sent", th: "ยังไม่มีคำขอที่ส่งออก" },
  "requests.empty.outbox_desc": {
    en: "Requests you send to others will appear here.",
    th: "คำขอที่คุณส่งไปยังผู้อื่นจะปรากฏที่นี่",
  },
  "requests.col.target": { en: "Target", th: "เป้าหมาย" },
  "requests.col.requester": { en: "Requester", th: "ผู้ขอ" },
  "requests.col.requested_role": { en: "Requested Role", th: "สิทธิ์ที่ขอ" },
  "requests.col.reason": { en: "Reason", th: "เหตุผล" },
  "requests.col.status": { en: "Status", th: "สถานะ" },
  "requests.col.created_at": { en: "Requested At", th: "วันที่ขอ" },
  "requests.col.actions": { en: "Actions", th: "การจัดการ" },
  "requests.status.pending": { en: "Pending", th: "รอการอนุมัติ" },
  "requests.status.approved": { en: "Approved", th: "อนุมัติแล้ว" },
  "requests.status.denied": { en: "Denied", th: "ปฏิเสธแล้ว" },
  "requests.status.expired": { en: "Expired", th: "หมดอายุ" },
  "requests.status.cancelled": { en: "Cancelled", th: "ยกเลิกแล้ว" },
  "requests.action.approve": { en: "Approve", th: "อนุมัติ" },
  "requests.action.deny": { en: "Deny", th: "ปฏิเสธ" },
  "requests.action.view_reason": { en: "View Reason", th: "ดูเหตุผล" },

  "requests.countdown.expires_in": { en: "Expires in:", th: "จะหมดอายุใน:" },
  "requests.countdown.expired": { en: "Expired", th: "หมดอายุแล้ว" },
  "requests.countdown.permanent": { en: "Permanent access", th: "สิทธิ์ถาวร" },
  "requests.approver_desc": {
    en: "Reviewing request for {name}.",
    th: "กำลังตรวจสอบคำขอสำหรับ {name}",
  },
  "requests.modal.title": { en: "Request access", th: "ขอสิทธิ์เข้าถึง" },
  "requests.modal.desc": {
    en: "You are requesting access to {name}. A manager will review your request.",
    th: "คุณกำลังขอสิทธิ์เข้าถึง {name} ผู้ดูแลระบบจะตรวจสอบคำขอของคุณ",
  },
  "requests.view_desc": {
    en: "Reviewing the decision for {name}.",
    th: "กำลังตรวจสอบผลการพิจารณาสำหรับ {name}",
  },
  "requests.modal.role_label": { en: "Requested role", th: "สิทธิ์ที่ต้องการ" },
  "requests.modal.duration_label": { en: "Duration", th: "ระยะเวลา" },
  "requests.modal.duration_days": { en: "Days", th: "วัน" },
  "requests.modal.duration_hours": { en: "Hours", th: "ชั่วโมง" },
  "requests.modal.duration_minutes": { en: "Minutes", th: "นาที" },
  "requests.modal.duration_hint": { en: "Leave blank for permanent access", th: "เว้นว่างไว้หากต้องการสิทธิ์ถาวร" },
  "requests.modal.reason_label": { en: "Reason", th: "เหตุผล" },
  "requests.modal.requested_role": { en: "Requested Role", th: "สิทธิ์ที่ขอ" },
  "requests.modal.requested_duration": { en: "Requested Duration", th: "ระยะเวลาที่ขอ" },
  "requests.modal.approved_role": { en: "Approved Role", th: "สิทธิ์ที่อนุมัติ" },
  "requests.modal.approved_duration": { en: "Approved Duration", th: "ระยะเวลาที่อนุมัติ" },
  "requests.modal.approval_reason": { en: "Approval Reason / Internal Note", th: "หมายเหตุการอนุมัติ" },
  "requests.modal.denial_reason": { en: "Denial Reason", th: "เหตุผลที่ปฏิเสธ" },
  "requests.modal.submit": { en: "Send request", th: "ส่งคำขอ" },
  "requests.modal.submitting": { en: "Sending…", th: "กำลังส่ง…" },
  "requests.toast.created": { en: "Request sent", th: "ส่งคำขอแล้ว" },
  "requests.toast.decided": { en: "Decision saved", th: "บันทึกการตัดสินใจแล้ว" },

  /* ---- Teams ---- */
  "teams.title": { en: "Teams", th: "ทีม" },
  "teams.subtitle": {
    en: "Organize users into groups to manage collective access.",
    th: "จัดกลุ่มผู้ใช้เพื่อจัดการสิทธิ์เข้าถึงแบบกลุ่ม",
  },
  "teams.new": { en: "New Team", th: "สร้างทีมใหม่" },
  "teams.all": { en: "All Teams", th: "ทีมทั้งหมด" },
  "teams.empty.title": { en: "No teams found", th: "ไม่พบทีม" },
  "teams.empty.desc": {
    en: "Get started by creating your first team.",
    th: "เริ่มต้นโดยการสร้างทีมแรกของคุณ",
  },
  "teams.col.name": { en: "Team Name", th: "ชื่อทีม" },
  "teams.col.members": { en: "Members", th: "สมาชิก" },
  "teams.col.created_at": { en: "Created At", th: "สร้างเมื่อ" },
  "teams.col.actions": { en: "Actions", th: "การจัดการ" },
  "teams.role.lead": { en: "Team Lead", th: "หัวหน้าทีม" },
  "teams.role.member": { en: "Member", th: "สมาชิก" },
  "teams.toast.created": { en: "Team created", th: "สร้างทีมสำเร็จ" },
  "teams.toast.updated": { en: "Team updated", th: "อัปเดตทีมสำเร็จ" },
  "teams.toast.deleted": { en: "Team deleted", th: "ลบทีมสำเร็จ" },
  "teams.create.name_label": { en: "Team Name", th: "ชื่อทีม" },
  "teams.create.name_placeholder": { en: "e.g. Engineering, Marketing", th: "เช่น Engineering, Marketing" },
  "teams.create.desc_label": { en: "Description", th: "คำอธิบาย" },
  "teams.create.submit": { en: "Create Team", th: "สร้างทีม" },
  "teams.create.submitting": { en: "Creating…", th: "กำลังสร้าง…" },
  "teams.members.manage": { en: "Manage Members", th: "จัดการสมาชิก" },
  "teams.members.add": { en: "Add member", th: "เพิ่มสมาชิก" },
  "teams.members.search": { en: "Search workspace members", th: "ค้นหาสมาชิกในเวิร์กสเปซ" },
  "teams.members.no_members": { en: "No members in this team yet.", th: "ยังไม่มีสมาชิกในทีมนี้" },
  "teams.members.remove_confirm": { en: "Remove member from team?", th: "ยืนยันการลบสมาชิกออกจากทีม?" },
  "teams.members.remove_confirm_desc": {
    en: "They will lose any access granted through this team.",
    th: "สมาชิกจะสูญเสียสิทธิ์การเข้าถึงที่ได้รับผ่านทีมนี้",
  },
  "teams.role.lead_desc": { en: "Can manage team members and settings.", th: "สามารถจัดการสมาชิกและตั้งค่าทีมได้" },
  "teams.role.member_desc": { en: "Standard member with team access.", th: "สมาชิกปกติที่มีสิทธิ์เข้าถึงตามทีม" },

  "sends.col.name": { en: "Name", th: "ชื่อ" },

  "sends.col.recipient": { en: "Recipient", th: "ผู้รับ" },
  "sends.col.views": { en: "Views", th: "การเปิดดู" },
  "sends.col.status": { en: "Status", th: "สถานะ" },
  "sends.col.expires": { en: "Expires", th: "หมดอายุ" },
  "sends.col.actions": { en: "Actions", th: "การจัดการ" },
  "sends.passphrase": { en: "passphrase", th: "Passphrase" },
  "sends.anyone_with_link": { en: "Anyone with link", th: "ใครก็ตามที่มีลิงก์" },
  "sends.status.active": { en: "Active", th: "ใช้งานอยู่" },
  "sends.status.burned": { en: "Burned", th: "ถูกทำลาย" },
  "sends.status.expired": { en: "Expired", th: "หมดอายุ" },
  "sends.action.burn_now": { en: "Burn now", th: "ทำลายทันที" },
  "sends.copy": { en: "Copy", th: "คัดลอก" },
  "sends.link_copied": {
    en: "Link copied to clipboard",
    th: "คัดลอกลิงก์แล้ว",
  },

  /* ---- new send page ---- */
  "send_new.title": {
    en: "New one-time send",
    th: "สร้างการส่งครั้งเดียว",
  },
  "send_new.subtitle": {
    en: "Share a secret outside your team. Burns after read.",
    th: "แชร์ความลับให้คนนอกทีม ทำลายตัวเองหลังเปิดอ่าน",
  },
  "send_new.sending_from": {
    en: "Sending from {name}. The vault item itself is not modified.",
    th: "ส่งจาก {name} รายการในตู้นิรภัยไม่ถูกแก้ไข",
  },
  "send_new.secret_content": { en: "Secret content", th: "เนื้อหาที่จะส่ง" },
  "send_new.placeholder_content": {
    en: "The secret to share…",
    th: "ความลับที่ต้องการแชร์…",
  },
  "send_new.encrypted_hint": {
    en: "Encrypted in your browser before upload. We never see plaintext.",
    th: "เข้ารหัสในเบราว์เซอร์ก่อนอัพโหลด เราไม่เห็น plaintext เลย",
  },
  "send_new.expires_in": { en: "Expires in", th: "หมดอายุใน" },
  "send_new.max_views": { en: "Max views", th: "เปิดดูได้สูงสุด" },
  "send_new.recipient_email": {
    en: "Recipient email (optional)",
    th: "อีเมลผู้รับ (ไม่จำเป็น)",
  },
  "send_new.recipient_hint": {
    en: "If set, recipient must verify their email matches before viewing.",
    th: "ถ้ากำหนด ผู้รับต้องยืนยันว่าอีเมลตรงกันก่อนดู",
  },
  "send_new.add_passphrase": { en: "Add a passphrase", th: "เพิ่ม Passphrase" },
  "send_new.passphrase_hint": {
    en: "Send this to the recipient via another channel (e.g. SMS). Adds extra layer if URL leaks.",
    th: "ส่ง Passphrase ให้ผู้รับผ่านช่องทางอื่น (เช่น SMS) เพิ่มความปลอดภัยถ้า URL รั่ว",
  },
  "send_new.passphrase_placeholder": {
    en: "At least 8 characters",
    th: "อย่างน้อย 8 ตัวอักษร",
  },
  "send_new.generate": { en: "Generate link", th: "สร้างลิงก์" },
  "send_new.link_ready": { en: "Link is ready", th: "ลิงก์พร้อมแล้ว" },
  "send_new.link_ready_desc": {
    en: "Copy it now — the decryption key is in the URL fragment and won't be stored on our servers.",
    th: "คัดลอกตอนนี้ — กุญแจถอดรหัสอยู่ใน URL fragment และจะไม่ถูกเก็บที่เซิร์ฟเวอร์",
  },
  "send_new.secure_url": { en: "Secure URL", th: "URL ปลอดภัย" },
  "send_new.show_qr": { en: "Show QR code", th: "แสดง QR code" },
  "send_new.view_all": { en: "View all sends", th: "ดูการส่งทั้งหมด" },
  "send_new.burn_after_n": {
    en: "After {n} view{plural} or expiration, the send is permanently burned.",
    th: "หลังเปิดดู {n} ครั้ง หรือเมื่อหมดอายุ การส่งจะถูกทำลายถาวร",
  },
  "send_new.key_after_hash": {
    en: "The decryption key is after the # — the server cannot decrypt this even if compromised.",
    th: "กุญแจถอดรหัสอยู่หลัง # — เซิร์ฟเวอร์ถอดรหัสไม่ได้แม้ถูกบุกรุก",
  },
  "send_new.recipient_must_verify": {
    en: "Recipient must verify their email matches {email} before viewing.",
    th: "ผู้รับต้องยืนยันอีเมล {email} ก่อนดู",
  },
  "send_new.info.recipient": { en: "Recipient", th: "ผู้รับ" },
  "send_new.info.max_views": { en: "Max views", th: "เปิดดูสูงสุด" },
  "send_new.info.expires_in": { en: "Expires in", th: "หมดอายุใน" },
  "send_new.info.passphrase": { en: "Passphrase", th: "Passphrase" },
  "send_new.passphrase_required": { en: "Required", th: "จำเป็น" },
  "send_new.passphrase_not_set": { en: "Not set", th: "ไม่ได้ตั้ง" },
  "send_new.exp.1h": { en: "1 hour", th: "1 ชั่วโมง" },
  "send_new.exp.24h": { en: "24 hours", th: "24 ชั่วโมง" },
  "send_new.exp.7d": { en: "7 days", th: "7 วัน" },
  "send_new.exp.30d": { en: "30 days", th: "30 วัน" },
  "send_new.mv.1": {
    en: "1 (burn after read)",
    th: "1 (ทำลายหลังอ่าน)",
  },
  "send_new.mv.3": { en: "3 views", th: "3 ครั้ง" },
  "send_new.mv.5": { en: "5 views", th: "5 ครั้ง" },
  "send_new.mv.10": { en: "10 views", th: "10 ครั้ง" },
  "send_new.fields_title": {
    en: "Select fields to send",
    th: "เลือกฟิลด์ที่จะส่ง",
  },
  "send_new.fields_hint": {
    en: "Each selected field will be included in the one-time link.",
    th: "ฟิลด์ที่เลือกจะถูกรวมในลิงก์ครั้งเดียว",
  },
  "send_new.field.password": { en: "Password", th: "Password" },
  "send_new.field.username": { en: "Username", th: "Username" },
  "send_new.field.totp": { en: "TOTP secret", th: "TOTP secret" },
  "send_new.field.url": { en: "URL", th: "URL" },
  "send_new.field.notes": { en: "Notes", th: "Notes" },
  "send_new.field.card_number": { en: "Card number", th: "เลขบัตร" },
  "send_new.field.card_cvv": { en: "CVV", th: "CVV" },
  "send_new.field.ssh_key": { en: "Private key", th: "Private key" },
  "send_new.audit_warning": {
    en: "Every action is recorded in the audit log · the secret itself is never logged.",
    th: "ทุก action ถูกบันทึกใน audit log · ตัว secret ไม่ถูก log",
  },
  "send_new.created_title": { en: "Send created", th: "สร้างการส่งแล้ว" },
  "send_new.created_subtitle": {
    en: "Share the link below. It will not be shown again.",
    th: "แชร์ลิงก์ด้านล่าง มันจะไม่แสดงอีก",
  },
  "send_new.link_copied": { en: "Link copied", th: "คัดลอกลิงก์แล้ว" },
  "send_new.views_count": {
    en: "{n} time{plural}",
    th: "{n} ครั้ง",
  },

  /* ---- members ---- */
  "members.title": { en: "Members", th: "สมาชิก" },
  "members.subtitle": {
    en: "{active} active · {pending} pending invites",
    th: "ใช้งาน {active} คน · รอตอบรับ {pending} คน",
  },
  "members.search": {
    en: "Search by name or email…",
    th: "ค้นหาตามชื่อหรืออีเมล…",
  },
  "members.invite": { en: "Invite", th: "เชิญ" },
  "members.export": { en: "Export", th: "ส่งออก" },
  "members.col.member": { en: "Member", th: "สมาชิก" },
  "members.col.role": { en: "Role", th: "บทบาท" },
  "members.col.2fa": { en: "2FA", th: "2FA" },
  "members.col.vaults": { en: "Vaults", th: "ตู้นิรภัย" },
  "members.col.last_active": { en: "Last active", th: "ใช้งานล่าสุด" },
  "members.stat.total": { en: "Total members", th: "สมาชิกทั้งหมด" },
  "members.stat.admins": { en: "Admins", th: "แอดมิน" },
  "members.stat.2fa": { en: "2FA enabled", th: "เปิดใช้ 2FA" },
  "members.stat.pending": { en: "Pending", th: "รอตอบรับ" },
  "members.pending.title": {
    en: "Pending invitations",
    th: "คำเชิญที่รอตอบรับ",
  },
  "members.pending.invited": { en: "Invited {when}", th: "เชิญเมื่อ {when}" },
  "members.resend": { en: "Resend", th: "ส่งซ้ำ" },
  "members.bulk_title": {
    en: "Bulk invite by email",
    th: "เชิญหลายคนด้วยอีเมล",
  },
  "members.bulk_desc": {
    en: "Paste multiple emails at once, or sync from Google Groups",
    th: "วางอีเมลหลายรายการ หรือซิงค์จาก Google Groups",
  },
  "members.open_inviter": { en: "Open inviter", th: "เปิดตัวจัดการคำเชิญ" },
  "members.role.owner": { en: "Owner", th: "เจ้าของ" },
  "members.role.admin": { en: "Admin", th: "แอดมิน" },
  "members.role.auditor": { en: "Auditor", th: "ผู้ตรวจสอบ" },
  "members.role.member": { en: "Member", th: "สมาชิก" },
  "members.role.guest": { en: "Guest", th: "บุคคลภายนอก" },
  "members.role.all": { en: "All", th: "ทั้งหมด" },
  "members.2fa.on": { en: "Enabled", th: "เปิดใช้งาน" },
  "members.2fa.off": { en: "Disabled", th: "ไม่ได้เปิดใช้" },
  "members.no_match": { en: "No members match", th: "ไม่พบสมาชิกที่ตรงกัน" },

  /* ---- invite dialog ---- */
  "invite.title": { en: "Invite members", th: "เชิญสมาชิก" },
  "invite.subtitle": {
    en: "Paste emails or import from Google Groups. We'll send each person a signed magic link.",
    th: "วางอีเมลหรือนำเข้าจาก Google Groups เราจะส่ง magic link ให้แต่ละคน",
  },
  "invite.email_addresses": { en: "Email addresses", th: "อีเมล" },
  "invite.email_placeholder": {
    en: "name@iux24.com — separate with comma, space, or Enter",
    th: "name@iux24.com — คั่นด้วย comma, space, หรือ Enter",
  },
  "invite.paste_hint": {
    en: "Paste a list — we'll split on commas, spaces, or new lines.",
    th: "วางรายการ — เราจะแยกตาม comma, space, หรือบรรทัดใหม่",
  },
  "invite.valid_count": {
    en: "{valid} / {total} valid",
    th: "ถูกต้อง {valid} / {total}",
  },
  "invite.invalid_count": {
    en: "{n} address is not a valid email format",
    th: "อีเมลรูปแบบไม่ถูกต้อง {n} รายการ",
  },
  "invite.invalid_count_plural": {
    en: "{n} addresses are not a valid email format",
    th: "อีเมลรูปแบบไม่ถูกต้อง {n} รายการ",
  },
  "invite.external_warning": {
    en: "{n} external address detected — not in @{domain}. Switch role to Guest to invite anyway.",
    th: "พบอีเมลภายนอก {n} รายการ — ไม่อยู่ใน @{domain} เปลี่ยนเป็นบทบาท Guest เพื่อเชิญ",
  },
  "invite.external_warning_plural": {
    en: "{n} external addresses detected — not in @{domain}. Switch role to Guest to invite anyway.",
    th: "พบอีเมลภายนอก {n} รายการ — ไม่อยู่ใน @{domain} เปลี่ยนเป็นบทบาท Guest เพื่อเชิญ",
  },
  "invite.role": { en: "Role", th: "บทบาท" },
  "invite.role.admin.desc": {
    en: "Manage workspace, teams, billing, audit",
    th: "จัดการเวิร์กสเปซ ทีม การเรียกเก็บเงิน และ audit",
  },
  "invite.role.auditor.desc": {
    en: "External compliance party. Metadata-only view of items and full audit log. No secret access.",
    th: "บุคคลภายนอก ดูได้เฉพาะชื่อรายการและประวัติการใช้งาน ห้ามเข้าถึงรหัสผ่านเด็ดขาด",
  },
  "invite.role.member.desc": {
    en: "Standard team access. Joins via SSO and group sync.",
    th: "การเข้าถึงระดับทีมปกติ เข้าผ่าน SSO และซิงค์กลุ่ม",
  },
  "invite.role.guest.desc": {
    en: "External party. No workspace browsing — vault access only.",
    th: "บุคคลภายนอก ไม่สามารถดูเวิร์กสเปซได้ — เข้าถึงตู้นิรภัยเท่านั้น",
  },
  "invite.role.owner.desc": {
    en: "Cannot invite directly — must transfer ownership",
    th: "เชิญโดยตรงไม่ได้ — ต้องโอนความเป็นเจ้าของ",
  },
  "invite.add_to_teams": {
    en: "Add to teams (optional)",
    th: "เพิ่มเข้าทีม (ไม่จำเป็น)",
  },
  "invite.selected_count": { en: "{n} selected", th: "เลือก {n} ทีม" },
  "invite.teams_hint": {
    en: "Teams synced from Google Groups are managed under SSO → Group mapping. Manual selections here apply on top.",
    th: "ทีมที่ซิงค์จาก Google Groups จัดการที่ SSO → Group mapping การเลือกที่นี่จะเพิ่มเติม",
  },
  "invite.guest_hint": {
    en: "Guests can't browse the workspace. After accepting, share specific vaults or items with them.",
    th: "Guest ดูเวิร์กสเปซไม่ได้ หลังตอบรับให้แชร์ตู้นิรภัยหรือรายการเฉพาะให้",
  },
  "invite.personal_message": {
    en: "Personal message (optional)",
    th: "ข้อความส่วนตัว (ไม่จำเป็น)",
  },
  "invite.message_placeholder": {
    en: "Hey, here's an invite to our team vault. Click to accept!",
    th: "สวัสดี นี่คือคำเชิญเข้าตู้นิรภัยทีมเรา คลิกเพื่อตอบรับได้เลย!",
  },
  "invite.hmac_hint": {
    en: "Magic link signed with HMAC · expires in 7 days",
    th: "Magic link เซ็นด้วย HMAC · หมดอายุใน 7 วัน",
  },
  "invite.send_n": {
    en: "Send {n} invite{plural}",
    th: "ส่งคำเชิญ {n} รายการ",
  },
  "invite.sent_success": {
    en: "Invited {n} {who}",
    th: "เชิญแล้ว {n} คน",
  },
  "invite.sent_desc": {
    en: "Signed magic link sent · expires in 7 days",
    th: "ส่ง magic link แล้ว · หมดอายุใน 7 วัน",
  },
  "invite.err_no_valid": {
    en: "Add at least one valid email",
    th: "เพิ่มอีเมลที่ถูกต้องอย่างน้อยหนึ่งรายการ",
  },
  "invite.err_external": {
    en: "External emails require Guest role",
    th: "อีเมลภายนอกต้องใช้บทบาท Guest",
  },
  "invite.err_external_desc": {
    en: "Switch role or remove external addresses.",
    th: "เปลี่ยนบทบาทหรือเอาอีเมลภายนอกออก",
  },

  /* ---- trash ---- */
  "trash.title": { en: "Trash", th: "ถังขยะ" },
  "trash.subtitle": {
    en: "Deleted items are kept for 30 days before being permanently removed",
    th: "รายการที่ลบจะถูกเก็บไว้ 30 วันก่อนลบถาวร",
  },
  "trash.empty.title": { en: "Trash is empty", th: "ถังขยะว่างเปล่า" },
  "trash.empty.desc": {
    en: "Deleted items will appear here. They're recoverable for 30 days before being permanently wiped.",
    th: "รายการที่ลบจะปรากฏที่นี่ กู้คืนได้ภายใน 30 วันก่อนถูกลบถาวร",
  },
  "trash.empty_button": { en: "Empty trash", th: "ล้างถังขยะ" },
  "trash.retention_notice_title": {
    en: "Retention policy:",
    th: "นโยบายการเก็บข้อมูล:",
  },
  "trash.retention_notice": {
    en: "Items in trash are recoverable for 30 days. After that they are cryptographically wiped — even backups cannot recover them.",
    th: "รายการในถังขยะกู้คืนได้ภายใน 30 วัน หลังจากนั้นจะถูกลบทางคริปโตกราฟิก — แม้แต่ backup ก็กู้ไม่ได้",
  },
  "trash.confirm.title": {
    en: "Permanently empty trash?",
    th: "ล้างถังขยะถาวร?",
  },
  "trash.confirm.desc": {
    en: "All {n} items will be permanently deleted. This cannot be undone — recipients with cached copies of these secrets will lose access immediately.",
    th: "{n} รายการทั้งหมดจะถูกลบถาวร ย้อนกลับไม่ได้ — ผู้รับที่มีสำเนาที่แคชไว้จะสูญเสียการเข้าถึงทันที",
  },
  "trash.confirm.button": {
    en: "Permanently delete all",
    th: "ลบทั้งหมดถาวร",
  },
  "trash.search": { en: "Search trash…", th: "ค้นหาในถังขยะ…" },
  "trash.col.item": { en: "Item", th: "รายการ" },
  "trash.col.from_vault": { en: "From vault", th: "จากตู้นิรภัย" },
  "trash.col.deleted_by": { en: "Deleted by", th: "ลบโดย" },
  "trash.col.purge_in": { en: "Auto-purge in", th: "ลบถาวรใน" },
  "trash.selected": { en: "{n} selected", th: "เลือกแล้ว {n} รายการ" },
  "trash.days_left": { en: "{n} days", th: "{n} วัน" },
  "trash.no_match": { en: "No items match", th: "ไม่พบรายการที่ตรงกัน" },
  "trash.toast.emptied": { en: "Trash emptied", th: "ล้างถังขยะแล้ว" },
  "trash.toast.emptied_desc": {
    en: "{n} items permanently deleted.",
    th: "ลบ {n} รายการถาวรแล้ว",
  },
  "trash.toast.restored": { en: "Restored", th: "กู้คืนแล้ว" },
  "trash.toast.restored_desc": {
    en: "{name} was returned to its vault.",
    th: "กู้คืน {name} กลับเข้าตู้นิรภัยแล้ว",
  },
  "trash.toast.purged": { en: "Permanently deleted", th: "ลบถาวรแล้ว" },
  "trash.toast.purged_desc": {
    en: "{name} was permanently deleted and cannot be recovered.",
    th: "ลบ {name} ถาวรแล้วและไม่สามารถกู้คืนได้",
  },
  "trash.toast.restore_failed": {
    en: "Couldn't restore item",
    th: "กู้คืนรายการไม่สำเร็จ",
  },
  "trash.toast.purge_failed": {
    en: "Couldn't permanently delete item",
    th: "ลบรายการถาวรไม่สำเร็จ",
  },
  "trash.toast.bulk_restored": {
    en: "Restored {ok} items",
    th: "กู้คืน {ok} รายการแล้ว",
  },
  "trash.toast.bulk_restored_partial": {
    en: "Restored {ok} of {total} — {failed} failed",
    th: "กู้คืน {ok} จาก {total} รายการ — ล้มเหลว {failed} รายการ",
  },
  "trash.toast.bulk_purged": {
    en: "Permanently deleted {ok} items",
    th: "ลบ {ok} รายการถาวรแล้ว",
  },
  "trash.toast.bulk_purged_partial": {
    en: "Deleted {ok} of {total} — {failed} failed",
    th: "ลบ {ok} จาก {total} รายการ — ล้มเหลว {failed} รายการ",
  },
  "trash.toast.empty_failed": {
    en: "Couldn't empty trash",
    th: "ล้างถังขยะไม่สำเร็จ",
  },
  "trash.row_confirm.title": {
    en: "Permanently delete this item?",
    th: "ลบรายการนี้ถาวร?",
  },
  "trash.row_confirm.desc": {
    en: "{name} will be permanently deleted. This cannot be undone — recipients with cached copies of this secret will lose access immediately.",
    th: "{name} จะถูกลบถาวร ย้อนกลับไม่ได้ — ผู้รับที่มีสำเนาที่แคชไว้จะสูญเสียการเข้าถึงทันที",
  },
  "trash.row_confirm.button": {
    en: "Permanently delete",
    th: "ลบถาวร",
  },
  "trash.bulk_confirm.title": {
    en: "Permanently delete selected items?",
    th: "ลบรายการที่เลือกถาวร?",
  },
  "trash.bulk_confirm.desc": {
    en: "{n} items will be permanently deleted. This cannot be undone.",
    th: "{n} รายการจะถูกลบถาวร ย้อนกลับไม่ได้",
  },

  /* ---- audit ---- */
  "audit.title": { en: "Audit Log", th: "ประวัติการใช้งาน" },
  "audit.subtitle": {
    en: "Every action in your vault, immutable and timestamped.",
    th: "ทุกการกระทำในตู้นิรภัย เปลี่ยนแปลงไม่ได้และมี timestamp",
  },
  "audit.search": { en: "Search events…", th: "ค้นหาเหตุการณ์…" },
  "audit.export_csv": { en: "Export CSV", th: "ส่งออกเป็น CSV" },
  "audit.no_match": {
    en: "No events match the current filters",
    th: "ไม่มีเหตุการณ์ที่ตรงกับตัวกรองปัจจุบัน",
  },
  "audit.col.timestamp": { en: "Timestamp", th: "เวลา" },
  "audit.col.actor": { en: "Actor", th: "ผู้กระทำ" },
  "audit.col.action": { en: "Action", th: "การกระทำ" },
  "audit.col.target": { en: "Target", th: "เป้าหมาย" },
  "audit.col.ip": { en: "IP", th: "IP" },
  "audit.filter.time_range": { en: "Time range", th: "ช่วงเวลา" },
  "audit.filter.all_time": { en: "All time", th: "ทุกช่วงเวลา" },
  "audit.filter.24h": { en: "Last 24 hours", th: "24 ชั่วโมงล่าสุด" },
  "audit.filter.7d": { en: "Last 7 days", th: "7 วันล่าสุด" },
  "audit.filter.30d": { en: "Last 30 days", th: "30 วันล่าสุด" },
  "audit.filter.90d": { en: "Last 90 days", th: "90 วันล่าสุด" },
  "audit.filter.action": { en: "Action type", th: "ประเภทการกระทำ" },
  "audit.filter.all_actions": { en: "All actions", th: "ทุกการกระทำ" },
  "audit.filter.actor": { en: "Actor", th: "ผู้กระทำ" },
  /* audit filter — action group headers */
  "audit.group.item": { en: "Items", th: "รายการ" },
  "audit.group.folder": { en: "Folders", th: "โฟลเดอร์" },
  "audit.group.vault": { en: "Vaults", th: "ตู้นิรภัย" },
  "audit.group.team": { en: "Teams", th: "ทีม" },
  "audit.group.member": { en: "Members", th: "สมาชิก" },
  "audit.group.auth": { en: "Authentication", th: "การยืนยันตัวตน" },
  "audit.group.2fa": { en: "Two-factor", th: "ยืนยันสองชั้น" },
  "audit.group.account": { en: "Account", th: "บัญชี" },
  "audit.group.attachment": { en: "Attachments", th: "ไฟล์แนบ" },
  "audit.group.send": { en: "Sends", th: "การส่ง" },
  "audit.group.workspace": { en: "Workspace", th: "เวิร์กสเปซ" },
  "audit.group.trash": { en: "Trash", th: "ถังขยะ" },
  "audit.group.other": { en: "Other", th: "อื่นๆ" },
  "audit.events_count": {
    en: "{n} of {m} events",
    th: "{n} จาก {m} เหตุการณ์",
  },
  /* audit actions — 2FA */
  "audit.action.2fa_enabled": { en: "Enabled 2FA", th: "เปิดใช้ 2FA" },
  "audit.action.2fa_disabled": { en: "Disabled 2FA", th: "ปิดใช้ 2FA" },
  "audit.action.2fa_enroll_started": {
    en: "Started 2FA setup",
    th: "เริ่มตั้งค่า 2FA",
  },
  "audit.action.2fa_backup_code_used": {
    en: "Used a backup code",
    th: "ใช้รหัสสำรอง",
  },
  "audit.action.2fa_backup_codes_regenerated": {
    en: "Regenerated backup codes",
    th: "สร้างรหัสสำรองใหม่",
  },
  "audit.action.2fa_login_verified": {
    en: "2FA verified at sign-in",
    th: "ยืนยัน 2FA ตอนเข้าสู่ระบบ",
  },
  "audit.action.2fa_login_failed": {
    en: "2FA verification failed",
    th: "ยืนยัน 2FA ไม่สำเร็จ",
  },

  /* audit actions — account */
  "audit.action.account_password_setup": {
    en: "Set up password",
    th: "ตั้งรหัสผ่าน",
  },
  "audit.action.account_password_reset_recovery": {
    en: "Reset password via recovery",
    th: "รีเซ็ตรหัสผ่านด้วยกู้คืน",
  },
  "audit.action.account_password_reset_failed": {
    en: "Password reset failed",
    th: "รีเซ็ตรหัสผ่านไม่สำเร็จ",
  },
  "audit.action.account_profile_updated": {
    en: "Updated profile",
    th: "อัพเดตโปรไฟล์",
  },
  "audit.action.account_recovery_kit_generated": {
    en: "Generated recovery kit",
    th: "สร้างชุดกู้คืน",
  },
  "audit.action.account_recovery_kit_regenerated": {
    en: "Regenerated recovery kit",
    th: "สร้างชุดกู้คืนใหม่",
  },
  "audit.action.account_recovery_kit_regenerate_failed": {
    en: "Recovery kit regeneration failed",
    th: "สร้างชุดกู้คืนใหม่ไม่สำเร็จ",
  },
  "audit.action.account_sessions_revoked": {
    en: "Revoked all sessions",
    th: "เพิกถอนทุกเซสชัน",
  },
  "audit.action.account_sessions_revoke_failed": {
    en: "Session revoke failed",
    th: "เพิกถอนเซสชันไม่สำเร็จ",
  },
  "audit.action.vault_unlock_success": {
    en: "Unlocked vault",
    th: "ปลดล็อกตู้นิรภัย",
  },
  "audit.action.vault_unlock_failed": {
    en: "Vault unlock failed",
    th: "ปลดล็อกตู้นิรภัยไม่สำเร็จ",
  },

  /* audit actions — auth */
  "audit.action.auth_login_success": { en: "Signed in", th: "เข้าสู่ระบบ" },
  "audit.action.auth_login_failed": {
    en: "Sign-in failed",
    th: "เข้าสู่ระบบไม่สำเร็จ",
  },
  "audit.action.auth_login_mfa_required": {
    en: "Sign-in needs 2FA",
    th: "เข้าสู่ระบบต้องใช้ 2FA",
  },
  "audit.action.auth_logout": { en: "Signed out", th: "ออกจากระบบ" },
  "audit.action.auth_register": { en: "Registered account", th: "สมัครบัญชี" },
  "audit.action.auth_register_failed": {
    en: "Registration failed",
    th: "สมัครบัญชีไม่สำเร็จ",
  },
  "audit.action.auth_sso_login_failed": {
    en: "SSO sign-in failed",
    th: "เข้าสู่ระบบ SSO ไม่สำเร็จ",
  },

  /* audit actions — attachment */
  "audit.action.attachment_uploaded": {
    en: "Uploaded attachment",
    th: "อัปโหลดไฟล์แนบ",
  },
  "audit.action.attachment_downloaded": {
    en: "Downloaded attachment",
    th: "ดาวน์โหลดไฟล์แนบ",
  },
  "audit.action.attachment_deleted": {
    en: "Deleted attachment",
    th: "ลบไฟล์แนบ",
  },

  /* audit actions — item */
  "audit.action.item_view": { en: "Viewed item", th: "เปิดดูรายการ" },
  "audit.action.item_create": { en: "Created item", th: "สร้างรายการ" },
  "audit.action.item_update": { en: "Updated item", th: "อัพเดตรายการ" },
  "audit.action.item_delete": { en: "Deleted item", th: "ลบรายการ" },
  "audit.action.item_reveal": { en: "Revealed secret", th: "เปิดเผยข้อมูลลับ" },
  "audit.action.item_restore": { en: "Restored item", th: "กู้คืนรายการ" },
  "audit.action.item_purge": {
    en: "Permanently deleted item",
    th: "ลบรายการถาวร",
  },
  "audit.action.item_share": { en: "Shared item", th: "แชร์รายการ" },
  "audit.action.item_role_change": {
    en: "Changed item access role",
    th: "เปลี่ยนสิทธิ์การเข้าถึงรายการ",
  },
  "audit.action.item_revoke": {
    en: "Revoked item access",
    th: "เพิกถอนสิทธิ์การเข้าถึงรายการ",
  },

  /* audit actions — folder */
  "audit.action.folder_create": { en: "Created folder", th: "สร้างโฟลเดอร์" },
  "audit.action.folder_update": { en: "Updated folder", th: "อัพเดตโฟลเดอร์" },
  "audit.action.folder_delete": { en: "Deleted folder", th: "ลบโฟลเดอร์" },
  "audit.action.folder_share": { en: "Shared folder", th: "แชร์โฟลเดอร์" },
  "audit.action.folder_role_change": {
    en: "Changed folder access role",
    th: "เปลี่ยนสิทธิ์การเข้าถึงโฟลเดอร์",
  },
  "audit.action.folder_revoke": {
    en: "Revoked folder access",
    th: "เพิกถอนสิทธิ์การเข้าถึงโฟลเดอร์",
  },

  /* audit actions — vault */
  "audit.action.vault_create": { en: "Created vault", th: "สร้างตู้นิรภัย" },
  "audit.action.vault_update": { en: "Updated vault", th: "อัพเดตตู้นิรภัย" },
  "audit.action.vault_delete": { en: "Deleted vault", th: "ลบตู้นิรภัย" },
  "audit.action.vault_share": { en: "Shared vault", th: "แชร์ตู้นิรภัย" },
  "audit.action.vault_role_change": {
    en: "Changed vault access role",
    th: "เปลี่ยนสิทธิ์การเข้าถึงตู้นิรภัย",
  },
  "audit.action.vault_revoke": {
    en: "Revoked vault access",
    th: "เพิกถอนสิทธิ์การเข้าถึงตู้นิรภัย",
  },
  "audit.action.vault_access_denied_locked": {
    en: "Vault access denied (locked)",
    th: "ปฏิเสธการเข้าถึงตู้นิรภัย (ถูกล็อก)",
  },

  /* audit actions — member */
  "audit.action.member_invite": { en: "Invited member", th: "เชิญสมาชิก" },
  "audit.action.member_invite_resent": {
    en: "Resent invitation",
    th: "ส่งคำเชิญอีกครั้ง",
  },
  "audit.action.member_invite_revoked": {
    en: "Revoked invitation",
    th: "เพิกถอนคำเชิญ",
  },
  "audit.action.member_invitation_accepted": {
    en: "Accepted invitation",
    th: "ตอบรับคำเชิญ",
  },
  "audit.action.member_remove": { en: "Removed member", th: "ลบสมาชิก" },
  "audit.action.member_role_change": {
    en: "Changed member role",
    th: "เปลี่ยนบทบาทสมาชิก",
  },
  "audit.action.team_create": { en: "Team create", th: "สร้างทีม" },
  "audit.action.team_update": { en: "Team update", th: "อัพเดตทีม" },
  "audit.action.team_delete": { en: "Team delete", th: "ลบทีม" },
  "audit.action.team_member_add": { en: "Team member add", th: "เพิ่มสมาชิกในทีม" },
  "audit.action.team_member_remove": { en: "Team member remove", th: "ลบสมาชิกออกจากทีม" },
  "audit.action.team_view": { en: "Team view", th: "ดูทีม" },
  "audit.action.team_list_viewed": { en: "Team list viewed", th: "ดูรายการทีม" },
  "audit.action.access_request_created": {
    en: "Requested access",
    th: "ขอสิทธิ์เข้าถึง",
  },
  "audit.action.access_request_approved": {
    en: "Approved access request",
    th: "อนุมัติการขอสิทธิ์เข้าถึง",
  },
  "audit.action.access_request_denied": {
    en: "Denied access request",
    th: "ปฏิเสธการขอสิทธิ์เข้าถึง",
  },

  /* audit actions — send */
  "audit.action.send_create": { en: "Created send", th: "สร้างการส่ง" },
  "audit.action.send_burn": { en: "Burned send", th: "ทำลายการส่ง" },
  "audit.action.send_reveal_deferred": {
    en: "Opened send",
    th: "เปิดการส่ง",
  },
  "audit.action.send_reveal_failed": {
    en: "Send open failed",
    th: "เปิดการส่งไม่สำเร็จ",
  },

  /* audit actions — workspace */
  "audit.action.workspace_created": {
    en: "Created workspace",
    th: "สร้างเวิร์กสเปซ",
  },
  "audit.action.workspace_switched": {
    en: "Switched workspace",
    th: "สลับเวิร์กสเปซ",
  },
  "audit.action.workspace_policy_update": {
    en: "Updated security policy",
    th: "อัพเดตนโยบายความปลอดภัย",
  },
  "audit.action.workspace_ownership_transferred": {
    en: "Transferred ownership",
    th: "โอนความเป็นเจ้าของ",
  },
  "audit.action.workspace_ownership_transfer_failed": {
    en: "Ownership transfer failed",
    th: "โอนความเป็นเจ้าของไม่สำเร็จ",
  },

  /* audit actions — trash */
  "audit.action.trash_empty": { en: "Emptied trash", th: "ล้างถังขยะ" },

  /* audit detail — metadata-enriched labels */
  "audit.detail.shared_with": {
    en: "Shared with {email}",
    th: "แชร์ให้ {email}",
  },
  "audit.detail.role_changed": {
    en: "Changed {email}'s role: {from} → {to}",
    th: "เปลี่ยนสิทธิ์ {email}: {from} → {to}",
  },
  "audit.detail.revoked": {
    en: "Revoked {email}'s access",
    th: "เพิกถอนสิทธิ์ {email}",
  },
  "audit.detail.member_role_changed": {
    en: "Changed {who}'s role: {from} → {to}",
    th: "เปลี่ยนบทบาท {who}: {from} → {to}",
  },
  "audit.detail.member_removed": {
    en: "Removed {who} ({role})",
    th: "ลบ {who} ({role})",
  },
  "audit.detail.member_removed_simple": {
    en: "Removed {who}",
    th: "ลบ {who}",
  },
  "audit.detail.member_invited": {
    en: "Invited {who} as {role}",
    th: "เชิญ {who} เป็น {role}",
  },
  "audit.detail.member_invited_simple": {
    en: "Invited {who}",
    th: "เชิญ {who}",
  },
  "audit.detail.team_member_added": {
    en: "Added {who} to team {team}",
    th: "เพิ่ม {who} ในทีม {team}",
  },
  "audit.detail.team_member_removed": {
    en: "Removed {who} from team {team}",
    th: "เอา {who} ออกจากทีม {team}",
  },
  "audit.success": { en: "Success", th: "สำเร็จ" },
  "audit.failure": { en: "Failed", th: "ล้มเหลว" },
  "audit.no_target": { en: "—", th: "—" },
  "audit.unknown_actor": { en: "System", th: "ระบบ" },
  "audit.load_more": { en: "Load more", th: "โหลดเพิ่มเติม" },
  "audit.loaded_count": {
    en: "{n} events loaded",
    th: "โหลดแล้ว {n} เหตุการณ์",
  },
  "audit.loading": { en: "Loading audit log…", th: "กำลังโหลดประวัติการใช้งาน…" },

  "import.title": { en: "Import Data", th: "นำเข้าข้อมูล" },
  "import.subtitle": { en: "Migrate your items from other password managers", th: "ย้ายข้อมูลของคุณจากโปรแกรมจัดการรหัสผ่านอื่น" },
  "import.source.select": { en: "Select source", th: "เลือกแหล่งที่มา" },
  "import.source.1password": { en: "1Password (.1pux)", th: "1Password (.1pux)" },
  "import.source.bitwarden": { en: "Bitwarden (.json)", th: "Bitwarden (.json)" },
  "import.source.lastpass": { en: "LastPass (.csv)", th: "LastPass (.csv)" },
  "import.source.generic_csv": { en: "Generic CSV", th: "CSV ทั่วไป" },
  "import.upload.title": { en: "Upload file", th: "อัปโหลดไฟล์" },
  "import.upload.desc": { en: "Drag and drop your export file here, or click to browse", th: "ลากไฟล์ส่งออกของคุณมาที่นี่ หรือคลิกเพื่อเลือกไฟล์" },
  "import.upload.error": { en: "Failed to upload and parse file", th: "อัปโหลดและประมวลผลไฟล์ไม่สำเร็จ" },
  "import.review.title": { en: "Review items", th: "ตรวจสอบรายการ" },
  "import.review.desc": { en: "We found {n} items in your file. Review them before importing.", th: "พบ {n} รายการในไฟล์ของคุณ ตรวจสอบก่อนนำเข้า" },
  "import.config.title": { en: "Import settings", th: "ตั้งค่าการนำเข้า" },
  "import.config.vault": { en: "Target Vault", th: "ตู้เก็บของปลายทาง" },
  "import.config.folder": { en: "Target Folder (Optional)", th: "โฟลเดอร์ปลายทาง (ไม่บังคับ)" },
  "import.config.conflict": { en: "Conflict Policy", th: "นโยบายเมื่อข้อมูลซ้ำ" },
  "import.config.conflict.skip": { en: "Skip duplicates", th: "ข้ามรายการที่ซ้ำ" },
  "import.config.conflict.overwrite": { en: "Overwrite existing", th: "เขียนทับข้อมูลเดิม" },
  "import.config.conflict.append": { en: "Append (create new copy)", th: "เพิ่มใหม่ (สร้างสำเนา)" },
  "import.execute.btn": { en: "Start Import", th: "เริ่มนำเข้า" },
  "import.status.processing": { en: "Importing...", th: "กำลังนำเข้า..." },
  "import.status.completed": { en: "Import completed", th: "นำเข้าสำเร็จ" },
  "import.status.failed": { en: "Import failed", th: "นำเข้าล้มเหลว" },
  "import.result.success": { en: "Successfully imported {n} items", th: "นำเข้าสำเร็จ {n} รายการ" },
  "import.result.failed": { en: "{n} items failed to import", th: "นำเข้าไม่สำเร็จ {n} รายการ" },
  "import.result.skipped": { en: "{n} items skipped", th: "ข้าม {n} รายการ" },

  /* ---- bulk operations ---- */
  "bulk.selected": { en: "{n} selected", th: "เลือกอยู่ {n} รายการ" },
  "bulk.action.delete": { en: "Delete", th: "ลบ" },
  "bulk.action.move": { en: "Move to folder", th: "ย้ายไปโฟลเดอร์" },
  "bulk.action.share": { en: "Share", th: "แชร์" },
  "bulk.delete.title": { en: "Delete {n} items?", th: "ลบ {n} รายการ?" },
  "bulk.delete.desc": { en: "These items will be moved to the trash. You can restore them within 30 days.", th: "รายการเหล่านี้จะถูกย้ายไปที่ถังขยะ คุณสามารถกู้คืนได้ภายใน 30 วัน" },
  "bulk.delete.confirm": { en: "Delete Items", th: "ลบรายการ" },
  "bulk.move.title": { en: "Move {n} items", th: "ย้าย {n} รายการ" },
  "bulk.move.select_folder": { en: "Select target folder", th: "เลือกโฟลเดอร์ปลายทาง" },
  "bulk.move.confirm": { en: "Move Items", th: "ย้ายรายการ" },
  "bulk.success.deleted": { en: "Successfully deleted {n} items", th: "ลบสำเร็จ {n} รายการ" },
  "bulk.success.moved": { en: "Successfully moved {n} items", th: "ย้ายสำเร็จ {n} รายการ" },
  "bulk.partial_success": { en: "{s} items succeeded, {f} items failed", th: "สำเร็จ {s} รายการ, ล้มเหลว {f} รายการ" },
  "bulk.share.title": { en: "Share {n} items", th: "แชร์ {n} รายการ" },
  "bulk.share.desc": {
    en: "Grant a person or team access to all selected items. Items you don't manage are skipped.",
    th: "ให้สิทธิ์เข้าถึงทุกรายการที่เลือกแก่ผู้ใช้หรือทีม รายการที่คุณไม่มีสิทธิ์จัดการจะถูกข้าม",
  },
  "bulk.share.recipient": { en: "Recipient", th: "ผู้รับสิทธิ์" },
  "bulk.share.no_recipient": { en: "Select a person or team to share with", th: "เลือกผู้ใช้หรือทีมที่จะแชร์ให้" },
  "bulk.share.confirm": { en: "Share Items", th: "แชร์รายการ" },
  "bulk.success.shared": { en: "Shared {n} items", th: "แชร์สำเร็จ {n} รายการ" },
  "teams.member_count": { en: "{n} members", th: "สมาชิก {n} คน" },
  "bulk.share.partial": { en: "Shared {s} · skipped {f}", th: "แชร์ {s} · ข้าม {f}" },

  "audit.action.import_start": { en: "Started import", th: "เริ่มการนำเข้า" },
  "upgrade.title": { en: "Security Upgrade Required", th: "จำเป็นต้องอัปเกรดความปลอดภัย" },
  "upgrade.desc": { 
    en: "We've improved our encryption to Zero-Knowledge. To continue, please enter your Master Password one last time to secure your keys locally.",
    th: "เราได้พัฒนาระบบการเข้ารหัสเป็นแบบ Zero-Knowledge เพื่อความปลอดภัยสูงสุด โปรดกรอก Master Password ของคุณอีกครั้งเพื่อยืนยันการสร้างกุญแจเข้ารหัสส่วนตัว"
  },
  "upgrade.button": { en: "Upgrade Security", th: "อัปเกรดความปลอดภัย" },
  "upgrade.hint": { 
    en: "After this upgrade, Woxa administrators will never be able to see your passwords, even in their database.",
    th: "หลังจากการอัปเกรดนี้ แม้แต่ผู้ดูแลระบบของ Woxa ก็จะไม่สามารถเห็นรหัสผ่านของคุณได้ เนื่องจากกุญแจถูกเก็บไว้ที่คุณคนเดียว"
  },
  "upgrade.success_toast": { en: "Security upgrade complete!", th: "อัปเกรดความปลอดภัยเสร็จสมบูรณ์!" },
  "audit.empty_title": { en: "No events yet", th: "ยังไม่มีเหตุการณ์" },
  "audit.empty_desc": {
    en: "Actions across your workspace will appear here.",
    th: "การกระทำต่าง ๆ ในเวิร์กสเปซจะแสดงที่นี่",
  },
  "audit.exported": {
    en: "Exported {n} events",
    th: "ส่งออก {n} เหตุการณ์",
  },
  "audit.exported_desc": {
    en: "{file} downloaded",
    th: "ดาวน์โหลด {file} แล้ว",
  },

  /* ---- settings ---- */
  "settings.workspace": { en: "Workspace", th: "เวิร์กสเปซ" },
  "settings.workspace_settings": {
    en: "Workspace settings",
    th: "ตั้งค่าเวิร์กสเปซ",
  },
  "settings.workspace_subtitle": {
    en: "Admin controls for {name}",
    th: "ตัวควบคุมแอดมินของ {name}",
  },
  "settings.workspace_desc": {
    en: "{name} workspace settings",
    th: "ตั้งค่าเวิร์กสเปซ {name}",
  },
  "settings.general": { en: "General", th: "ทั่วไป" },
  "settings.workspace_name": { en: "Workspace name", th: "ชื่อเวิร์กสเปซ" },
  "settings.slug": { en: "Slug", th: "Slug" },
  "settings.slug_auto_hint": {
    en: "The slug is generated from the workspace name automatically.",
    th: "slug จะถูกสร้างจากชื่อเวิร์กสเปซโดยอัตโนมัติ",
  },
  "settings.rename.success": {
    en: "Workspace renamed to “{name}”.",
    th: "เปลี่ยนชื่อเวิร์กสเปซเป็น “{name}” แล้ว",
  },
  "settings.rename.error_forbidden": {
    en: "Only owners and admins can rename the workspace.",
    th: "เฉพาะ owner และ admin เท่านั้นที่เปลี่ยนชื่อเวิร์กสเปซได้",
  },
  "settings.rename.error_invalid": {
    en: "That workspace name isn’t valid.",
    th: "ชื่อเวิร์กสเปซไม่ถูกต้อง",
  },
  "settings.rename.error_generic": {
    en: "Couldn’t rename the workspace. Please try again.",
    th: "เปลี่ยนชื่อเวิร์กสเปซไม่สำเร็จ ลองอีกครั้ง",
  },
  "settings.sso": { en: "SSO & provisioning", th: "SSO และการจัดเตรียม" },
  "settings.sso_summary": {
    en: "Google Workspace connected · 12 members · 5 group mappings",
    th: "Google Workspace เชื่อมต่อแล้ว · 12 สมาชิก · 5 group mappings",
  },
  "settings.security_policy": { en: "Security policy", th: "นโยบายความปลอดภัย" },
  "settings.security_policy_desc": {
    en: "Auth requirements, idle lock, export restrictions",
    th: "ข้อกำหนดการ authentication, การล็อคขณะไม่ใช้งาน, การจำกัดการส่งออก",
  },
  "settings.security_policy_rules": {
    en: "Rules that apply to every member in this workspace",
    th: "กฎที่บังคับใช้กับทุกสมาชิกในเวิร์กสเปซนี้",
  },
  "settings.integrations": { en: "Integrations", th: "การเชื่อมต่อ" },
  "settings.billing": { en: "Plan & billing", th: "แผนและการเรียกเก็บเงิน" },
  "settings.profile": { en: "Profile", th: "โปรไฟล์" },
  "settings.profile_desc": {
    en: "Your personal information visible to other members",
    th: "ข้อมูลส่วนตัวของคุณที่สมาชิกคนอื่นเห็น",
  },
  "settings.photo_hint": {
    en: "JPG, PNG or GIF · max 2MB",
    th: "JPG, PNG หรือ GIF · สูงสุด 2MB",
  },
  "settings.security_2fa": { en: "Security & 2FA", th: "ความปลอดภัยและ 2FA" },
  "settings.security_2fa_desc": {
    en: "Protect your account with extra verification",
    th: "ปกป้องบัญชีของคุณด้วยการยืนยันเพิ่มเติม",
  },
  "settings.master_password": { en: "Master password", th: "รหัสผ่านมาสเตอร์" },
  "settings.master_password_desc": {
    en: "Used to derive your encryption key. Never sent to our servers.",
    th: "ใช้สร้างกุญแจเข้ารหัสในเครื่องคุณ ไม่ถูกส่งไปยังเซิร์ฟเวอร์",
  },
  "settings.change_password": { en: "Change password", th: "เปลี่ยนรหัสผ่าน" },
  "settings.last_changed_days": {
    en: "Last changed {n} days ago",
    th: "เปลี่ยนล่าสุดเมื่อ {n} วันก่อน",
  },
  "settings.2fa_required_by_policy": {
    en: "Required by workspace policy",
    th: "บังคับตามนโยบายเวิร์กสเปซ",
  },
  "settings.totp_title": {
    en: "Authenticator app (TOTP)",
    th: "แอป Authenticator (TOTP)",
  },
  "settings.totp_desc": {
    en: "Google Authenticator, 1Password, Authy",
    th: "Google Authenticator, 1Password, Authy",
  },
  "settings.totp_added": { en: "Added Jan 10, 2026", th: "เพิ่มเมื่อ 10 ม.ค. 2026" },
  "settings.passkeys_title": { en: "Passkeys", th: "Passkeys" },
  "settings.passkeys_desc": {
    en: "Face ID, Touch ID, hardware keys",
    th: "Face ID, Touch ID, hardware keys",
  },
  "settings.passkeys_count": {
    en: "2 passkeys registered",
    th: "ลงทะเบียน Passkey แล้ว 2 รายการ",
  },
  "settings.add_method": { en: "Add another method", th: "เพิ่มวิธีอื่น" },
  "settings.recovery_kit": { en: "Recovery Kit", th: "Recovery Kit" },
  "settings.recovery_kit_desc": {
    en: "24-word phrase that can restore your master password if you lose it.",
    th: "ชุดคำ 24 คำสำหรับกู้รหัสผ่านมาสเตอร์คืน เผื่อคุณลืม",
  },
  "settings.recovery_generated": {
    en: "Generated Jan 10, 2026 · Keep it offline & physical",
    th: "สร้างเมื่อ 10 ม.ค. 2026 · ควรเก็บแบบออฟไลน์ พิมพ์ลงกระดาษ",
  },
  "settings.active_sessions": { en: "Active sessions", th: "เซสชันที่ใช้งานอยู่" },
  "settings.sessions_count": {
    en: "{n} devices signed in",
    th: "อุปกรณ์เข้าสู่ระบบ {n} เครื่อง",
  },
  "settings.signout_all": { en: "Sign out all", th: "ออกจากระบบทั้งหมด" },
  "settings.notifications_email": {
    en: "Email notifications",
    th: "การแจ้งเตือนทางอีเมล",
  },
  "settings.notifications_in_app": {
    en: "In-app notifications",
    th: "การแจ้งเตือนในแอป",
  },
  "settings.notif.new_login": { en: "New login alert", th: "แจ้งเตือนการเข้าสู่ระบบใหม่" },
  "settings.notif.new_login_desc": {
    en: "When your account signs in from a new device",
    th: "เมื่อบัญชีคุณเข้าสู่ระบบจากอุปกรณ์ใหม่",
  },
  "settings.notif.send_received": {
    en: "One-time send received",
    th: "มีคนเปิดลิงก์ที่คุณส่ง",
  },
  "settings.notif.send_received_desc": {
    en: "When someone you sent a link to views it",
    th: "แจ้งเตือนเมื่อผู้รับเปิดดูลิงก์ที่คุณส่งไป",
  },
  "settings.notif.send_expired": {
    en: "Send expired without view",
    th: "ลิงก์หมดอายุโดยไม่มีคนเปิด",
  },
  "settings.notif.send_expired_desc": {
    en: "When a one-time send you created expires unread",
    th: "แจ้งเตือนเมื่อลิงก์ที่คุณสร้างหมดอายุโดยที่ยังไม่มีใครเปิดดู",
  },
  "settings.notif.vault_shared": {
    en: "Vault access granted",
    th: "ได้รับสิทธิ์เข้าตู้นิรภัย",
  },
  "settings.notif.vault_shared_desc": {
    en: "When someone shares a vault with you",
    th: "เมื่อมีคนแชร์ตู้นิรภัยให้คุณ",
  },
  "settings.notif.rotation": {
    en: "Password expiry reminder",
    th: "เตือนรหัสผ่านใกล้หมดอายุ",
  },
  "settings.notif.rotation_desc": {
    en: "When items in your vaults need rotation",
    th: "เมื่อรายการในตู้นิรภัยต้องเปลี่ยนรหัส",
  },
  "settings.notif.weekly": { en: "Weekly digest", th: "สรุปประจำสัปดาห์" },
  "settings.notif.weekly_desc": {
    en: "Summary of vault activity every Monday",
    th: "สรุปกิจกรรมตู้นิรภัยทุกวันจันทร์",
  },
  "settings.notif.mentions": { en: "Mentions", th: "การ mention" },
  "settings.notif.mentions_desc": {
    en: "When you're @mentioned in a note",
    th: "เมื่อคุณถูก @mention ในบันทึก",
  },
  "settings.notif.sounds": { en: "Activity sound", th: "เสียงแจ้งเตือน" },
  "settings.notif.sounds_desc": {
    en: "Play a subtle sound for important alerts",
    th: "เล่นเสียงสำหรับการแจ้งเตือนสำคัญ",
  },

  /* security policy */
  "secpol.auth": { en: "Authentication", th: "การยืนยันตัวตน" },
  "secpol.auth_desc": {
    en: "How members prove identity when signing in",
    th: "วิธีที่สมาชิกพิสูจน์ตัวตนตอนเข้าสู่ระบบ",
  },
  "secpol.require_sso": {
    en: "Require SSO for all members",
    th: "บังคับ SSO สำหรับทุกสมาชิก",
  },
  "secpol.require_sso_preview_desc": {
    en: "Will disable password sign-in once SSO enforcement ships. Not enforced yet — password login still works.",
    th: "จะปิดการเข้าสู่ระบบด้วยรหัสผ่านเมื่อระบบบังคับใช้ SSO พร้อมใช้งาน ยังไม่บังคับใช้ — เข้าสู่ระบบด้วยรหัสผ่านยังใช้ได้",
  },
  "secpol.require_2fa": { en: "Require 2FA", th: "บังคับ 2FA" },
  "secpol.require_2fa_desc": {
    en: "TOTP or Passkey required on every login (not just SSO bypass)",
    th: "ต้องใช้ TOTP หรือ Passkey ทุกครั้งที่เข้าสู่ระบบ",
  },
  "secpol.require_passkey": {
    en: "Require Passkey for Admin role",
    th: "บังคับ Passkey สำหรับบทบาทแอดมิน",
  },
  "secpol.require_passkey_desc": {
    en: "Admins cannot use TOTP — only WebAuthn / hardware key. Phishing-resistant.",
    th: "แอดมินใช้ TOTP ไม่ได้ — ใช้ WebAuthn / hardware key เท่านั้น ป้องกัน phishing",
  },
  "secpol.recommended_enterprise": {
    en: "Recommended for enterprise",
    th: "แนะนำสำหรับองค์กร",
  },
  "secpol.sessions": { en: "Sessions", th: "เซสชัน" },
  "secpol.sessions_desc": {
    en: "When a session locks or expires",
    th: "เมื่อเซสชันถูกล็อคหรือหมดอายุ",
  },
  "secpol.auto_lock": {
    en: "Auto-lock idle session",
    th: "ล็อคอัตโนมัติเมื่อไม่ได้ใช้งาน",
  },
  "secpol.auto_lock_desc": {
    en: "Lock the vault after no activity for this long. User must re-enter master password or re-authenticate.",
    th: "ล็อคตู้นิรภัยเมื่อไม่ได้ใช้งานเป็นเวลานี้ ผู้ใช้ต้องกรอกรหัสผ่านมาสเตอร์ใหม่",
  },
  "secpol.max_session": { en: "Max session duration", th: "ระยะเวลาเซสชันสูงสุด" },
  "secpol.max_session_desc": {
    en: "Sign-in expires after this long even with activity. Forces periodic re-auth.",
    th: "เซสชันหมดอายุหลังเวลานี้แม้ใช้งานอยู่ บังคับให้ยืนยันตัวตนใหม่เป็นระยะ",
  },
  "secpol.access": { en: "Access controls", th: "การควบคุมการเข้าถึง" },
  "secpol.access_desc": {
    en: "Who can be invited and what they can take with them",
    th: "ใครที่เชิญได้และสามารถพาอะไรไปด้วย",
  },
  "secpol.block_guest": {
    en: "Block guest invitations",
    th: "บล็อกการเชิญ Guest",
  },
  "secpol.block_guest_desc": {
    en: "Only emails from verified workspace domains can be added",
    th: "เฉพาะอีเมลจากโดเมนที่ยืนยันแล้วเท่านั้นที่เพิ่มได้",
  },
  "secpol.restrict_export": { en: "Restrict export", th: "จำกัดการส่งออก" },
  "secpol.restrict_export_desc": {
    en: "Prevent members from downloading vault data as CSV/JSON. Managers and admins only.",
    th: "ป้องกันสมาชิกดาวน์โหลดข้อมูลตู้นิรภัยเป็น CSV/JSON เฉพาะ Manager และแอดมิน",
  },
  "secpol.ip_allow": { en: "IP allowlist", th: "IP allowlist" },
  "secpol.ip_allow_desc": {
    en: "Restrict vault access to specific IP ranges (office, VPN)",
    th: "จำกัดการเข้าถึงตู้นิรภัยตาม IP range (สำนักงาน, VPN)",
  },
  "secpol.enterprise_plan": { en: "Enterprise plan", th: "Enterprise plan" },
  "secpol.compliance": { en: "Compliance snapshot", th: "ภาพรวมการปฏิบัติตาม" },
  "secpol.compliance_desc": {
    en: "Current configuration meets SOC 2 Type I authentication requirements.",
    th: "การตั้งค่าปัจจุบันผ่านข้อกำหนด SOC 2 Type I",
  },
  "secpol.generate_report": { en: "Generate report", th: "สร้างรายงาน" },

  /* sso section */
  "sso.title": {
    en: "SSO & provisioning",
    th: "SSO และการจัดเตรียม",
  },
  "sso.subtitle": {
    en: "Single sign-on, domain restrictions, and automatic team mapping",
    th: "Single sign-on, การจำกัดโดเมน, และการ map ทีมอัตโนมัติ",
  },
  "sso.connected_status": {
    en: "{domain} · {members} members · last sync {when}",
    th: "{domain} · {members} สมาชิก · ซิงค์ล่าสุด {when}",
  },
  "sso.sync_now": { en: "Sync now", th: "ซิงค์ทันที" },
  "sso.test_login": { en: "Test login", th: "ทดสอบเข้าสู่ระบบ" },
  "sso.allowed_domains": {
    en: "Allowed email domains",
    th: "โดเมนอีเมลที่อนุญาต",
  },
  "sso.allowed_domains_desc": {
    en: "Only emails from these verified domains can sign in via SSO.",
    th: "เฉพาะอีเมลจากโดเมนที่ยืนยันแล้วเท่านั้นที่เข้าสู่ระบบผ่าน SSO ได้",
  },
  "sso.domain_enforcement": {
    en: "Domain restriction is enforced both at OAuth (hd param) and on our server (defense in depth).",
    th: "การจำกัดโดเมนบังคับใช้ทั้งที่ OAuth (พารามิเตอร์ hd) และที่เซิร์ฟเวอร์ของเรา (defense in depth)",
  },
  "sso.add_domain": { en: "Add domain", th: "เพิ่มโดเมน" },
  "sso.domain_placeholder": {
    en: "yourcompany.com",
    th: "yourcompany.com",
  },
  "sso.domain_txt_hint": {
    en: "You'll need to add a TXT record to your DNS to verify ownership.",
    th: "คุณต้องเพิ่ม TXT record ใน DNS เพื่อยืนยันความเป็นเจ้าของ",
  },
  "sso.verify": { en: "Verify", th: "ยืนยัน" },
  "sso.recheck_dns": { en: "Re-check DNS", th: "ตรวจสอบ DNS ใหม่" },
  "sso.view_users": { en: "View users", th: "ดูผู้ใช้" },
  "sso.set_primary": { en: "Set as primary", th: "ตั้งเป็นโดเมนหลัก" },
  "sso.remove_domain": { en: "Remove domain", th: "ลบโดเมน" },
  "sso.primary": { en: "Primary", th: "หลัก" },
  "sso.domain_verified_status": {
    en: "Verified",
    th: "ยืนยันแล้ว",
  },
  "sso.domain_linked": { en: "linked to {provider}", th: "เชื่อมกับ {provider}" },
  "sso.domain_users": { en: "{n} user", th: "{n} ผู้ใช้" },
  "sso.domain_users_plural": { en: "{n} users", th: "{n} ผู้ใช้" },
  "sso.domain_pending": {
    en: "Pending · Add TXT record to DNS to verify",
    th: "รอดำเนินการ · เพิ่ม TXT record ใน DNS เพื่อยืนยัน",
  },
  "sso.domain_failed": {
    en: "Verification failed · Check TXT record",
    th: "การยืนยันล้มเหลว · ตรวจสอบ TXT record",
  },
  "sso.dns_txt_record": { en: "DNS TXT record", th: "DNS TXT record" },
  "sso.host_label": { en: "Host:", th: "โฮสต์:" },
  "sso.provisioning_behavior": {
    en: "Provisioning behavior",
    th: "การสร้างและจัดการบัญชีอัตโนมัติ",
  },
  "sso.provisioning_desc": {
    en: "How user accounts are created and deactivated via SSO. Auth requirements live under Security policy.",
    th: "กำหนดวิธีสร้างและปิดการใช้งานบัญชีผู้ใช้ผ่าน SSO ส่วนข้อกำหนดด้านการยืนยันตัวตนดูได้ที่หน้านโยบายความปลอดภัย",
  },
  "sso.jit": { en: "JIT provisioning", th: "JIT provisioning" },
  "sso.jit_preview_desc": {
    en: "Auto-create user account on first SSO sign-in. Pending SSO enforcement — not active yet.",
    th: "สร้างบัญชีผู้ใช้อัตโนมัติเมื่อเข้าสู่ระบบ SSO ครั้งแรก รอระบบบังคับใช้ SSO — ยังไม่เปิดใช้งาน",
  },
  "sso.auto_deprovision": { en: "Auto-deprovision", th: "ยกเลิกอัตโนมัติ" },
  "sso.auto_deprovision_desc": {
    en: "Suspend access immediately when user is removed from Google Workspace",
    th: "ระงับการเข้าถึงทันทีเมื่อผู้ใช้ถูกลบจาก Google Workspace",
  },
  "sso.group_mapping": { en: "Group → Team mapping", th: "Group → Team mapping" },
  "sso.group_mapping_desc": {
    en: "Members of Google Groups are automatically synced into matching Woxa teams. Mapping respects the most-specific rule.",
    th: "สมาชิกของ Google Groups จะถูกซิงค์เข้าทีม Woxa อัตโนมัติ การ map ใช้กฎเฉพาะที่สุด",
  },
  "sso.add_mapping": { en: "Add mapping", th: "เพิ่ม mapping" },
  "sso.col.google_group": { en: "Google Group", th: "Google Group" },
  "sso.col.woxa_team": { en: "Woxa Team", th: "ทีม Woxa" },
  "sso.col.members": { en: "Members", th: "สมาชิก" },
  "sso.col.auto_sync": { en: "Auto-sync", th: "ซิงค์อัตโนมัติ" },
  "sso.col.last_sync": { en: "Last sync", th: "ซิงค์ล่าสุด" },
  "sso.default_jit_role": { en: "Default JIT role", th: "บทบาท JIT เริ่มต้น" },
  "sso.default_jit_desc": {
    en: "New users provisioned via SSO without a matching group mapping",
    th: "ผู้ใช้ใหม่ที่จัดเตรียมผ่าน SSO โดยไม่มี mapping ที่ตรง",
  },
  "sso.default_role": { en: "Default role", th: "บทบาทเริ่มต้น" },
  "sso.initial_vault": { en: "Initial vault access", th: "การเข้าถึงตู้นิรภัยเริ่มต้น" },
  "sso.add_provider": { en: "Add another provider", th: "เพิ่มผู้ให้บริการอื่น" },
  "sso.add_provider_desc": {
    en: "Switch IdP or run multiple in parallel during migration",
    th: "เปลี่ยน IdP หรือใช้หลายตัวพร้อมกันระหว่าง migration",
  },
  "sso.enterprise_sso_desc": {
    en: "Enterprise SSO via SAML 2.0 / OIDC",
    th: "Enterprise SSO ผ่าน SAML 2.0 / OIDC",
  },
  "sso.recent_events": { en: "Recent SSO events", th: "เหตุการณ์ SSO ล่าสุด" },
  "sso.view_full_audit": { en: "View full audit", th: "ดู audit เต็ม" },
  "sso.disconnect_title": { en: "Disconnect SSO", th: "ยกเลิกการเชื่อมต่อ SSO" },
  "sso.disconnect_desc": {
    en: "All users will need to set up master passwords. Active sessions are revoked immediately.",
    th: "ผู้ใช้ทั้งหมดต้องตั้งรหัสผ่านมาสเตอร์ เซสชันที่ใช้งานอยู่จะถูกเพิกถอนทันที",
  },

  /* integrations + billing */
  "intg.workspace_title": {
    en: "Workspace integrations",
    th: "การเชื่อมต่อของเวิร์กสเปซ",
  },
  "intg.workspace_desc": {
    en: "Connect Vault with tools that affect the whole organization",
    th: "เชื่อมต่อ Vault กับเครื่องมือที่กระทบทั้งองค์กร",
  },
  "intg.personal_title": {
    en: "Personal integrations",
    th: "การเชื่อมต่อส่วนตัว",
  },
  "intg.personal_desc": {
    en: "Connect your own devices and apps to your account",
    th: "เชื่อมต่ออุปกรณ์และแอปของคุณกับบัญชี",
  },
  "intg.browser_ext": { en: "Browser extension", th: "ส่วนขยายเบราว์เซอร์" },
  "intg.browser_ext_desc": {
    en: "Autofill and save secrets directly in your browser",
    th: "Autofill และบันทึกความลับในเบราว์เซอร์โดยตรง",
  },
  "intg.cli_mobile": { en: "CLI & mobile", th: "CLI และมือถือ" },
  "intg.cli_mobile_desc": {
    en: "Access your vault from terminal and mobile devices",
    th: "เข้าถึงตู้นิรภัยจาก terminal และมือถือ",
  },
  "intg.api_tokens": { en: "Personal API tokens", th: "API tokens ส่วนตัว" },
  "intg.api_tokens_desc": {
    en: "Scoped tokens for your own scripts and integrations",
    th: "Token ที่กำหนดขอบเขตสำหรับ script และการเชื่อมต่อของคุณ",
  },
  "intg.connected_section": { en: "Connected", th: "เชื่อมต่อแล้ว" },
  "intg.available_section": { en: "Available", th: "พร้อมใช้งาน" },
  "intg.coming_soon_section": {
    en: "Coming soon",
    th: "เร็วๆ นี้",
  },
  "intg.empty_connected": {
    en: "No integrations connected yet",
    th: "ยังไม่มีการเชื่อมต่อ",
  },
  "intg.test": { en: "Test", th: "ทดสอบ" },
  "intg.unavailable": { en: "Unavailable", th: "ใช้งานไม่ได้" },
  "intg.platform_sso_missing": {
    en: "Google SSO is not configured on this deployment. Ask your platform admin to set the Google OAuth environment variables.",
    th: "ยังไม่ได้ตั้งค่า Google SSO บนระบบนี้ โปรดติดต่อผู้ดูแลแพลตฟอร์มเพื่อตั้งค่า Google OAuth",
  },
  "intg.slack_dialog_title": {
    en: "Connect Slack",
    th: "เชื่อมต่อ Slack",
  },
  "intg.slack_dialog_desc": {
    en: "Paste an incoming webhook URL from your Slack workspace. Woxa Vault will use it for workspace notifications.",
    th: "วาง Incoming Webhook URL จาก Slack workspace ของคุณ Woxa Vault จะใช้ส่งการแจ้งเตือนของเวิร์กสเปซ",
  },
  "intg.slack_webhook_label": {
    en: "Incoming webhook URL",
    th: "Incoming webhook URL",
  },
  "intg.slack_connect_success": {
    en: "Slack connected",
    th: "เชื่อมต่อ Slack แล้ว",
  },
  "intg.slack_disconnect_success": {
    en: "Slack disconnected",
    th: "ยกเลิกการเชื่อมต่อ Slack แล้ว",
  },
  "intg.slack_test_success": {
    en: "Test message sent to Slack",
    th: "ส่งข้อความทดสอบไปยัง Slack แล้ว",
  },
  "intg.error_generic": {
    en: "Could not update the integration. Try again.",
    th: "อัปเดตการเชื่อมต่อไม่สำเร็จ ลองอีกครั้ง",
  },
  "intg.error_forbidden": {
    en: "Only workspace owners and admins can manage integrations.",
    th: "เฉพาะเจ้าของและผู้ดูแลเวิร์กสเปซเท่านั้นที่จัดการการเชื่อมต่อได้",
  },
  "intg.new_token": { en: "New token", th: "Token ใหม่" },
  "intg.no_tokens_yet": {
    en: "No personal tokens yet",
    th: "ยังไม่มี token ส่วนตัว",
  },
  "intg.no_tokens_desc": {
    en: "Workspace tokens are managed by admins under Workspace → Service tokens",
    th: "Workspace tokens จัดการโดยแอดมินที่ Workspace → Service tokens",
  },

  /* billing */
  "billing.title": {
    en: "Plan & billing",
    th: "แผนและการเรียกเก็บเงิน",
  },
  "billing.subtitle": {
    en: "Manage your subscription and payment details",
    th: "จัดการการสมัครและรายละเอียดการชำระเงิน",
  },
  "billing.under_development_title": {
    en: "Billing is under development",
    th: "การเรียกเก็บเงินกำลังพัฒนา",
  },
  "billing.under_development_desc": {
    en: "Plan management, invoices, and payment methods are not available yet. We will enable this section in a future release.",
    th: "การจัดการแผน ใบแจ้งหนี้ และวิธีชำระเงินยังไม่พร้อมใช้งาน เราจะเปิดใช้งานส่วนนี้ในเวอร์ชันถัดไป",
  },
  "billing.current_plan": { en: "Business plan", th: "แผน Business" },
  "billing.current": { en: "Current", th: "ปัจจุบัน" },
  "billing.plan_desc": {
    en: "$8 per user / month · 12 active members · billed monthly",
    th: "$8 ต่อผู้ใช้ / เดือน · 12 สมาชิกใช้งาน · เรียกเก็บรายเดือน",
  },
  "billing.per_month_suffix": { en: "/mo", th: "/เดือน" },
  "billing.change_plan": { en: "Change plan", th: "เปลี่ยนแผน" },
  "billing.payment_method": { en: "Payment method", th: "วิธีชำระเงิน" },
  "billing.expires": { en: "Expires", th: "หมดอายุ" },
  "billing.history": { en: "Billing history", th: "ประวัติการเรียกเก็บเงิน" },
  "billing.paid": { en: "Paid", th: "ชำระแล้ว" },

  /* danger zone messages */
  "danger.delete_account": { en: "Delete account", th: "ลบบัญชี" },
  "danger.delete_account_desc": {
    en: "Permanently delete your account and all data you've created. This cannot be undone.",
    th: "ลบบัญชีและข้อมูลทั้งหมดที่คุณสร้างถาวร ย้อนกลับไม่ได้",
  },
  "danger.delete_workspace": { en: "Delete workspace", th: "ลบเวิร์กสเปซ" },
  "danger.delete_workspace_desc": {
    en: "Permanently delete this workspace and all its vaults, items, and audit history. This cannot be undone.",
    th: "ลบเวิร์กสเปซนี้และตู้นิรภัย รายการ และประวัติ audit ทั้งหมดถาวร ย้อนกลับไม่ได้",
  },

  /* ---- item ---- */
  "item.credentials": { en: "Credentials", th: "ข้อมูลรับรอง" },
  "item.username": { en: "Username", th: "ชื่อผู้ใช้" },
  "item.password": { en: "Password", th: "รหัสผ่าน" },
  "item.url": { en: "URL", th: "URL" },
  "item.totp_code": { en: "One-time code (TOTP)", th: "รหัสครั้งเดียว (TOTP)" },
  "item.custom_fields": { en: "Custom fields", th: "ฟิลด์กำหนดเอง" },
  "item.notes": { en: "Notes", th: "บันทึก" },
  "item.security": { en: "Security", th: "ความปลอดภัย" },
  "item.shared_with": { en: "Shared with", th: "แชร์กับ" },
  "item.shared_with_count": {
    en: "Shared with · {n}",
    th: "แชร์กับ · {n}",
  },
  "item.more_count": { en: "+{n} more", th: "+อีก {n}" },
  "item.danger_zone": { en: "Danger zone", th: "โซนอันตราย" },
  "item.move_to_trash": { en: "Move to trash", th: "ย้ายไปถังขยะ" },
  "item.recent_activity": { en: "Recent activity", th: "กิจกรรมล่าสุด" },
  "item.no_recent_activity": {
    en: "No recent activity for this item.",
    th: "ไม่มีกิจกรรมล่าสุดของรายการนี้",
  },
  "item.security.encryption": { en: "Encryption", th: "การเข้ารหัส" },
  "item.security.strength": { en: "Strength", th: "ความแข็งแกร่ง" },
  "item.security.reused": { en: "Reused", th: "ใช้ซ้ำ" },
  "item.security.breach": { en: "Breach check", th: "ตรวจสอบการรั่วไหล" },
  "item.security.strong": { en: "Strong", th: "แข็งแกร่ง" },
  "item.security.no": { en: "No", th: "ไม่" },
  "item.security.not_found": { en: "Not found", th: "ไม่พบ" },
  "item.types.login": { en: "Login", th: "การเข้าสู่ระบบ" },
  "item.types.api_key": { en: "API key", th: "API key" },
  "item.types.ssh": { en: "SSH key", th: "คีย์ SSH" },
  "item.types.note": { en: "Secure note", th: "บันทึกปลอดภัย" },
  "item.types.card": { en: "Payment card", th: "บัตรชำระเงิน" },
  "item.types.identity": { en: "Identity", th: "ข้อมูลส่วนตัว" },
  "item.encryption.zk": { en: "Zero-knowledge", th: "Zero-knowledge" },
  "item.encryption.envelope": { en: "Envelope (KMS)", th: "Envelope (KMS)" },
  "item.action.viewed": { en: "viewed this item", th: "เปิดดูรายการนี้" },
  "item.action.copied": {
    en: "copied the password",
    th: "คัดลอกรหัสผ่าน",
  },
  "item.action.created": {
    en: "created this item",
    th: "สร้างรายการนี้",
  },
  "item.action.updated": {
    en: "updated this item",
    th: "อัพเดตรายการนี้",
  },
  "item.action.sent_one_time": {
    en: "created a one-time send",
    th: "สร้างการส่งครั้งเดียว",
  },
  "item.updated_at": {
    en: "updated {when}",
    th: "อัพเดต {when}",
  },
  "item.back_to": { en: "Back to {name}", th: "กลับไป {name}" },
  "item.hides_in_30s": { en: "hides in 30s", th: "ซ่อนใน 30 วินาที" },
  "item.clipboard_will_clear": {
    en: "Clipboard will clear in 30 seconds.",
    th: "Clipboard จะถูกล้างใน 30 วินาที",
  },
  "item.totp_copied": { en: "TOTP code copied", th: "คัดลอกรหัส TOTP แล้ว" },
  "item.from_team": { en: "team", th: "ทีม" },
  "item.from_vault": { en: "vault", th: "ตู้นิรภัย" },
  "item.edit": { en: "Edit", th: "แก้ไข" },
  "item.send_one_time": { en: "Send one-time", th: "ส่งครั้งเดียว" },
  "item.subtitle": { en: "{type} · {vault}", th: "{type} · {vault}" },
  "item.view_all_audit": { en: "View all →", th: "ดูทั้งหมด →" },
  "item.manage_access": { en: "Manage access", th: "จัดการสิทธิ์เข้าถึง" },
  "item.menu.duplicate": { en: "Duplicate item", th: "ทำสำเนารายการ" },
  "item.menu.move_vault": { en: "Move to vault…", th: "ย้ายไปตู้นิรภัยอื่น…" },
  "item.menu.copy_link": { en: "Copy item link", th: "คัดลอกลิงก์รายการ" },
  "item.menu.export": { en: "Export as JSON", th: "ส่งออกเป็น JSON" },
  "item.menu.print": { en: "Print", th: "พิมพ์" },
  "item.menu.archive": { en: "Archive", th: "เก็บเข้าคลัง" },
  "item.menu.aria": { en: "More actions", th: "การจัดการเพิ่มเติม" },
  "item.fav.added": { en: "Added to favorites", th: "เพิ่มในรายการโปรดแล้ว" },
  "item.fav.removed": { en: "Removed from favorites", th: "เอาออกจากรายการโปรดแล้ว" },
  "item.edit_dialog.title": { en: "Edit item", th: "แก้ไขรายการ" },
  "item.edit_dialog.subtitle": {
    en: "Changes are re-encrypted in your browser before saving.",
    th: "การเปลี่ยนแปลงจะถูกเข้ารหัสใหม่ในเบราว์เซอร์ก่อนบันทึก",
  },
  "item.edit_dialog.save": { en: "Save changes", th: "บันทึกการเปลี่ยนแปลง" },
  "item.edit_dialog.saved": { en: "Item updated", th: "อัพเดตรายการแล้ว" },
  "item.edit_dialog.saved_desc": {
    en: "{name} saved to {vault}",
    th: "บันทึก {name} ไปยัง {vault} แล้ว",
  },
  "item.menu.duplicated": {
    en: "Duplicated item",
    th: "ทำสำเนารายการแล้ว",
  },
  "item.menu.link_copied": {
    en: "Link copied to clipboard",
    th: "คัดลอกลิงก์แล้ว",
  },
  "item.menu.exported": {
    en: "Exported item JSON",
    th: "ส่งออก JSON แล้ว",
  },
  "item.menu.archived": { en: "Item archived", th: "เก็บเข้าคลังแล้ว" },
  "item.trashed": { en: "Moved to trash", th: "ย้ายไปถังขยะแล้ว" },
  "item.trashed_desc": {
    en: "Can be restored within 30 days",
    th: "กู้คืนได้ภายใน 30 วัน",
  },

  /* ---- lock screen ---- */
  "lock.title": { en: "Vault is locked", th: "ตู้นิรภัยล็อคอยู่" },
  "lock.subtitle": {
    en: "Enter your master password to continue",
    th: "กรอกรหัสผ่านมาสเตอร์เพื่อดำเนินการต่อ",
  },
  "lock.master_password": { en: "Master password", th: "รหัสผ่านมาสเตอร์" },
  "lock.placeholder": { en: "Your master password", th: "รหัสผ่านมาสเตอร์ของคุณ" },
  "lock.unlock": { en: "Unlock vault", th: "ปลดล็อคตู้นิรภัย" },
  "lock.unlocking": { en: "Unlocking…", th: "กำลังปลดล็อค…" },
  "lock.forgot": { en: "Forgot password?", th: "ลืมรหัสผ่าน?" },
  "lock.recovery": { en: "Use Recovery Kit", th: "ใช้ Recovery Kit" },
  "lock.locked_when": {
    en: "Locked {when} · Workspace",
    th: "ล็อคเมื่อ {when} · เวิร์กสเปซ",
  },
  "lock.welcome_back": {
    en: "Welcome back. Decrypting your keys…",
    th: "ยินดีต้อนรับกลับ กำลังถอดรหัสกุญแจของคุณ…",
  },

  /* ---- toast/system messages ---- */
  "toast.vault_locked": { en: "Vault locked", th: "ล็อคตู้นิรภัยแล้ว" },
  "toast.vault_locked_desc": {
    en: "Encryption keys cleared from memory.",
    th: "ล้างกุญแจเข้ารหัสออกจากหน่วยความจำแล้ว",
  },
  "toast.vault_unlocked": { en: "Vault unlocked", th: "ปลดล็อคตู้นิรภัยแล้ว" },
  "toast.copied": { en: "Copied", th: "คัดลอกแล้ว" },
  "toast.copied_field": { en: "{label} copied", th: "คัดลอก {label} แล้ว" },
  "toast.couldnt_copy": {
    en: "Couldn't copy to clipboard",
    th: "ไม่สามารถคัดลอกได้",
  },
  "toast.link_copied": { en: "Link copied", th: "คัดลอกลิงก์แล้ว" },
  "toast.role_updated": { en: "Role updated", th: "อัพเดตบทบาทแล้ว" },
  "toast.removed": { en: "Removed {name}", th: "ลบ {name} แล้ว" },
  "toast.added_grant": { en: "{name} added", th: "เพิ่ม {name} แล้ว" },
  "toast.added_grant_desc": {
    en: "Granted {role} access",
    th: "ให้สิทธิ์ {role} แล้ว",
  },
  "toast.profile_saved": { en: "Profile saved", th: "บันทึกโปรไฟล์แล้ว" },
  "toast.folder_created": { en: "Folder created", th: "สร้างโฟลเดอร์แล้ว" },
  "toast.folder_created_desc": {
    en: '"{name}" added to {vault}',
    th: 'เพิ่ม "{name}" ใน {vault} แล้ว',
  },
  "toast.vault_created": { en: "Vault created", th: "สร้างตู้นิรภัยแล้ว" },
  "toast.vault_created_with_folders": {
    en: '"{name}" with {n} starter folders',
    th: '"{name}" พร้อม {n} โฟลเดอร์เริ่มต้น',
  },
  "toast.vault_created_empty": {
    en: '"{name}" is ready — add your first item to begin',
    th: '"{name}" พร้อมแล้ว — เพิ่มรายการแรกเพื่อเริ่ม',
  },
  "toast.item_created": { en: "Item created", th: "สร้างรายการแล้ว" },
  "toast.item_created_desc": {
    en: '{type} "{name}" saved to {vault}',
    th: 'บันทึก {type} "{name}" ใน {vault} แล้ว',
  },
  "toast.give_name": { en: "Please give it a name", th: "กรุณาตั้งชื่อ" },
  "toast.strong_pw": {
    en: "Strong password generated",
    th: "สร้างรหัสผ่านที่แข็งแกร่งแล้ว",
  },
  "gen.options": { en: "Generator options", th: "ตัวเลือกการสร้างรหัสผ่าน" },
  "gen.length": { en: "Length", th: "ความยาว" },
  "gen.uppercase": { en: "Uppercase (A-Z)", th: "ตัวพิมพ์ใหญ่ (A-Z)" },
  "gen.lowercase": { en: "Lowercase (a-z)", th: "ตัวพิมพ์เล็ก (a-z)" },
  "gen.numbers": { en: "Numbers (0-9)", th: "ตัวเลข (0-9)" },
  "gen.symbols": { en: "Symbols (!#$…)", th: "สัญลักษณ์ (!#$…)" },
  "gen.generate": { en: "Generate", th: "สร้างรหัสผ่าน" },
  "toast.domain_added": { en: "{name} added", th: "เพิ่ม {name} แล้ว" },
  "toast.domain_added_desc": {
    en: "Add the TXT record to your DNS to verify ownership.",
    th: "เพิ่ม TXT record ใน DNS เพื่อยืนยันความเป็นเจ้าของ",
  },
  "toast.domain_verified": { en: "Domain verified", th: "ยืนยันโดเมนแล้ว" },
  "toast.domain_invalid": { en: "Invalid domain format", th: "รูปแบบโดเมนไม่ถูกต้อง" },
  "toast.domain_duplicate": { en: "Domain already added", th: "เพิ่มโดเมนนี้แล้ว" },
  "toast.domain_cant_remove_primary": {
    en: "Can't remove primary domain",
    th: "ไม่สามารถลบโดเมนหลักได้",
  },
  "toast.domain_removed": { en: "{domain} removed", th: "ลบ {domain} แล้ว" },
  "toast.domain_now_primary": {
    en: "{domain} is now primary",
    th: "{domain} เป็นโดเมนหลักแล้ว",
  },
  "toast.txt_copied": { en: "TXT record copied", th: "คัดลอก TXT record แล้ว" },
  "toast.all_read": {
    en: "All notifications marked as read",
    th: "ทำเครื่องหมายว่าอ่านการแจ้งเตือนทั้งหมดแล้ว",
  },
  "toast.trash_emptied": { en: "Trash emptied", th: "ล้างถังขยะแล้ว" },

  /* ---- share dialog ---- */
  "share.title": { en: 'Share "{name}"', th: 'แชร์ "{name}"' },
  "share.vault_desc": {
    en: "Grant access to this vault. Members can access all items inside unless overridden at the item level.",
    th: "ให้สิทธิ์เข้าถึงตู้นิรภัยนี้ สมาชิกเข้าถึงรายการทั้งหมดข้างในได้ เว้นแต่กำหนดที่ระดับรายการ",
  },
  "share.item_desc": {
    en: "Grant access to this item only. Vault-level access takes precedence unless this item has its own grants.",
    th: "ให้สิทธิ์เฉพาะรายการนี้ สิทธิ์ระดับตู้นิรภัยมีอำนาจเหนือกว่า เว้นแต่กำหนดเฉพาะรายการ",
  },
  "share.search_placeholder": {
    en: "Search people, teams, or type an email…",
    th: "ค้นหาคน ทีม หรือพิมพ์อีเมล…",
  },
  "share.no_matches": {
    en: "No matches. Type an email to invite externally.",
    th: "ไม่พบ พิมพ์อีเมลเพื่อเชิญจากภายนอก",
  },
  "share.matches_for": { en: 'Matches for "{query}"', th: 'ผลลัพธ์ของ "{query}"' },
  "share.recent_active": {
    en: "Recently active in workspace",
    th: "ใช้งานล่าสุดในเวิร์กสเปซ",
  },
  "share.copy_link": { en: "Copy link", th: "คัดลอกลิงก์" },
  "share.who_has_access": {
    en: "Who has access · {n}",
    th: "ผู้ที่มีสิทธิ์เข้าถึง · {n}",
  },
  "share.most_specific_wins": {
    en: "Most specific permission wins",
    th: "สิทธิ์ที่เฉพาะที่สุดชนะ",
  },
  "share.no_one_has_access": {
    en: "No one has access yet. Use the search above to add people.",
    th: "ยังไม่มีใครเข้าถึงได้ ใช้การค้นหาด้านบนเพื่อเพิ่มคน",
  },
  "share.changes_encrypted": {
    en: "Changes are encrypted and re-shared in your browser",
    th: "การเปลี่ยนแปลงถูกเข้ารหัสและแชร์ซ้ำในเบราว์เซอร์",
  },
  "share.from_vault": { en: "from vault", th: "จากตู้นิรภัย" },
  "share.via_team": { en: "via team", th: "ผ่านทีม" },
  "share.set_expiration": { en: "Set expiration", th: "ตั้งวันหมดอายุ" },
  "share.copy_access_link": { en: "Copy access link", th: "คัดลอกลิงก์การเข้าถึง" },
  "share.revoke_access": { en: "Revoke access", th: "เพิกถอนสิทธิ์" },
  "share.share_link_copied": { en: "Share link copied", th: "คัดลอกลิงก์แชร์แล้ว" },
  "share.all_workspace_members": {
    en: "All workspace members",
    th: "สมาชิกทั้งหมดในเวิร์กสเปซ",
  },
  "share.external_caption": {
    en: "External email · invite as guest",
    th: "อีเมลภายนอก · เชิญเป็น guest",
  },
  "share.team_members_count": {
    en: "{n} members",
    th: "{n} สมาชิก",
  },
  "share.share_link_desc": {
    en: "Anyone with this link who can sign in to your workspace gains access.",
    th: "ใครก็ตามที่มีลิงก์นี้และเข้าสู่ระบบเวิร์กสเปซได้จะเข้าถึงได้",
  },
  "share.read_only_note": {
    en: "You can see who has access. Only vault managers can change it.",
    th: "คุณดูรายชื่อผู้มีสิทธิ์ได้ แต่เฉพาะ Manager ของตู้นิรภัยเท่านั้นที่แก้ไขได้",
  },
  "share.search_people": {
    en: "Search workspace members…",
    th: "ค้นหาสมาชิกในเวิร์กสเปซ…",
  },
  "share.no_people_match": {
    en: "No matching members.",
    th: "ไม่พบสมาชิกที่ตรงกัน",
  },
  "share.no_members_to_add": {
    en: "Everyone in this workspace already has access.",
    th: "ทุกคนในเวิร์กสเปซนี้มีสิทธิ์เข้าถึงแล้ว",
  },
  "share.no_members_yet": {
    en: "No one has access to this vault yet.",
    th: "ยังไม่มีใครเข้าถึงตู้นิรภัยนี้",
  },
  "share.loading_members": {
    en: "Loading members…",
    th: "กำลังโหลดสมาชิก…",
  },
  "share.add_as": { en: "Add as", th: "เพิ่มเป็น" },
  "share.you": { en: "You", th: "คุณ" },
  "share.audit_note": {
    en: "Membership changes are recorded in the audit log.",
    th: "การเปลี่ยนสมาชิกถูกบันทึกใน audit log",
  },
  "share.error.already_member": {
    en: "That person already has access to this vault.",
    th: "คนนี้มีสิทธิ์เข้าถึงตู้นิรภัยนี้อยู่แล้ว",
  },
  "share.error.last_manager": {
    en: "A vault must keep at least one manager.",
    th: "ตู้นิรภัยต้องมี Manager อย่างน้อย 1 คน",
  },
  "share.error.forbidden": {
    en: "Only vault managers can change access.",
    th: "เฉพาะ Manager ของตู้นิรภัยเท่านั้นที่เปลี่ยนสิทธิ์ได้",
  },
  "share.error.not_in_workspace": {
    en: "That user isn't a member of this workspace.",
    th: "ผู้ใช้นี้ไม่ได้เป็นสมาชิกของเวิร์กสเปซนี้",
  },
  "share.error.generic": {
    en: "Couldn't update sharing. Please try again.",
    th: "อัปเดตการแชร์ไม่สำเร็จ กรุณาลองใหม่",
  },
  "share.folder_desc": {
    en: "Grant access to this folder. Members can access items inside unless overridden at the item level.",
    th: "ให้สิทธิ์เข้าถึงโฟลเดอร์นี้ สมาชิกเข้าถึงรายการข้างในได้ เว้นแต่กำหนดที่ระดับรายการ",
  },
  "share.share_folder": { en: "Share folder", th: "แชร์โฟลเดอร์" },
  "share.share_item": { en: "Share item", th: "แชร์รายการ" },
  "share.read_only_note_resource": {
    en: "You can see who has access. Only editors and managers can change it.",
    th: "คุณดูรายชื่อผู้มีสิทธิ์ได้ แต่เฉพาะ Editor และ Manager เท่านั้นที่แก้ไขได้",
  },

  /* role config */
  "role.manager": { en: "Manager", th: "Manager" },
  "role.manager_desc": {
    en: "Full control — edit, share, and delete",
    th: "ควบคุมเต็มที่ — แก้ไข แชร์ และลบ",
  },
  "role.editor": { en: "Editor", th: "Editor" },
  "role.editor_desc": {
    en: "Can view, use, edit, and share",
    th: "ดู ใช้ แก้ไข และแชร์ได้",
  },
  "role.user": { en: "User", th: "User" },
  "role.user_desc": {
    en: "Can view and use (copy/decrypt) only",
    th: "ดูและใช้งานได้เท่านั้น (คัดลอก/ถอดรหัส)",
  },
  "role.viewer": { en: "Viewer", th: "Viewer" },
  "role.viewer_desc": {
    en: "Sees item exists but cannot reveal secrets",
    th: "เห็นว่ามีรายการแต่เปิดดูความลับไม่ได้",
  },
  /* role abilities */
  "role.ability.view": { en: "View metadata", th: "ดู metadata" },
  "role.ability.use": { en: "Reveal & copy", th: "เปิดดูและคัดลอก" },
  "role.ability.edit": { en: "Edit", th: "แก้ไข" },
  "role.ability.share": { en: "Share with others", th: "แชร์ให้คนอื่น" },
  "role.ability.delete": { en: "Delete", th: "ลบ" },

  /* expiry options */
  "expiry.never": { en: "Never", th: "ไม่กำหนด" },
  "expiry.24h": { en: "24 hours", th: "24 ชั่วโมง" },
  "expiry.7d": { en: "7 days", th: "7 วัน" },
  "expiry.30d": { en: "30 days", th: "30 วัน" },
  "expiry.90d": { en: "90 days", th: "90 วัน" },

  "ptype.user": { en: "User", th: "ผู้ใช้" },
  "ptype.team": { en: "Team", th: "ทีม" },
  "ptype.domain": { en: "Domain", th: "โดเมน" },
  "ptype.external": { en: "External", th: "ภายนอก" },

  /* ---- new folder dialog ---- */
  "nf.title": { en: "New folder", th: "โฟลเดอร์ใหม่" },
  "nf.desc": {
    en: "Folders organize items within a vault. Permissions inherit from the vault unless overridden.",
    th: "โฟลเดอร์จัดระเบียบรายการในตู้นิรภัย สิทธิ์สืบทอดจากตู้นิรภัย เว้นแต่กำหนดเอง",
  },
  "nf.placeholder_name": { en: "Folder name", th: "ชื่อโฟลเดอร์" },
  "nf.example_name": { en: "e.g. Databases", th: "เช่น Databases" },
  "nf.in_vault": { en: "In vault", th: "ในตู้นิรภัย" },
  "nf.parent_folder": { en: "Parent folder", th: "โฟลเดอร์หลัก" },
  "nf.root_level": { en: "— root level —", th: "— ระดับรูท —" },
  "nf.create_button": { en: "Create folder", th: "สร้างโฟลเดอร์" },

  /* ---- new item dialog ---- */
  "ni.title_pick": { en: "Create new item", th: "สร้างรายการใหม่" },
  "ni.subtitle_pick": {
    en: "Choose what kind of secret you want to store. You can change it later.",
    th: "เลือกประเภทของความลับที่คุณต้องการเก็บ เปลี่ยนได้ภายหลัง",
  },
  "ni.title_form": {
    en: "New {type}",
    th: "{type}ใหม่",
  },
  "ni.subtitle_form": {
    en: "Fields are encrypted in your browser before being saved.",
    th: "ฟิลด์ถูกเข้ารหัสในเบราว์เซอร์ก่อนบันทึก",
  },
  "ni.type.login.desc": {
    en: "Username + password for a website or service",
    th: "ชื่อผู้ใช้ + รหัสผ่านสำหรับเว็บไซต์หรือบริการ",
  },
  "ni.type.login.eg": {
    en: "AWS Console, Mailchimp, internal admin panel",
    th: "AWS Console, Mailchimp, แอดมินภายใน",
  },
  "ni.type.api_key.desc": {
    en: "Secret tokens for programmatic access",
    th: "Token ลับสำหรับการเข้าถึงโดยโปรแกรม",
  },
  "ni.type.api_key.eg": {
    en: "Stripe key, GitHub PAT, OpenAI API key",
    th: "Stripe key, GitHub PAT, OpenAI API key",
  },
  "ni.type.ssh.desc": {
    en: "SSH private keys for server access",
    th: "SSH private key สำหรับเข้าถึง server",
  },
  "ni.type.ssh.eg": {
    en: "Production bastion, deploy key",
    th: "Bastion โปรดักชัน, deploy key",
  },
  "ni.type.note.desc": {
    en: "Free-form encrypted text",
    th: "ข้อความเข้ารหัสรูปแบบอิสระ",
  },
  "ni.type.note.eg": {
    en: "Runbook secrets, recovery procedures",
    th: "ความลับ runbook, ขั้นตอนการกู้คืน",
  },
  "ni.type.card.desc": {
    en: "Payment card details",
    th: "รายละเอียดบัตรชำระเงิน",
  },
  "ni.type.card.eg": {
    en: "Company AMEX, prepaid card for vendors",
    th: "AMEX บริษัท, บัตรเติมเงินสำหรับ vendor",
  },
  "ni.type.identity.desc": {
    en: "Personal information",
    th: "ข้อมูลส่วนตัว",
  },
  "ni.type.identity.eg": {
    en: "Address, passport, tax ID",
    th: "ที่อยู่, พาสปอร์ต, เลขประจำตัวผู้เสียภาษี",
  },
  "ni.type.coming_soon": {
    en: "Coming soon",
    th: "เร็วๆ นี้",
  },
  "ni.type.coming_soon_hint": {
    en: "This item type isn't available yet — backend support is shipping in a future release.",
    th: "ยังไม่รองรับประเภทนี้ — แบ็กเอนด์จะรองรับในรุ่นถัดไป",
  },
  "ni.type.coming_soon_footnote": {
    en: "Locked types will unlock once the backend ships their secret-field schema. For now, Login and Secure note are fully supported.",
    th: "ประเภทที่ถูกล็อกจะปลดเมื่อแบ็กเอนด์รองรับ schema สำหรับฟิลด์ลับ ตอนนี้ Login และ Secure note ใช้งานได้เต็มรูปแบบ",
  },
  "ni.type.eg_prefix": {
    en: "e.g.",
    th: "เช่น",
  },
  "ni.untitled": { en: "Untitled", th: "ไม่มีชื่อ" },
  "ni.toggle_favorite": { en: "Toggle favorite", th: "สลับรายการโปรด" },
  "ni.placeholder_login": {
    en: "e.g. AWS Production Root",
    th: "เช่น AWS Production Root",
  },
  "ni.placeholder_api_key": {
    en: "e.g. Stripe Live Secret Key",
    th: "เช่น Stripe Live Secret Key",
  },
  "ni.placeholder_default": {
    en: "Give it a memorable name",
    th: "ตั้งชื่อที่จำได้",
  },
  "ni.vault": { en: "Vault", th: "ตู้นิรภัย" },
  "ni.folder": { en: "Folder", th: "โฟลเดอร์" },
  "ni.no_folder": { en: "— No folder —", th: "— ไม่มีโฟลเดอร์ —" },
  "ni.username_email": { en: "Username or email", th: "ชื่อผู้ใช้หรืออีเมล" },
  "ni.url_placeholder": {
    en: "https://example.com",
    th: "https://example.com",
  },
  "ni.totp_secret": {
    en: "TOTP secret (optional)",
    th: "TOTP secret (ไม่จำเป็น)",
  },
  "ni.totp_hint": {
    en: "Paste the 'secret key' from the QR setup screen",
    th: "วาง 'secret key' จากหน้าตั้งค่า QR",
  },
  "ni.secret_value": { en: "Secret value", th: "ค่าความลับ" },
  "ni.add_field": { en: "Add field", th: "เพิ่มฟิลด์" },
  "ni.custom_fields_hint": {
    en: "Add public keys, webhook secrets, scopes, etc.",
    th: "เพิ่ม public key, webhook secret, scope ฯลฯ",
  },
  "ni.field_name": { en: "Field name", th: "ชื่อฟิลด์" },
  "ni.value": { en: "Value", th: "ค่า" },
  "ni.private_key": { en: "Private key", th: "Private key" },
  "ni.private_key_hint": {
    en: "Paste the contents of your id_ed25519 / id_rsa file",
    th: "วางเนื้อหาของไฟล์ id_ed25519 / id_rsa",
  },
  "ni.passphrase": { en: "Passphrase (optional)", th: "Passphrase (ไม่จำเป็น)" },
  "ni.card_number": { en: "Card number", th: "หมายเลขบัตร" },
  "ni.cardholder": { en: "Cardholder name", th: "ชื่อผู้ถือบัตร" },
  "ni.cardholder_placeholder": {
    en: "As shown on card",
    th: "ตามที่แสดงบนบัตร",
  },
  "ni.card_expiry": { en: "Expiry", th: "วันหมดอายุ" },
  "ni.card_cvv": { en: "CVV / CVC", th: "CVV / CVC" },
  "ni.phone_placeholder": {
    en: "+66 8X XXX XXXX",
    th: "+66 8X XXX XXXX",
  },
  "ni.tags_placeholder": {
    en: "Add tags · press Enter",
    th: "เพิ่มแท็ก · กด Enter",
  },
  "ni.notes_placeholder": {
    en: "Optional context, runbook hints, expiry reminders…",
    th: "บริบทเพิ่มเติม คำแนะนำ runbook เตือนวันหมดอายุ…",
  },
  "ni.security_hint": {
    en: "All fields are encrypted in your browser with AES-256-GCM before being sent to the server.",
    th: "ฟิลด์ทั้งหมดถูกเข้ารหัสในเบราว์เซอร์ด้วย AES-256-GCM ก่อนส่งไปเซิร์ฟเวอร์",
  },
  "ni.save_item": { en: "Save item", th: "บันทึกรายการ" },

  /* ---- new vault dialog ---- */
  "nv.title": { en: "Create a new vault", th: "สร้างตู้นิรภัยใหม่" },
  "nv.subtitle": {
    en: "Vaults are top-level containers with their own access list. Start with a template or build from scratch.",
    th: "ตู้นิรภัยเป็น container ระดับบนสุดที่มีรายการสิทธิ์ของตัวเอง เริ่มจาก template หรือสร้างเอง",
  },
  "nv.placeholder_name": { en: "Vault name", th: "ชื่อตู้นิรภัย" },
  "nv.example_name": {
    en: "e.g. Production, Marketing, Personal",
    th: "เช่น Production, Marketing, Personal",
  },
  "nv.description": { en: "Description", th: "คำอธิบาย" },
  "nv.description_placeholder": {
    en: "What kind of secrets live in this vault?",
    th: "ตู้นิรภัยนี้เก็บความลับประเภทไหน?",
  },
  "nv.description_preview": {
    en: "Add a description so your team knows what goes here.",
    th: "เพิ่มคำอธิบายให้ทีมรู้ว่าใส่อะไรที่นี่",
  },
  "nv.starter_caption": {
    en: "{n} starter folders · {mode}",
    th: "{n} โฟลเดอร์เริ่มต้น · {mode}",
  },
  "nv.encryption": { en: "Encryption", th: "การเข้ารหัส" },
  "nv.zk": { en: "Zero-knowledge", th: "Zero-knowledge" },
  "nv.zk_badge": { en: "Recommended", th: "แนะนำ" },
  "nv.zk_desc": {
    en: "Encrypted in your browser. Even we can't read it. No search across content.",
    th: "เข้ารหัสในเบราว์เซอร์ แม้แต่เราก็อ่านไม่ได้ ค้นหาในเนื้อหาไม่ได้",
  },
  "nv.server_side": { en: "Server-side", th: "Server-side" },
  "nv.server_side_desc": {
    en: "Envelope encryption via KMS. Supports full-text search across items.",
    th: "การเข้ารหัสแบบ envelope ผ่าน KMS รองรับการค้นหาแบบ full-text",
  },
  "nv.starter_template": { en: "Starter template", th: "เทมเพลตเริ่มต้น" },
  "nv.template_hint": {
    en: "Optional · you can change folders later",
    th: "เลือกหรือไม่ก็ได้ · ปรับโฟลเดอร์ทีหลังได้ตลอด",
  },
  "nv.template.empty": { en: "Empty", th: "เริ่มจากศูนย์" },
  "nv.template.empty_desc": {
    en: "Start with no folders. Add structure as you go.",
    th: "เริ่มแบบไม่มีโฟลเดอร์ แล้วค่อยจัดโครงสร้างทีหลังตามต้องการ",
  },
  "nv.template.infra": { en: "Infrastructure", th: "Infrastructure" },
  "nv.template.infra_desc": {
    en: "Cloud, databases, CI/CD, DNS — typical SRE setup.",
    th: "Cloud, ฐานข้อมูล, CI/CD, DNS — เซ็ตอัพมาตรฐานสำหรับทีม SRE",
  },
  "nv.template.saas": {
    en: "Third-party services",
    th: "เครื่องมือภายนอก",
  },
  "nv.template.saas_desc": {
    en: "Logins to SaaS tools your team uses every day.",
    th: "บัญชีสำหรับ SaaS และเครื่องมือที่ทีมใช้ประจำ",
  },
  "nv.template.finance": {
    en: "Finance & operations",
    th: "การเงินและการดำเนินงาน",
  },
  "nv.template.finance_desc": {
    en: "Payment cards, vendor logins, accounting tools.",
    th: "บัตรเครดิตของบริษัท บัญชีคู่ค้า และโปรแกรมบัญชี",
  },
  "nv.more_count": { en: "+{n} more", th: "+อีก {n}" },
  "nv.access_hint": {
    en: "You'll be the Manager by default. Invite members and teams from the vault page after creation.",
    th: "คุณจะเป็น Manager โดยอัตโนมัติ เชิญสมาชิกและทีมจากหน้าตู้นิรภัยหลังสร้าง",
  },
  "nv.create_button": { en: "Create vault", th: "สร้างตู้นิรภัย" },

  /* ---- notifications panel ---- */
  "notif.title": { en: "Notifications", th: "การแจ้งเตือน" },
  "notif.n_new": { en: "{n} new", th: "ใหม่ {n}" },
  "notif.mark_all_read": { en: "Mark all read", th: "ทำเครื่องหมายอ่านทั้งหมด" },
  "notif.someone": { en: "Someone", th: "ใครบางคน" },
  "notif.loading": { en: "Loading…", th: "กำลังโหลด…" },
  "notif.error": {
    en: "Couldn't load notifications.",
    th: "โหลดการแจ้งเตือนไม่สำเร็จ",
  },
  "notif.share_received.title": {
    en: "Shared with you",
    th: "ถูกแชร์ให้คุณ",
  },
  "notif.share_received.body": {
    en: '{actor} gave you {role} access to "{target}"',
    th: '{actor} ให้สิทธิ์ {role} กับคุณใน "{target}"',
  },
  "notif.access_request_created.title": { en: "Access requested", th: "มีการขอสิทธิ์เข้าถึง" },
  "notif.access_request_created.body": {
    en: '{actor} is requesting {role} access to "{target}"',
    th: '{actor} กำลังขอสิทธิ์ {role} สำหรับ "{target}"',
  },
  "notif.access_request_approved.title": { en: "Request approved & Role changed", th: "คำขอได้รับการอนุมัติและเปลี่ยนบทบาทแล้ว" },
  "notif.access_request_approved.body": {
    en: 'Your request for "{target}" was approved and your role has been changed. You now have {role} access.',
    th: 'คำขอเข้าถึง "{target}" ได้รับการอนุมัติและเปลี่ยนบทบาทแล้ว คุณได้รับสิทธิ์ระดับ {role}',
  },
  "notif.access_request_denied.title": { en: "Request denied", th: "คำขอถูกปฏิเสธ" },
  "notif.access_request_denied.body": {
    en: 'Your request for "{target}" was denied. Reason: "{reason}"',
    th: 'คำขอเข้าถึง "{target}" ถูกปฏิเสธ เหตุผล: "{reason}"',
  },
  "notif.role_changed.title": {
 en: "Your role changed", th: "บทบาทของคุณเปลี่ยน" },
  "notif.role_changed.body": {
    en: '{actor} changed your role on "{target}": {from} → {to}',
    th: '{actor} เปลี่ยนบทบาทของคุณใน "{target}": {from} → {to}',
  },
  "notif.role_changed.system_body": {
    en: 'Your temporary access to "{target}" has expired. Role reverted: {from} → {to}',
    th: 'สิทธิ์เข้าถึงชั่วคราวของคุณใน "{target}" หมดอายุแล้ว บทบาทถูกเปลี่ยนกลับ: {from} → {to}',
  },
  "notif.access_revoked.title": { en: "Access removed", th: "ถูกเพิกถอนสิทธิ์" },
  "notif.access_revoked.body": {
    en: '{actor} removed your access to "{target}"',
    th: '{actor} เพิกถอนสิทธิ์ของคุณใน "{target}"',
  },
  "notif.access_revoked.system_body": {
    en: 'Your temporary access to "{target}" has expired.',
    th: 'สิทธิ์เข้าถึงชั่วคราวของคุณใน "{target}" หมดอายุแล้ว',
  },
  "notif.member_role_changed.title": {
    en: "Workspace role changed",
    th: "บทบาทในเวิร์กสเปซเปลี่ยน",
  },
  "notif.member_role_changed.body": {
    en: "{actor} changed your workspace role: {from} → {to}",
    th: "{actor} เปลี่ยนบทบาทของคุณในเวิร์กสเปซ: {from} → {to}",
  },
  "notif.send_viewed.title": {
    en: "One-time send opened",
    th: "ลิงก์ส่งครั้งเดียวถูกเปิด",
  },
  "notif.send_viewed.body_burned": {
    en: "Your one-time send was opened and burned.",
    th: "ลิงก์ส่งครั้งเดียวของคุณถูกเปิดและถูกทำลายแล้ว",
  },
  "notif.send_viewed.body_views": {
    en: "Your one-time send was opened · {n} views left",
    th: "ลิงก์ส่งครั้งเดียวของคุณถูกเปิด · เหลือดูได้อีก {n} ครั้ง",
  },
  "notif.tab.all": { en: "All", th: "ทั้งหมด" },
  "notif.tab.unread": { en: "Unread", th: "ยังไม่อ่าน" },
  "notif.empty.all": { en: "No notifications", th: "ไม่มีการแจ้งเตือน" },
  "notif.empty.unread": { en: "All caught up", th: "อ่านครบแล้ว" },
  "notif.empty.all_desc": {
    en: "We'll let you know when something needs your attention.",
    th: "เราจะแจ้งเมื่อมีอะไรต้องการความสนใจของคุณ",
  },
  "notif.empty.unread_desc": {
    en: "You've read everything in your inbox.",
    th: "คุณอ่านทุกอย่างในกล่องข้อความแล้ว",
  },

  /* ---- keyboard shortcuts dialog ---- */
  "ks.title": { en: "Keyboard shortcuts", th: "ปุ่มลัด" },
  "ks.subtitle": {
    en: "Move around the vault without your mouse. Press ? from anywhere to open this dialog.",
    th: "ใช้ตู้นิรภัยโดยไม่ต้องใช้เมาส์ กด ? ที่ไหนก็ได้เพื่อเปิด dialog นี้",
  },
  "ks.group.nav": { en: "Navigation", th: "การนำทาง" },
  "ks.group.items": { en: "Items", th: "รายการ" },
  "ks.group.vault": { en: "Vault", th: "ตู้นิรภัย" },
  "ks.group.appearance": { en: "Appearance", th: "รูปลักษณ์" },
  "ks.group.general": { en: "General", th: "ทั่วไป" },
  "ks.cmd_palette": {
    en: "Open command palette",
    th: "เปิด command palette",
  },
  "ks.cmd_palette_desc": {
    en: "Search items, vaults, and run commands",
    th: "ค้นหารายการ ตู้นิรภัย และรันคำสั่ง",
  },
  "ks.goto_home": { en: "Go to Home", th: "ไปหน้าหลัก" },
  "ks.goto_last_vault": {
    en: "Go to your last opened vault",
    th: "ไปตู้นิรภัยที่เปิดล่าสุด",
  },
  "ks.goto_favorites": { en: "Go to Favorites", th: "ไปรายการโปรด" },
  "ks.goto_sends": { en: "Go to One-time Sends", th: "ไปการส่งครั้งเดียว" },
  "ks.show_dialog": {
    en: "Show this shortcuts dialog",
    th: "แสดง dialog ปุ่มลัด",
  },
  "ks.new_item": { en: "New item", th: "รายการใหม่" },
  "ks.send_copy": {
    en: "Send one-time copy of current item",
    th: "ส่งสำเนาครั้งเดียวของรายการปัจจุบัน",
  },
  "ks.copy_password": {
    en: "Copy password (when viewing item)",
    th: "คัดลอกรหัสผ่าน (เมื่อดูรายการ)",
  },
  "ks.copy_username": { en: "Copy username", th: "คัดลอกชื่อผู้ใช้" },
  "ks.open_url": {
    en: "Open URL in current item",
    th: "เปิด URL ในรายการปัจจุบัน",
  },
  "ks.toggle_fav": { en: "Toggle favorite", th: "สลับรายการโปรด" },
  "ks.edit_current": { en: "Edit current item", th: "แก้ไขรายการปัจจุบัน" },
  "ks.move_trash": { en: "Move to trash", th: "ย้ายไปถังขยะ" },
  "ks.lock_vault": { en: "Lock vault", th: "ล็อคตู้นิรภัย" },
  "ks.lock_vault_desc": {
    en: "Clears decrypted keys from memory",
    th: "ล้างกุญแจที่ถอดรหัสออกจากหน่วยความจำ",
  },
  "ks.new_vault": { en: "New vault", th: "ตู้นิรภัยใหม่" },
  "ks.focus_search": {
    en: "Focus search filter in current vault",
    th: "โฟกัสตัวกรองค้นหาในตู้นิรภัยปัจจุบัน",
  },
  "ks.theme_light": { en: "Switch to Light theme", th: "เปลี่ยนเป็นธีมสว่าง" },
  "ks.theme_dark": { en: "Switch to Dark theme", th: "เปลี่ยนเป็นธีมมืด" },
  "ks.esc": { en: "Close dialog / cancel action", th: "ปิด dialog / ยกเลิก" },
  "ks.enter": { en: "Submit form / confirm action", th: "ส่ง form / ยืนยัน" },
  "ks.tab": { en: "Next field", th: "ฟิลด์ถัดไป" },
  "ks.shift_tab": { en: "Previous field", th: "ฟิลด์ก่อนหน้า" },
  "ks.platform_hint": {
    en: 'On Windows / Linux, swap ⌘ for Ctrl and ⌥ for Alt. The "Not yet wired" shortcuts are reference for upcoming features.',
    th: 'บน Windows / Linux ใช้ Ctrl แทน ⌘ และ Alt แทน ⌥ ปุ่มลัด "ยังไม่ได้เชื่อม" เป็น reference สำหรับฟีเจอร์ในอนาคต',
  },

  /* ---- command palette ---- */
  "cmd.search_placeholder": {
    en: "Search items, vaults, or commands…",
    th: "ค้นหารายการ ตู้นิรภัย หรือคำสั่ง…",
  },
  "cmd.no_results": { en: "No results found.", th: "ไม่พบผลลัพธ์" },
  "cmd.quick_actions": { en: "Quick actions", th: "การกระทำด่วน" },
  "cmd.items": { en: "Items", th: "รายการ" },
  "cmd.vaults": { en: "Vaults", th: "ตู้นิรภัย" },
  "cmd.go_to": { en: "Go to", th: "ไปยัง" },
  "cmd.send_copy": { en: "Send one-time copy", th: "ส่งสำเนาครั้งเดียว" },
  "cmd.n_items": { en: "{n} items", th: "{n} รายการ" },
  "cmd.searching": { en: "Searching…", th: "กำลังค้นหา…" },
  "cmd.no_items": { en: "No matching items.", th: "ไม่พบรายการที่ตรงกัน" },

  /* ---- recipient page ---- */
  "recip.someone_shared": {
    en: "Someone shared a secret with you",
    th: "มีคนแชร์ความลับให้คุณ",
  },
  "recip.from": { en: "From {email}", th: "จาก {email}" },
  "recip.sent_ago": { en: "sent 12 min ago", th: "ส่งเมื่อ 12 นาทีที่แล้ว" },
  "recip.burn_caption": {
    en: "Burns after viewing — 1 view remaining",
    th: "ทำลายหลังเปิดดู — เหลือ 1 ครั้ง",
  },
  "recip.expires_in_caption": {
    en: "Expires in 23 hours 48 minutes",
    th: "หมดอายุใน 23 ชั่วโมง 48 นาที",
  },
  "recip.e2e_caption": {
    en: "End-to-end encrypted — only you can read it",
    th: "เข้ารหัสแบบ end-to-end — มีเพียงคุณที่อ่านได้",
  },
  "recip.reveal_secret": { en: "Reveal secret", th: "เปิดดูความลับ" },
  "recip.shoulder_warning": {
    en: "Make sure no one is watching your screen.",
    th: "ตรวจสอบให้แน่ใจว่าไม่มีใครมองหน้าจอ",
  },
  "recip.passphrase_warning": {
    en: "This send is protected with a passphrase. Ask the sender for it through a different channel.",
    th: "การส่งนี้ใส่ Passphrase ป้องกันไว้ ขอ Passphrase จากผู้ส่งผ่านช่องทางอื่น",
  },
  "recip.passphrase": { en: "Passphrase", th: "Passphrase" },
  "recip.passphrase_placeholder": {
    en: "At least 8 characters",
    th: "อย่างน้อย 8 ตัวอักษร",
  },
  "recip.unlock": { en: "Unlock", th: "ปลดล็อค" },
  "recip.secret_content": { en: "Secret content", th: "เนื้อหาความลับ" },
  "recip.burned_views_left": {
    en: "Burned · {n} views left",
    th: "ถูกทำลาย · เหลือ {n} ครั้ง",
  },
  "recip.auto_clear_caption": {
    en: "This page will auto-clear in {n}s. URL is being scrubbed from history.",
    th: "หน้านี้จะถูกล้างอัตโนมัติใน {n} วินาที URL กำลังถูกลบจากประวัติ",
  },
  "recip.burned_title": { en: "Secret burned", th: "ความลับถูกทำลายแล้ว" },
  "recip.burned_desc": {
    en: "This page was cleared for your safety. The link cannot be used again.",
    th: "หน้านี้ถูกล้างเพื่อความปลอดภัย ลิงก์นี้ใช้อีกครั้งไม่ได้",
  },
  "recip.go_to_vault": { en: "Go to Vault", th: "ไปที่ตู้นิรภัย" },
  "recip.key_caption": {
    en: "The decryption key lives only in your browser URL (after #). Our servers never see it.",
    th: "กุญแจถอดรหัสอยู่เฉพาะใน URL ของเบราว์เซอร์ (หลัง #) เซิร์ฟเวอร์ของเราไม่เห็น",
  },
  "recip.brand_caption": {
    en: "Secure one-time send",
    th: "การส่งครั้งเดียวที่ปลอดภัย",
  },
  "recip.learn_more": { en: "Learn more", th: "เรียนรู้เพิ่มเติม" },
  "recip.learn_more_arrow": { en: "Learn more →", th: "เรียนรู้เพิ่มเติม →" },
  "recip.copy": { en: "Copy", th: "คัดลอก" },
  "recip.copied": { en: "Copied to clipboard", th: "คัดลอกแล้ว" },
  "recip.title_someone": {
    en: "Someone sent you a secret",
    th: "มีคนส่ง secret ให้คุณ",
  },
  "recip.via_brand": {
    en: "via Woxa Vault · iux24.com",
    th: "via Woxa Vault · iux24.com",
  },
  "recip.sender_line": {
    en: "{email} sent you a secret",
    th: "{email} ส่ง secret มาให้คุณ",
  },
  "recip.sender_action": {
    en: "sent you a secret",
    th: "ส่ง secret มาให้คุณ",
  },
  "recip.one_shot_warning": {
    en: "One-time view only — after you tap Reveal, the secret is immediately removed from the server. Please copy it before closing this page.",
    th: "เปิดได้ครั้งเดียวเท่านั้น — หลังจากกด Reveal ระบบจะลบ secret ออกจาก server ทันที กรุณา copy เก็บไว้ก่อนปิดหน้านี้",
  },
  "recip.info.expires_in": { en: "Expires in", th: "หมดอายุใน" },
  "recip.info.opens": { en: "Opens", th: "เปิดได้" },
  "recip.info.passphrase": { en: "Passphrase", th: "Passphrase" },
  "recip.info.encryption": { en: "Encryption", th: "Encryption" },
  "recip.expires_minutes": { en: "{n} minutes", th: "{n} นาที" },
  "recip.opens_burn_after_read": {
    en: "1 view (burn after read)",
    th: "1 ครั้ง (burn after read)",
  },
  "recip.passphrase_not_required": { en: "Not required", th: "ไม่ต้อง" },
  "recip.encryption_value": {
    en: "AES-256-GCM zero-knowledge",
    th: "AES-256-GCM zero-knowledge",
  },
  "recip.footer_security": {
    en: "Secret is decrypted in your browser · server never sees plaintext",
    th: "Secret จะ decrypt ในเบราว์เซอร์ของคุณ · server ไม่เคยเห็น plaintext",
  },
  "recip.copy_all": { en: "Copy all", th: "คัดลอกทั้งหมด" },
  "recip.copy_field": { en: "Copy {label}", th: "คัดลอก {label}" },
  "recip.field_copied": { en: "{label} copied", th: "คัดลอก {label} แล้ว" },
  "recip.field_from": { en: "(from {item})", th: "(จาก {item})" },
  "recip.show_value": { en: "Show {label}", th: "แสดง {label}" },
  "recip.hide_value": { en: "Hide {label}", th: "ซ่อน {label}" },
  "recip.empty_payload": {
    en: "This send has no fields.",
    th: "การส่งนี้ไม่มีฟิลด์ใด ๆ",
  },

  /* ---- settings additions ---- */
  "settings.open_sso": { en: "Open SSO settings", th: "เปิดการตั้งค่า SSO" },
  "settings.open_security_policy": {
    en: "Open security policy",
    th: "เปิดนโยบายความปลอดภัย",
  },
  "secpol.minute_one": { en: "1 minute", th: "1 นาที" },
  "secpol.minutes": { en: "{n} minutes", th: "{n} นาที" },
  "secpol.hour_one": { en: "1 hour", th: "1 ชั่วโมง" },
  "secpol.hours": { en: "{n} hours", th: "{n} ชั่วโมง" },
  "secpol.days": { en: "{n} days", th: "{n} วัน" },
  "sso.members_last_sync": {
    en: "{n} members · last sync {when}",
    th: "{n} สมาชิก · ซิงค์ล่าสุด {when}",
  },
  "sso.domain_enforcement_pending": {
    en: "Preview only. Domain enforcement is pending verified domain binding (AC-006.2) — this list is not enforced at sign-in yet.",
    th: "ตัวอย่างเท่านั้น การบังคับใช้โดเมนรอการผูกโดเมนที่ยืนยันแล้ว (AC-006.2) — รายการนี้ยังไม่ถูกบังคับใช้ตอนเข้าสู่ระบบ",
  },
  "sso.provisioning_desc_prefix": {
    en: "Map identity provider groups to Woxa teams. Roles inherit from",
    th: "เชื่อมกลุ่มจาก identity provider เข้ากับทีมใน Woxa สิทธิ์การเข้าถึงจะถูกกำหนดจาก",
  },
  "sso.role.member": { en: "Member", th: "สมาชิก" },
  "sso.role.guest": { en: "Guest", th: "ผู้เยี่ยมชม" },
  "sso.role.admin": { en: "Admin", th: "ผู้ดูแล" },
  "sso.vault.none": { en: "None", th: "ไม่มี" },
  "sso.vault.shared": { en: "Shared vaults", th: "ตู้นิรภัยที่แชร์" },
  "sso.vault.onboarding": { en: "Onboarding vault", th: "ตู้นิรภัยสำหรับเริ่มต้น" },
  "intg.google_workspace_desc": {
    en: "Directory sync + SSO via SAML",
    th: "ซิงค์ไดเรกทอรี + SSO ผ่าน SAML",
  },
  "intg.slack_desc": {
    en: "Send notifications and approvals to channels",
    th: "ส่งการแจ้งเตือนและการอนุมัติไปยังช่องสนทนา",
  },
  "intg.github_desc": {
    en: "Detect leaked secrets in commits",
    th: "ตรวจจับความลับที่รั่วไหลใน commit",
  },
  "intg.entra_desc": {
    en: "Microsoft identity provider via OIDC",
    th: "Microsoft identity provider ผ่าน OIDC",
  },
  "intg.datadog_desc": {
    en: "Stream audit events to your SIEM",
    th: "ส่ง audit event ไปยัง SIEM ของคุณ",
  },
  "intg.pagerduty_desc": {
    en: "Page on critical access events",
    th: "แจ้งเตือนเมื่อมีเหตุการณ์เข้าถึงที่สำคัญ",
  },
  "billing.update": { en: "Update", th: "อัพเดต" },
  "billing.download_all": { en: "Download all", th: "ดาวน์โหลดทั้งหมด" },
  "billing.date.may1_2026": { en: "May 1, 2026", th: "1 พ.ค. 2026" },
  "billing.date.apr1_2026": { en: "Apr 1, 2026", th: "1 เม.ย. 2026" },
  "billing.date.mar1_2026": { en: "Mar 1, 2026", th: "1 มี.ค. 2026" },

  /* ---- account additions ---- */
  "settings.account_settings": { en: "Account settings", th: "การตั้งค่าบัญชี" },
  "settings.account_subtitle": {
    en: "Manage your personal account · {email}",
    th: "จัดการบัญชีส่วนตัวของคุณ · {email}",
  },
  "settings.notifications": { en: "Notifications", th: "การแจ้งเตือน" },
  "settings.personal_integrations": {
    en: "Personal integrations",
    th: "การเชื่อมต่อส่วนตัว",
  },
  "common.on": { en: "On", th: "เปิด" },
  "account.two_factor": {
    en: "Two-factor authentication",
    th: "การยืนยันตัวตนสองชั้น",
  },
  "account.notif_desc": {
    en: "Pick what we tell you about. Critical security alerts cannot be turned off.",
    th: "เลือกสิ่งที่จะแจ้งให้คุณทราบ การแจ้งเตือนความปลอดภัยสำคัญไม่สามารถปิดได้",
  },
  "account.integrations_desc": {
    en: "Connect your personal devices and tools to access Woxa Vault.",
    th: "เชื่อมต่ออุปกรณ์และเครื่องมือส่วนตัวเพื่อใช้งาน Woxa Vault",
  },
  "account.browser_extension": { en: "Browser extension", th: "ส่วนขยายเบราว์เซอร์" },
  "account.browser_extension_desc": {
    en: "Auto-fill passwords and 2FA codes on every site.",
    th: "เติมรหัสผ่านและรหัส 2FA อัตโนมัติทุกเว็บไซต์",
  },
  "account.install_chrome": { en: "Install for Chrome", th: "ติดตั้งบน Chrome" },
  "account.install_firefox": { en: "Install for Firefox", th: "ติดตั้งบน Firefox" },
  "account.install_edge": { en: "Install for Edge", th: "ติดตั้งบน Edge" },
  "account.cli_mobile": { en: "CLI & mobile", th: "CLI และมือถือ" },
  "account.cli_mobile_desc": {
    en: "Power-user access from your terminal or phone.",
    th: "เข้าถึงจาก terminal หรือโทรศัพท์สำหรับผู้ใช้ขั้นสูง",
  },
  "account.cli_install_desc": {
    en: "Install via brew, npm, or scoop. Sign in with your account password.",
    th: "ติดตั้งผ่าน brew, npm หรือ scoop เข้าสู่ระบบด้วยรหัสผ่านบัญชีของคุณ",
  },
  "account.ios_app": { en: "iOS app", th: "แอป iOS" },
  "account.ios_app_desc": {
    en: "iPhone & iPad with Face ID unlock",
    th: "iPhone และ iPad ปลดล็อคด้วย Face ID",
  },
  "account.android_app": { en: "Android app", th: "แอป Android" },
  "account.android_app_desc": {
    en: "Android with biometric unlock",
    th: "Android ปลดล็อคด้วยไบโอเมตริก",
  },
  "account.api_tokens": { en: "Personal API tokens", th: "API token ส่วนตัว" },
  "account.api_tokens_desc": {
    en: "Tokens scoped to your account for scripts and automations.",
    th: "Token ที่จำกัดอยู่ในบัญชีคุณ สำหรับสคริปต์และระบบอัตโนมัติ",
  },
  "account.no_tokens_yet": {
    en: "No tokens created yet.",
    th: "ยังไม่ได้สร้าง token",
  },
  "account.workspace_tokens_hint": {
    en: "Need workspace-wide tokens? See Settings → Integrations.",
    th: "ต้องการ token ระดับเวิร์กสเปซ? ดูที่ การตั้งค่า → การเชื่อมต่อ",
  },
  "account.new_token": { en: "New token", th: "Token ใหม่" },

  /* ---- shared component additions ---- */
  "toast.field_copied": { en: "{label} copied", th: "คัดลอก {label} แล้ว" },
  "toast.copy_failed": {
    en: "Couldn't copy to clipboard",
    th: "คัดลอกไม่สำเร็จ",
  },
  "secret.hides_in_5s": { en: "hides in 5s", th: "ซ่อนใน 5 วินาที" },
  "secret.clipboard_clear": {
    en: "Clipboard will clear in 30 seconds.",
    th: "Clipboard จะถูกล้างใน 30 วินาที",
  },
  "secret.aria.hide": { en: "Hide", th: "ซ่อน" },
  "secret.aria.reveal": { en: "Reveal", th: "เปิดดู" },
  "secret.aria.copy": { en: "Copy", th: "คัดลอก" },
  "secret.reveal_failed": {
    en: "Couldn't reveal the secret. Please try again.",
    th: "เปิดดูข้อมูลลับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  },
  "totp.label": { en: "One-time code (TOTP)", th: "รหัสครั้งเดียว (TOTP)" },
  "totp.copied": { en: "TOTP code copied", th: "คัดลอกรหัส TOTP แล้ว" },
  "totp.aria.copy_code": { en: "Copy code", th: "คัดลอกรหัส" },
  "domains.title": { en: "Allowed email domains", th: "โดเมนอีเมลที่อนุญาต" },
  "domains.preview_desc": {
    en: "Read-only preview. Once verified domain binding (AC-006.2) ships, addresses outside these domains will be blocked. Not enforced today.",
    th: "ตัวอย่างแบบอ่านอย่างเดียว เมื่อการผูกโดเมนที่ยืนยันแล้ว (AC-006.2) พร้อมใช้งาน อีเมลนอกโดเมนเหล่านี้จะถูกบล็อก ปัจจุบันยังไม่บังคับใช้",
  },
  "domains.placeholder": { en: "example.com", th: "example.com" },
  "domains.txt_hint": {
    en: "Add the TXT record below to your DNS to verify ownership.",
    th: "เพิ่ม TXT record ด้านล่างใน DNS เพื่อยืนยันความเป็นเจ้าของ",
  },
  "domains.add_domain": { en: "Add domain", th: "เพิ่มโดเมน" },
  "domains.add": { en: "Add", th: "เพิ่ม" },
  "domains.cancel": { en: "Cancel", th: "ยกเลิก" },
  "domains.verify": { en: "Verify", th: "ยืนยัน" },
  "domains.primary": { en: "Primary", th: "หลัก" },
  "domains.verified": { en: "Verified", th: "ยืนยันแล้ว" },
  "domains.linked_to": { en: "Linked to", th: "เชื่อมโยงกับ" },
  "domains.user_singular": { en: "user", th: "ผู้ใช้" },
  "domains.user_plural": { en: "users", th: "ผู้ใช้" },
  "domains.pending_status": { en: "Pending verification", th: "รอการยืนยัน" },
  "domains.failed_status": { en: "Verification failed", th: "ยืนยันไม่สำเร็จ" },
  "domains.set_primary": { en: "Set as primary", th: "ตั้งเป็นโดเมนหลัก" },
  "domains.recheck_dns": { en: "Recheck DNS", th: "ตรวจสอบ DNS อีกครั้ง" },
  "domains.view_users": { en: "View users", th: "ดูผู้ใช้" },
  "domains.remove_domain": { en: "Remove domain", th: "ลบโดเมน" },
  "domains.more_aria": { en: "More options", th: "ตัวเลือกเพิ่มเติม" },
  "domains.dns_txt_record": { en: "DNS TXT record", th: "DNS TXT record" },
  "domains.host_label": { en: "Host", th: "Host" },
  "domains.toast.verified": { en: "Domain verified", th: "ยืนยันโดเมนแล้ว" },
  "domains.toast.cant_remove_primary": {
    en: "Cannot remove primary domain",
    th: "ไม่สามารถลบโดเมนหลักได้",
  },
  "domains.toast.now_primary": {
    en: "Primary domain updated",
    th: "อัพเดตโดเมนหลักแล้ว",
  },
  "domains.toast.txt_copied": { en: "TXT record copied", th: "คัดลอก TXT record แล้ว" },

  /* ---- attachments (new item dialog) ---- */
  "ni.attachments": { en: "Attachments", th: "ไฟล์แนบ" },
  "ni.attachments_hint": {
    en: "Click to browse or drop files here",
    th: "คลิกเพื่อเลือก หรือลากไฟล์มาวาง",
  },
  "ni.attachments_drop": {
    en: "Drop files to attach",
    th: "ปล่อยไฟล์เพื่อแนบ",
  },
  "ni.attachments_max": {
    en: "Up to 25 MB per file",
    th: "ไม่เกิน 25 MB ต่อไฟล์",
  },
  "ni.attached_files": {
    en: "Attached files ({n})",
    th: "ไฟล์แนบ ({n})",
  },
  "ni.remove_attachment": { en: "Remove attachment", th: "ลบไฟล์แนบ" },
  "ni.attachment_too_large": {
    en: "File exceeds 25 MB and was skipped",
    th: "ไฟล์มีขนาดเกิน 25 MB ถูกข้ามไป",
  },

  /* ---- Google SSO ---- */
  "sso.continue_google": {
    en: "Continue with Google",
    th: "ดำเนินการต่อด้วย Google",
  },
  "sso.redirecting": {
    en: "Redirecting to Google…",
    th: "กำลังไปยัง Google…",
  },
  "sso.signed_in_with_google": {
    en: "Use your Google Workspace account to sign in.",
    th: "ใช้บัญชี Google Workspace เพื่อเข้าสู่ระบบ",
  },
  "sso.signed_in_with_google_for": {
    en: "Sign in to {email} with Google Workspace.",
    th: "เข้าสู่ระบบในบัญชี {email} ด้วย Google Workspace",
  },
  "sso.error.title": { en: "Sign-in failed", th: "เข้าสู่ระบบไม่สำเร็จ" },
  "sso.error.sso_state_mismatch": {
    en: "The sign-in link expired or didn't match. Please try again.",
    th: "ลิงก์เข้าสู่ระบบหมดอายุหรือไม่ตรงกัน กรุณาลองอีกครั้ง",
  },
  "sso.error.sso_domain_forbidden": {
    en: "Your Google account isn't allowed in this workspace.",
    th: "บัญชี Google นี้ไม่ได้รับอนุญาตในเวิร์กสเปซนี้",
  },
  "sso.error.sso_email_unverified": {
    en: "Your Google account email isn't verified yet.",
    th: "อีเมลของบัญชี Google ยังไม่ได้ยืนยัน",
  },
  "sso.error.sso_provider_error": {
    en: "Google reported an error during sign-in. Please try again.",
    th: "Google แจ้งข้อผิดพลาดระหว่างเข้าสู่ระบบ กรุณาลองอีกครั้ง",
  },
  "sso.error.sso_internal_error": {
    en: "Something went wrong while signing you in. Please try again.",
    th: "เกิดข้อผิดพลาดระหว่างเข้าสู่ระบบ กรุณาลองอีกครั้ง",
  },
  "sso.error.dismiss": { en: "Dismiss", th: "ปิด" },

  /* ---- Generic API data states (loading/error fallback) ---- */
  "api.loading": { en: "Loading…", th: "กำลังโหลด…" },
  "api.error.title": {
    en: "Couldn't load this data",
    th: "ไม่สามารถโหลดข้อมูลนี้ได้",
  },
  "api.error.network": {
    en: "Can't reach the server. Check your connection and try again.",
    th: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง",
  },
  "api.error.generic": {
    en: "Something went wrong. Please try again.",
    th: "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง",
  },
  "api.retry": { en: "Try again", th: "ลองอีกครั้ง" },
  "api.error.forbidden_title": {
    en: "Access restricted",
    th: "ข้อจำกัดในการเข้าถึง",
  },
  "api.error.forbidden_desc": {
    en: "You don't have permission to view this section or perform this action.",
    th: "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ หรือไม่มีสิทธิ์ดำเนินการดังกล่าว",
  },
  "api.error.forbidden_auditor_desc": {
    en: "As an Auditor, you have metadata-only access. Secret material and management actions are strictly restricted.",
    th: "ในบทบาทผู้ตรวจสอบ คุณสามารถดูได้เฉพาะข้อมูลทั่วไปเท่านั้น ระบบจำกัดการเข้าถึงข้อมูลลับและการจัดการต่างๆ ไว้",
  },
  "api.error.not_found_title": {
    en: "Not found",
    th: "ไม่พบข้อมูล",
  },
  "api.error.not_found_desc": {
    en: "This may have been deleted, or you don't have access to view it.",
    th: "อาจถูกลบไปแล้ว หรือคุณไม่มีสิทธิ์เข้าถึง",
  },
  "api.error.delete_failed": {
    en: "Couldn't delete",
    th: "ลบไม่สำเร็จ",
  },
  "api.error.save_failed": {
    en: "Couldn't save changes",
    th: "บันทึกไม่สำเร็จ",
  },
  "api.error.create_failed": {
    en: "Couldn't create",
    th: "สร้างไม่สำเร็จ",
  },
  "api.error.vault_not_empty": {
    en: "Vault still has items. Delete or move them first.",
    th: "ตู้นิรภัยยังมีรายการอยู่ ต้องลบหรือย้ายออกก่อน",
  },
  "api.error.reveal_failed": {
    en: "Couldn't reveal this item",
    th: "ไม่สามารถเปิดดูรายการนี้ได้",
  },

  /* ---- API-backed vault list empty state ---- */
  "vaults.empty.title": { en: "No vaults yet", th: "ยังไม่มีตู้นิรภัย" },
  "vaults.empty.desc": {
    en: "Create your first vault to start storing credentials and secrets.",
    th: "สร้างตู้นิรภัยแรกของคุณเพื่อเริ่มเก็บข้อมูลรับรองและความลับ",
  },
  "vaults.empty.cta": { en: "Create your first vault", th: "สร้างตู้นิรภัยแรก" },

  /* ---- Vault detail (items list) empty state ---- */
  "vault.items.empty.title": { en: "No items yet", th: "ยังไม่มีรายการ" },
  "vault.items.empty.desc": {
    en: "Add a login or note to start filling this vault.",
    th: "เพิ่มข้อมูลเข้าสู่ระบบหรือบันทึกเพื่อเริ่มใช้ตู้นี้",
  },
  "vault.items.empty.cta": {
    en: "Create your first item",
    th: "สร้างรายการแรก",
  },

  /* ---- Vault deletion confirmation ---- */
  "vault.delete.title": { en: "Delete this vault?", th: "ลบตู้นิรภัยนี้?" },
  "vault.delete.desc": {
    en: "This permanently removes {name}. The vault must be empty.",
    th: "การลบนี้จะนำ {name} ออกอย่างถาวร ตู้ต้องว่างก่อน",
  },
  "vault.delete.button": { en: "Delete vault", th: "ลบตู้นิรภัย" },
  "vault.delete.danger_zone": { en: "Danger zone", th: "พื้นที่อันตราย" },
  "vault.deleted_toast": { en: "Vault deleted", th: "ลบตู้นิรภัยแล้ว" },

  /* ---- Item deletion confirmation ---- */
  "item.delete.title": { en: "Delete this item?", th: "ลบรายการนี้?" },
  "item.delete.desc": {
    en: "{name} will be permanently deleted. This cannot be undone.",
    th: "{name} จะถูกลบอย่างถาวร และไม่สามารถย้อนกลับได้",
  },
  "item.delete.button": { en: "Delete item", th: "ลบรายการ" },
  "item.deleted_toast": { en: "Item deleted", th: "ลบรายการแล้ว" },

  /* ---- View-only (effective viewer) ---- */
  "item.share": { en: "Share", th: "แชร์" },
  "item.readonly_notice": {
    en: "Access restricted",
    th: "ข้อจำกัดในการเข้าถึง",
  },
  "item.readonly_secret": {
    en: "Hidden by security policy",
    th: "ถูกซ่อนตามนโยบายความปลอดภัย",
  },
  "item.readonly_notice_desc": {
    en: "You can view this item's metadata, but your role doesn't have permission to reveal secrets or edit data.",
    th: "คุณสามารถดูข้อมูลทั่วไปได้ แต่บทบาทของคุณไม่มีสิทธิ์ดูรหัสผ่านหรือแก้ไขข้อมูล",
  },

  /* ---- Item reveal (decrypted) ---- */
  "item.reveal_loading": {
    en: "Decrypting…",
    th: "กำลังถอดรหัส…",
  },
  "item.no_secret": { en: "Not set", th: "ไม่ได้ตั้งค่า" },

  /* ---- Folder dialog (backed by /vaults/:id/folders endpoint) ---- */
  "folder.delete.title": { en: "Delete this folder?", th: "ลบโฟลเดอร์นี้?" },
  "folder.delete.desc": {
    en: "Items inside {name} stay in the vault but will lose their folder assignment.",
    th: "รายการใน {name} จะยังอยู่ในตู้นิรภัย แต่จะไม่อยู่ในโฟลเดอร์นี้",
  },
  "folder.delete.button": { en: "Delete folder", th: "ลบโฟลเดอร์" },
  "folder.deleted_toast": { en: "Folder deleted", th: "ลบโฟลเดอร์แล้ว" },
  "folder.empty.title": { en: "Empty folder", th: "โฟลเดอร์ว่าง" },
  "folder.empty.desc": {
    en: "Move items into {name} from anywhere in this vault.",
    th: "ย้ายรายการเข้า {name} ได้จากที่ใดก็ตามในตู้นิรภัยนี้",
  },
  "folder.all_items": { en: "All items", th: "รายการทั้งหมด" },
  "folder.uncategorized": {
    en: "No folder",
    th: "ไม่มีโฟลเดอร์",
  },
  "folder.filter_active": {
    en: "Folder: {name}",
    th: "โฟลเดอร์: {name}",
  },
  "folder.filter_label": { en: "Folder", th: "โฟลเดอร์" },
  "folder.filter_all": { en: "All folders", th: "ทุกโฟลเดอร์" },
  "folder.filter_aria": {
    en: "Filter items by folder",
    th: "กรองรายการตามโฟลเดอร์",
  },
  "vault.actions_aria": { en: "Vault actions", th: "การกระทำของตู้นิรภัย" },
  "folder.actions_aria": { en: "Folder actions", th: "การกระทำของโฟลเดอร์" },

  /* ---- Item tags / favorite list affordances ---- */
  "item.tag_add": { en: "Add tag", th: "เพิ่มแท็ก" },
  "item.tag_remove": { en: "Remove tag", th: "ลบแท็ก" },
  "item.favorite": { en: "Favorite", th: "รายการโปรด" },
  "item.unfavorite": { en: "Remove favorite", th: "เอาออกจากรายการโปรด" },
  "item.toggle_favorite": { en: "Toggle favorite", th: "สลับรายการโปรด" },
  "item.move_to_folder": { en: "Move to folder", th: "ย้ายไปโฟลเดอร์" },

  /* ---- Item detail extras ---- */
  "item.totp": { en: "TOTP (2FA)", th: "TOTP (2FA)" },

  /* ---- Card-specific labels ---- */
  "item.card.number": { en: "Card number", th: "หมายเลขบัตร" },
  "item.card.cardholder": { en: "Cardholder name", th: "ชื่อผู้ถือบัตร" },
  "item.card.expiry": { en: "Expiry", th: "วันหมดอายุ" },
  "item.card.cvv": { en: "CVV / CVC", th: "CVV / CVC" },

  /* ---- Identity-specific labels ---- */
  "item.identity.full_name": { en: "Full name", th: "ชื่อ-นามสกุล" },
  "item.identity.email": { en: "Email", th: "อีเมล" },
  "item.identity.phone": { en: "Phone", th: "โทรศัพท์" },
  "item.identity.address": { en: "Address", th: "ที่อยู่" },

  /* ---- SSH-specific labels ---- */
  "item.ssh.private_key": { en: "Private key", th: "Private key" },
  "item.ssh.public_key": { en: "Public key", th: "Public key" },
  "item.ssh.passphrase": { en: "Passphrase", th: "Passphrase" },

  /* ---- API key-specific ---- */
  "item.api_key.key": { en: "API key", th: "API key" },
  "item.api_key.label": { en: "Service / label", th: "บริการ / ชื่อกำกับ" },

  /* ---- Vault edit dialog ---- */
  "vault.edit.title": { en: "Edit vault", th: "แก้ไขตู้นิรภัย" },
  "vault.edit.desc": {
    en: "Update the name, description, icon, or color for this vault.",
    th: "อัปเดตชื่อ คำอธิบาย ไอคอน หรือสีของตู้นิรภัยนี้",
  },
  "vault.edit.button": { en: "Edit vault", th: "แก้ไขตู้นิรภัย" },
  "vault.edit.save": { en: "Save changes", th: "บันทึกการเปลี่ยนแปลง" },
  "vault.edit.no_changes": { en: "No changes to save", th: "ไม่มีการเปลี่ยนแปลง" },
  "vault.updated_toast": { en: "Vault updated", th: "อัปเดตตู้นิรภัยแล้ว" },
  "vault.updated_toast_desc": {
    en: 'Changes to "{name}" saved.',
    th: 'บันทึกการเปลี่ยนแปลงของ "{name}" แล้ว',
  },

  /* ---- Folder edit dialog ---- */
  "folder.edit.title": { en: "Edit folder", th: "แก้ไขโฟลเดอร์" },
  "folder.edit.desc": {
    en: "Update the name, icon, or color for this folder.",
    th: "อัปเดตชื่อ ไอคอน หรือสีของโฟลเดอร์นี้",
  },
  "folder.edit.button": { en: "Edit folder", th: "แก้ไขโฟลเดอร์" },
  "folder.edit.save": { en: "Save changes", th: "บันทึกการเปลี่ยนแปลง" },
  "folder.updated_toast": { en: "Folder updated", th: "อัปเดตโฟลเดอร์แล้ว" },
  "folder.updated_toast_desc": {
    en: 'Changes to "{name}" saved.',
    th: 'บันทึกการเปลี่ยนแปลงของ "{name}" แล้ว',
  },

  /* ---- One-time sends — API error mapping (POST/GET/DELETE /sends) ---- */
  "sends.error.create_failed": {
    en: "Couldn't create send",
    th: "สร้างการส่งไม่สำเร็จ",
  },
  "sends.error.list_failed": {
    en: "Couldn't load sends",
    th: "โหลดรายการส่งไม่สำเร็จ",
  },
  "sends.error.burn_failed": {
    en: "Couldn't burn send",
    th: "ทำลายการส่งไม่สำเร็จ",
  },
  "sends.error.rate_limited": {
    en: "Too many sends. Please wait a minute and try again.",
    th: "ส่งบ่อยเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง",
  },
  "sends.burned_toast": { en: "Send burned", th: "ทำลายการส่งแล้ว" },
  "sends.copy_disabled_tooltip": {
    en: "Link is only available right after creation.",
    th: "ลิงก์แสดงได้เฉพาะตอนสร้างเสร็จเท่านั้น",
  },
  "sends.row.label": {
    en: "Send {preview}",
    th: "การส่ง {preview}",
  },
  "sends.empty.title": { en: "No sends yet", th: "ยังไม่มีการส่ง" },
  "sends.empty.desc": {
    en: "Create a one-time send to share a secret with someone outside your team.",
    th: "สร้างการส่งครั้งเดียวเพื่อแชร์ความลับให้คนนอกทีม",
  },

  /* ---- Recipient page — reveal API errors ---- */
  "recip.error.not_found_title": {
    en: "Link not found",
    th: "ไม่พบลิงก์",
  },
  "recip.error.not_found_desc": {
    en: "This link is invalid or has been removed.",
    th: "ลิงก์นี้ไม่ถูกต้องหรือถูกลบไปแล้ว",
  },
  "recip.error.expired_title": {
    en: "Link expired",
    th: "ลิงก์หมดอายุ",
  },
  "recip.error.expired_desc": {
    en: "This send has passed its expiry time.",
    th: "การส่งนี้หมดอายุแล้ว",
  },
  "recip.error.password_required": {
    en: "A passphrase is required to view this secret.",
    th: "ต้องใส่ Passphrase เพื่อเปิดดูความลับนี้",
  },
  "recip.error.password_invalid": {
    en: "That passphrase is incorrect.",
    th: "Passphrase ไม่ถูกต้อง",
  },
  "recip.error.rate_limited": {
    en: "Too many attempts. Please wait a minute and try again.",
    th: "พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง",
  },
  "recip.error.generic": {
    en: "Couldn't reveal this secret. Please try again.",
    th: "ไม่สามารถเปิดดูความลับนี้ได้ กรุณาลองอีกครั้ง",
  },
  "recip.preparing": {
    en: "Preparing secret…",
    th: "กำลังเตรียมความลับ…",
  },

  /* ---- items.attachments (form section, item detail, errors) ---- */
  "items.attachments.title": { en: "Attachments", th: "ไฟล์แนบ" },
  "items.attachments.drop_hint": {
    en: "Drop files here or click to browse",
    th: "ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก",
  },
  "items.attachments.choose_file": { en: "Choose file", th: "เลือกไฟล์" },
  "items.attachments.uploading": {
    en: "Uploading {name}…",
    th: "กำลังอัปโหลด {name}…",
  },
  "items.attachments.empty": {
    en: "No attachments yet.",
    th: "ยังไม่มีไฟล์แนบ",
  },
  "items.attachments.delete_confirm": {
    en: "Delete this attachment?",
    th: "ลบไฟล์แนบนี้ใช่หรือไม่?",
  },
  "items.attachments.limit_hint": {
    en: "Up to 25 MB per file · 100 MB total",
    th: "ไม่เกิน 25 MB ต่อไฟล์ · รวมไม่เกิน 100 MB",
  },
  "items.attachments.available_after_save": {
    en: "Save the item first to enable attachments.",
    th: "บันทึกรายการก่อน แล้วจึงจะแนบไฟล์ได้",
  },
  "items.attachments.queued": {
    en: "{n} file queued — will upload after save",
    th: "ไฟล์ {n} รายการในคิว จะอัปโหลดหลังบันทึก",
  },
  "items.attachments.queued_plural": {
    en: "{n} files queued — will upload after save",
    th: "ไฟล์ {n} รายการในคิว จะอัปโหลดหลังบันทึก",
  },
  "items.attachments.download": { en: "Download", th: "ดาวน์โหลด" },
  "items.attachments.delete": { en: "Delete", th: "ลบ" },
  "items.attachments.uploaded_at": {
    en: "Uploaded {when}",
    th: "อัปโหลดเมื่อ {when}",
  },
  "items.attachments.error.too_large": {
    en: "File too large — limit is 25 MB per file.",
    th: "ไฟล์มีขนาดใหญ่เกิน — จำกัด 25 MB ต่อไฟล์",
  },
  "items.attachments.error.quota_exceeded": {
    en: "Item attachment quota exceeded (100 MB total).",
    th: "เกินโควต้าไฟล์แนบของรายการนี้ (รวม 100 MB)",
  },
  "items.attachments.error.mime_not_allowed": {
    en: "File type not allowed. Docs, images, archives, keys and certs are accepted.",
    th: "ไม่อนุญาตประเภทไฟล์นี้ รองรับเอกสาร รูปภาพ ไฟล์บีบอัด คีย์ และใบรับรอง",
  },
  "items.attachments.error.upload_failed": {
    en: "Upload failed. Please try again.",
    th: "อัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง",
  },
  "items.attachments.error.delete_failed": {
    en: "Couldn't delete attachment. Please try again.",
    th: "ลบไฟล์แนบไม่สำเร็จ กรุณาลองอีกครั้ง",
  },
  "items.attachments.error.list_failed": {
    en: "Couldn't load attachments.",
    th: "โหลดไฟล์แนบไม่สำเร็จ",
  },
  "items.attachments.toast.uploaded": {
    en: "Attachment uploaded",
    th: "อัปโหลดไฟล์แนบแล้ว",
  },
  "items.attachments.toast.deleted": {
    en: "Attachment deleted",
    th: "ลบไฟล์แนบแล้ว",
  },

  /* ---- members (live API wiring) ---- */
  "members.active": { en: "Active members", th: "สมาชิกที่ใช้งาน" },
  "members.pending": { en: "Pending invitations", th: "คำเชิญที่รอตอบรับ" },
  "members.empty.title": { en: "No members yet", th: "ยังไม่มีสมาชิก" },
  "members.empty.desc": {
    en: "Invite teammates to start collaborating.",
    th: "เชิญเพื่อนร่วมทีมเพื่อเริ่มทำงานร่วมกัน",
  },
  "members.pending_empty": {
    en: "No pending invitations.",
    th: "ไม่มีคำเชิญที่รอตอบรับ",
  },
  "members.joined_at": { en: "Joined {when}", th: "เข้าร่วมเมื่อ {when}" },
  "members.last_active": {
    en: "Last active {when}",
    th: "ใช้งานล่าสุด {when}",
  },
  "members.invitation.expires": {
    en: "Expires {when}",
    th: "หมดอายุ {when}",
  },
  "members.invitation.sent": {
    en: "Sent {when}",
    th: "ส่งเมื่อ {when}",
  },
  "members.actions.resend": { en: "Resend invitation", th: "ส่งคำเชิญอีกครั้ง" },
  "members.actions.revoke": { en: "Revoke invitation", th: "ยกเลิกคำเชิญ" },
  "members.actions.change_role": { en: "Change role", th: "เปลี่ยนบทบาท" },
  "members.actions.remove": { en: "Remove member", th: "ลบสมาชิก" },
  "members.actions.copy_link": { en: "Copy invite link", th: "คัดลอกลิงก์คำเชิญ" },
  "members.toast.role_updated": {
    en: "Role updated",
    th: "อัปเดตบทบาทแล้ว",
  },
  "members.toast.removed": { en: "Member removed", th: "ลบสมาชิกแล้ว" },
  "members.toast.invited": { en: "Invitation created", th: "สร้างคำเชิญแล้ว" },
  "members.toast.resent": { en: "Invitation resent", th: "ส่งคำเชิญอีกครั้งแล้ว" },
  "members.toast.revoked": { en: "Invitation revoked", th: "ยกเลิกคำเชิญแล้ว" },
  "members.toast.link_copied": {
    en: "Invite link copied",
    th: "คัดลอกลิงก์คำเชิญแล้ว",
  },
  "members.error.list_failed": {
    en: "Couldn't load members.",
    th: "โหลดรายชื่อสมาชิกไม่สำเร็จ",
  },
  "members.error.invite_failed": {
    en: "Couldn't create invitation.",
    th: "สร้างคำเชิญไม่สำเร็จ",
  },
  "members.error.already_member": {
    en: "This email is already a member of the workspace.",
    th: "อีเมลนี้เป็นสมาชิกของเวิร์กสเปซอยู่แล้ว",
  },
  "members.error.invitation_already_accepted": {
    en: "This invitation has already been accepted.",
    th: "คำเชิญนี้ถูกตอบรับไปแล้ว",
  },
  "members.error.invitation_revoked": {
    en: "This invitation has been revoked.",
    th: "คำเชิญนี้ถูกยกเลิกไปแล้ว",
  },
  "members.error.owner_forbidden": {
    en: "You can't remove or change the workspace owner. Transfer ownership first.",
    th: "ไม่สามารถลบหรือเปลี่ยนสิทธิ์เจ้าของเวิร์กสเปซได้ ต้องโอน ownership ก่อน",
  },
  "members.error.role_update_failed": {
    en: "Couldn't update role.",
    th: "เปลี่ยนบทบาทไม่สำเร็จ",
  },
  "members.error.remove_failed": {
    en: "Couldn't remove member.",
    th: "ลบสมาชิกไม่สำเร็จ",
  },
  "members.error.revoke_failed": {
    en: "Couldn't revoke invitation.",
    th: "ยกเลิกคำเชิญไม่สำเร็จ",
  },
  "members.error.resend_failed": {
    en: "Couldn't resend invitation.",
    th: "ส่งคำเชิญซ้ำไม่สำเร็จ",
  },
  "members.invite.title": { en: "Invite a member", th: "เชิญสมาชิก" },
  "members.invite.subtitle": {
    en: "Send an invitation link to a teammate.",
    th: "สร้างลิงก์คำเชิญเพื่อส่งให้เพื่อนร่วมทีม",
  },
  "members.invite.email_label": { en: "Email address", th: "อีเมล" },
  "members.invite.role_label": { en: "Role", th: "บทบาท" },
  "members.invite.submit": { en: "Create invitation", th: "สร้างคำเชิญ" },
  "members.invite.email_warning": {
    en: "Email delivery is not active yet — copy the invite link and send it to the invitee manually.",
    th: "ระบบยังไม่ส่งอีเมลให้อัตโนมัติ — กรุณาคัดลอกลิงก์คำเชิญแล้วส่งให้ผู้รับด้วยตนเอง",
  },
  "members.invite.copy_link": { en: "Copy invite link", th: "คัดลอกลิงก์คำเชิญ" },
  "members.invite.success": {
    en: "Invitation ready — share the link below.",
    th: "พร้อมแล้ว — แชร์ลิงก์ด้านล่างให้ผู้รับ",
  },
  "members.invite.accept_url_label": {
    en: "Invite link",
    th: "ลิงก์คำเชิญ",
  },
  "members.invite.created_for": {
    en: "Invitation for {email}",
    th: "คำเชิญสำหรับ {email}",
  },
  "members.invite.expires_in": {
    en: "Expires {when}",
    th: "หมดอายุ {when}",
  },
  "members.invite.close": { en: "Done", th: "เสร็จสิ้น" },
  "members.invitedBy": { en: "Invited by {who}", th: "เชิญโดย {who}" },
  "members.role.unknown": { en: "Unknown", th: "ไม่ทราบ" },
  "members.copy_link_title": { en: "Invitation link", th: "ลิงก์คำเชิญ" },
  "members.copy_link_subtitle": {
    en: "Email delivery is not active in Phase A. Copy and share manually.",
    th: "เฟส A ยังไม่ส่งอีเมลให้อัตโนมัติ คัดลอกลิงก์เพื่อส่งให้ผู้รับเอง",
  },
  "common.you": { en: "You", th: "คุณ" },
  "members.invite.only_admin_tooltip": {
    en: "Only owner or admin can invite members",
    th: "เฉพาะ owner หรือ admin เท่านั้นที่เชิญสมาชิกได้",
  },

  // ─── Invitation acceptance page (/invite/[token]) ────────────────────────
  "invite.loading": {
    en: "Loading invitation…",
    th: "กำลังโหลดคำเชิญ…",
  },
  "invite.preview.title": {
    en: "You're invited to {orgName}",
    th: "คุณได้รับเชิญเข้าร่วม {orgName}",
  },
  "invite.preview.subtitle": {
    en: "Join the workspace to start sharing secrets securely.",
    th: "เข้าร่วม workspace เพื่อเริ่มแชร์ความลับอย่างปลอดภัย",
  },
  "invite.preview.invited_by": {
    en: "Invited by {name}",
    th: "เชิญโดย {name}",
  },
  "invite.preview.invited_by_unknown": {
    en: "Invited by your team",
    th: "เชิญโดยทีมของคุณ",
  },
  "invite.preview.role_label": {
    en: "Role",
    th: "บทบาท",
  },
  "invite.preview.org_label": {
    en: "Workspace",
    th: "Workspace",
  },
  "invite.preview.email_label": {
    en: "Invited email",
    th: "อีเมลที่ได้รับเชิญ",
  },
  "invite.preview.email_lock": {
    en: "This invitation is for {email}",
    th: "คำเชิญนี้สำหรับ {email}",
  },
  "invite.preview.expires_label": {
    en: "Expires",
    th: "หมดอายุ",
  },
  "invite.preview.expires_in": {
    en: "Expires {when}",
    th: "หมดอายุ{when}",
  },
  "invite.accept": {
    en: "Accept invitation",
    th: "ตอบรับคำเชิญ",
  },
  "invite.accepting": {
    en: "Accepting…",
    th: "กำลังตอบรับ…",
  },
  "invite.signin_to_accept": {
    en: "Sign in to accept",
    th: "เข้าสู่ระบบเพื่อตอบรับ",
  },
  "invite.signin_hint": {
    en: "Sign in as {email} to accept this invitation.",
    th: "เข้าสู่ระบบด้วย {email} เพื่อตอบรับคำเชิญนี้",
  },
  "invite.success": {
    en: "Welcome to {orgName}",
    th: "ยินดีต้อนรับสู่ {orgName}",
  },
  "invite.go_to_app": {
    en: "Go to your vault",
    th: "ไปที่ vault ของคุณ",
  },
  "invite.go_to_login": {
    en: "Go to sign in",
    th: "ไปที่หน้าเข้าสู่ระบบ",
  },
  "invite.sign_out_action": {
    en: "Sign out and try again",
    th: "ออกจากระบบแล้วลองอีกครั้ง",
  },
  "invite.error.title.not_found": {
    en: "Invitation not found",
    th: "ไม่พบคำเชิญ",
  },
  "invite.error.title.expired": {
    en: "Invitation expired",
    th: "คำเชิญหมดอายุแล้ว",
  },
  "invite.error.title.revoked": {
    en: "Invitation revoked",
    th: "คำเชิญถูกยกเลิกแล้ว",
  },
  "invite.error.title.already_accepted": {
    en: "Invitation already used",
    th: "คำเชิญนี้ถูกใช้ไปแล้ว",
  },
  "invite.error.title.generic": {
    en: "Something went wrong",
    th: "เกิดข้อผิดพลาด",
  },
  "invite.error.not_found": {
    en: "This invitation link is invalid or no longer exists.",
    th: "ลิงก์คำเชิญนี้ไม่ถูกต้องหรือไม่มีอยู่แล้ว",
  },
  "invite.error.expired": {
    en: "This invitation has expired. Ask your admin to send a new one.",
    th: "คำเชิญนี้หมดอายุแล้ว แจ้งแอดมินให้ส่งคำเชิญใหม่ได้",
  },
  "invite.error.revoked": {
    en: "This invitation has been revoked by an admin.",
    th: "คำเชิญนี้ถูกยกเลิกโดยแอดมิน",
  },
  "invite.error.already_accepted": {
    en: "This invitation has already been accepted. Sign in to access your workspace.",
    th: "คำเชิญนี้ถูกตอบรับไปแล้ว เข้าสู่ระบบเพื่อใช้งาน workspace ของคุณ",
  },
  "invite.error.already_member": {
    en: "You are already a member of {orgName}.",
    th: "คุณเป็นสมาชิกของ {orgName} อยู่แล้ว",
  },
  "invite.error.email_mismatch": {
    en: "This invitation is for {invitedEmail}. You are signed in as {currentEmail}.",
    th: "คำเชิญนี้สำหรับ {invitedEmail} แต่คุณกำลังเข้าสู่ระบบเป็น {currentEmail}",
  },
  "invite.error.generic": {
    en: "We couldn't accept this invitation. Please try again.",
    th: "ไม่สามารถตอบรับคำเชิญได้ กรุณาลองอีกครั้ง",
  },
  "invite.error.user_exists": {
    en: "An account already exists for this email. Please sign in to accept.",
    th: "มีบัญชีสำหรับอีเมลนี้อยู่แล้ว กรุณาเข้าสู่ระบบเพื่อตอบรับ",
  },
  "invite.error.rate_limited": {
    en: "Too many attempts. Please wait a moment and try again.",
    th: "พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง",
  },

  // ─── Invite signup form (shown when userExists === false) ───────────────
  "invite.signup.title": {
    en: "Create your account",
    th: "สร้างบัญชีของคุณ",
  },
  "invite.signup.subtitle": {
    en: "Create a password to accept your invitation to {orgName}.",
    th: "สร้างรหัสผ่านเพื่อตอบรับคำเชิญเข้าร่วม {orgName}",
  },
  "invite.signup.email_label": {
    en: "Email",
    th: "อีเมล",
  },
  "invite.signup.email_readonly_hint": {
    en: "Your invitation is tied to this email.",
    th: "คำเชิญผูกกับอีเมลนี้",
  },
  "invite.signup.displayName_label": {
    en: "Display name (optional)",
    th: "ชื่อที่แสดง (ไม่บังคับ)",
  },
  "invite.signup.displayName_placeholder": {
    en: "How should we address you?",
    th: "อยากให้เราเรียกคุณว่าอะไร",
  },
  "invite.signup.password_label": {
    en: "Password",
    th: "รหัสผ่าน",
  },
  "invite.signup.password_hint": {
    en: "At least 10 characters. Next, you'll set a separate Master Password to unlock your vault.",
    th: "อย่างน้อย 10 ตัวอักษร ขั้นต่อไปคุณจะตั้ง Master Password แยกต่างหากสำหรับปลดล็อก vault",
  },
  "invite.signup.password_confirm_label": {
    en: "Confirm password",
    th: "ยืนยันรหัสผ่าน",
  },
  // Prominent two-password explainer so the recipient doesn't conflate the
  // login password set here with the Master Password set later.
  "invite.signup.two_password_notice_title": {
    en: "This is your login password — not your Master Password",
    th: "นี่คือรหัสผ่านสำหรับเข้าสู่ระบบ — ไม่ใช่ Master Password",
  },
  "invite.signup.two_password_notice_desc": {
    en: "Next, you'll set a separate Master Password that unlocks your vault and get a recovery kit.",
    th: "ขั้นต่อไปคุณจะตั้ง Master Password แยกต่างหากสำหรับปลดล็อก vault และรับ recovery kit",
  },
  "invite.signup.submit": {
    en: "Create account & accept",
    th: "สร้างบัญชีและตอบรับ",
  },
  "invite.signup.submitting": {
    en: "Creating account…",
    th: "กำลังสร้างบัญชี…",
  },
  "invite.signup.success": {
    en: "Welcome to {orgName}",
    th: "ยินดีต้อนรับสู่ {orgName}",
  },
  "invite.signup.policy.min_length": {
    en: "At least 10 characters",
    th: "อย่างน้อย 10 ตัวอักษร",
  },
  "invite.signup.policy.match": {
    en: "Passwords match",
    th: "รหัสผ่านตรงกัน",
  },
  "invite.signup.policy.recommend_uppercase": {
    en: "An uppercase letter (recommended)",
    th: "มีตัวพิมพ์ใหญ่ (แนะนำ)",
  },
  "invite.signup.policy.recommend_lowercase": {
    en: "A lowercase letter (recommended)",
    th: "มีตัวพิมพ์เล็ก (แนะนำ)",
  },
  "invite.signup.policy.recommend_digit": {
    en: "A number (recommended)",
    th: "มีตัวเลข (แนะนำ)",
  },
  "invite.signup.policy.recommend_special": {
    en: "A special character (recommended)",
    th: "มีอักขระพิเศษ (แนะนำ)",
  },
  "invite.signup.strength.weak": {
    en: "Weak",
    th: "อ่อน",
  },
  "invite.signup.strength.fair": {
    en: "Fair",
    th: "พอใช้",
  },
  "invite.signup.strength.good": {
    en: "Good",
    th: "ดี",
  },
  "invite.signup.strength.strong": {
    en: "Strong",
    th: "แข็งแกร่ง",
  },
  "invite.signup.strength_label": {
    en: "Password strength",
    th: "ความแข็งแกร่งของรหัสผ่าน",
  },

  // ─── Account settings (live) ─────────────────────────────────────────────
  "account.title": {
    en: "Account settings",
    th: "ตั้งค่าบัญชี",
  },
  "account.subtitle": {
    en: "Manage your profile, Master Password, and active sessions.",
    th: "จัดการโปรไฟล์, Master Password และเซสชันที่กำลังใช้งาน",
  },

  // Profile
  "account.profile.section_title": {
    en: "Profile",
    th: "โปรไฟล์",
  },
  "account.profile.section_desc": {
    en: "How you appear to your teammates.",
    th: "ข้อมูลที่เพื่อนร่วมทีมจะมองเห็น",
  },
  "account.profile.email_label": {
    en: "Email",
    th: "อีเมล",
  },
  "account.profile.email_readonly_hint": {
    en: "Email cannot be changed. Contact support if you need to migrate.",
    th: "ไม่สามารถเปลี่ยนอีเมลได้ กรุณาติดต่อทีมงานหากต้องการย้ายอีเมล",
  },
  "account.profile.displayName_label": {
    en: "Display name",
    th: "ชื่อที่แสดง",
  },
  "account.profile.displayName_placeholder": {
    en: "Your name",
    th: "ชื่อของคุณ",
  },
  "account.profile.role_label": {
    en: "Role",
    th: "บทบาท",
  },
  "account.profile.role_none": {
    en: "No workspace",
    th: "ยังไม่มี workspace",
  },
  "account.profile.created_at_label": {
    en: "Created",
    th: "สร้างเมื่อ",
  },
  "account.profile.last_login_label": {
    en: "Last sign-in",
    th: "เข้าสู่ระบบล่าสุด",
  },
  "account.profile.last_login_never": {
    en: "Never",
    th: "ยังไม่เคย",
  },
  "account.profile.save": {
    en: "Save changes",
    th: "บันทึกการเปลี่ยนแปลง",
  },
  "account.profile.saving": {
    en: "Saving…",
    th: "กำลังบันทึก…",
  },
  "account.profile.saved": {
    en: "Profile updated",
    th: "อัปเดตโปรไฟล์แล้ว",
  },
  "account.profile.error.empty_name": {
    en: "Display name cannot be empty.",
    th: "ชื่อที่แสดงต้องไม่ว่าง",
  },

  // Shared password-policy error strings (used by setup, recovery flows, and
  // the invite signup form). The full "change Master Password" flow has been
  // retired — POST /me/password no longer exists; the recovery kit is the
  // only path for forgotten-password recovery.
  "account.password.error.too_short": {
    en: "Password must be at least 10 characters.",
    th: "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร",
  },
  "account.password.error.no_match": {
    en: "Passwords don't match.",
    th: "รหัสผ่านไม่ตรงกัน",
  },
  "account.password.error.rate_limited": {
    en: "Too many attempts. Please wait a moment and try again.",
    th: "พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง",
  },
  "account.password.error.generic": {
    en: "We couldn't update your password. Please try again.",
    th: "ไม่สามารถอัปเดตรหัสผ่านได้ กรุณาลองอีกครั้ง",
  },

  /* ---- Recovery Kit (account settings card) ---- */
  "account.recovery_kit.section_title": {
    en: "Recovery Kit",
    th: "Recovery Kit",
  },
  "account.recovery_kit.subtitle": {
    en: "If you lose your master password, use your recovery kit at the login screen to reset it. Generate a new kit if you suspect your current one is compromised.",
    th: "หากลืม Master Password ให้ใช้ Recovery Kit ที่หน้าเข้าสู่ระบบเพื่อรีเซ็ตรหัสผ่าน สร้างใหม่หากสงสัยว่ารหัสปัจจุบันรั่ว",
  },
  "account.recovery_kit.status_active": {
    en: "Recovery kit generated on {when}",
    th: "สร้าง Recovery Kit เมื่อ {when}",
  },
  "account.recovery_kit.status_missing": {
    en: "No recovery kit set",
    th: "ยังไม่มี Recovery Kit",
  },
  "account.recovery_kit.regenerate": {
    en: "Regenerate Recovery Kit",
    th: "สร้าง Recovery Kit ใหม่",
  },
  "account.recovery_kit.regenerating": {
    en: "Generating…",
    th: "กำลังสร้าง…",
  },
  "account.recovery_kit.regenerate_confirm_title": {
    en: "Generate a new recovery kit?",
    th: "สร้าง Recovery Kit ใหม่ใช่ไหม",
  },
  "account.recovery_kit.regenerate_confirm_desc": {
    en: "This will replace your existing recovery code. Your old code will no longer work.",
    th: "การกระทำนี้จะแทนที่ Recovery Code เดิม โดย Code เดิมจะใช้ไม่ได้อีก",
  },
  "account.recovery_kit.regenerate_password_label": {
    en: "Confirm current Master Password",
    th: "ยืนยัน Master Password ปัจจุบัน",
  },
  "account.recovery_kit.error.invalid_password": {
    en: "Incorrect master password",
    th: "Master Password ไม่ถูกต้อง",
  },
  "account.recovery_kit.error.rate_limited": {
    en: "Too many attempts. Please wait an hour and try again.",
    th: "พยายามบ่อยเกินไป กรุณารอ 1 ชั่วโมงแล้วลองอีกครั้ง",
  },
  "account.recovery_kit.error.regenerate_failed": {
    en: "We couldn't generate a new recovery kit. Please try again.",
    th: "ไม่สามารถสร้าง Recovery Kit ใหม่ได้ กรุณาลองอีกครั้ง",
  },

  /* ---- Recovery Kit modal (shared across setup/regenerate/signup) ---- */
  "recovery_kit_modal.title.setup": {
    en: "Save Your Recovery Kit",
    th: "บันทึกชุดกู้คืนบัญชีของคุณ",
  },
  "recovery_kit_modal.title.regenerate": {
    en: "New Recovery Kit Generated",
    th: "สร้างชุดกู้คืนบัญชีใหม่แล้ว",
  },
  "recovery_kit_modal.title.signup": {
    en: "Welcome — Save Your Recovery Kit",
    th: "ยินดีต้อนรับ — บันทึกชุดกู้คืนบัญชีของคุณ",
  },
  "recovery_kit_modal.subtitle": {
    en: "This 24-word mnemonic is the only way to recover your account if you forget your master password.",
    th: "คำศัพท์ 24 คำนี้คือทางเดียวที่จะกู้คืนบัญชีได้หากคุณลืมรหัสผ่านมาสเตอร์",
  },
  "recovery_kit_modal.warning_one_time": {
    en: "This is the only time you will see these words. If you lose them, you cannot recover your account.",
    th: "คุณจะเห็นชุดคำศัพท์นี้เพียงครั้งเดียวเท่านั้น หากทำหายจะกู้คืนบัญชีไม่ได้",
  },
  "recovery_kit_modal.code_label": {
    en: "Recovery Mnemonic",
    th: "ชุดคำศัพท์กู้คืน",
  },
  "recovery_kit_modal.checkbox.saved": {
    en: "I have saved my recovery mnemonic somewhere safe.",
    th: "ฉันได้บันทึกชุดคำศัพท์กู้คืนไว้ในที่ปลอดภัยแล้ว",
  },
  "recovery_kit_modal.checkbox.understood": {
    en: "I understand these words will not be shown again.",
    th: "ฉันเข้าใจว่าจะไม่มีการแสดงชุดคำศัพท์นี้อีก",
  },
  "recovery_kit_modal.action.copy": {
    en: "Copy words",
    th: "คัดลอกคำศัพท์",
  },
  "recovery_kit_modal.action.download_pdf": {
    en: "Download PDF",
    th: "ดาวน์โหลด PDF",
  },
  "recovery_kit_modal.action.print": {
    en: "Print Kit",
    th: "พิมพ์ชุดกู้คืน",
  },
  "recovery_kit_modal.download_success": {
    en: "Recovery kit downloaded",
    th: "ดาวน์โหลดชุดกู้คืนแล้ว",
  },
  "recovery_kit_modal.action.copied": {
    en: "Copied",
    th: "คัดลอกแล้ว",
  },
  "recovery_kit_modal.action.copied_with_countdown": {
    en: "Copied — clearing in {seconds}s",
    th: "คัดลอกแล้ว — จะล้างใน {seconds} วินาที",
  },
  "recovery_kit_modal.action.clipboard_cleared": {
    en: "Clipboard cleared",
    th: "ล้างคลิปบอร์ดแล้ว",
  },
  "recovery_kit_modal.clipboard_hint": {
    en: "Your clipboard will be cleared automatically in {seconds}s to keep your recovery code safe.",
    th: "คลิปบอร์ดจะถูกล้างอัตโนมัติใน {seconds} วินาที เพื่อความปลอดภัยของ Recovery Code",
  },
  "recovery_kit_modal.download_confirm.body": {
    en: "If your downloads folder syncs to iCloud, Google Drive, OneDrive, or another cloud service, the recovery mnemonic will be uploaded automatically — printing or offline storage is more secure.",
    th: "หากโฟลเดอร์ดาวน์โหลดของคุณซิงค์กับ iCloud, Google Drive, OneDrive หรือคลาวด์อื่น ชุดคำศัพท์นี้จะถูกอัปโหลดอัตโนมัติ — การพิมพ์หรือบันทึกแบบออฟไลน์จะปลอดภัยกว่า",
  },
  "recovery_kit_modal.action.continue": {
    en: "Continue",
    th: "ดำเนินการต่อ",
  },
  "recovery_kit_modal.copy_failed": {
    en: "Couldn't copy to clipboard. Please copy manually.",
    th: "คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง",
  },
  "recovery_kit_modal.download.heading": {
    en: "Woxa Vault Recovery Kit",
    th: "Woxa Vault Recovery Kit",
  },
  "recovery_kit_modal.download.instructions": {
    en: "Store this document somewhere only you can access (a password manager, a printed copy in a safe, etc.). You'll need both your email and this code to reset your master password.",
    th: "เก็บเอกสารนี้ไว้ในที่ที่คุณคนเดียวเข้าถึงได้ (เช่น Password Manager หรือพิมพ์เก็บใส่ตู้นิรภัย) คุณต้องใช้ทั้งอีเมลและ Code นี้ในการรีเซ็ต Master Password",
  },
  "recovery_kit_modal.print.heading": {
    en: "Woxa Vault Recovery Kit",
    th: "Woxa Vault Recovery Kit",
  },
  "recovery_kit_modal.print.generated_label": {
    en: "Generated",
    th: "สร้างเมื่อ",
  },

  /* ---- /setup-password page (post-SSO mandatory) ---- */
  "setup_password.title": {
    en: "Set your Master Password",
    th: "ตั้งค่า Master Password ของคุณ",
  },
  "setup_password.subtitle": {
    en: "You signed in via SSO. Choose a master password now — you'll use it to unlock your vault and you'll receive a recovery kit on the next step.",
    th: "คุณเข้าสู่ระบบผ่าน SSO กรุณาตั้ง Master Password ตอนนี้ — คุณจะใช้รหัสนี้ในการปลดล็อค Vault และจะได้รับ Recovery Kit ในขั้นถัดไป",
  },
  "setup_password.password_label": {
    en: "Master Password",
    th: "Master Password",
  },
  "setup_password.confirm_label": {
    en: "Confirm Master Password",
    th: "ยืนยัน Master Password",
  },
  "setup_password.submit": {
    en: "Set master password",
    th: "ตั้ง Master Password",
  },
  "setup_password.submitting": {
    en: "Saving…",
    th: "กำลังบันทึก…",
  },
  "setup_password.success_toast": {
    en: "Master password set. Save your recovery kit before continuing.",
    th: "ตั้ง Master Password แล้ว บันทึก Recovery Kit ก่อนดำเนินการต่อ",
  },
  "setup_password.error.already_set": {
    en: "You already have a master password. Sign in normally.",
    th: "คุณมี Master Password อยู่แล้ว กรุณาเข้าสู่ระบบตามปกติ",
  },
  "setup_password.error.generic": {
    en: "We couldn't set your master password. Please try again.",
    th: "ไม่สามารถตั้ง Master Password ได้ กรุณาลองอีกครั้ง",
  },

  /* ---- /forgot-password page ---- */
  "forgot_password.title": {
    en: "Recover Your Account",
    th: "กู้คืนบัญชีของคุณ",
  },
  "forgot_password.subtitle": {
    en: "Enter your email, paste your 24-word recovery mnemonic, and choose a new master password. All existing sessions will be signed out.",
    th: "กรอกอีเมล วางชุดคำศัพท์กู้คืน 24 คำ และตั้งรหัสผ่านมาสเตอร์ใหม่ เซสชันทั้งหมดจะถูกออกจากระบบ",
  },
  "forgot_password.email_label": {
    en: "Email Address",
    th: "ที่อยู่อีเมล",
  },
  "forgot_password.code_label": {
    en: "Recovery Mnemonic",
    th: "ชุดคำศัพท์กู้คืน",
  },
  "forgot_password.mnemonic_placeholder": {
    en: "Enter your 24 words separated by spaces (apple banana cherry…)",
    th: "กรอกคำศัพท์ 24 คำ เว้นวรรคทีละคำ (apple banana cherry…)",
  },
  "forgot_password.mnemonic_hint": {
    en: "Normalization will handle extra spaces or newlines automatically.",
    th: "ระบบจะปรับรูปแบบเว้นวรรคให้ถูกต้องโดยอัตโนมัติ",
  },
  "forgot_password.new_password_label": {
    en: "New Master Password",
    th: "รหัสผ่านมาสเตอร์ใหม่",
  },
  "forgot_password.confirm_label": {
    en: "Confirm new master password",
    th: "ยืนยัน Master Password ใหม่",
  },
  "forgot_password.submit": {
    en: "Reset master password",
    th: "รีเซ็ต Master Password",
  },
  "forgot_password.submitting": {
    en: "Resetting…",
    th: "กำลังรีเซ็ต…",
  },
  "forgot_password.success": {
    en: "Password reset successful. You have been signed out of all devices. Please sign in with your new password.",
    th: "รีเซ็ตรหัสผ่านสำเร็จ คุณถูกออกจากระบบทุกอุปกรณ์แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่",
  },
  "forgot_password.back_to_login": {
    en: "Back to sign in",
    th: "กลับไปเข้าสู่ระบบ",
  },
  "forgot_password.error.invalid": {
    en: "Recovery code is invalid.",
    th: "Recovery Code ไม่ถูกต้อง",
  },
  "forgot_password.error.rate_limited": {
    en: "Too many attempts. Please wait an hour and try again.",
    th: "พยายามบ่อยเกินไป กรุณารอ 1 ชั่วโมงแล้วลองอีกครั้ง",
  },
  "forgot_password.error.generic": {
    en: "We couldn't reset your password. Please try again.",
    th: "ไม่สามารถรีเซ็ตรหัสผ่านได้ กรุณาลองอีกครั้ง",
  },

  /* ---- Login / banner additions ---- */
  "login.forgot_password_link": {
    en: "Forgot password? Use your recovery kit",
    th: "ลืมรหัสผ่าน? ใช้ Recovery Kit",
  },
  "login.after_recovery_notice": {
    en: "After signing in, generate a new recovery kit from Account Settings — your previous one is no longer valid.",
    th: "หลังเข้าสู่ระบบ กรุณาสร้าง Recovery Kit ใหม่จากหน้าตั้งค่าบัญชี — Recovery Kit เดิมใช้ไม่ได้แล้ว",
  },
  "auth.banner.regenerate_recovery": {
    en: "Your recovery kit is missing. Generate a new one from Account Settings now.",
    th: "Recovery Kit ของคุณหายไป กรุณาสร้างใหม่จากหน้าตั้งค่าบัญชีตอนนี้",
  },
  "auth.banner.regenerate_recovery_action": {
    en: "Open Account Settings",
    th: "เปิดตั้งค่าบัญชี",
  },
  "invite.signup.success_toast": {
    en: "Account created. Next, set your Master Password.",
    th: "สร้างบัญชีแล้ว ขั้นต่อไปตั้ง Master Password ของคุณ",
  },
  "invite.signup.success_redirecting": {
    en: "Taking you to set your Master Password…",
    th: "กำลังพาคุณไปตั้ง Master Password…",
  },

  // Sessions
  "account.sessions.section_title": {
    en: "Active sessions",
    th: "เซสชันที่กำลังใช้งาน",
  },
  "account.sessions.subtitle": {
    en: "Sign out of every other browser or device you've used.",
    th: "ออกจากระบบบนอุปกรณ์อื่นทั้งหมดที่คุณเคยใช้",
  },
  "account.sessions.revoke_all": {
    en: "Sign out other devices",
    th: "ออกจากระบบอุปกรณ์อื่น",
  },
  "account.sessions.revoking": {
    en: "Signing out…",
    th: "กำลังออกจากระบบ…",
  },
  "account.sessions.revoke_confirm_title": {
    en: "Sign out other devices?",
    th: "ออกจากระบบอุปกรณ์อื่นใช่ไหม",
  },
  "account.sessions.revoke_confirm": {
    en: "Every browser and device except this one will need to sign in again.",
    th: "ทุกเบราว์เซอร์และอุปกรณ์ยกเว้นเครื่องนี้จะต้องเข้าสู่ระบบใหม่",
  },
  "account.sessions.revoked": {
    en: "{count} sessions signed out",
    th: "ออกจากระบบ {count} เซสชันแล้ว",
  },
  "account.sessions.revoked_none": {
    en: "No other sessions were signed in.",
    th: "ไม่มีเซสชันอื่นที่กำลังใช้งาน",
  },
  "account.sessions.password_label": {
    en: "Confirm with your current Master Password",
    th: "ยืนยันด้วย Master Password ปัจจุบัน",
  },
  "account.sessions.error.invalid_password": {
    en: "Incorrect password.",
    th: "รหัสผ่านไม่ถูกต้อง",
  },
  "account.sessions.error.rate_limited": {
    en: "Too many attempts. Please wait an hour and try again.",
    th: "พยายามบ่อยเกินไป กรุณารอ 1 ชั่วโมงแล้วลองอีกครั้ง",
  },

  // Page-level error / loading
  "account.error.load_failed": {
    en: "We couldn't load your account.",
    th: "ไม่สามารถโหลดข้อมูลบัญชีได้",
  },
  "account.error.update_failed": {
    en: "We couldn't save your changes. Please try again.",
    th: "ไม่สามารถบันทึกการเปลี่ยนแปลงได้ กรุณาลองอีกครั้ง",
  },

  /* ---- vault auto-lock + unlock (AC-055.8, DESIGN.md §15) ---- */
  "vault_lock.title": {
    en: "Your vault is locked",
    th: "ตู้นิรภัยของคุณถูกล็อค",
  },
  "vault_lock.subtitle.idle": {
    en: "Locked after 15 minutes of inactivity. Enter your master password to continue.",
    th: "ล็อคหลังจากไม่ได้ใช้งาน 15 นาที กรอกรหัสผ่านมาสเตอร์เพื่อดำเนินการต่อ",
  },
  "vault_lock.subtitle.manual": {
    en: "You locked the vault. Enter your master password to continue.",
    th: "คุณล็อคตู้นิรภัยไว้ กรอกรหัสผ่านมาสเตอร์เพื่อดำเนินการต่อ",
  },
  "vault_lock.subtitle.restart": {
    en: "Locked after a browser restart. Enter your master password to continue.",
    th: "ล็อคหลังจากเปิดเบราว์เซอร์ใหม่ กรอกรหัสผ่านมาสเตอร์เพื่อดำเนินการต่อ",
  },
  "vault_lock.subtitle.sleep": {
    en: "Locked while this tab was hidden. Enter your master password to continue.",
    th: "ล็อคขณะที่แท็บนี้ถูกซ่อนไว้ กรอกรหัสผ่านมาสเตอร์เพื่อดำเนินการต่อ",
  },
  "vault_lock.account_label": {
    en: "Signed in as",
    th: "เข้าสู่ระบบในชื่อ",
  },
  "vault_lock.password_label": {
    en: "Master password",
    th: "รหัสผ่านมาสเตอร์",
  },
  "vault_lock.password_placeholder": {
    en: "Your master password",
    th: "รหัสผ่านมาสเตอร์ของคุณ",
  },
  "vault_lock.submit": { en: "Unlock", th: "ปลดล็อค" },
  "vault_lock.submitting": { en: "Verifying…", th: "กำลังตรวจสอบ…" },
  "vault_lock.cooldown": {
    en: "Try again in {seconds}s",
    th: "ลองใหม่ใน {seconds} วินาที",
  },
  "vault_lock.forgot_password_link": {
    en: "Forgot password? Use recovery kit",
    th: "ลืมรหัสผ่าน? ใช้ Recovery Kit",
  },
  "vault_lock.signout_link": {
    en: "Sign out instead",
    th: "ออกจากระบบแทน",
  },
  "vault_lock.unlocked_toast": {
    en: "Vault unlocked",
    th: "ปลดล็อคตู้นิรภัยแล้ว",
  },
  "vault_lock.error.invalid": {
    en: "Incorrect master password",
    th: "รหัสผ่านมาสเตอร์ไม่ถูกต้อง",
  },
  "vault_lock.error.rate_limited": {
    en: "Too many attempts. Please wait a moment.",
    th: "ลองใหม่หลายครั้งเกินไป กรุณารอสักครู่",
  },
  "vault_lock.error.rate_limited_with_cooldown": {
    en: "Too many attempts. Try again in {seconds}s.",
    th: "ลองใหม่หลายครั้งเกินไป ลองใหม่ใน {seconds} วินาที",
  },
  "vault_lock.error.password_not_set": {
    en: "You need to set a master password before unlocking. Redirecting…",
    th: "คุณต้องตั้งรหัสผ่านมาสเตอร์ก่อนปลดล็อค กำลังพาไป…",
  },
  "vault_lock.error.generic": {
    en: "Something went wrong. Please try again.",
    th: "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง",
  },
  "vault_lock.topbar.lock_shortcut": {
    en: "⌘⌥L",
    th: "⌘⌥L",
  },
  "vault_lock.topbar.locked_toast": {
    en: "Vault locked",
    th: "ล็อคตู้นิรภัยแล้ว",
  },
  "vault_lock.topbar.locked_toast_desc": {
    en: "Enter your master password to continue.",
    th: "กรอกรหัสผ่านมาสเตอร์เพื่อดำเนินการต่อ",
  },

  /* ---- common (additions) ---- */
  "common.retry": { en: "Retry", th: "ลองใหม่" },

  /* =====================================================================
     2FA / TOTP — login challenge
     ===================================================================== */
  "auth.mfa.challenge.title": {
    en: "Two-factor authentication",
    th: "ยืนยันตัวตนสองชั้น",
  },
  "auth.mfa.challenge.subtitle": {
    en: "Enter the 6-digit code from your authenticator app for {email}.",
    th: "กรอกรหัส 6 หลักจากแอป Authenticator ของคุณสำหรับ {email}",
  },
  "auth.mfa.challenge.codeLabel": {
    en: "Authentication code",
    th: "รหัสยืนยันตัวตน",
  },
  "auth.mfa.challenge.backupCodeLabel": {
    en: "Backup code",
    th: "รหัสสำรอง (backup code)",
  },
  "auth.mfa.challenge.backupCodePlaceholder": {
    en: "ABCDE-FGHIJ",
    th: "ABCDE-FGHIJ",
  },
  "auth.mfa.challenge.useBackup": {
    en: "Use a backup code instead",
    th: "ใช้รหัสสำรอง (backup code) แทน",
  },
  "auth.mfa.challenge.useTotpInstead": {
    en: "Use your authenticator app instead",
    th: "กลับไปใช้รหัสจากแอป Authenticator",
  },
  "auth.mfa.challenge.verify": {
    en: "Verify",
    th: "ยืนยัน",
  },
  "auth.mfa.challenge.verifying": {
    en: "Verifying…",
    th: "กำลังยืนยัน…",
  },
  "auth.mfa.challenge.expires_in": {
    en: "Expires in {time}",
    th: "หมดอายุใน {time}",
  },
  "auth.mfa.challenge.hint": {
    en: "Codes refresh every 30 seconds. Backup codes can each be used once.",
    th: "รหัส TOTP รีเฟรชทุก 30 วินาที รหัสสำรองแต่ละชุดใช้ได้ครั้งเดียว",
  },

  "login.error.mfa_invalid_code": {
    en: "Incorrect code. Please try again.",
    th: "รหัสไม่ถูกต้อง กรุณาลองอีกครั้ง",
  },
  "login.error.mfa_expired": {
    en: "Session expired. Please log in again.",
    th: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
  },

  /* =====================================================================
     SSO 2FA challenge — standalone /login/mfa page (post Google redirect)
     ===================================================================== */
  "login.mfa.subtitle": {
    en: "Enter the 6-digit code from your authenticator app to finish signing in.",
    th: "กรอกรหัส 6 หลักจากแอป Authenticator ของคุณเพื่อเข้าสู่ระบบให้เสร็จสิ้น",
  },
  "login.mfa.hint": {
    en: "Continuing your Google sign-in. Codes refresh every 30 seconds; backup codes can each be used once.",
    th: "กำลังดำเนินการเข้าสู่ระบบด้วย Google ต่อ รหัส TOTP รีเฟรชทุก 30 วินาที รหัสสำรองแต่ละชุดใช้ได้ครั้งเดียว",
  },
  "login.mfa.back_to_login": {
    en: "Back to sign in",
    th: "กลับไปหน้าเข้าสู่ระบบ",
  },
  "login.mfa.restart_sso": {
    en: "Start sign-in again",
    th: "เริ่มเข้าสู่ระบบใหม่",
  },
  "login.mfa.error.invalid": {
    en: "This verification session has expired or is invalid. Please start signing in again.",
    th: "เซสชันยืนยันตัวตนนี้หมดเวลาหรือไม่ถูกต้อง กรุณาเริ่มเข้าสู่ระบบใหม่",
  },
  "login.mfa.error.invalid_code": {
    en: "That code isn't correct. Please try again.",
    th: "รหัส 2FA ไม่ถูกต้อง ลองใหม่อีกครั้ง",
  },
  "login.mfa.error.rate_limited": {
    en: "Too many attempts. Please wait a moment and try again.",
    th: "พยายามมากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง",
  },
  "login.mfa.error.network": {
    en: "Couldn't reach the server. Check your connection and try again.",
    th: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง",
  },
  "login.mfa.error.generic": {
    en: "Something went wrong. Please start signing in again.",
    th: "เกิดข้อผิดพลาดบางอย่าง กรุณาเริ่มเข้าสู่ระบบใหม่",
  },
  "login.mfa.expired.title": {
    en: "Verification timed out",
    th: "หมดเวลายืนยันตัวตน",
  },
  "login.mfa.expired.body": {
    en: "Your verification window has closed. Please start signing in with Google again.",
    th: "หมดช่วงเวลายืนยันตัวตนแล้ว กรุณาเริ่มเข้าสู่ระบบด้วย Google ใหม่อีกครั้ง",
  },

  /* =====================================================================
     2FA / TOTP — settings (enroll, manage, disable)
     ===================================================================== */
  "auth.twofa.card.title": {
    en: "Two-factor authentication (2FA)",
    th: "ยืนยันตัวตนสองชั้น (2FA)",
  },
  "auth.twofa.card.enabled": {
    en: "Two-factor authentication is enabled.",
    th: "เปิดใช้งาน 2FA เรียบร้อยแล้ว",
  },
  "auth.twofa.card.enabled_since": {
    en: "Two-factor authentication is enabled — turned on {when}.",
    th: "เปิดใช้งาน 2FA แล้วเมื่อ {when}",
  },
  "auth.twofa.card.disabled": {
    en: "Add an extra step at login using an authenticator app (TOTP).",
    th: "เพิ่มความปลอดภัยตอนเข้าสู่ระบบด้วยแอป Authenticator (TOTP)",
  },
  "auth.twofa.card.pending": {
    en: "Setup is incomplete. Finish enrollment or cancel to start over.",
    th: "การตั้งค่ายังไม่เสร็จ ดำเนินการต่อหรือยกเลิกเพื่อเริ่มใหม่",
  },
  "auth.twofa.card.pending_banner": {
    en: "You started enabling 2FA but didn't finish. Resume now or cancel to discard the in-progress setup.",
    th: "คุณเริ่มเปิด 2FA ไว้แต่ยังไม่เสร็จ กดดำเนินการต่อหรือยกเลิกเพื่อเริ่มใหม่",
  },
  "auth.twofa.card.resume_setup": {
    en: "Continue setup",
    th: "ดำเนินการต่อ",
  },
  "auth.twofa.card.backup_remaining": {
    en: "{count} of 10 backup codes remaining",
    th: "เหลือ backup code {count} จาก 10 รหัส",
  },
  "auth.twofa.card.low_backup_warning": {
    en: "Backup codes are running low.",
    th: "เหลือ backup code น้อยแล้ว",
  },
  "auth.twofa.card.regenerate_now": {
    en: "Regenerate now",
    th: "สร้างชุดใหม่ตอนนี้",
  },

  "auth.twofa.actions.enable": {
    en: "Enable 2FA",
    th: "เปิดใช้งาน 2FA",
  },
  "auth.twofa.actions.disable": {
    en: "Disable 2FA",
    th: "ปิด 2FA",
  },
  "auth.twofa.actions.regenerate": {
    en: "Regenerate codes",
    th: "สร้าง backup code ใหม่",
  },

  /* Enroll dialog */
  "auth.twofa.enroll.loading": {
    en: "Preparing your authenticator…",
    th: "กำลังเตรียมข้อมูลสำหรับ Authenticator…",
  },
  "auth.twofa.enroll.error.title": {
    en: "Couldn't start setup",
    th: "เริ่มการตั้งค่าไม่สำเร็จ",
  },
  "auth.twofa.enroll.error.enroll_failed": {
    en: "We couldn't reach the server to start 2FA setup. Try again in a moment.",
    th: "ไม่สามารถติดต่อเซิร์ฟเวอร์เพื่อเริ่มตั้งค่า 2FA ได้ ลองใหม่อีกครั้ง",
  },
  "auth.twofa.enroll.error.already_enabled": {
    en: "2FA is already enabled on this account.",
    th: "บัญชีนี้เปิดใช้งาน 2FA อยู่แล้ว",
  },
  "auth.twofa.enroll.toast.completed": {
    en: "Two-factor authentication is now enabled.",
    th: "เปิดใช้งาน 2FA สำเร็จ",
  },

  "auth.twofa.enroll.scan.title": {
    en: "Scan QR code",
    th: "สแกน QR code",
  },
  "auth.twofa.enroll.scan.subtitle": {
    en: "Open your authenticator app (Google Authenticator, 1Password, Authy) and scan the QR code.",
    th: "เปิดแอป Authenticator (Google Authenticator, 1Password, Authy) แล้วสแกน QR code",
  },
  "auth.twofa.enroll.scan.qr_alt": {
    en: "TOTP enrollment QR code",
    th: "QR code สำหรับลงทะเบียน TOTP",
  },
  "auth.twofa.enroll.scan.secret_label": {
    en: "Or enter this secret manually",
    th: "หรือพิมพ์ secret นี้ลงในแอปด้วยตัวเอง",
  },
  "auth.twofa.enroll.scan.copy_secret": {
    en: "Copy secret",
    th: "คัดลอก secret",
  },
  "auth.twofa.enroll.scan.secret_copied": {
    en: "Secret copied",
    th: "คัดลอก secret แล้ว",
  },
  "auth.twofa.enroll.scan.copy_failed": {
    en: "Couldn't copy. Select the secret manually instead.",
    th: "คัดลอกไม่สำเร็จ กรุณาเลือก secret แล้วคัดลอกเอง",
  },
  "auth.twofa.enroll.scan.manual_hint": {
    en: "Use the QR code when possible — manual entry is slower and easier to mistype.",
    th: "แนะนำให้สแกน QR code มากกว่า การพิมพ์เองช้ากว่าและพิมพ์ผิดง่าย",
  },
  "auth.twofa.enroll.scan.continue": {
    en: "I've scanned it — continue",
    th: "สแกนแล้ว — ดำเนินการต่อ",
  },

  "auth.twofa.enroll.verify.title": {
    en: "Verify your authenticator",
    th: "ยืนยันรหัสจาก Authenticator",
  },
  "auth.twofa.enroll.verify.subtitle": {
    en: "Enter the 6-digit code your app is showing right now.",
    th: "กรอกรหัส 6 หลักที่แอป Authenticator แสดงอยู่ตอนนี้",
  },
  "auth.twofa.enroll.verify.code_label": {
    en: "6-digit code",
    th: "รหัส 6 หลัก",
  },
  "auth.twofa.enroll.verify.submit": {
    en: "Verify",
    th: "ยืนยัน",
  },
  "auth.twofa.enroll.verify.verifying": {
    en: "Verifying…",
    th: "กำลังยืนยัน…",
  },
  "auth.twofa.enroll.verify.invalid_code": {
    en: "Incorrect code. Make sure your phone's clock is accurate.",
    th: "รหัสไม่ถูกต้อง ตรวจสอบว่าเวลาในมือถือตรงกับเวลาจริงหรือไม่",
  },
  "auth.twofa.enroll.verify.rate_limited": {
    en: "Too many attempts. Please wait a moment.",
    th: "ลองหลายครั้งเกินไป กรุณารอสักครู่",
  },
  "auth.twofa.enroll.verify.generic_error": {
    en: "Something went wrong. Try the code again.",
    th: "เกิดข้อผิดพลาด ลองกรอกรหัสใหม่อีกครั้ง",
  },

  "auth.twofa.enroll.codes.title": {
    en: "Save your backup codes",
    th: "บันทึก backup code ของคุณ",
  },
  "auth.twofa.enroll.codes.subtitle": {
    en: "Store these somewhere safe. They are your only way back in if you lose your authenticator.",
    th: "เก็บรหัสเหล่านี้ไว้ในที่ปลอดภัย หากคุณทำ Authenticator หาย คุณจะใช้รหัสเหล่านี้เข้าสู่ระบบ",
  },

  /* Backup-codes panel (shared by enroll step 3 + regenerate) */
  "auth.twofa.codes.warning_one_time": {
    en: "Save these now — they will not be shown again. Each code works exactly once.",
    th: "บันทึกตอนนี้เลย ระบบจะไม่แสดงรหัสเหล่านี้อีก แต่ละรหัสใช้ได้ครั้งเดียวเท่านั้น",
  },
  "auth.twofa.codes.copy_all": {
    en: "Copy all",
    th: "คัดลอกทั้งหมด",
  },
  "auth.twofa.codes.copied": {
    en: "Backup codes copied",
    th: "คัดลอก backup code แล้ว",
  },
  "auth.twofa.codes.copy_failed": {
    en: "Couldn't copy. Select the codes and copy them manually.",
    th: "คัดลอกไม่สำเร็จ กรุณาเลือกรหัสและคัดลอกเอง",
  },
  "auth.twofa.codes.download": {
    en: "Download .txt",
    th: "ดาวน์โหลดไฟล์ .txt",
  },
  "auth.twofa.codes.print": {
    en: "Print",
    th: "พิมพ์",
  },
  "auth.twofa.codes.cloud_warning": {
    en: "The downloaded file may sync to iCloud Drive, Google Drive, or OneDrive. Move it offline if your downloads folder syncs automatically.",
    th: "ไฟล์ที่ดาวน์โหลดอาจซิงค์ขึ้น iCloud Drive, Google Drive หรือ OneDrive โดยอัตโนมัติ ควรย้ายไฟล์ออกจากโฟลเดอร์ที่ซิงค์",
  },
  "auth.twofa.codes.confirm_saved": {
    en: "I have saved my backup codes in a secure place.",
    th: "ฉันได้บันทึก backup code ในที่ปลอดภัยแล้ว",
  },

  /* Disable dialog */
  "auth.twofa.disable.title": {
    en: "Disable two-factor authentication",
    th: "ปิดการยืนยันตัวตนสองชั้น (2FA)",
  },
  "auth.twofa.disable.subtitle": {
    en: "Confirm with your master password and a current code to turn 2FA off.",
    th: "ยืนยันด้วยรหัสผ่านมาสเตอร์และรหัสยืนยันตัวตนปัจจุบันเพื่อปิด 2FA",
  },
  "auth.twofa.disable.warning": {
    en: "Disabling 2FA significantly reduces your account's protection. We strongly recommend leaving it on.",
    th: "การปิด 2FA จะลดความปลอดภัยของบัญชีอย่างมาก เราแนะนำให้เปิดไว้",
  },
  "auth.twofa.disable.password_label": {
    en: "Master password",
    th: "รหัสผ่านมาสเตอร์",
  },
  "auth.twofa.disable.code_label": {
    en: "Current 6-digit code",
    th: "รหัส 6 หลักปัจจุบัน",
  },
  "auth.twofa.disable.submit": {
    en: "Disable 2FA",
    th: "ปิด 2FA",
  },
  "auth.twofa.disable.submitting": {
    en: "Disabling…",
    th: "กำลังปิด…",
  },
  "auth.twofa.disable.toast.success": {
    en: "2FA disabled.",
    th: "ปิดใช้งาน 2FA แล้ว",
  },
  "auth.twofa.disable.error.missing_fields": {
    en: "Enter your master password and a current code.",
    th: "กรุณากรอกรหัสผ่านมาสเตอร์และรหัสปัจจุบัน",
  },
  "auth.twofa.disable.error.invalid_password": {
    en: "Master password is incorrect.",
    th: "รหัสผ่านมาสเตอร์ไม่ถูกต้อง",
  },
  "auth.twofa.disable.error.invalid_code": {
    en: "That code didn't match. Try the latest 6-digit code, or use a backup code.",
    th: "รหัสไม่ถูกต้อง ลองรหัส 6 หลักล่าสุดอีกครั้ง หรือใช้ backup code แทน",
  },
  "auth.twofa.disable.error.rate_limited": {
    en: "Too many attempts. Please wait a moment.",
    th: "ลองหลายครั้งเกินไป กรุณารอสักครู่",
  },
  "auth.twofa.disable.error.generic": {
    en: "Couldn't disable 2FA. Try again in a moment.",
    th: "ปิด 2FA ไม่สำเร็จ ลองใหม่อีกครั้ง",
  },

  /* Cancel pending enrollment */
  "auth.twofa.pending.discard.title": {
    en: "Discard 2FA setup?",
    th: "ยกเลิกการตั้งค่า 2FA?",
  },
  "auth.twofa.pending.discard.subtitle": {
    en: "Your in-progress 2FA secret will be removed. You can start over anytime.",
    th: "ระบบจะลบ secret ที่กำลังตั้งค่าอยู่ คุณสามารถเริ่มใหม่ได้ตลอด",
  },
  "auth.twofa.pending.discard.submit": {
    en: "Discard setup",
    th: "ยกเลิกการตั้งค่า",
  },
  "auth.twofa.pending.discard.submitting": {
    en: "Discarding…",
    th: "กำลังยกเลิก…",
  },
  "auth.twofa.pending.toast.discarded": {
    en: "2FA setup cancelled.",
    th: "ยกเลิกการตั้งค่า 2FA แล้ว",
  },

  /* Regenerate dialog */
  "auth.twofa.regenerate.title": {
    en: "Regenerate backup codes",
    th: "สร้าง backup code ชุดใหม่",
  },
  "auth.twofa.regenerate.subtitle": {
    en: "Generating new backup codes invalidates all of your existing ones.",
    th: "เมื่อสร้าง backup code ใหม่ รหัสเดิมทั้งหมดจะใช้ไม่ได้อีก",
  },
  "auth.twofa.regenerate.codes_subtitle": {
    en: "Your new backup codes are below. Save them now — the old codes no longer work.",
    th: "นี่คือ backup code ชุดใหม่ของคุณ บันทึกตอนนี้เลย รหัสเดิมจะใช้ไม่ได้แล้ว",
  },
  "auth.twofa.regenerate.password_label": {
    en: "Master password",
    th: "รหัสผ่านมาสเตอร์",
  },
  "auth.twofa.regenerate.code_label": {
    en: "Current 6-digit code",
    th: "รหัส 6 หลักปัจจุบัน",
  },
  "auth.twofa.regenerate.code_hint": {
    en: "Backup codes can't be used here — use the code from your authenticator app.",
    th: "ไม่สามารถใช้ backup code ในขั้นนี้ได้ ต้องใช้รหัสจากแอป Authenticator เท่านั้น",
  },
  "auth.twofa.regenerate.submit": {
    en: "Generate new codes",
    th: "สร้างรหัสใหม่",
  },
  "auth.twofa.regenerate.submitting": {
    en: "Generating…",
    th: "กำลังสร้าง…",
  },
  "auth.twofa.regenerate.toast.success": {
    en: "New backup codes generated.",
    th: "สร้าง backup code ชุดใหม่สำเร็จ",
  },
  "auth.twofa.regenerate.error.missing_fields": {
    en: "Enter your password and a 6-digit code.",
    th: "กรุณากรอกรหัสผ่านและรหัส 6 หลัก",
  },
  "auth.twofa.regenerate.error.invalid_password": {
    en: "Master password is incorrect.",
    th: "รหัสผ่านมาสเตอร์ไม่ถูกต้อง",
  },
  "auth.twofa.regenerate.error.invalid_code": {
    en: "That TOTP code didn't match. Backup codes can't be used here.",
    th: "รหัส TOTP ไม่ถูกต้อง ไม่สามารถใช้ backup code ในขั้นนี้ได้",
  },
  "auth.twofa.regenerate.error.rate_limited": {
    en: "Too many attempts. Please wait a moment.",
    th: "ลองหลายครั้งเกินไป กรุณารอสักครู่",
  },
  "auth.twofa.regenerate.error.generic": {
    en: "Couldn't generate new codes. Try again in a moment.",
    th: "สร้างรหัสไม่สำเร็จ ลองใหม่อีกครั้ง",
  },

  /* Account → Security section heading update */
  "account.other_methods": {
    en: "Other sign-in methods",
    th: "วิธีเข้าสู่ระบบอื่น",
  },

  /* =====================================================================
     Members — invite email feedback
     ===================================================================== */
  "members.invite.emailSent": {
    en: "Invitation email sent to {email}",
    th: "ส่งคำเชิญทางอีเมลไปที่ {email} แล้ว",
  },
  "members.invite.emailFailedFallback": {
    en: "Could not send invitation email. You can copy the link below to share manually.",
    th: "ส่งอีเมลคำเชิญไม่สำเร็จ คุณสามารถคัดลอกลิงก์ด้านล่างเพื่อส่งต่อด้วยตัวเองได้",
  },
  "members.invite.emailFailedFallbackTitle": {
    en: "Share invitation manually",
    th: "ส่งคำเชิญด้วยตัวเอง",
  },
  "members.invite.emailFailedFallbackDesc": {
    en: "We couldn't deliver the email, but the invitation is still valid — share the link below.",
    th: "ส่งอีเมลไม่สำเร็จ แต่คำเชิญยังใช้งานได้ คัดลอกลิงก์ด้านล่างไปส่งให้สมาชิกแทน",
  },
  "members.invite.emailFailedNoFallback": {
    en: "Could not send invitation email.",
    th: "ส่งอีเมลคำเชิญไม่สำเร็จ",
  },
  "members.invite.emailFailedNoFallbackTitle": {
    en: "Invitation email failed",
    th: "ส่งอีเมลคำเชิญไม่สำเร็จ",
  },
  "members.invite.emailFailedNoFallbackDesc": {
    en: "The invitation was created but the email could not be delivered. Try resending.",
    th: "สร้างคำเชิญสำเร็จแต่ส่งอีเมลไม่ได้ ลองส่งใหม่อีกครั้ง",
  },
  "members.invite.emailFailedHelp": {
    en: "Check the invited email address for typos. If the problem persists, revoke this invitation and create a new one.",
    th: "ตรวจสอบความถูกต้องของอีเมล หากยังไม่สำเร็จ ให้ยกเลิกคำเชิญนี้แล้วสร้างใหม่",
  },
  "members.invite.emailErrorLabel": {
    en: "Delivery error: {message}",
    th: "ข้อผิดพลาด: {message}",
  },
  "members.invite.retrySend": {
    en: "Retry send",
    th: "ส่งอีกครั้ง",
  },
  "members.invite.retrying": {
    en: "Retrying…",
    th: "กำลังส่งใหม่…",
  },
  "members.error.copy_failed": {
    en: "Couldn't copy. Select the link and copy it manually.",
    th: "คัดลอกไม่สำเร็จ กรุณาเลือกลิงก์แล้วคัดลอกเอง",
  },

  /* ---- onboarding (/welcome) ---- */
  "onboarding.title": { en: "Get started", th: "เริ่มต้นใช้งาน" },
  "onboarding.subtitle": {
    en: "Enter your work email and we'll find your workspace.",
    th: "ป้อนอีเมลที่ทำงาน เราจะค้นหา workspace ให้",
  },
  "onboarding.email_label": { en: "Work email", th: "อีเมลที่ทำงาน" },
  "onboarding.email_placeholder": {
    en: "you@iux24.com",
    th: "you@iux24.com",
  },
  "onboarding.searching": {
    en: "Searching for your workspace…",
    th: "กำลังค้นหา workspace ของคุณ…",
  },
  "onboarding.workspace_members": {
    en: "{domain} · {count} members",
    th: "{domain} · {count} สมาชิก",
  },
  "onboarding.workspace_active": { en: "Active", th: "Active" },
  "onboarding.continue": { en: "Continue", th: "ดำเนินการต่อ" },
  "onboarding.or": { en: "Or", th: "หรือ" },
  "onboarding.create_workspace": {
    en: "Create new workspace",
    th: "สร้าง workspace ใหม่",
  },
  "onboarding.no_google_prefix": {
    en: "Don't have Google Workspace?",
    th: "ยังไม่มี Google Workspace?",
  },
  "onboarding.use_password_link": {
    en: "Use email + password for now",
    th: "ใช้อีเมล + password ก่อนได้",
  },
  "onboarding.no_match": {
    en: "No workspace found for that domain. You can create a new one below.",
    th: "ไม่พบ workspace สำหรับโดเมนนี้ คุณสามารถสร้างใหม่ได้ด้านล่าง",
  },
  "onboarding.invalid_email": {
    en: "Enter a valid work email address.",
    th: "กรุณาป้อนอีเมลที่ทำงานให้ถูกต้อง",
  },
  "onboarding.aria_workspace_avatar": {
    en: "Workspace avatar",
    th: "รูปประจำ workspace",
  },

  /* ---- spaces (post-auth workspace hub) ---- */
  "spaces.title": {
    en: "Choose a workspace",
    th: "เลือก workspace",
  },
  "spaces.subtitle": {
    en: "Pick a workspace to continue, or create a new one for your team.",
    th: "เลือก workspace เพื่อดำเนินการต่อ หรือสร้างใหม่สำหรับทีมของคุณ",
  },
  "spaces.joined_heading": {
    en: "Your workspaces",
    th: "Workspace ของคุณ",
  },
  "spaces.create_heading": {
    en: "Create a new workspace",
    th: "สร้าง workspace ใหม่",
  },
  "spaces.workspace_meta": {
    en: "{slug} · {count} members",
    th: "{slug} · {count} สมาชิก",
  },
  "spaces.joined_on": {
    en: "joined {date}",
    th: "เข้าร่วมเมื่อ {date}",
  },
  "spaces.enter_aria": {
    en: "Enter workspace {name}",
    th: "เข้าสู่ workspace {name}",
  },
  "spaces.load_error": {
    en: "Couldn't load your workspaces.",
    th: "โหลด workspace ของคุณไม่สำเร็จ",
  },
  "spaces.empty.title": {
    en: "No workspaces yet",
    th: "ยังไม่มี workspace",
  },
  "spaces.empty.desc": {
    en: "You don't belong to any workspace. Create one to get started — you'll be its Owner.",
    th: "คุณยังไม่ได้อยู่ใน workspace ใด สร้างใหม่เพื่อเริ่มต้น แล้วคุณจะเป็น Owner ของ workspace นี้",
  },
  "spaces.empty.cta": {
    en: "Create workspace",
    th: "สร้าง workspace",
  },
  "spaces.create.name_label": {
    en: "Workspace name",
    th: "ชื่อ workspace",
  },
  "spaces.create.name_placeholder": {
    en: "e.g. Acme Inc.",
    th: "เช่น Acme Inc.",
  },
  "spaces.create.owner_notice": {
    en: "You'll be the Owner of this workspace.",
    th: "คุณจะเป็น Owner ของ workspace นี้",
  },
  "spaces.create.submit": {
    en: "Create workspace",
    th: "สร้าง workspace",
  },
  "spaces.create.submitting": {
    en: "Creating…",
    th: "กำลังสร้าง…",
  },
  "spaces.create.success_toast": {
    en: "Workspace created",
    th: "สร้าง workspace แล้ว",
  },
  "spaces.create.error.required": {
    en: "Enter a workspace name.",
    th: "กรุณากรอกชื่อ workspace",
  },
  "spaces.create.error.invalid_name": {
    en: "That workspace name isn't valid. Use 1–{max} characters.",
    th: "ชื่อ workspace ไม่ถูกต้อง ใช้ได้ 1–{max} ตัวอักษร",
  },
  "spaces.create.error.name_taken": {
    en: "A workspace with that name already exists.",
    th: "มี workspace ชื่อนี้อยู่แล้ว",
  },
  "spaces.create.error.rate_limited": {
    en: "Too many attempts. Please try again later.",
    th: "พยายามมากเกินไป กรุณาลองใหม่ภายหลัง",
  },
  "spaces.create.error.generic": {
    en: "Couldn't create the workspace. Please try again.",
    th: "สร้าง workspace ไม่สำเร็จ กรุณาลองใหม่",
  },

  /* ---- workspace switcher (app chrome) ---- */
  "workspace_switcher.no_workspace": {
    en: "No workspace",
    th: "ไม่มีเวิร์กสเปซ",
  },
  "workspace_switcher.label": {
    en: "Switch workspace",
    th: "สลับ workspace",
  },
  "workspace_switcher.heading": {
    en: "Workspaces",
    th: "Workspace",
  },
  "workspace_switcher.current": {
    en: "Current",
    th: "ปัจจุบัน",
  },
  "workspace_switcher.member_count": {
    en: "{count} members",
    th: "{count} สมาชิก",
  },
  "workspace_switcher.switching": {
    en: "Switching…",
    th: "กำลังสลับ…",
  },
  "workspace_switcher.switched_toast": {
    en: "Switched to {name}",
    th: "สลับไปที่ {name} แล้ว",
  },
  "workspace_switcher.manage": {
    en: "Manage workspaces",
    th: "จัดการ workspace",
  },
  "workspace_switcher.load_error": {
    en: "Couldn't load workspaces.",
    th: "โหลด workspace ไม่สำเร็จ",
  },
  "workspace_switcher.error.no_access": {
    en: "You don't have access to that workspace.",
    th: "คุณไม่มีสิทธิ์เข้าถึง workspace นี้",
  },
  "workspace_switcher.error.rate_limited": {
    en: "Too many switches. Please try again in a moment.",
    th: "สลับบ่อยเกินไป กรุณาลองใหม่อีกครั้งในอีกสักครู่",
  },
  "workspace_switcher.error.generic": {
    en: "Couldn't switch workspace. Please try again.",
    th: "สลับ workspace ไม่สำเร็จ กรุณาลองใหม่",
  },

  // Forced 2FA enrollment wall (/setup-2fa)
  "setup_2fa.policy_title": {
    en: "Your workspace requires 2FA",
    th: "Workspace ของคุณกำหนดให้เปิด 2FA",
  },
  "setup_2fa.policy_desc": {
    en: "An admin turned on the Require 2FA policy. Set up two-factor authentication now to continue — you can't access your vaults until it's done.",
    th: "แอดมินเปิดนโยบายบังคับ 2FA คุณต้องตั้งค่าการยืนยันตัวตนสองชั้นก่อนจึงจะใช้งานต่อได้ — เข้าถึง vault ไม่ได้จนกว่าจะตั้งค่าเสร็จ",
  },
  "setup_2fa.finish": {
    en: "Finish setup",
    th: "ตั้งค่าเสร็จสิ้น",
  },

  // Require-2FA workspace policy toggle (security settings)
  "common.read_only": { en: "Read-only", th: "อ่านอย่างเดียว" },
  "secpol.require_2fa.read_only_hint": {
    en: "Only an owner or admin can change this policy.",
    th: "เฉพาะเจ้าของหรือแอดมินเท่านั้นที่แก้นโยบายนี้ได้",
  },
  "secpol.require_2fa.load_error": {
    en: "Couldn't load this policy.",
    th: "โหลดนโยบายนี้ไม่สำเร็จ",
  },
  "secpol.require_2fa.toast_enabled": {
    en: "Require 2FA is now enforced for all members.",
    th: "บังคับ 2FA สำหรับสมาชิกทุกคนแล้ว",
  },
  "secpol.require_2fa.toast_disabled": {
    en: "Require 2FA has been turned off.",
    th: "ปิดการบังคับ 2FA แล้ว",
  },
  "secpol.require_2fa.self_enroll_warning": {
    en: "You don't have 2FA yet — you'll be asked to set it up too.",
    th: "คุณยังไม่ได้เปิด 2FA — ระบบจะให้คุณตั้งค่าด้วยเช่นกัน",
  },
  "secpol.require_2fa.error_forbidden": {
    en: "Only an owner or admin can change this policy.",
    th: "เฉพาะเจ้าของหรือแอดมินเท่านั้นที่แก้นโยบายนี้ได้",
  },
  "secpol.require_2fa.error_rate_limited": {
    en: "Too many changes. Please try again in a moment.",
    th: "เปลี่ยนบ่อยเกินไป กรุณาลองใหม่อีกครั้งในอีกสักครู่",
  },
  "secpol.require_2fa.error_generic": {
    en: "Couldn't update the policy. Please try again.",
    th: "อัปเดตนโยบายไม่สำเร็จ กรุณาลองใหม่",
  },

  // ─── Self-service signup (/signup) ───────────────────────────────────────
  "signup.title": {
    en: "Create your account",
    th: "สร้างบัญชีของคุณ",
  },
  "signup.subtitle": {
    en: "Sign up with your email to get started with Woxa Vault.",
    th: "สมัครด้วยอีเมลของคุณเพื่อเริ่มใช้งาน Woxa Vault",
  },
  "signup.back_to_start": {
    en: "Back",
    th: "ย้อนกลับ",
  },
  "signup.email_label": {
    en: "Work email",
    th: "อีเมลที่ทำงาน",
  },
  "signup.email_placeholder": {
    en: "you@iux24.com",
    th: "you@iux24.com",
  },
  "signup.displayName_label": {
    en: "Display name (optional)",
    th: "ชื่อที่แสดง (ไม่บังคับ)",
  },
  "signup.displayName_placeholder": {
    en: "How should we address you?",
    th: "อยากให้เราเรียกคุณว่าอะไร",
  },
  // The whole point of this copy: this is the SIGN-IN credential, NOT the
  // Master Password that unlocks the vault (that comes next at /setup-password).
  "signup.password_label": {
    en: "Login password",
    th: "รหัสผ่านสำหรับเข้าสู่ระบบ",
  },
  "signup.password_hint": {
    en: "This signs you in to your account. At least 10 characters.",
    th: "ใช้รหัสนี้เข้าสู่ระบบบัญชีของคุณ อย่างน้อย 10 ตัวอักษร",
  },
  "signup.password_confirm_label": {
    en: "Confirm login password",
    th: "ยืนยันรหัสผ่านสำหรับเข้าสู่ระบบ",
  },
  // Prominent two-password explainer so the user doesn't conflate the login
  // password with the Master Password.
  "signup.two_password_notice_title": {
    en: "This is your login password — not your Master Password",
    th: "นี่คือรหัสผ่านสำหรับเข้าสู่ระบบ — ไม่ใช่ Master Password",
  },
  "signup.two_password_notice_desc": {
    en: "Next, you'll set a separate Master Password that unlocks your vault and get a recovery kit.",
    th: "ขั้นต่อไปคุณจะตั้ง Master Password แยกต่างหากสำหรับปลดล็อก vault และรับ recovery kit",
  },
  "signup.submit": {
    en: "Create account",
    th: "สร้างบัญชี",
  },
  "signup.submitting": {
    en: "Creating account…",
    th: "กำลังสร้างบัญชี…",
  },
  "signup.have_account": {
    en: "Already have an account?",
    th: "มีบัญชีอยู่แล้ว?",
  },
  "signup.sign_in_link": {
    en: "Sign in",
    th: "เข้าสู่ระบบ",
  },
  "signup.error.email_taken": {
    en: "An account already exists for this email.",
    th: "อีเมลนี้มีบัญชีอยู่แล้ว",
  },
  "signup.error.email_taken_action": {
    en: "Sign in instead",
    th: "เข้าสู่ระบบแทน",
  },
  "signup.error.validation": {
    en: "Check your email and make sure your login password is at least 10 characters.",
    th: "ตรวจสอบอีเมล และให้แน่ใจว่ารหัสผ่านเข้าสู่ระบบยาวอย่างน้อย 10 ตัวอักษร",
  },
  "signup.error.rate_limited": {
    en: "Too many attempts. Please try again in a moment.",
    th: "พยายามบ่อยเกินไป กรุณาลองใหม่อีกครั้งในอีกสักครู่",
  },
  "signup.error.network": {
    en: "Couldn't reach the server. Check your connection and try again.",
    th: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่",
  },
  "signup.error.generic": {
    en: "Couldn't create your account. Please try again.",
    th: "สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่",
  },
  // Entry links from /login/password and the root page.
  "signup.from_login_prompt": {
    en: "Don't have an account?",
    th: "ยังไม่มีบัญชี?",
  },
  "signup.from_login_link": {
    en: "Sign up with email",
    th: "สมัครด้วยอีเมล",
  },
  "signup.from_welcome_link": {
    en: "Create a new account with email",
    th: "สร้างบัญชีใหม่ด้วยอีเมล",
  },

  "item.activity.title": { en: "Recent activity", th: "กิจกรรมล่าสุด" },
  "item.activity.loading": {
    en: "Loading activity…",
    th: "กำลังโหลดกิจกรรม…",
  },
  "item.activity.empty": {
    en: "No activity yet for this item.",
    th: "ยังไม่มีกิจกรรมสำหรับรายการนี้",
  },
  "item.activity.error": {
    en: "Couldn't load activity.",
    th: "โหลดกิจกรรมไม่สำเร็จ",
  },
  "item.activity.retry": { en: "Try again", th: "ลองใหม่" },
  "item.activity.view_full_log": {
    en: "View full audit log",
    th: "ดูประวัติการใช้งานทั้งหมด",
  },

  /* ---- Workspace settings: live policy wiring ---- */
  "common.preview": { en: "Preview", th: "ตัวอย่าง" },
  "common.coming_soon": { en: "Coming soon", th: "เร็วๆ นี้" },
  "secpol.auto_lock.toast_saved": {
    en: "Auto-lock timeout updated",
    th: "อัปเดตเวลาล็อกอัตโนมัติแล้ว",
  },
  "sso.preview_section_note": {
    en: "The items below are a design preview — provider connections, group mapping, JIT defaults and SSO events aren't wired to the backend yet and won't save.",
    th: "รายการด้านล่างเป็นเพียงตัวอย่างดีไซน์ — การเชื่อมต่อผู้ให้บริการ, group mapping, ค่าเริ่มต้น JIT และเหตุการณ์ SSO ยังไม่ได้เชื่อมกับ backend และจะไม่ถูกบันทึก",
  },
  "domains.empty_preview": {
    en: "No domains configured yet.",
    th: "ยังไม่ได้ตั้งค่าโดเมน",
  },
  "domains.load_error": {
    en: "Couldn't load allowed domains",
    th: "โหลดโดเมนที่อนุญาตไม่สำเร็จ",
  },

  /* ---- Item version history (US-015 / FR-037) ---- */
  "item.versions.title": { en: "Version history", th: "ประวัติเวอร์ชัน" },
  "item.versions.loading": {
    en: "Loading version history…",
    th: "กำลังโหลดประวัติเวอร์ชัน…",
  },
  "item.versions.empty": {
    en: "No previous versions yet.",
    th: "ยังไม่มีเวอร์ชันก่อนหน้า",
  },
  "item.versions.error": {
    en: "Couldn't load version history.",
    th: "โหลดประวัติเวอร์ชันไม่สำเร็จ",
  },
  "item.versions.retry": { en: "Try again", th: "ลองใหม่" },
  "item.versions.label": { en: "Version {n}", th: "เวอร์ชัน {n}" },
  "item.versions.edited_by": {
    en: "Edited by {email}",
    th: "แก้ไขโดย {email}",
  },
  "item.versions.has_password": {
    en: "Password",
    th: "รหัสผ่าน",
  },
  "item.versions.has_notes": { en: "Notes", th: "บันทึก" },
  "item.versions.view": { en: "View this version", th: "ดูเวอร์ชันนี้" },
  "item.versions.view_aria": {
    en: "View version {n}",
    th: "ดูเวอร์ชัน {n}",
  },
  "item.versions.cap_note": {
    en: "Showing the {n} most recent versions.",
    th: "แสดง {n} เวอร์ชันล่าสุด",
  },
  "item.versions.dialog_title": {
    en: "Version {n}",
    th: "เวอร์ชัน {n}",
  },
  "item.versions.dialog_desc": {
    en: "Saved {when} · by {email}",
    th: "บันทึกเมื่อ {when} · โดย {email}",
  },
  "item.versions.reveal_failed": {
    en: "Couldn't reveal this version.",
    th: "เปิดดูเวอร์ชันนี้ไม่สำเร็จ",
  },
  "item.versions.no_notes": {
    en: "This version has no notes.",
    th: "เวอร์ชันนี้ไม่มีบันทึก",
  },

  /* ---- Password age (US-015 / FR-037) ---- */
  "item.password_changed": {
    en: "Password last changed {when}",
    th: "เปลี่ยนรหัสผ่านล่าสุด {when}",
  },
  "item.password_never_changed": {
    en: "Password has never been changed",
    th: "ยังไม่เคยเปลี่ยนรหัสผ่าน",
  },

};

/** Translate with optional variable interpolation: {name} → value */
export function tr(
  key: string,
  locale: Locale,
  vars?: Record<string, string | number>,
): string {
  const entry = translations[key];
  if (!entry) return key;
  let str = entry[locale] ?? entry.en ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}
