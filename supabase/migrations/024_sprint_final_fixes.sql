-- Sprint Final: production readiness fixes

-- 1. RPC to atomically increment contact total_conversations
CREATE OR REPLACE FUNCTION increment_contact_conversations(p_contact_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE contacts
  SET total_conversations = COALESCE(total_conversations, 0) + 1
  WHERE id = p_contact_id;
$$;

-- 2. Add shopify_customer_id to contacts for Shopify bridge
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS shopify_customer_id bigint;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS shopify_customer_url text;

CREATE INDEX IF NOT EXISTS idx_contacts_shopify_customer_id
  ON contacts(shopify_customer_id) WHERE shopify_customer_id IS NOT NULL;

-- 3. Backfill total_conversations from actual conversation count
UPDATE contacts c
SET total_conversations = sub.cnt
FROM (
  SELECT contact_id, COUNT(*) as cnt
  FROM conversations
  GROUP BY contact_id
) sub
WHERE c.id = sub.contact_id
  AND COALESCE(c.total_conversations, 0) = 0;

-- 4. Grant execute to authenticated (RLS still applies via service_role caller)
GRANT EXECUTE ON FUNCTION increment_contact_conversations(uuid) TO service_role;
