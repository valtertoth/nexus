-- Webhook processing queue for crash recovery
-- If the server crashes after returning 200 to Meta but before processing,
-- messages can be recovered from this queue on restart.

CREATE TABLE IF NOT EXISTS webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding pending/failed items ready for processing
CREATE INDEX IF NOT EXISTS idx_webhook_queue_pending
ON webhook_queue(status, next_retry_at)
WHERE status IN ('pending', 'failed');

-- Index for dedup check by wa_message_id
CREATE INDEX IF NOT EXISTS idx_webhook_queue_dedup
ON webhook_queue(wa_message_id)
WHERE status != 'completed';

-- Unique constraint on messages table to prevent duplicate inserts (atomic dedup).
-- If two concurrent webhooks pass the SELECT dedup check, only one INSERT will succeed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_messages_wa_id_org'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT uq_messages_wa_id_org
    UNIQUE (wa_message_id, org_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- Grant access
GRANT ALL ON webhook_queue TO authenticated;
GRANT ALL ON webhook_queue TO service_role;

-- Enable RLS
ALTER TABLE webhook_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on webhook_queue"
ON webhook_queue FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
