# Agent Memory Index

- [KDF salt contract](project_kdf_salt_contract.md) — deriveMasterKey takes server-issued per-user salt; login/unlock use getKdfSalt, setup/upgrade use me.kdfSalt
- [Vault-key wrap (ECIES)](project_vault_key_wrap.md) — wrapVaultKey/unwrapVaultKey hardened: HKDF-SHA256 + ephemeral-pubkey AAD + all-zero check; layout/signatures unchanged
