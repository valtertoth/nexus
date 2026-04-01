import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import {
  getAvailableTags,
  getConversationTags,
  applyTag,
  removeTag,
  createCustomTag,
  suggestTags,
  updateConversationLeadScore,
  getAccountabilityBreakdown,
} from '../services/tag.service.js'
import { supabaseAdmin } from '../lib/supabase.js'

type AuthVars = { Variables: { userId: string; orgId: string } }

const tags = new Hono<AuthVars>()
tags.use('*', authMiddleware)
tags.use('*', apiRateLimit)

// GET /api/tags — All available tags for org
tags.get('/', async (c) => {
  const orgId = c.get('orgId')
  const data = await getAvailableTags(orgId)
  return c.json({ tags: data })
})

// GET /api/tags/conversation/:id — Tags on a conversation
tags.get('/conversation/:id', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = c.req.param('id')

  // Verify ownership
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (!conv) return c.json({ error: 'Conversa não encontrada' }, 404)

  const data = await getConversationTags(conversationId)
  return c.json({ tags: data })
})

// POST /api/tags/conversation/:id — Apply a tag
tags.post('/conversation/:id', async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const conversationId = c.req.param('id')

  const { tag_slug } = await c.req.json<{ tag_slug: string }>()
  if (!tag_slug) return c.json({ error: 'tag_slug é obrigatório' }, 400)

  // Verify ownership
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (!conv) return c.json({ error: 'Conversa não encontrada' }, 404)

  await applyTag({ conversationId, orgId, tagSlug: tag_slug, taggedBy: userId })
  return c.json({ success: true })
})

// DELETE /api/tags/conversation/:id/:slug — Remove a tag
tags.delete('/conversation/:id/:slug', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = c.req.param('id')
  const tagSlug = c.req.param('slug')

  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (!conv) return c.json({ error: 'Conversa não encontrada' }, 404)

  await removeTag(conversationId, tagSlug)
  return c.json({ success: true })
})

// POST /api/tags/conversation/:id/suggest — AI tag suggestions
tags.post('/conversation/:id/suggest', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = c.req.param('id')

  const { outcome } = await c.req.json<{ outcome: string }>()
  if (!outcome) return c.json({ error: 'outcome é obrigatório' }, 400)

  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (!conv) return c.json({ error: 'Conversa não encontrada' }, 404)

  try {
    const suggestions = await suggestTags(conversationId, orgId, outcome)
    return c.json({ suggestions })
  } catch (err) {
    // AI unavailable — return empty suggestions gracefully
    console.error('[Tags] AI suggestion failed:', err instanceof Error ? err.message : err)
    return c.json({ suggestions: [] })
  }
})

// POST /api/tags/conversation/:id/score — Recalculate lead score
tags.post('/conversation/:id/score', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = c.req.param('id')

  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (!conv) return c.json({ error: 'Conversa não encontrada' }, 404)

  await updateConversationLeadScore(conversationId)
  return c.json({ success: true })
})

// POST /api/tags/custom — Create custom tag for org
tags.post('/custom', async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json<{
    slug: string
    label: string
    dimension: string
    accountability?: string
    color?: string
    emoji?: string
  }>()

  if (!body.slug || !body.label || !body.dimension) {
    return c.json({ error: 'slug, label e dimension são obrigatórios' }, 400)
  }

  await createCustomTag(orgId, body)
  return c.json({ success: true })
})

// GET /api/tags/analytics/accountability — "Whose fault?" breakdown
tags.get('/analytics/accountability', async (c) => {
  const orgId = c.get('orgId')
  const startDate = c.req.query('start_date')
  const endDate = c.req.query('end_date')
  const channel = c.req.query('channel')
  const campaignId = c.req.query('campaign_id')

  const breakdown = await getAccountabilityBreakdown(orgId, {
    startDate,
    endDate,
    channel,
    campaignId,
  })

  return c.json(breakdown)
})

export default tags
