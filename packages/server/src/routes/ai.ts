import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { authMiddleware } from '../middleware/auth.js'
import { aiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireUUID, requireString } from '../lib/validate.js'
import { generateSuggestion, streamSuggestion } from '../services/ai.service.js'
import { streamConsultation } from '../services/ai-consult.service.js'

type AuthVars = { Variables: { userId: string; orgId: string } }

const ai = new Hono<AuthVars>()

// All routes require auth + AI rate limit
ai.use('*', authMiddleware)
ai.use('*', aiRateLimit)

// POST /api/ai/suggest — Generate AI suggestion (non-streaming)
ai.post('/suggest', async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json<{ conversationId: string }>()

  requireUUID(body.conversationId, 'conversationId')

  // Get conversation with sector
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id, sector_id')
    .eq('id', body.conversationId)
    .eq('org_id', orgId)
    .single()

  if (!conv) {
    return c.json({ error: 'Conversa não encontrada' }, 404)
  }

  // Get latest contact message
  const { data: latestMsg } = await supabaseAdmin
    .from('messages')
    .select('content')
    .eq('conversation_id', body.conversationId)
    .eq('sender_type', 'contact')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!latestMsg?.content) {
    return c.json({ error: 'Nenhuma mensagem do contato encontrada' }, 400)
  }

  try {
    const result = await generateSuggestion(
      body.conversationId,
      latestMsg.content,
      conv.sector_id,
      orgId
    )

    return c.json({
      suggestion: result.suggestion,
      sources: result.sources,
      model: result.model,
      tokens: result.tokens,
      latencyMs: result.latencyMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar sugestão'
    console.error('[AI Route] Suggest error:', message)
    return c.json({ error: message }, 500)
  }
})

// GET /api/ai/stream/:conversationId — SSE streaming of suggestion
ai.get('/stream/:conversationId', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = requireUUID(c.req.param('conversationId'), 'conversationId')

  // Get conversation with sector
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id, sector_id')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (!conv) {
    return c.json({ error: 'Conversa não encontrada' }, 404)
  }

  // Get latest contact message
  const { data: latestMsg } = await supabaseAdmin
    .from('messages')
    .select('content')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'contact')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!latestMsg?.content) {
    return c.json({ error: 'Nenhuma mensagem do contato encontrada' }, 400)
  }

  return streamSSE(c, async (stream) => {
    const generator = streamSuggestion(
      conversationId,
      latestMsg.content,
      conv.sector_id,
      orgId
    )

    for await (const event of generator) {
      await stream.writeSSE({
        event: event.type,
        data: event.data,
      })
    }
  })
})

// POST /api/ai/consult/:conversationId — SSE streaming AI consultation
ai.post('/consult/:conversationId', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = c.req.param('conversationId')

  const body = await c.req.json<{
    question: string
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  }>()

  requireString(body.question, 'question')

  return streamSSE(c, async (stream) => {
    const generator = streamConsultation(
      conversationId,
      body.question.trim(),
      body.chatHistory || [],
      orgId
    )

    for await (const event of generator) {
      if (event.type === 'error') {
        console.error('[AI Consult] Error:', event.data)
      }
      await stream.writeSSE({
        event: event.type,
        data: event.data,
      })
    }
  })
})

export default ai
