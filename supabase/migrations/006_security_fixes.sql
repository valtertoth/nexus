-- ============================================
-- NEXUS MIGRATION 006
-- Security Fixes
-- 1. RLS on pending_attributions
-- 2. Create missing tables + RLS: org_brain_directives,
--    quotes, quote_settings, shopify_products, conversation_snapshots
-- 3. Harden signup_organization RPC with auth.uid() check
-- ============================================

-- ─── 1. RLS on pending_attributions ─────────────────────────────────────────
-- Written by webhook (service_role bypasses RLS), but policy still required

ALTER TABLE pending_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pending_attr_org_isolation" ON pending_attributions
  FOR ALL USING (org_id = get_user_org_id());

-- ─── 2a. org_brain_directives ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_brain_directives (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category          TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  content           TEXT NOT NULL,
  source_reference  TEXT,
  priority          INTEGER DEFAULT 5,
  applies_to_sectors TEXT[] DEFAULT '{}',
  is_active         BOOLEAN DEFAULT TRUE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_directives_org
  ON org_brain_directives(org_id, is_active);

CREATE TRIGGER trg_brain_directives_updated_at
  BEFORE UPDATE ON org_brain_directives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE org_brain_directives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brain_directives_org_isolation" ON org_brain_directives
  FOR ALL USING (org_id = get_user_org_id());

-- ─── 2b. conversation_snapshots ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_snapshots (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id           UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id                UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_to               UUID REFERENCES users(id) ON DELETE SET NULL,

  detected_intent           TEXT,
  detected_product          TEXT,
  detected_urgency          TEXT,
  detected_temperature      TEXT,
  detected_sentiment        TEXT,
  detected_stage            TEXT,

  seller_approach_score     NUMERIC,
  seller_approach_notes     TEXT,
  seller_response_avg_secs  NUMERIC,
  seller_messages_count     INTEGER,
  contact_messages_count    INTEGER,

  buying_signals            TEXT[] DEFAULT '{}',
  risk_signals              TEXT[] DEFAULT '{}',
  opportunity_signals       TEXT[] DEFAULT '{}',

  recommended_action        TEXT,
  recommended_priority      TEXT,
  message_count_at_snapshot INTEGER,

  ai_model                  TEXT,
  ai_tokens_used            INTEGER,

  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_conversation
  ON conversation_snapshots(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_org
  ON conversation_snapshots(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_contact
  ON conversation_snapshots(contact_id, created_at DESC);

ALTER TABLE conversation_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots_org_isolation" ON conversation_snapshots
  FOR ALL USING (org_id = get_user_org_id());

-- ─── 2c. shopify_products ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shopify_products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shopify_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  image_url   TEXT,
  cost_price  NUMERIC(12,2),
  sale_price  NUMERIC(12,2),
  variants    JSONB DEFAULT '[]',
  is_active   BOOLEAN DEFAULT TRUE,
  synced_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, shopify_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_products_org
  ON shopify_products(org_id, is_active);

CREATE TRIGGER trg_shopify_products_updated_at
  BEFORE UPDATE ON shopify_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE shopify_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shopify_products_org_isolation" ON shopify_products
  FOR ALL USING (org_id = get_user_org_id());

-- ─── 2d. quotes ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quotes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  items           JSONB NOT NULL DEFAULT '[]',
  subtotal        NUMERIC(12,2) DEFAULT 0,
  discount_type   TEXT CHECK (discount_type IN ('fixed', 'percentage', NULL)),
  discount_value  NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  payment_terms   TEXT,
  notes           TEXT,
  seller_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  seller_name     TEXT,
  valid_until     DATE,
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_org
  ON quotes(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_conversation
  ON quotes(conversation_id);

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_org_isolation" ON quotes
  FOR ALL USING (org_id = get_user_org_id());

-- ─── 2e. quote_settings ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quote_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  default_markup  NUMERIC(5,2) DEFAULT 2.0,
  logo_url        TEXT,
  footer_text     TEXT,
  payment_options TEXT[] DEFAULT ARRAY['PIX', 'Cartão', 'Boleto'],
  visible_fields  JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_quote_settings_updated_at
  BEFORE UPDATE ON quote_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE quote_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quote_settings_org_isolation" ON quote_settings
  FOR ALL USING (org_id = get_user_org_id());

-- ─── 3. Harden signup_organization RPC ──────────────────────────────────────
-- Add auth.uid() check to prevent user A from creating an org for user B

CREATE OR REPLACE FUNCTION signup_organization(
  p_user_id UUID,
  p_user_email TEXT,
  p_user_name TEXT,
  p_org_name TEXT,
  p_org_slug TEXT
)
RETURNS JSON AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Verify caller is the user being set up
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: user ID mismatch';
  END IF;

  -- Cria organização
  INSERT INTO organizations (name, slug)
  VALUES (p_org_name, p_org_slug)
  RETURNING id INTO v_org_id;

  -- Cria user profile como owner
  INSERT INTO users (id, org_id, email, name, role)
  VALUES (p_user_id, v_org_id, p_user_email, p_user_name, 'owner');

  RETURN json_build_object(
    'org_id', v_org_id,
    'user_id', p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
