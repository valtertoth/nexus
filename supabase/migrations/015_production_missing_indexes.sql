-- ============================================================
-- Production-critical missing indexes
-- Applied manually via Supabase SQL Editor on 2026-04-05
-- Prevents sequential scans on high-traffic tables
-- ============================================================

-- CRITICAL: User queries by organization (used by RLS get_user_org_id)
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(org_id, role);

-- HIGH: Knowledge base chunk retrieval by document
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);

-- HIGH: Knowledge document listing
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_org ON knowledge_documents(org_id, created_at DESC);

-- HIGH: Sector filtering
CREATE INDEX IF NOT EXISTS idx_sectors_org_id ON sectors(org_id);

-- MEDIUM: Quote history by contact
CREATE INDEX IF NOT EXISTS idx_quotes_contact ON quotes(contact_id);

-- MEDIUM: Attribution cleanup queries
CREATE INDEX IF NOT EXISTS idx_pending_attr_created ON pending_attributions(org_id, received_at);

-- MEDIUM: Agent dashboard snapshot lookups
CREATE INDEX IF NOT EXISTS idx_snapshots_assigned ON conversation_snapshots(assigned_to, created_at DESC)
  WHERE assigned_to IS NOT NULL;
