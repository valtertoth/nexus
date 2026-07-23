-- ============================================
-- MIGRATION 030: Notas internas de conversa (colaboração do time · Lane G)
-- Trilha interna do atendimento — NUNCA vai ao cliente/WhatsApp.
-- Visível só ao time do próprio org. Suporta @menção (array de user_ids) e
-- serve de trilha de auditoria para transferências de conversa.
-- ============================================

CREATE TABLE IF NOT EXISTS conversation_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  mentions UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Listagem cronológica por conversa (uso principal do painel).
CREATE INDEX IF NOT EXISTS idx_conversation_notes_conv
  ON conversation_notes(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_org
  ON conversation_notes(org_id);

ALTER TABLE conversation_notes ENABLE ROW LEVEL SECURITY;

-- ── RLS: membros do org leem/escrevem notas do próprio org (colaboração) ─────
-- O acesso normal passa pelo servidor (service_role, ignora RLS). As políticas
-- abaixo são defesa em profundidade caso alguém use o supabase-js autenticado.
-- Qualquer membro pode ler e criar nota; editar/apagar só o próprio autor.
DROP POLICY IF EXISTS "conversation_notes_select" ON conversation_notes;
CREATE POLICY "conversation_notes_select" ON conversation_notes FOR SELECT
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "conversation_notes_insert" ON conversation_notes;
CREATE POLICY "conversation_notes_insert" ON conversation_notes FOR INSERT
  WITH CHECK (org_id = get_user_org_id() AND author_id = auth.uid());

DROP POLICY IF EXISTS "conversation_notes_update" ON conversation_notes;
CREATE POLICY "conversation_notes_update" ON conversation_notes FOR UPDATE
  USING (org_id = get_user_org_id() AND author_id = auth.uid())
  WITH CHECK (org_id = get_user_org_id() AND author_id = auth.uid());

DROP POLICY IF EXISTS "conversation_notes_delete" ON conversation_notes;
CREATE POLICY "conversation_notes_delete" ON conversation_notes FOR DELETE
  USING (org_id = get_user_org_id() AND author_id = auth.uid());
