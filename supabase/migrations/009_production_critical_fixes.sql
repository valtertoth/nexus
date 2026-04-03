-- ============================================================================
-- NEXUS MIGRATION 009 — Production Critical Fixes
-- AI token atomic RPCs + webhook queue cleanup index
-- Applied: 2026-04-03
-- ============================================================================

-- RPC atômico para incrementar tokens AI (corrige race condition)
CREATE OR REPLACE FUNCTION increment_ai_tokens(p_org_id UUID, p_tokens INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE organizations
  SET ai_tokens_used_this_month = COALESCE(ai_tokens_used_this_month, 0) + p_tokens
  WHERE id = p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_ai_tokens(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_ai_tokens(UUID, INTEGER) TO service_role;

-- RPC atômico para check-and-increment tokens (com limite)
CREATE OR REPLACE FUNCTION check_and_increment_ai_tokens(
  p_org_id UUID,
  p_tokens INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current INTEGER;
  v_limit INTEGER;
BEGIN
  SELECT ai_tokens_used_this_month, ai_monthly_token_limit
  INTO v_current, v_limit
  FROM organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_limit IS NOT NULL AND (COALESCE(v_current, 0) + p_tokens) > v_limit THEN
    RETURN FALSE;
  END IF;

  UPDATE organizations
  SET ai_tokens_used_this_month = COALESCE(v_current, 0) + p_tokens
  WHERE id = p_org_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION check_and_increment_ai_tokens(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_increment_ai_tokens(UUID, INTEGER) TO service_role;

-- Index para cleanup do webhook_queue
CREATE INDEX IF NOT EXISTS idx_webhook_queue_cleanup
  ON webhook_queue(status, created_at)
  WHERE status = 'completed';
