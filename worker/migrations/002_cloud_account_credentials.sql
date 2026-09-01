-- Credentials for providers without a cross-account role/trust model (e.g. Huawei AK/SK).
-- Encrypted at rest with a server-side key (CREDENTIALS_ENCRYPTION_KEY); never stored plaintext.
ALTER TABLE cloud_accounts
  ADD COLUMN credentials_encrypted TEXT;
