-- Fix WhatsApp token decryption
-- The decrypt_wa_token function relies on app.encryption_secret GUC setting,
-- which may not be configured in production. This adds a fallback function
-- that accepts the key explicitly.

-- Fallback function: decrypt with explicit key (called from server when GUC not set)
CREATE OR REPLACE FUNCTION decrypt_wa_token_with_key(encrypted BYTEA, secret_key TEXT)
RETURNS TEXT AS $$
  SELECT pgp_sym_decrypt(encrypted, secret_key)
$$ LANGUAGE sql SECURITY DEFINER;

-- Also create a helper to re-encrypt with a new key
CREATE OR REPLACE FUNCTION encrypt_wa_token_with_key(token TEXT, secret_key TEXT)
RETURNS BYTEA AS $$
  SELECT pgp_sym_encrypt(token, secret_key)
$$ LANGUAGE sql SECURITY DEFINER;
