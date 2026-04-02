import { Hono } from 'hono'
import { authMiddleware, type UserRole } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { recordOutcome, getPendingConversions, markConversionSent, getConversionSummary } from '../services/conversion.service.js'
import { analyzeConversation, getTopInsightsForSector } from '../services/conversation_intelligence.service.js'

type AuthVars = { Variables: { userId: string; orgId: string; userRole: UserRole } }

const intelligence = new Hono<AuthVars>()

// ─── User-authenticated routes ─────────────────────────────────────────────

intelligence.use('*', async (c, next) => {
  // Intelligence API key routes use their own auth (x-nexus-api-key header)
  // Each /nexus/* handler MUST call verifyIntelligenceApiKey and return 401 if invalid
  const path = c.req.path
  if (path.includes('/nexus/')) {
    return next()
  }
  return authMiddleware(c, next)
})

intelligence.use('*', apiRateLimit)

// POST /api/intelligence/outcome — Record conversation outcome
intelligence.post('/outcome', async (c) => {
  const userId = c.get('userId')
  const orgId = c.get('orgId')

  const body = await c.req.json<{
    conversationId: string
    outcome: 'converted' | 'lost' | 'problem'
    value?: number
    currency?: string
    reason?: string
    product?: string
  }>()

  const { conversationId, outcome, value, currency, reason, product } = body

  if (!conversationId || !outcome) {
    return c.json({ error: 'conversationId e outcome são obrigatórios' }, 400)
  }

  if (!['converted', 'lost', 'problem'].includes(outcome)) {
    return c.json({ error: 'outcome deve ser: converted, lost ou problem' }, 400)
  }

  if (outcome === 'converted' && value !== undefined && value < 0) {
    return c.json({ error: 'value deve ser um número positivo' }, 400)
  }

  try {
    // Verify conversation exists and belongs to this org before recording
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('org_id', orgId)
      .single()

    if (!conv) {
      return c.json({ error: 'Conversa nao encontrada' }, 404)
    }

    await recordOutcome({ conversationId, orgId, userId, outcome, value, currency, reason, product })
    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return c.json({ error: message }, 500)
  }
})

// GET /api/intelligence/insights/:sectorId — Get top insights for a sector
intelligence.get('/insights/:sectorId', async (c) => {
  const orgId = c.get('orgId')
  const sectorId = c.req.param('sectorId')
  const limit = parseInt(c.req.query('limit') || '20')

  const { data, error } = await supabaseAdmin
    .from('conversation_insights')
    .select('*')
    .eq('org_id', orgId)
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ insights: data })
})

// GET /api/intelligence/insights — Get all insights for org
intelligence.get('/insights', async (c) => {
  const orgId = c.get('orgId')
  const insightType = c.req.query('type')
  const minConfidence = parseFloat(c.req.query('min_confidence') || '0')
  const limit = parseInt(c.req.query('limit') || '50')

  let query = supabaseAdmin
    .from('conversation_insights')
    .select('*, sectors(name)')
    .eq('org_id', orgId)
    .eq('is_active', true)

  if (insightType) query = query.eq('insight_type', insightType)
  if (minConfidence > 0) query = query.gte('confidence', minConfidence)

  query = query.order('confidence', { ascending: false }).order('created_at', { ascending: false }).limit(Math.min(limit, 100))

  const { data, error } = await query
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ insights: data })
})

// GET /api/intelligence/analytics — Conversion summary
intelligence.get('/analytics', async (c) => {
  const orgId = c.get('orgId')
  const startDate = c.req.query('start_date')
  const endDate = c.req.query('end_date')

  const summary = await getConversionSummary(orgId, startDate, endDate)
  return c.json(summary)
})

// POST /api/intelligence/analyze/:conversationId — Manually trigger analysis
intelligence.post('/analyze/:conversationId', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = c.req.param('conversationId')

  // Verify conversation belongs to org
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id, outcome')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (!conv) return c.json({ error: 'Conversa não encontrada' }, 404)
  if (!conv.outcome) return c.json({ error: 'Conversa sem outcome definido' }, 400)

  setImmediate(() => {
    analyzeConversation(conversationId).catch(console.error)
  })

  return c.json({ success: true, message: 'Análise iniciada em background' })
})

// POST /api/intelligence/api-key/regenerate — Generate or regenerate API key
intelligence.post('/api-key/regenerate', async (c) => {
  const orgId = c.get('orgId')

  // Generate a new key: nxk_ prefix + 32 random hex bytes
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  const newKey = `nxk_${hex}`

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ nexus_api_key: newKey })
    .eq('id', orgId)

  if (error) return c.json({ error: error.message }, 500)

  return c.json({ apiKey: newKey })
})

// ─── Intelligence API key routes (called by Intelligence platform) ─────────
// These use a shared API key instead of user JWT

const verifyIntelligenceApiKey = async (c: Parameters<typeof authMiddleware>[0]): Promise<boolean> => {
  const apiKey = c.req.header('x-nexus-api-key')
  if (!apiKey) return false

  const { data } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('nexus_api_key', apiKey)
    .single()

  if (data) {
    // Set orgId for subsequent handlers
    ;(c as unknown as { set: (key: string, value: string) => void }).set('orgId', data.id)
    return true
  }
  return false
}

// GET /api/intelligence/nexus/conversions/pending?platform=meta|google
intelligence.get('/nexus/conversions/pending', async (c) => {
  const valid = await verifyIntelligenceApiKey(c)
  if (!valid) return c.json({ error: 'API key inválida' }, 401)

  const orgId = c.get('orgId')
  const platform = c.req.query('platform') as 'meta' | 'google'

  if (!platform || !['meta', 'google'].includes(platform)) {
    return c.json({ error: 'platform deve ser: meta ou google' }, 400)
  }

  const events = await getPendingConversions(orgId, platform)
  return c.json({ events })
})

// POST /api/intelligence/nexus/conversions/acknowledge — Mark as sent
intelligence.post('/nexus/conversions/acknowledge', async (c) => {
  const valid = await verifyIntelligenceApiKey(c)
  if (!valid) return c.json({ error: 'API key inválida' }, 401)

  const body = await c.req.json<{
    platform: 'meta' | 'google'
    results: Array<{ id: string; success: boolean; eventId?: string; error?: string }>
  }>()

  const { platform, results } = body
  if (!platform || !results?.length) {
    return c.json({ error: 'platform e results são obrigatórios' }, 400)
  }

  const ids = results.map((r) => r.id)
  await markConversionSent(ids, platform, results)
  return c.json({ success: true, processed: results.length })
})

// POST /api/intelligence/nexus/attribution — Receive lead attribution from Intelligence
intelligence.post('/nexus/attribution', async (c) => {
  const valid = await verifyIntelligenceApiKey(c)
  if (!valid) return c.json({ error: 'API key inválida' }, 401)

  const orgId = c.get('orgId')
  const body = await c.req.json<{
    wa_id: string
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
    utm_ad_id?: string
    utm_adset_id?: string
    utm_campaign_id?: string
  }>()

  if (!body.wa_id) {
    return c.json({ error: 'wa_id é obrigatório' }, 400)
  }

  const { receiveLeadAttribution, parseUtmFromObject } = await import('../services/attribution.service.js')
  const params = parseUtmFromObject(body as Record<string, string>)
  const result = await receiveLeadAttribution(orgId, body.wa_id, params)

  return c.json(result)
})

// GET /api/intelligence/nexus/insights/top?sector_id=...&limit=10
intelligence.get('/nexus/insights/top', async (c) => {
  const valid = await verifyIntelligenceApiKey(c)
  if (!valid) return c.json({ error: 'API key inválida' }, 401)

  const orgId = c.get('orgId')
  const sectorId = c.req.query('sector_id')
  const limit = parseInt(c.req.query('limit') || '10')

  if (!sectorId) return c.json({ error: 'sector_id é obrigatório' }, 400)

  const insights = await getTopInsightsForSector(orgId, sectorId, limit)
  return c.json({ insights })
})

export default intelligence
