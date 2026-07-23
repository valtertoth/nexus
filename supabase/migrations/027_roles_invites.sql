-- ============================================
-- MIGRATION 027: Papéis por vendedor + convites
-- Login real por usuário (mata perfis localStorage).
-- Papéis: owner | admin | agent  (admin == "gerente/manager")
-- ============================================

-- ── Helper: papel do usuário logado ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Backfill: garante 1 owner por org (o usuário mais antigo) ────────────────
-- Idempotente: só age em orgs que ainda não têm nenhum owner.
UPDATE public.users u
SET role = 'owner'
WHERE u.id IN (
  SELECT DISTINCT ON (org_id) id
  FROM public.users
  WHERE org_id NOT IN (
    SELECT org_id FROM public.users WHERE role = 'owner'
  )
  ORDER BY org_id, created_at ASC
);

-- ── Convites de equipe ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  token UUID NOT NULL DEFAULT uuid_generate_v4(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_invites_org ON team_invites(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites(token);

ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_invites_select" ON team_invites;
CREATE POLICY "team_invites_select" ON team_invites FOR SELECT
  USING (org_id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "team_invites_insert" ON team_invites;
CREATE POLICY "team_invites_insert" ON team_invites FOR INSERT
  WITH CHECK (org_id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "team_invites_delete" ON team_invites;
CREATE POLICY "team_invites_delete" ON team_invites FOR DELETE
  USING (org_id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'));

-- ── RLS por papel: mutações administrativas restritas a owner/admin ──────────
-- Leitura da org continua para todos os membros; UPDATE só owner/admin.
DROP POLICY IF EXISTS "org_update" ON organizations;
CREATE POLICY "org_update" ON organizations FOR UPDATE
  USING (id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'))
  WITH CHECK (id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'));

-- Setores guardam config de IA (prompt/modelo) => escrita só owner/admin,
-- leitura para todos os membros.
DROP POLICY IF EXISTS "sectors_all" ON sectors;
DROP POLICY IF EXISTS "sectors_select" ON sectors;
CREATE POLICY "sectors_select" ON sectors FOR SELECT
  USING (org_id = get_user_org_id());
DROP POLICY IF EXISTS "sectors_insert" ON sectors;
CREATE POLICY "sectors_insert" ON sectors FOR INSERT
  WITH CHECK (org_id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'));
DROP POLICY IF EXISTS "sectors_update" ON sectors;
CREATE POLICY "sectors_update" ON sectors FOR UPDATE
  USING (org_id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'))
  WITH CHECK (org_id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'));
DROP POLICY IF EXISTS "sectors_delete" ON sectors;
CREATE POLICY "sectors_delete" ON sectors FOR DELETE
  USING (org_id = get_user_org_id() AND get_user_role() IN ('owner', 'admin'));

-- ── Signup público desabilitado: novas orgs só via convite ──────────────────
-- A criação de organização pelo fluxo aberto vira erro claro. O provisionamento
-- de membros passa a ser feito pelo servidor (admin API) via /api/team/invite.
CREATE OR REPLACE FUNCTION signup_organization(
  p_user_id UUID,
  p_user_email TEXT,
  p_user_name TEXT,
  p_org_name TEXT,
  p_org_slug TEXT
)
RETURNS JSON AS $$
BEGIN
  RAISE EXCEPTION 'Peça um convite ao administrador' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
