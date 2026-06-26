-- ============================================
-- 020: Encrypt Shopify token (H3) + Hash API keys (H4)
-- ============================================

-- H3: Shopify token encryption (same pgp_sym pattern as WA token)

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS shopify_access_token_encrypted BYTEA;

CREATE OR REPLACE FUNCTION encrypt_shopify_token(token TEXT)
RETURNS BYTEA AS $$
  SELECT pgp_sym_encrypt(token, current_setting('app.encryption_secret', true))
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_shopify_token(encrypted BYTEA)
RETURNS TEXT AS $$
  SELECT pgp_sym_decrypt(encrypted, current_setting('app.encryption_secret', true))
$$ LANGUAGE sql SECURITY DEFINER;

-- Restrict to service_role only
REVOKE ALL ON FUNCTION encrypt_shopify_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION encrypt_shopify_token(TEXT) TO service_role;

REVOKE ALL ON FUNCTION decrypt_shopify_token(BYTEA) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decrypt_shopify_token(BYTEA) TO service_role;

-- Migrate existing plaintext tokens to encrypted
UPDATE organizations
SET shopify_access_token_encrypted = encrypt_shopify_token(shopify_access_token),
    shopify_access_token = NULL
WHERE shopify_access_token IS NOT NULL;


-- H4: API key hashing

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS nexus_api_key_hash TEXT;

-- Migrate existing plaintext keys to hash
UPDATE organizations
SET nexus_api_key_hash = encode(sha256(nexus_api_key::bytea), 'hex'),
    nexus_api_key = NULL
WHERE nexus_api_key IS NOT NULL;
