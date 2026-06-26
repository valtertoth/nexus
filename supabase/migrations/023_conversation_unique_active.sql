-- Prevent duplicate open/pending conversations for the same contact
-- This guards against race conditions where concurrent webhooks both create a conversation
CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_active_per_contact
ON conversations (org_id, contact_id)
WHERE status IN ('open', 'pending');
