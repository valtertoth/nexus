-- ============================================
-- MIGRATION 031: Follow-ups agendados por vendedor
-- "Me lembra desse cliente em 3 dias" — crucial no ciclo longo de móveis.
-- Cada lembrete pertence a um usuário (dono) dentro de uma org, ligado a uma
-- conversa. A FILA visível já é útil; o DISPARO (job que percorre os vencidos)
-- fica documentado como integração futura.
-- ============================================

CREATE TABLE IF NOT EXISTS conversation_followups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE, -- dono do lembrete
  remind_at       TIMESTAMPTZ NOT NULL,
  note            TEXT,
  done_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fila do vendedor: pendentes ordenados por vencimento. O índice cobre a
-- consulta quente (GET /mine — filtra por org + user, ignora concluídos).
CREATE INDEX IF NOT EXISTS idx_followups_queue
  ON conversation_followups (org_id, user_id, remind_at)
  WHERE done_at IS NULL;

-- Também acelera a limpeza/relacionamento por conversa (cascade + listagens).
CREATE INDEX IF NOT EXISTS idx_followups_conversation
  ON conversation_followups (conversation_id);

-- ── RLS: escopo por org; cada um vê/edita os seus, gestão vê todos ───────────
-- O servidor opera com service_role (ignora RLS), mas mantemos as políticas
-- como defesa em profundidade caso o front consulte a tabela direto.
ALTER TABLE conversation_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "followups_select" ON conversation_followups;
CREATE POLICY "followups_select" ON conversation_followups FOR SELECT
  USING (
    org_id = get_user_org_id()
    AND (user_id = auth.uid() OR get_user_role() IN ('owner', 'admin'))
  );

DROP POLICY IF EXISTS "followups_insert" ON conversation_followups;
CREATE POLICY "followups_insert" ON conversation_followups FOR INSERT
  WITH CHECK (
    org_id = get_user_org_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "followups_update" ON conversation_followups;
CREATE POLICY "followups_update" ON conversation_followups FOR UPDATE
  USING (
    org_id = get_user_org_id()
    AND (user_id = auth.uid() OR get_user_role() IN ('owner', 'admin'))
  )
  WITH CHECK (
    org_id = get_user_org_id()
    AND (user_id = auth.uid() OR get_user_role() IN ('owner', 'admin'))
  );

DROP POLICY IF EXISTS "followups_delete" ON conversation_followups;
CREATE POLICY "followups_delete" ON conversation_followups FOR DELETE
  USING (
    org_id = get_user_org_id()
    AND (user_id = auth.uid() OR get_user_role() IN ('owner', 'admin'))
  );
