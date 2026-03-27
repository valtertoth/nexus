-- ============================================
-- NEXUS DATABASE SCHEMA v2.0
-- Supabase PostgreSQL + pgvector + Auth
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- CORE: Organizações e Usuários
-- ============================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
  wa_phone_number_id TEXT,
  wa_business_account_id TEXT,
  wa_access_token_encrypted BYTEA,
  wa_webhook_secret TEXT,
  settings JSONB DEFAULT '{}',
  max_agents INTEGER DEFAULT 3,
  ai_monthly_token_limit INTEGER DEFAULT 500000,
  ai_tokens_used_this_month INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Funções de encriptação do token WA (usa env var via GUC)
-- Em produção, setar: ALTER DATABASE postgres SET app.encryption_secret = 'sua-chave';
CREATE OR REPLACE FUNCTION encrypt_wa_token(token TEXT)
RETURNS BYTEA AS $$
  SELECT pgp_sym_encrypt(token, current_setting('app.encryption_secret', true))
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_wa_token(encrypted BYTEA)
RETURNS TEXT AS $$
  SELECT pgp_sym_decrypt(encrypted, current_setting('app.encryption_secret', true))
$$ LANGUAGE sql SECURITY DEFINER;

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'agent')),
  sector_id UUID,
  ai_mode TEXT DEFAULT 'dictated' CHECK (ai_mode IN ('automatic', 'dictated', 'off')),
  is_online BOOLEAN DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SETORES
-- ============================================

CREATE TABLE sectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  ai_model TEXT DEFAULT 'claude-sonnet-4-20250514',
  system_prompt TEXT NOT NULL DEFAULT '',
  ai_temperature NUMERIC DEFAULT 0.3,
  ai_max_tokens INTEGER DEFAULT 1024,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD CONSTRAINT fk_user_sector
  FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL;

-- ============================================
-- CONTATOS E CONVERSAS
-- ============================================

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, wa_id)
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sector_id UUID REFERENCES sectors(id),
  assigned_to UUID REFERENCES users(id),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  subject TEXT,
  unread_count INTEGER DEFAULT 0,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  wa_service_window_expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MENSAGENS
-- ============================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('contact', 'agent', 'ai', 'system')),
  sender_id UUID,
  content TEXT,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN (
    'text', 'image', 'audio', 'video', 'document',
    'location', 'contact', 'sticker', 'interactive', 'template'
  )),
  media_url TEXT,
  media_original_url TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  media_size INTEGER,
  wa_message_id TEXT,
  wa_status TEXT DEFAULT 'sent' CHECK (wa_status IN ('sent', 'delivered', 'read', 'failed')),
  wa_timestamp TIMESTAMPTZ,
  ai_suggested_response TEXT,
  ai_suggestion_sources JSONB,
  ai_approved BOOLEAN,
  ai_edited BOOLEAN DEFAULT FALSE,
  ai_original_suggestion TEXT,
  ai_model_used TEXT,
  ai_tokens_used INTEGER,
  ai_latency_ms INTEGER,
  is_internal_note BOOLEAN DEFAULT FALSE,
  reply_to_message_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BASE DE CONHECIMENTO (RAG)
-- ============================================

CREATE TABLE knowledge_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  chunks_count INTEGER DEFAULT 0,
  error_message TEXT,
  uploaded_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  sector_id UUID NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536),
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index (melhor que IVFFlat para volumes iniciais)
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Performance indexes
CREATE INDEX idx_chunks_sector ON knowledge_chunks(sector_id);
CREATE INDEX idx_chunks_org ON knowledge_chunks(org_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_org ON messages(org_id);
CREATE INDEX idx_messages_wa_id ON messages(wa_message_id); -- deduplicação de webhook
CREATE INDEX idx_conversations_org_status ON conversations(org_id, status);
CREATE INDEX idx_conversations_assigned ON conversations(assigned_to, status);
CREATE INDEX idx_contacts_wa_id ON contacts(org_id, wa_id);

-- ============================================
-- FUNÇÃO DE BUSCA SEMÂNTICA (RAG)
-- ============================================

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding VECTOR(1536),
  p_sector_id UUID,
  p_org_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE kc.sector_id = p_sector_id
    AND kc.org_id = p_org_id
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- MÉTRICAS
-- ============================================

CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL,
  user_id UUID,
  conversation_id UUID,
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms INTEGER,
  was_approved BOOLEAN,
  was_edited BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS (Row Level Security)
-- ============================================

-- Helper: pegar org_id do usuário logado
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ORGANIZATIONS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_select" ON organizations FOR SELECT
  USING (id = get_user_org_id());
CREATE POLICY "org_update" ON organizations FOR UPDATE
  USING (id = get_user_org_id())
  WITH CHECK (id = get_user_org_id());

-- USERS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select" ON users FOR SELECT
  USING (org_id = get_user_org_id());
CREATE POLICY "users_insert" ON users FOR INSERT
  WITH CHECK (org_id = get_user_org_id());
CREATE POLICY "users_update" ON users FOR UPDATE
  USING (org_id = get_user_org_id());

-- SECTORS
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sectors_all" ON sectors FOR ALL
  USING (org_id = get_user_org_id());

-- CONTACTS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_all" ON contacts FOR ALL
  USING (org_id = get_user_org_id());

-- CONVERSATIONS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_all" ON conversations FOR ALL
  USING (org_id = get_user_org_id());

-- MESSAGES
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_all" ON messages FOR ALL
  USING (org_id = get_user_org_id());

-- KNOWLEDGE_DOCUMENTS
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_docs_all" ON knowledge_documents FOR ALL
  USING (org_id = get_user_org_id());

-- KNOWLEDGE_CHUNKS
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_chunks_all" ON knowledge_chunks FOR ALL
  USING (org_id = get_user_org_id());

-- AI_USAGE_LOGS
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_logs_all" ON ai_usage_logs FOR ALL
  USING (org_id = get_user_org_id());

-- ============================================
-- SIGNUP RPC (bypassa RLS para criar org + user)
-- ============================================

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

-- ============================================
-- STORAGE BUCKETS
-- ============================================

INSERT INTO storage.buckets (id, name, public) VALUES
  ('media', 'media', false),
  ('knowledge', 'knowledge', false);

CREATE POLICY "media_access" ON storage.objects FOR ALL
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = get_user_org_id()::TEXT);

CREATE POLICY "knowledge_access" ON storage.objects FOR ALL
  USING (bucket_id = 'knowledge' AND (storage.foldername(name))[1] = get_user_org_id()::TEXT);
