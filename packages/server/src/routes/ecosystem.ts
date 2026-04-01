import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { generateConversationSnapshot } from '../services/ecosystem.service.js'

type AuthVariables = {
  userId: string
  orgId: string
}

const app = new Hono<{ Variables: AuthVariables }>()

// All routes require auth + rate limiting
app.use('*', authMiddleware)
app.use('*', apiRateLimit)

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ecosystem/contact/:contactId/profile
// Retorna perfil evolutivo do cliente
// ─────────────────────────────────────────────────────────────────────────────
app.get('/contact/:contactId/profile', async (c) => {
  const orgId = c.get('orgId')
  const contactId = c.req.param('contactId')

  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select(`
      id, name, phone, email,
      profile_summary, profile_traits, profile_interests, profile_objections,
      profile_stage, profile_sentiment,
      total_conversations, total_revenue, lifetime_value,
      first_message_at, last_message_at, profile_updated_at,
      tags, metadata
    `)
    .eq('id', contactId)
    .eq('org_id', orgId)
    .single()

  if (!contact) return c.json({ error: 'Contato nao encontrado' }, 404)

  // Buscar historico de snapshots deste contato
  const { data: snapshots } = await supabaseAdmin
    .from('conversation_snapshots')
    .select(`
      detected_intent, detected_product, detected_temperature,
      detected_stage, detected_sentiment,
      buying_signals, risk_signals, opportunity_signals,
      created_at
    `)
    .eq('contact_id', contactId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(10)

  return c.json({ contact, history: snapshots || [] })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ecosystem/conversation/:conversationId/snapshot
// Retorna ultimo snapshot de uma conversa
// ─────────────────────────────────────────────────────────────────────────────
app.get('/conversation/:conversationId/snapshot', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = c.req.param('conversationId')

  const { data: snapshot } = await supabaseAdmin
    .from('conversation_snapshots')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!snapshot) return c.json({ snapshot: null })
  return c.json({ snapshot })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ecosystem/conversation/:conversationId/analyze
// Forca analise de uma conversa manualmente
// ─────────────────────────────────────────────────────────────────────────────
app.post('/conversation/:conversationId/analyze', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = c.req.param('conversationId')

  try {
    await generateConversationSnapshot(conversationId, orgId)
    return c.json({ success: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Falha na analise' }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ecosystem/sellers
// Retorna performance de todos os vendedores
// ─────────────────────────────────────────────────────────────────────────────
app.get('/sellers', async (c) => {
  const orgId = c.get('orgId')

  const { data: sellers } = await supabaseAdmin
    .from('users')
    .select(`
      id, name, email, role,
      seller_score, seller_strengths, seller_weaknesses,
      seller_style, seller_stats, seller_profile_updated_at
    `)
    .eq('org_id', orgId)
    .order('seller_score', { ascending: false })

  return c.json({ sellers: sellers || [] })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ecosystem/dashboard
// Visao consolidada do ecossistema
// ─────────────────────────────────────────────────────────────────────────────
app.get('/dashboard', async (c) => {
  const orgId = c.get('orgId')

  // Snapshots recentes (ultimas 24h)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: recentSnapshots } = await supabaseAdmin
    .from('conversation_snapshots')
    .select(`
      detected_intent, detected_temperature, detected_stage,
      detected_product, seller_approach_score,
      buying_signals, risk_signals, opportunity_signals,
      recommended_action, recommended_priority,
      created_at
    `)
    .eq('org_id', orgId)
    .gte('created_at', yesterday)
    .order('created_at', { ascending: false })
    .limit(50)

  // Contatos com perfil (top por revenue)
  const { data: topContacts } = await supabaseAdmin
    .from('contacts')
    .select('id, name, phone, profile_summary, profile_stage, profile_sentiment, total_revenue, lifetime_value')
    .eq('org_id', orgId)
    .not('profile_summary', 'is', null)
    .order('total_revenue', { ascending: false })
    .limit(10)

  // Alertas: conversas quentes sem resposta
  const { data: hotConversations } = await supabaseAdmin
    .from('conversation_snapshots')
    .select(`
      conversation_id, detected_temperature, detected_urgency,
      recommended_action, recommended_priority, created_at
    `)
    .eq('org_id', orgId)
    .in('detected_temperature', ['hot', 'burning'])
    .in('recommended_priority', ['immediate', 'today'])
    .order('created_at', { ascending: false })
    .limit(10)

  return c.json({
    recentSnapshots: recentSnapshots || [],
    topContacts: topContacts || [],
    alerts: hotConversations || [],
  })
})

export default app
