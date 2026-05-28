/**
 * Auth endpoints — see /API_CONTRACT.md.
 *
 * NOTE: these run against the real backend. The frontend keeps the mock data
 * for vaults / items / sends until the corresponding endpoints are added to
 * the contract; do NOT swap those over yet.
 */

import { apiFetch } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
}

interface LoginRequest {
  email: string;
  password?: string;
  authKeyHash?: string;
}

export interface LoginInfo {
  userId: string;
  kdf: "argon2id";
  kdfParams: {
    iterations: number;
    memorySize: number;
    parallelism: number;
  };
  requiresZk: boolean;
}

/** GET /auth/login-info — pre-login salt/KDF lookup. */
export async function getLoginInfo(email: string): Promise<LoginInfo> {
  return apiFetch<LoginInfo>(`/auth/login-info?email=${encodeURIComponent(email)}`);
}

interface AuthUserResponse {
  user: AuthUser;
}

/**
 * Discriminated result of POST /auth/login.
 *
 *  - "ok": password accepted AND the user has no 2FA OR 2FA already satisfied
 *    by some out-of-band channel — session cookie is set, caller can refresh
 *    /me and route into /app.
 *  - "mfa_required": password is valid but the user has TOTP enabled. The
 *    short-lived `mfaToken` (JWT, ~5min) must be exchanged via
 *    POST /auth/2fa/verify-login + a TOTP/backup code. The session cookie is
 *    NOT yet set in this state.
 *
 * Keep the discriminator narrow; callers should `switch` on `status` rather
 * than checking property presence so any future variant (e.g. WebAuthn step-up)
 * fails closed at the type level.
 */
export type LoginResult =
  | { 
      status: "ok"; 
      user: AuthUser; 
      keys?: {
        publicKey: string;
        encryptedPrivateKey: string;
        privateKeyIv: string;
        privateKeyAuthTag: string;
      };
    }
  | { status: "mfa_required"; mfaToken: string };

interface LoginResponseRaw {
  status?: "ok" | "mfa_required";
  user?: AuthUser;
  mfaToken?: string;
  keys?: {
    publicKey: string;
    encryptedPrivateKey: string;
    privateKeyIv: string;
    privateKeyAuthTag: string;
  };
}

/**
 * POST /auth/login — returns a discriminated `LoginResult`.
 *
 * Backend contract (see /API_CONTRACT.md):
 *   - 200 `{ status: "ok", user }` — session cookie set, full sign-in complete.
 *   - 200 `{ status: "mfa_required", mfaToken }` — password ok, must finish via
 *     POST /auth/2fa/verify-login. The mfaToken is short-lived (~5min).
 *   - 401 `invalid_credentials` — wrong email/password.
 *   - 429 `rate_limited`.
 */
export async function login(input: LoginRequest): Promise<LoginResult> {
  const res = await apiFetch<LoginResponseRaw>("/auth/login", {
    method: "POST",
    body: input,
  });
  if (res?.status === "mfa_required" && typeof res.mfaToken === "string") {
    return { status: "mfa_required", mfaToken: res.mfaToken };
  }
  if (res?.user) {
    return { status: "ok", user: res.user, keys: res.keys };
  }
  throw new Error("Unexpected /auth/login response shape");
}

/**
 * POST /auth/2fa/verify-login — finalize a login that returned `mfa_required`.
 */
export async function verifyMfaLogin(input: {
  mfaToken?: string;
  code: string;
  useBackupCode?: boolean;
}): Promise<AuthUser & { 
  keys?: {
    publicKey: string;
    encryptedPrivateKey: string;
    privateKeyIv: string;
    privateKeyAuthTag: string;
  };
}> {
  // Only send keys that are present so the SSO variant emits `{ code }` (and
  // optionally useBackupCode) exactly — never a `mfaToken: undefined` field.
  const body: { mfaToken?: string; code: string; useBackupCode?: boolean } = {
    code: input.code,
  };
  if (input.mfaToken !== undefined) body.mfaToken = input.mfaToken;
  if (input.useBackupCode !== undefined) body.useBackupCode = input.useBackupCode;
  const res = await apiFetch<AuthUserResponse & { 
    keys?: {
      publicKey: string;
      encryptedPrivateKey: string;
      privateKeyIv: string;
      privateKeyAuthTag: string;
    };
  }>("/auth/2fa/verify-login", {
    method: "POST",
    body,
  });
  return { ...res.user, keys: res.keys };
}

interface RegisterRequest {
  email: string;
  /**
   * The LOGIN password (account/sign-in credential), NOT the Master Password
   * that unlocks the vault. The Master Password is set later at /setup-password
   * along with the recovery kit. Backend enforces min length 10.
   */
  password: string;
  displayName?: string;
}

/**
 * POST /auth/register — self-service email + login-password signup.
 *
 * Backend contract (see /API_CONTRACT.md):
 *   - 200 `{ status: "ok", user }` — session cookie set, user is signed in
 *     immediately. There is NO recoveryCode here: the recovery kit is issued
 *     later at /setup-password when the Master Password is created.
 *   - 400 `validation_error` — weak login password (<10) or malformed email.
 *   - 409 `email_taken` — an account already exists for this email.
 *   - 429 `rate_limited`.
 *
 * After a successful register, GET /me reports `requiresPasswordSetup=true` +
 * `hasWorkspace=false`, so SessionGuard walks the user to /setup-password
 * (Master Password + recovery kit) and then /spaces.
 */
export async function register(input: RegisterRequest): Promise<AuthUser> {
  const body: RegisterRequest = {
    email: input.email,
    password: input.password,
  };
  if (input.displayName !== undefined && input.displayName.trim().length > 0) {
    body.displayName = input.displayName.trim();
  }
  const res = await apiFetch<AuthUserResponse>("/auth/register", {
    method: "POST",
    body,
  });
  return res.user;
}

/** POST /auth/logout — never throws on 401 (already logged out is fine). */
export async function logout(): Promise<void> {
  try {
    await apiFetch<void>("/auth/logout", { method: "POST" });
  } catch (err) {
    // If the session is already gone we still consider logout successful.
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status?: number }).status === 401
    ) {
      return;
    }
    throw err;
  }
}

/**
 * GET /auth/me — returns the current user, or null if unauthenticated.
 * 401 is the "anonymous" signal here, so it's caught and normalized to null.
 */
export async function fetchCurrentUser(
  signal?: AbortSignal,
): Promise<AuthUser | null> {
  try {
    const res = await apiFetch<AuthUserResponse>("/auth/me", { signal });
    return res.user;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status?: number }).status === 401
    ) {
      return null;
    }
    throw err;
  }
}
