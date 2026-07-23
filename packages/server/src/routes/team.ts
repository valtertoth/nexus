import { Hono } from 'hono'
import { randomUUID, randomBytes } from 'crypto'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireUUID } from '../lib/validate.js'

type AuthVars = { Variables: { userId: string; orgId: string; userRole: string } }

const team = new Hono<AuthVars>()

team.use('*', authMiddleware)
team.use('*', apiRateLimit)

type InviteRole = 'admin' | 'agent'
const INVITE_ROLES: InviteRole[] = ['admin', 'agent']

function tempPassword(): string {
  // Senha temporária forte, entregue ao convidante para repassar ao membro.
  return randomBytes(12).toString('base64url')
}

// GET /api/team/members — membros da org
team.get('/members', async (c) => {
  const orgId = c.get('orgId')

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, role, is_online, last_seen_at, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (error) {
    return c.json({ error: 'Erro ao buscar membros' }, 500)
  }

  return c.json({ members: data || [] })
})

// POST /api/team/invite — owner/admin cria membro na MESMA org
team.post('/invite', requireRole('admin'), async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')

  const body = await c.req.json().catch(() => null) as
    | { email?: string; name?: string; role?: string }
    | null

  const email = body?.email?.trim().toLowerCase()
  const role = (body?.role || 'agent') as InviteRole

  if (!email || !email.includes('@')) {
    return c.json({ error: 'Email inválido' }, 400)
  }
  if (!INVITE_ROLES.includes(role)) {
    return c.json({ error: 'Papel inválido (use admin ou agent)' }, 400)
  }

  const name = body?.name?.trim() || email.split('@')[0]

  // Cria usuário no Supabase Auth (admin API), já confirmado.
  const password = tempPassword()
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr || !created?.user) {
    const message = createErr?.message || ''
    if (message.toLowerCase().includes('already') || message.toLowerCase().includes('registered')) {
      return c.json({ error: 'Já existe um usuário com este email' }, 409)
    }
    return c.json({ error: `Erro ao criar usuário: ${message}` }, 500)
  }

  const newUserId = created.user.id

  // Associa à MESMA org do convidante, com o papel do convite.
  const { data: member, error: profileErr } = await supabaseAdmin
    .from('users')
    .insert({
      id: newUserId,
      org_id: orgId,
      email,
      name,
      role,
    })
    .select('id, name, email, role, is_online, last_seen_at, created_at')
    .single()

  if (profileErr || !member) {
    // Rollback do auth user para não deixar órfão.
    await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {})
    return c.json({ error: `Erro ao criar perfil: ${profileErr?.message || ''}` }, 500)
  }

  // Registra o convite (provisionado imediatamente).
  await supabaseAdmin.from('team_invites').insert({
    org_id: orgId,
    email,
    role,
    token: randomUUID(),
    created_by: userId,
    accepted_at: new Date().toISOString(),
  })

  return c.json({ member, tempPassword: password })
})

// DELETE /api/team/member/:id — só owner; não remove o último owner
team.delete('/member/:id', requireRole('owner'), async (c) => {
  const orgId = c.get('orgId')
  const targetId = requireUUID(c.req.param('id'), 'id')

  const { data: target, error: targetErr } = await supabaseAdmin
    .from('users')
    .select('id, org_id, role')
    .eq('id', targetId)
    .eq('org_id', orgId)
    .single()

  if (targetErr || !target) {
    return c.json({ error: 'Membro não encontrado' }, 404)
  }

  if (target.role === 'owner') {
    const { count } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'owner')

    if ((count || 0) <= 1) {
      return c.json({ error: 'Não é possível remover o último owner' }, 400)
    }
  }

  // Solta as referências antes de remover (FKs sem cascade).
  await supabaseAdmin
    .from('conversations')
    .update({ assigned_to: null })
    .eq('org_id', orgId)
    .eq('assigned_to', targetId)

  await supabaseAdmin
    .from('knowledge_documents')
    .update({ uploaded_by: null })
    .eq('org_id', orgId)
    .eq('uploaded_by', targetId)

  // Remove do Auth — cascateia para public.users (FK ON DELETE CASCADE).
  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(targetId)
  if (delErr) {
    return c.json({ error: `Erro ao remover membro: ${delErr.message}` }, 500)
  }

  return c.json({ ok: true })
})

export default team
