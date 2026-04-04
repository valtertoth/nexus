-- ============================================
-- NEXUS MIGRATION 011
-- Shopify Product Enrichment
-- Adds description, images, metafields, tags,
-- handle, product_type, vendor to shopify_products
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_products' AND column_name = 'description'
  ) THEN
    ALTER TABLE shopify_products ADD COLUMN description TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_products' AND column_name = 'images'
  ) THEN
    ALTER TABLE shopify_products ADD COLUMN images JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_products' AND column_name = 'metafields'
  ) THEN
    ALTER TABLE shopify_products ADD COLUMN metafields JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_products' AND column_name = 'tags'
  ) THEN
    ALTER TABLE shopify_products ADD COLUMN tags TEXT[] DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_products' AND column_name = 'handle'
  ) THEN
    ALTER TABLE shopify_products ADD COLUMN handle TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_products' AND column_name = 'product_type'
  ) THEN
    ALTER TABLE shopify_products ADD COLUMN product_type TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_products' AND column_name = 'vendor'
  ) THEN
    ALTER TABLE shopify_products ADD COLUMN vendor TEXT;
  END IF;
END $$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_shopify_products_product_type
  ON shopify_products(org_id, product_type);

CREATE INDEX IF NOT EXISTS idx_shopify_products_handle
  ON shopify_products(org_id, handle);
