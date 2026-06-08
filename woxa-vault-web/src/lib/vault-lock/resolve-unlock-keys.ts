/**
 * resolveUnlockKeys — pure, dependency-injected core of the vault-unlock
 * key-persistence decision (extracted from VaultLockScreen.onSubmit so the
 * branch can be unit-tested without a DOM/React harness).
 *
 * The historical bug (fixed alongside this extraction): private-key
 * persistence was gated on a `masterKey` that was only derived inside the
 * `requiresZk === true` branch. Accounts that upgraded to `masterAuthKeyHash`
 * report `requiresZk === false` for the *legacy* `authKeyHash` factor check
 * (backend auth.ts: `requiresZk = user.authKeyHash !== null`), so the
 * non-ZK branch ran, never derived a master key, and SKIPPED persisting the
 * private key — even though `verify-password` still returned `res.keys`. The
 * overlay cleared (markUnlocked) but `woxa-vault-pk` never landed in
 * sessionStorage, so getVaultKey() returned null and v2 (zero-knowledge)
 * saves failed with "Vault is locked".
 *
 * Contract this module pins:
 *   1. The master key is ALWAYS derived from the typed Master password + the
 *      per-user KDF salt, independent of `requiresZk`. (verify-password checks
 *      the typed password against `user.passwordHash` = the Master password,
 *      and the private-key blob is wrapped with KDF(masterPassword, salt).)
 *   2. `requiresZk` ONLY selects the verify payload shape.
 *   3. Whenever the server returns `keys`, the private key is decrypted and
 *      persisted — on BOTH the ZK and non-ZK branches.
 *   4. A private-key decrypt failure NEVER blocks the unlock. A v1-only user
 *      or a user without a keypair must still unlock; the save path guards
 *      missing keys with VaultLockedError.
 */

export interface UnlockKeysBlob {
  encryptedPrivateKey: string;
  privateKeyIv: string;
  privateKeyAuthTag: string;
  publicKey?: string;
}

export interface ResolveUnlockKeysDeps {
  /** KDF(masterPassword, salt) → stretched master key. */
  deriveMasterKey: (password: string, salt: Uint8Array) => Promise<Uint8Array>;
  /** AES-GCM unwrap of the private-key blob with the master key. */
  decryptPrivateKey: (
    encrypted: { ciphertext: Uint8Array; iv: Uint8Array; authTag: Uint8Array },
    masterKey: Uint8Array,
  ) => Promise<Uint8Array>;
  /** base64 → bytes. */
  fromBase64: (s: string) => Uint8Array;
  /** Side effect: write the decrypted private key into sessionStorage. */
  persistPrivateKey: (pk: Uint8Array) => void;
  /** Optional sink for a clean (non-leaking) decrypt-failure log. */
  onDecryptError?: (err: unknown) => void;
}

export interface ResolveUnlockKeysResult {
  /** True iff the private key was decrypted and persisted this call. */
  persisted: boolean;
  /** True iff a key blob was present but decryption failed (unlock still ok). */
  decryptFailed: boolean;
}

/**
 * Given the typed Master password, the per-user KDF salt, and the keys blob
 * returned by verify-password, derive the master key and (if a blob is
 * present) decrypt + persist the private key. Returns what happened so the
 * caller can decide messaging — but a decrypt failure is reported, never
 * thrown, so the caller can still mark the vault unlocked.
 */
export async function resolveUnlockKeys(
  params: {
    masterPassword: string;
    salt: Uint8Array;
    keys: UnlockKeysBlob | null | undefined;
    /**
     * Optional pre-derived master key. The ZK branch already runs
     * KDF(masterPassword, salt) to build the masterAuthKeyHash; passing that
     * result here avoids a SECOND expensive Argon2id derivation per unlock.
     * When omitted (non-ZK branch / unit tests), the master key is derived
     * internally so the "always have a master key" contract still holds.
     */
    masterKey?: Uint8Array;
  },
  deps: ResolveUnlockKeysDeps,
): Promise<ResolveUnlockKeysResult> {
  // (1) Always have a master key — independent of requiresZk. Reuse a
  // pre-derived key when the caller already paid the KDF cost; otherwise
  // derive it here. Either way the key is the same KDF(masterPassword, salt).
  const masterKey = params.masterKey ?? (await deps.deriveMasterKey(params.masterPassword, params.salt));

  // (3) No keys blob → nothing to persist (v1-only user / no keypair). Not an
  // error — the unlock proceeds.
  if (!params.keys) {
    return { persisted: false, decryptFailed: false };
  }

  try {
    const pk = await deps.decryptPrivateKey(
      {
        ciphertext: deps.fromBase64(params.keys.encryptedPrivateKey),
        iv: deps.fromBase64(params.keys.privateKeyIv),
        authTag: deps.fromBase64(params.keys.privateKeyAuthTag),
      },
      masterKey,
    );
    deps.persistPrivateKey(pk);
    return { persisted: true, decryptFailed: false };
  } catch (err) {
    // (4) Never block the unlock on a key-decrypt failure.
    deps.onDecryptError?.(err);
    return { persisted: false, decryptFailed: true };
  }
}
