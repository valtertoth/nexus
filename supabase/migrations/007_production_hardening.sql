-- Migration: 007_production_hardening
-- Description: Production hardening - atomic unread_count RPC, missing indexes, dedup index
-- Date: 2026-04-01

-- ============================================================================
-- 1. Atomic unread_count increment RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_unread_count(conv_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE conversations
  SET unread_count = COALESCE(unread_count, 0) + 1
  WHERE id = conv_id;
END;
$$;

-- ============================================================================
-- 2. Missing indexes for common query patterns
-- ============================================================================

-- Contact lookups by conversation (for conversation list queries)
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id
ON conversations(contact_id);

-- Conversations ordered by last message (for inbox sorting)
CREATE INDEX IF NOT EXISTS idx_conversations_last_message
ON conversations(org_id, last_message_at DESC NULLS LAST);

-- Messages by org for analytics
CREATE INDEX IF NOT EXISTS idx_messages_created_at
ON messages(org_id, created_at DESC);

-- ============================================================================
-- 3. Composite index for message deduplication
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_messages_wa_dedup
ON messages(wa_message_id, org_id)
WHERE wa_message_id IS NOT NULL;

-- ============================================================================
-- 4. Grant execute on increment_unread_count to authenticated users
-- ============================================================================
GRANT EXECUTE ON FUNCTION increment_unread_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_unread_count(UUID) TO service_role;
