-- Enable required Postgres extensions for Woxa Vault.
-- pgcrypto provides gen_random_uuid() and digest()/hmac primitives.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
