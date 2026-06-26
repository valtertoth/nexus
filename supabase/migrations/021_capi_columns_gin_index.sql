-- ============================================
-- 021: CAPI production columns (M16) + GIN index
-- ============================================

-- M16: Missing columns for Meta CAPI + Google Ads production payloads
ALTER TABLE conversion_events
  ADD COLUMN IF NOT EXISTS action_source TEXT DEFAULT 'business_messaging',
  ADD COLUMN IF NOT EXISTS event_source_url TEXT,
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_conversion_action TEXT,
  ADD COLUMN IF NOT EXISTS meta_retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS google_retry_count INT DEFAULT 0;

-- event_id for dedup (Meta + Google both use it)
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_events_event_id
  ON conversion_events(event_id) WHERE event_id IS NOT NULL;
