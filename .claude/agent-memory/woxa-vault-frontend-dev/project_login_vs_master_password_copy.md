---
name: project-login-vs-master-password-copy
description: 2-password model copy boundary — sign-in surfaces say "password" (login/account password); only vault-unlock + sensitive re-auth say "Master Password"
metadata:
  type: project
---

Woxa Vault uses a confirmed 2-password model. Copy MUST keep the two passwords distinct:

- **Login/account password** = the email sign-in credential. Backend `/auth/login` verifies `login_password_hash`. It IS sent to the server. Copy here must NEVER claim it's "processed locally" / "never sent to server" (that's a false security claim — the login password is sent over the wire).
- **Master Password** = unlocks the vault, derives the encryption key, zero-knowledge / never sent. Keep the "Master Password" label and "never sent / processed locally" copy only here.

**Why:** Earlier the `/login/password` sign-in screen labeled its field "Master password", placeholder "Your master password", button "Unlock vault", footer "processed locally / never sent" — all conflating the login password with the master password. The user explicitly confirmed: every sign-in surface uses the login password; Master Password is only for vault unlock + sensitive re-auth.

**How to apply** — say "Password" (login/account password) at every SIGN-IN surface:
- `/login/password` — `login.password_label`, `login.password_placeholder`, `login.sign_in`/`login.signing_in`, `login.secure_connection`, `login.login_password_hint`. (The old `login.master_password*`, `login.never_sent`, `login.unlock_vault`, `login.unlocking`, `login.use_recovery`, `login.processed_locally`, `login.or` keys were REMOVED. The Recovery-Kit button + OR divider were removed from this screen — recovery resets the master password and is reached via the forgot-password flow, not from the login-password screen.)
- `/login/sso` — "Use password instead" button + `login.login_password_hint` footer (was `login.use_password_instead` "Use master password instead" + `login.processed_locally`).
- `secpol.require_sso_desc` — "Disable password sign-in" (was "master-password sign-in").
- `account.cli_install_desc` — "Sign in with your account password" (CLI auth is a sign-in action).
- `/signup` and `/invite/[token]` were ALREADY correct: they show "Password" + a two-password explainer ("This is your login password — not your Master Password"). Don't touch.

**Keep "Master Password" (genuine master surfaces — do NOT change):**
- `/setup-password` (sets the master), `setup.*` keys
- vault-unlock prompt: `components/vault-lock/*`, `lock.*` keys
- sensitive re-auth: disable 2FA (`auth.twofa.disable.*`), regenerate recovery kit, transfer-ownership
- recovery-kit reset / forgot-password (`/forgot-password` resets the MASTER password)
- `settings.master_password*` (settings card describing the master-password feature)
- admin policy copy about requiring/resetting master passwords

See [[project-sso-mfa-flow]] for the related MFA error UX fix done in the same pass.
