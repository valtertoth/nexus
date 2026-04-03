-- 010_production_stability_fixes.sql
-- Fixes identified during production readiness audit

-- 1. Add 'pending' to wa_status CHECK constraint (frontend uses it for optimistic UI)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_wa_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_wa_status_check
  CHECK (wa_status IN ('pending', 'sent', 'delivered', 'read', 'failed'));

-- 2. Enforce status progression: only allow forward transitions
-- sent(1) -> delivered(2) -> read(3), failed(4) can happen from any state
CREATE OR REPLACE FUNCTION enforce_status_progression()
RETURNS TRIGGER AS $$
DECLARE
  status_order CONSTANT TEXT[] := ARRAY['pending', 'sent', 'delivered', 'read'];
  old_idx INT;
  new_idx INT;
BEGIN
  -- Always allow transition to 'failed'
  IF NEW.wa_status = 'failed' THEN
    RETURN NEW;
  END IF;

  -- Find positions in progression
  old_idx := array_position(status_order, OLD.wa_status);
  new_idx := array_position(status_order, NEW.wa_status);

  -- If old status is 'failed', allow any transition (retry scenario)
  IF OLD.wa_status = 'failed' THEN
    RETURN NEW;
  END IF;

  -- Block backward transitions (e.g. read -> delivered)
  IF old_idx IS NOT NULL AND new_idx IS NOT NULL AND new_idx < old_idx THEN
    RETURN OLD; -- Keep the existing (higher) status
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_status_progression ON messages;
CREATE TRIGGER trg_enforce_status_progression
  BEFORE UPDATE OF wa_status ON messages
  FOR EACH ROW
  EXECUTE FUNCTION enforce_status_progression();

-- 3. Add authorization checks to RPCs that accept arbitrary org_id
CREATE OR REPLACE FUNCTION increment_ai_tokens(p_org_id UUID, p_tokens INT)
RETURNS VOID AS $$
BEGIN
  -- Verify caller belongs to this org
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND org_id = p_org_id
  ) AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  UPDATE organizations
  SET ai_tokens_used_this_month = ai_tokens_used_this_month + p_tokens
  WHERE id = p_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_unread_count(conv_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Verify caller belongs to the org that owns this conversation
  IF NOT EXISTS (
    SELECT 1 FROM conversations c
    JOIN users u ON u.org_id = c.org_id
    WHERE c.id = conv_id AND u.id = auth.uid()
  ) AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Not authorized for this conversation';
  END IF;

  UPDATE conversations
  SET unread_count = unread_count + 1
  WHERE id = conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Add missing index on conversations.sector_id (common filter)
CREATE INDEX IF NOT EXISTS idx_conversations_sector ON conversations(sector_id);

-- 5. Add missing index on messages.sender_type for analytics queries
CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender_type, sender_id);

-- 6. Add ON DELETE SET NULL to conversations foreign keys
-- (allows deleting sectors/users without FK violations)
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_sector_id_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_sector_id_fkey
  FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_assigned_to_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;
