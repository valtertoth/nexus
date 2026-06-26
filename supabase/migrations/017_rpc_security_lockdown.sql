-- ============================================
-- 017: Restrict sensitive RPCs to service_role only
-- Fixes: C3 (match_knowledge_chunks cross-org leak),
--        H10 (check_and_increment_ai_tokens no auth),
--        H11 (decrypt_wa_token_with_key callable by any user)
-- ============================================

-- C3: match_knowledge_chunks is SECURITY DEFINER and accepts p_org_id as param
-- without verifying the caller belongs to that org. Revoking from authenticated
-- ensures only the server (service_role) can call it.
REVOKE ALL ON FUNCTION match_knowledge_chunks(VECTOR, UUID, UUID, FLOAT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_knowledge_chunks(VECTOR, UUID, UUID, FLOAT, INT) TO service_role;

-- H10: check_and_increment_ai_tokens — migration 009 granted to authenticated
-- but no auth.uid() check inside. Only server calls this.
REVOKE ALL ON FUNCTION check_and_increment_ai_tokens(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_and_increment_ai_tokens(UUID, INTEGER) TO service_role;

-- H11: decrypt_wa_token_with_key — decrypts WA access tokens.
-- Must never be callable from the frontend.
REVOKE ALL ON FUNCTION decrypt_wa_token_with_key(BYTEA, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decrypt_wa_token_with_key(BYTEA, TEXT) TO service_role;

-- C4: wa_media_id column exists in TypeScript types and is actively used by
-- webhook.ts (stores WhatsApp media ID) and messages.ts (retries failed media
-- downloads), but was never created in any migration.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_media_id TEXT;
