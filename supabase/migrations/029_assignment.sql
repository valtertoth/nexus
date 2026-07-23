-- ============================================
-- MIGRATION 029: Motor de atribuição (multi-vendedor)
-- Popular assigned_to + first_response_at/response_time_secs + status.
--
-- Modos de atribuição por org (organizations.assign_mode):
--   off                  → nenhuma atribuição automática (padrão)
--   round_robin          → menor carga entre agentes online
--   sticky_round_robin   → mesmo agente que já atendeu o contato; senão round-robin
--
-- IMPORTANTE: NÃO altera o CHECK de conversations.status. Os estados canônicos
-- seguem sendo 'open' | 'pending' | 'resolved' | 'closed' (migration 001). A lane
-- padroniza a LÓGICA de negócio em open (ativo) / closed (fechado), preservando
-- 'pending' e 'resolved' já existentes nos dados.
-- ============================================

-- ── 1. organizations.assign_mode ────────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS assign_mode TEXT NOT NULL DEFAULT 'off';

-- Adiciona o CHECK só se ainda não existir (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_assign_mode_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_assign_mode_check
      CHECK (assign_mode IN ('off', 'round_robin', 'sticky_round_robin'));
  END IF;
END $$;

-- ── 2. Colunas de SLA (defensivo: podem já existir ao vivo) ──────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS response_time_secs INTEGER;

-- ── 3. Índices para o inbox por vendedor ─────────────────────────────────────
-- Filtro por status + dono (scope=mine / unassigned).
CREATE INDEX IF NOT EXISTS idx_conversations_org_status_assigned
  ON conversations(org_id, status, assigned_to);

-- Lista ordenada por atividade dentro da caixa de um vendedor.
CREATE INDEX IF NOT EXISTS idx_conversations_org_assigned_activity
  ON conversations(org_id, assigned_to, last_message_at DESC);

-- ── 4. Round-robin: próximo agente por MENOR carga entre online ──────────────
-- Retorna o user do org com role in (owner,admin,agent), is_online=true, que tem
-- a MENOR quantidade de conversas abertas (status='open') atribuídas. Desempate
-- por last_seen_at mais antigo (quem está online há mais tempo sem receber).
-- SECURITY DEFINER + grant só service_role (chamado apenas pelo servidor).
CREATE OR REPLACE FUNCTION pick_next_agent(p_org_id UUID)
RETURNS UUID AS $$
  SELECT u.id
  FROM public.users u
  LEFT JOIN public.conversations c
    ON c.assigned_to = u.id
   AND c.org_id = p_org_id
   AND c.status = 'open'
  WHERE u.org_id = p_org_id
    AND u.is_online = true
    AND u.role IN ('owner', 'admin', 'agent')
  GROUP BY u.id, u.last_seen_at
  ORDER BY COUNT(c.id) ASC, u.last_seen_at ASC NULLS FIRST
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION pick_next_agent(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION pick_next_agent(UUID) FROM anon;
REVOKE ALL ON FUNCTION pick_next_agent(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION pick_next_agent(UUID) TO service_role;
