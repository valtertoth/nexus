import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { requireUUID, requireString, requireConversationAccess } from '../lib/validate.js'
import { listNotes, createNote, createTransferNote } from '../services/notes.service.js'

type AuthVars = { Variables: { userId: string; orgId: string; userRole: string } }

// Montado em /api/notes (ver ganchos_de_integracao). Prefixo escolhido para NÃO
// colidir com a lane de assignment, que fica com /api/conversations.
const notes = new Hono<AuthVars>()

notes.use('*', authMiddleware)
notes.use('*', apiRateLimit)

// GET /api/notes/:conversationId — lista notas internas da conversa
notes.get('/:conversationId', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = requireUUID(c.req.param('conversationId'), 'conversationId')

  await requireConversationAccess(conversationId, orgId)

  const data = await listNotes(orgId, conversationId)
  return c.json({ notes: data })
})

// POST /api/notes/:conversationId — cria nota interna {body, mentions?}
notes.post('/:conversationId', async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const conversationId = requireUUID(c.req.param('conversationId'), 'conversationId')

  const payload = await c.req
    .json<{ body?: string; mentions?: string[] }>()
    .catch(() => ({} as { body?: string; mentions?: string[] }))

  const text = requireString(payload.body, 'body')
  if (text.length > 5000) {
    return c.json({ error: 'Nota excede o limite de 5000 caracteres' }, 400)
  }

  await requireConversationAccess(conversationId, orgId)

  const note = await createNote(orgId, conversationId, userId, text, payload.mentions)
  return c.json({ note }, 201)
})

// POST /api/notes/:conversationId/transfer — registra transferência como nota
// {toUserId, note?}. A reatribuição (assigned_to) é ligada pela lane de assignment.
notes.post('/:conversationId/transfer', async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const conversationId = requireUUID(c.req.param('conversationId'), 'conversationId')

  const payload = await c.req
    .json<{ toUserId?: string; note?: string }>()
    .catch(() => ({} as { toUserId?: string; note?: string }))

  const toUserId = requireUUID(payload.toUserId, 'toUserId')

  await requireConversationAccess(conversationId, orgId)

  const result = await createTransferNote(orgId, conversationId, userId, toUserId, payload.note)
  if (!result) {
    return c.json({ error: 'Membro de destino não encontrado' }, 404)
  }

  return c.json(result, 201)
})

export default notes
