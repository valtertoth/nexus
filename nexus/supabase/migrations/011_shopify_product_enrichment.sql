-- ============================================================
-- 011: Shopify Product Enrichment
-- Adds rich product data columns (description, images, metafields,
-- tags, handle, product_type, vendor) to shopify_products table
-- for the Product Quick Panel feature.
-- ============================================================

-- Add new columns (IF NOT EXISTS guards for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shopify_products' AND column_name = 'description') THEN
    ALTER TABLE shopify_products ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shopify_products' AND column_name = 'images') THEN
    ALTER TABLE shopify_products ADD COLUMN images JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shopify_products' AND column_name = 'metafields') THEN
    ALTER TABLE shopify_products ADD COLUMN metafields JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shopify_products' AND column_name = 'tags') THEN
    ALTER TABLE shopify_products ADD COLUMN tags TEXT[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shopify_products' AND column_name = 'handle') THEN
    ALTER TABLE shopify_products ADD COLUMN handle TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shopify_products' AND column_name = 'product_type') THEN
    ALTER TABLE shopify_products ADD COLUMN product_type TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shopify_products' AND column_name = 'vendor') THEN
    ALTER TABLE shopify_products ADD COLUMN vendor TEXT;
  END IF;
END $$;

-- Index for text search on product type (used in panel filtering)
CREATE INDEX IF NOT EXISTS idx_shopify_products_product_type
  ON shopify_products (org_id, product_type)
  WHERE is_active = true;

-- Index for handle lookups
CREATE INDEX IF NOT EXISTS idx_shopify_products_handle
  ON shopify_products (org_id, handle)
  WHERE is_active = true;

COMMENT ON COLUMN shopify_products.description IS 'Plain text product description (HTML stripped during sync)';
COMMENT ON COLUMN shopify_products.images IS 'JSON array of all product image URLs from Shopify';
COMMENT ON COLUMN shopify_products.metafields IS 'JSON object of Shopify metafields (namespace.key → value)';
COMMENT ON COLUMN shopify_products.tags IS 'Array of Shopify product tags';
COMMENT ON COLUMN shopify_products.handle IS 'Shopify product handle (URL slug)';
COMMENT ON COLUMN shopify_products.product_type IS 'Shopify product type classification';
COMMENT ON COLUMN shopify_products.vendor IS 'Product manufacturer/vendor name';
