import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireUUID, requireOneOf } from '../lib/validate.js'
import {
  assignConversation,
  claimConversation,
  closeConversation,
  reopenConversation,
  type AssignMode,
} from '../services/assignment.service.js'

type AuthVars = { Variables: { userId: string; orgId: string; userRole: string } }

const conversations = new Hono<AuthVars>()

conversations.use('*', authMiddleware)
conversations.use('*', apiRateLimit)

const ASSIGN_MODES: AssignMode[] = ['off', 'round_robin', 'sticky_round_robin']

// Verifica que a conversa existe e pertence ao org do usuário logado.
async function conversationInOrg(conversationId: string, orgId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .maybeSingle()
  return !!data
}

// GET /api/conversations?scope=mine|all|unassigned&status=open|closed|...
// - mine        → conversas atribuídas ao usuário logado (padrão)
// - unassigned  → conversas sem dono do org
// - all         → todas do org (só owner/admin)
conversations.get('/', async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const role = c.get('userRole')
  const scope = c.req.query('scope') || 'mine'
  const status = c.req.query('status')
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100)
  const cursor = c.req.query('cursor') // last_message_at para paginação

  if (scope === 'all' && role !== 'owner' && role !== 'admin') {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Escopo "all" requer gestor' } }, 403)
  }

  let query = supabaseAdmin
    .from('conversations')
    .select('*, contact:contacts(id, name, wa_id, phone, avatar_url), assigned_user:users!conversations_assigned_to_fkey(id, name, avatar_url)')
    .eq('org_id', orgId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (scope === 'mine') {
    query = query.eq('assigned_to', userId)
  } else if (scope === 'unassigned') {
    query = query.is('assigned_to', null)
  }
  // scope === 'all' → sem filtro de dono

  if (status) {
    query = query.eq('status', status)
  }

  if (cursor) {
    query = query.lt('last_message_at', cursor)
  }

  const { data, error } = await query

  if (error) {
    return c.json({ error: { code: 'QUERY_FAILED', message: 'Erro ao buscar conversas' } }, 500)
  }

  return c.json({
    conversations: data || [],
    hasMore: (data?.length || 0) === limit,
  })
})

// POST /api/conversations/:id/assign { userId } — owner/admin atribui a alguém
conversations.post('/:id/assign', requireRole('admin'), async (c) => {
  const orgId = c.get('orgId')
  const byUserId = c.get('userId')
  const conversationId = requireUUID(c.req.param('id'), 'id')

  const body = await c.req.json().catch(() => null) as { userId?: string } | null
  const targetUserId = requireUUID(body?.userId, 'userId')

  if (!(await conversationInOrg(conversationId, orgId))) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Conversa não encontrada' } }, 404)
  }

  const ok = await assignConversation(orgId, conversationId, targetUserId, byUserId)
  if (!ok) {
    return c.json({ error: { code: 'ASSIGN_FAILED', message: 'Usuário inválido ou fora do org' } }, 400)
  }

  return c.json({ ok: true, conversationId, assignedTo: targetUserId })
})

// POST /api/conversations/:id/claim — o próprio agente pega a conversa pra si
conversations.post('/:id/claim', async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const conversationId = requireUUID(c.req.param('id'), 'id')

  if (!(await conversationInOrg(conversationId, orgId))) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Conversa não encontrada' } }, 404)
  }

  const ok = await claimConversation(orgId, conversationId, userId)
  if (!ok) {
    return c.json({ error: { code: 'CLAIM_FAILED', message: 'Não foi possível assumir a conversa' } }, 400)
  }

  return c.json({ ok: true, conversationId, assignedTo: userId })
})

// POST /api/conversations/:id/close — fecha a conversa
conversations.post('/:id/close', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = requireUUID(c.req.param('id'), 'id')

  const ok = await closeConversation(orgId, conversationId)
  if (!ok) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Conversa não encontrada' } }, 404)
  }

  return c.json({ ok: true, conversationId, status: 'closed' })
})

// POST /api/conversations/:id/reopen — reabre a conversa
conversations.post('/:id/reopen', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = requireUUID(c.req.param('id'), 'id')

  const ok = await reopenConversation(orgId, conversationId)
  if (!ok) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Conversa não encontrada' } }, 404)
  }

  return c.json({ ok: true, conversationId, status: 'open' })
})

// PUT /api/conversations/assign-mode { mode } — owner/admin configura o modo
conversations.put('/assign-mode', requireRole('admin'), async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json().catch(() => null) as { mode?: string } | null
  const mode = requireOneOf(body?.mode, ASSIGN_MODES, 'mode')

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ assign_mode: mode })
    .eq('id', orgId)

  if (error) {
    return c.json({ error: { code: 'UPDATE_FAILED', message: 'Erro ao salvar modo de atribuição' } }, 500)
  }

  return c.json({ ok: true, assignMode: mode })
})

export default conversations
