-- =============================================================
-- Migration 013: Production indexes for scale
-- Adds composite indexes identified in production readiness audit
-- for handling thousands of conversations and messages
-- =============================================================

-- Tier 1: Critical for production scale

-- Messages: analytics by sender type (agent activity timelines)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_org_sender_created
  ON messages(org_id, sender_type, created_at DESC);

-- Conversations: status-grouped inbox with sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_org_status_created
  ON conversations(org_id, status, created_at DESC);

-- Conversations: agent dashboard (my assigned convos, sorted by recency)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_assigned_status_last
  ON conversations(org_id, assigned_to, status, last_message_at DESC);

-- Conversations: contact history view (recent conversations for a contact)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_contact_created
  ON conversations(contact_id, created_at DESC);

-- AI Usage Logs: usage dashboards time-series
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_usage_org_created
  ON ai_usage_logs(org_id, created_at DESC);

-- AI Usage Logs: model performance comparison
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_usage_org_model_created
  ON ai_usage_logs(org_id, model, created_at DESC);

-- Tier 2: High priority for 10K+ conversations

-- Conversations: priority queue view
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_org_priority_status
  ON conversations(org_id, priority, status, last_message_at DESC);

-- Contacts: sorted by recency for contact list
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_org_last_message
  ON contacts(org_id, last_message_at DESC NULLS LAST);

-- AI Usage Logs: approval rate trends
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_usage_org_approved_created
  ON ai_usage_logs(org_id, was_approved, created_at DESC);
