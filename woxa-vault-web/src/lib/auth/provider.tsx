"use client";

/**
 * AuthProvider — owns the current session for the Next.js client tree.
 *
 *  - On mount, bootstraps via GET /auth/me (lightweight session probe). If a
 *    user is found, immediately follows up with GET /me to fetch the full
 *    profile including `requiresPasswordSetup` and `hasRecoveryKit` — these
 *    are needed by `SessionGuard` to gate the Master Password / Recovery Kit
 *    setup flows.
 *  - login()/logout() are wrappers that update local state after the API
 *    round-trip succeeds. The /app guard reads `user` + `status` to decide
 *    whether to redirect.
 *  - Errors from login() are thrown to the caller so the form can map the
 *    ApiError code to a translated message.
 *  - `refresh()` re-fetches both /auth/me and /me — call it after surfaces
 *    that mutate the user (setup-password, regenerate-recovery-kit) so
 *    guards see the new flags.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  verifyMfaLogin as verifyMfaLoginRequest,
  getLoginInfo,
  getKdfSalt,
  type AuthUser,
  type LoginResult,
} from "@/lib/api/auth";
import { getMe, type MeUser } from "@/lib/api/me";
import { 
  clearUnlockTimestamp, 
  persistUnlockTimestamp, 
  persistPrivateKey 
} from "@/components/vault-lock/lock-provider";
import {
  deriveMasterKey,
  deriveAuthKeyHash,
  decryptPrivateKey,
  fromBase64
} from "@/lib/crypto-client";
import { selectLoginFactor } from "@/lib/auth/select-login-factor";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: AuthUser | null;
  /**
   * Full profile from GET /me. `null` while bootstrapping or when
   * unauthenticated. Use this (not `user`) to read `requiresPasswordSetup`
   * and `hasRecoveryKit`.
   */
  me: MeUser | null;
  status: AuthStatus;
  /**
   * Begin a sign-in. Resolves with a `LoginResult` so the caller can detect
   * the new MFA hand-off path. The auth state is only mutated on
   * `status === "ok"`; for `"mfa_required"` the caller must finish the flow
   * via `completeMfaLogin`.
   */
  login: (email: string, password: string) => Promise<LoginResult>;
  /**
   * Self-service signup with email + LOGIN password. On success the backend
   * sets the session cookie (immediate sign-in), so we mirror the `login()`
   * happy path: pull a fresh /me and flip status to "authenticated". The
   * vault stays LOCKED — the freshly-created user has
   * `requiresPasswordSetup=true` so SessionGuard walks them to /setup-password
   * (Master Password + recovery kit), and that page stamps the unlock once
   * they set it. Errors are thrown to the caller for mapping (409 email_taken,
   * 400 validation_error, 429 rate_limited).
   */
  register: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<AuthUser>;
  /**
   * Exchange a short-lived MFA token for a real session. Two callers:
   *  - PASSWORD flow: pass the `mfaToken` returned by `login()`.
   *  - SSO flow (/login/mfa): OMIT `mfaToken` — it rides the HttpOnly
   *    `mfa_pending` cookie set by the SSO callback; the browser re-attaches it.
   * Mirrors `login()` in terms of auth state mutation — only sets
   * `status="authenticated"` on success.
   */
  completeMfaLogin: (input: {
    mfaToken?: string;
    code: string;
    useBackupCode?: boolean;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [me, setMe] = useState<MeUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchCurrentUser();
      if (!mounted.current) return;
      if (!next) {
        setUser(null);
        setMe(null);
        setStatus("unauthenticated");
        return;
      }
      // Hydrate the richer /me profile so guards can read setup flags.
      // SECURITY: we MUST NOT flip status to "authenticated" while `me` is
      // still null — SessionGuard relies on `me.requiresPasswordSetup` to
      // decide whether to bounce JIT-provisioned SSO users to /setup-password,
      // and a null `me` would let them slip into /app for a frame. If /me
      // fails we fail closed (treat as unauthenticated) so the user is sent
      // back to login rather than into protected routes with unknown state.
      let profile: Awaited<ReturnType<typeof getMe>>;
      try {
        profile = await getMe();
      } catch (err) {
        if (!mounted.current) return;
        console.error("[auth] /me failed during bootstrap — failing closed", err);
        setUser(null);
        setMe(null);
        setStatus("unauthenticated");
        return;
      }
      if (!mounted.current) return;
      // Bootstrap: a live login session does NOT imply an unlocked vault, so
      // we deliberately do NOT stamp the vault-unlock timestamp here. Opening
      // a new tab/session (SSO callback, reopened browser with a valid cookie)
      // must land on the lock screen and prompt for the master password. The
      // vault counts as unlocked only when sessionStorage already holds a
      // fresh `markUnlocked()` stamp from this tab — VaultLockProvider reads
      // it on mount. Login and vault-unlock are intentionally separate gates.
      setUser(next);
      setMe(profile);
      setStatus("authenticated");
    } catch {
      // Network failures on /auth/me: treat as unauthenticated.
      if (!mounted.current) return;
      setUser(null);
      setMe(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // Store master key between login steps (Step 1 -> MFA Challenge)
  const pendingMasterKeyRef = useRef<Uint8Array | null>(null);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      // Phase C: Fetch login info to choose the auth factor.
      const info = await getLoginInfo(email);
      const authPayload: { email: string; password?: string; authKeyHash?: string } = { email };
      let masterKey: Uint8Array | null = null;

      // LOGIN factor selection: prefer the LOGIN password when one exists.
      // `requiresZk` describes the VAULT-UNLOCK master factor and must NOT
      // drive login — an account with both a login password and a legacy
      // auth_key_hash (test@gmail.com shape) must authenticate against
      // login_password_hash, not derive a ZK hash from the typed login password
      // (which would never match the master-derived auth key). See
      // select-login-factor.ts for the full rationale + regression coverage.
      const factor = selectLoginFactor(info);

      if (factor === "zk") {
        // Legacy ZK-only account (no login password): derive with the
        // server-issued per-user salt. login-info may not carry it; fetch via
        // the dedicated /auth/kdf-salt lookup (falls back to login-info's
        // kdfSalt if a future backend inlines it there).
        const saltB64 = info.kdfSalt ?? (await getKdfSalt(email));
        const salt = fromBase64(saltB64);
        masterKey = await deriveMasterKey(password, salt);
        authPayload.authKeyHash = await deriveAuthKeyHash(masterKey, salt);
      } else {
        // Login-password path: send the plaintext login password. Deliberately
        // do NOT derive a master key — the vault stays LOCKED after login and
        // the user unlocks separately via the lock screen (which derives the
        // master key from the MASTER password). masterKey stays null, so the
        // `if (masterKey && result.keys)` persist block below is correctly
        // skipped; the private key is not persisted at login. This matches the
        // intended login/unlock separation and is not a regression.
        authPayload.password = password;
      }

      const result = await loginRequest(authPayload);
      if (result.status === "mfa_required") {
        // Cache master key for the next step (verify-login)
        pendingMasterKeyRef.current = masterKey;
        return result;
      }

      // If ZK keys were returned, decrypt and persist the private key
      if (masterKey && result.keys) {
        const pk = await decryptPrivateKey({
          ciphertext: fromBase64(result.keys.encryptedPrivateKey),
          iv: fromBase64(result.keys.privateKeyIv),
          authTag: fromBase64(result.keys.privateKeyAuthTag),
        }, masterKey);
        
        persistPrivateKey(pk);
        // The user just proved possession of the master password
        persistUnlockTimestamp();
      }

      const profile = await getMe();
      setUser(result.user);
      setMe(profile);
      setStatus("authenticated");
      return result;
    },
    [],
  );

  const register = useCallback<AuthContextValue["register"]>(
    async (input) => {
      const next = await registerRequest(input);
      // Backend set the session cookie. The new user carries
      // requiresPasswordSetup=true, so SessionGuard walks them to
      // /setup-password to choose their master password; that page stamps the
      // unlock once they prove possession. We do NOT unlock here — the vault
      // stays locked until then. Same fail-closed contract — if /me throws we
      // propagate to the caller and leave state untouched.
      const profile = await getMe();
      setUser(next);
      setMe(profile);
      setStatus("authenticated");
      return next;
    },
    [],
  );

  const completeMfaLogin = useCallback<AuthContextValue["completeMfaLogin"]>(
    async (input) => {
      const result = await verifyMfaLoginRequest(input);
      
      const masterKey = pendingMasterKeyRef.current;
      if (masterKey && result.keys) {
        const pk = await decryptPrivateKey({
          ciphertext: fromBase64(result.keys.encryptedPrivateKey),
          iv: fromBase64(result.keys.privateKeyIv),
          authTag: fromBase64(result.keys.privateKeyAuthTag),
        }, masterKey);
        
        persistPrivateKey(pk);
        persistUnlockTimestamp();
      }
      
      // Clear the ref once done
      pendingMasterKeyRef.current = null;

      const profile = await getMe();
      const userObj: AuthUser = { id: result.id, email: result.email, displayName: result.displayName };
      setUser(userObj);
      setMe(profile);
      setStatus("authenticated");
      return userObj;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      // Clear the unlock timestamp so a stale tab can't refresh-and-skip
      // the next login's password gate.
      clearUnlockTimestamp();
      setUser(null);
      setMe(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      me,
      status,
      login,
      register,
      completeMfaLogin,
      logout,
      refresh,
    }),
    [user, me, status, login, register, completeMfaLogin, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
