-- ============================================
-- NEXUS MIGRATION 012
-- Fix shopify_products updated_at column
-- The trigger trg_shopify_products_updated_at references
-- updated_at but the column was never added.
-- ============================================

ALTER TABLE shopify_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
