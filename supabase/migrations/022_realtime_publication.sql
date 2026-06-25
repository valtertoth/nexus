-- Enable Realtime for messages and conversations tables
-- Required for the frontend to receive live updates via Supabase Realtime subscriptions

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- Set REPLICA IDENTITY to FULL so UPDATE events include all columns (not just PK)
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;
