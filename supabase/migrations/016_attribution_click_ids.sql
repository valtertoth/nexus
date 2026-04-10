-- Add click ID columns to contacts for Meta/Google attribution
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS fbc TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS fbp TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS gclid TEXT;

-- Add click ID columns to conversion_events for CAPI
ALTER TABLE conversion_events ADD COLUMN IF NOT EXISTS attr_fbc TEXT;
ALTER TABLE conversion_events ADD COLUMN IF NOT EXISTS attr_fbp TEXT;
ALTER TABLE conversion_events ADD COLUMN IF NOT EXISTS attr_gclid TEXT;
