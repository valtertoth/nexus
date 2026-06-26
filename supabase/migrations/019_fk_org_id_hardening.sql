-- ============================================
-- 019: Add missing FK constraints on org_id (H14)
-- 4 tables have org_id without FK to organizations.
-- Verified: 0 orphan rows in all 4 tables.
-- ============================================

ALTER TABLE messages
  ADD CONSTRAINT messages_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id);

ALTER TABLE conversation_analysis_jobs
  ADD CONSTRAINT conversation_analysis_jobs_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id);
