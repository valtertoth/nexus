-- ============================================================================
-- NEXUS MIGRATION 028 — Atomic webhook_queue claim (recovery race hardening)
-- ============================================================================
-- The recovery loop (every 2min) and the inline webhook processor both write to
-- webhook_queue. The old recovery SELECT picked up rows with status 'processing'
-- as soon as their next_retry_at (DEFAULT NOW()) was due — including rows that a
-- live inline handler had just inserted and was still processing. When inline
-- processing ran longer than the recovery interval, the same payload was
-- reprocessed in parallel (duplicate paid Claude calls, duplicate attribution,
-- duplicate markAsRead).
--
-- claim_webhook_batch() replaces the SELECT-then-UPDATE with a single atomic
-- UPDATE ... FOR UPDATE SKIP LOCKED so no row is ever handed to two workers, and
-- it never claims a 'processing' row that is still young enough to be owned by a
-- live inline handler (younger than 10 minutes). Only pending/failed rows that
-- are due, or 'processing' rows abandoned by a crash (older than 10 minutes with
-- no processed_at), are claimed.

CREATE OR REPLACE FUNCTION claim_webhook_batch(p_limit INTEGER DEFAULT 100)
RETURNS SETOF webhook_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE webhook_queue
  SET status = 'processing',
      attempts = attempts + 1,
      next_retry_at = now() + interval '5 minutes'
  WHERE id IN (
    SELECT id FROM webhook_queue
    WHERE attempts < 12
      AND (
        (status IN ('pending', 'failed') AND next_retry_at <= now())
        OR (status = 'processing' AND processed_at IS NULL AND created_at < now() - interval '10 minutes')
      )
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- Only the server (service_role) may claim. Keep it away from anon/authenticated.
REVOKE ALL ON FUNCTION claim_webhook_batch(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_webhook_batch(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION claim_webhook_batch(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_webhook_batch(INTEGER) TO service_role;

-- Makes the stale-'processing' branch of the claim scan cheap.
CREATE INDEX IF NOT EXISTS idx_webhook_queue_stale_processing
  ON webhook_queue(created_at)
  WHERE status = 'processing' AND processed_at IS NULL;

-- Supports the cleanup of aged 'failed' rows (dead-letter pruning).
CREATE INDEX IF NOT EXISTS idx_webhook_queue_failed_cleanup
  ON webhook_queue(status, created_at)
  WHERE status = 'failed';
