import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { requireUUID, requireOneOf } from '../lib/validate.js'
import {
  createFollowup,
  listMine,
  markDone,
  FollowupError,
  type FollowupScope,
} from '../services/followup.service.js'

type AuthVars = { Variables: { userId: string; orgId: string; userRole: string } }

const followups = new Hono<AuthVars>()

followups.use('*', authMiddleware)
followups.use('*', apiRateLimit)

// POST /api/followups — agenda um lembrete pro vendedor logado
followups.post('/', async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')

  const body = await c.req.json().catch(() => null) as
    | { conversationId?: string; remind_at?: string; note?: string }
    | null

  const conversationId = requireUUID(body?.conversationId, 'conversationId')

  // remind_at: precisa ser uma data válida no futuro (tolerância de 1min pra clock skew).
  const remindRaw = body?.remind_at
  if (typeof remindRaw !== 'string' || Number.isNaN(Date.parse(remindRaw))) {
    return c.json({ error: 'remind_at deve ser uma data ISO válida' }, 400)
  }
  const remindAt = new Date(remindRaw)
  if (remindAt.getTime() < Date.now() - 60_000) {
    return c.json({ error: 'remind_at deve ser no futuro' }, 400)
  }

  const note = typeof body?.note === 'string' ? body.note.slice(0, 2000) : undefined

  try {
    const followup = await createFollowup({
      orgId,
      userId,
      conversationId,
      remindAt: remindAt.toISOString(),
      note,
    })
    return c.json({ followup }, 201)
  } catch (err) {
    if (err instanceof FollowupError) {
      return c.json({ error: err.message }, err.status)
    }
    throw err
  }
})

// GET /api/followups/mine?scope=due|upcoming — fila do vendedor logado
followups.get('/mine', async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')

  const scope = requireOneOf<FollowupScope>(
    c.req.query('scope') || 'due',
    ['due', 'upcoming'],
    'scope'
  )

  try {
    const items = await listMine({ orgId, userId, scope })
    return c.json({ followups: items })
  } catch (err) {
    if (err instanceof FollowupError) {
      return c.json({ error: err.message }, err.status)
    }
    throw err
  }
})

// POST /api/followups/:id/done — marca um lembrete como concluído
followups.post('/:id/done', async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const id = requireUUID(c.req.param('id'), 'id')

  try {
    const followup = await markDone({ orgId, userId, id })
    return c.json({ followup })
  } catch (err) {
    if (err instanceof FollowupError) {
      return c.json({ error: err.message }, err.status)
    }
    throw err
  }
})

export default followups
