import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../lib/supabase.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

export interface TagSuggestion {
  slug: string
  label: string
  dimension: string
  accountability: string | null
  confidence: number
  reasoning: string
}

interface ConversationTagInput {
  conversationId: string
  orgId: string
  tagSlug: string
  taggedBy: string
  taggedByAi?: boolean
  aiConfidence?: number
}

/**
 * Get all available tags for an org (system defaults + org customs).
 */
export async function getAvailableTags(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('tag_definitions')
    .select('*')
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .eq('is_active', true)
    .order('dimension')
    .order('sort_order')

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Get tags applied to a specific conversation.
 */
export async function getConversationTags(conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from('conversation_tags')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at')

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Apply a tag to a conversation.
 */
export async function applyTag(input: ConversationTagInput): Promise<void> {
  // Get tag definition to copy label and accountability
  const { data: tagDef } = await supabaseAdmin
    .from('tag_definitions')
    .select('label, dimension, accountability')
    .eq('slug', input.tagSlug)
    .or(`org_id.is.null,org_id.eq.${input.orgId}`)
    .single()

  if (!tagDef) throw new Error(`Tag '${input.tagSlug}' não encontrada`)

  const { error } = await supabaseAdmin
    .from('conversation_tags')
    .upsert(
      {
        conversation_id: input.conversationId,
        org_id: input.orgId,
        tag_slug: input.tagSlug,
        tag_label: tagDef.label,
        dimension: tagDef.dimension,
        accountability: tagDef.accountability,
        tagged_by: input.taggedBy,
        tagged_by_ai: input.taggedByAi ?? false,
        ai_confidence: input.aiConfidence,
      },
      { onConflict: 'conversation_id,tag_slug' }
    )

  if (error) throw new Error(error.message)
}

/**
 * Remove a tag from a conversation.
 */
export async function removeTag(conversationId: string, tagSlug: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('conversation_tags')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('tag_slug', tagSlug)

  if (error) throw new Error(error.message)
}

/**
 * Create a custom tag for an org.
 */
export async function createCustomTag(
  orgId: string,
  data: {
    slug: string
    label: string
    dimension: string
    accountability?: string
    color?: string
    emoji?: string
  }
): Promise<void> {
  // Sanitize slug
  const slug = data.slug
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50)

  const { error } = await supabaseAdmin.from('tag_definitions').insert({
    org_id: orgId,
    slug,
    label: data.label,
    dimension: data.dimension,
    accountability: data.accountability,
    color: data.color || '#6B7280',
    emoji: data.emoji,
  })

  if (error) throw new Error(error.message)
}

/**
 * Calculate lead quality score based on conversation data.
 * Returns 0-100 score + factors breakdown.
 */
export async function calculateLeadScore(
  conversationId: string
): Promise<{ score: number; factors: Record<string, unknown> }> {
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('sender_type, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('is_internal_note', false)
    .order('created_at', { ascending: true })

  if (!messages || messages.length === 0) {
    return { score: 0, factors: { message_count: 0 } }
  }

  const contactMessages = messages.filter((m) => m.sender_type === 'contact')
  const agentMessages = messages.filter((m) => m.sender_type === 'agent' || m.sender_type === 'ai')

  // Factor 1: Message count from contact (engagement)
  const msgCount = contactMessages.length
  const msgScore = Math.min(msgCount * 8, 30) // max 30 points

  // Factor 2: Keywords indicating high intent
  const allContactText = contactMessages
    .map((m) => (m.content || '').toLowerCase())
    .join(' ')

  const highIntentKeywords = [
    'quanto', 'preço', 'valor', 'custa', 'pagamento', 'comprar',
    'quero', 'preciso', 'urgente', 'hoje', 'agora', 'logo',
    'parcela', 'cartão', 'pix', 'boleto'
  ]
  const matchedKeywords = highIntentKeywords.filter((k) => allContactText.includes(k))
  const keywordScore = Math.min(matchedKeywords.length * 5, 25) // max 25 points

  // Factor 3: Response speed (how fast the lead responds)
  let responseSpeedScore = 0
  if (contactMessages.length >= 2) {
    const gaps: number[] = []
    for (let i = 1; i < contactMessages.length; i++) {
      const prev = new Date(contactMessages[i - 1].created_at).getTime()
      const curr = new Date(contactMessages[i].created_at).getTime()
      gaps.push((curr - prev) / 1000 / 60) // minutes
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
    if (avgGap < 5) responseSpeedScore = 20
    else if (avgGap < 15) responseSpeedScore = 15
    else if (avgGap < 60) responseSpeedScore = 10
    else responseSpeedScore = 5
  }

  // Factor 4: Conversation length (depth of engagement)
  const totalMessages = messages.length
  const depthScore = Math.min(totalMessages * 3, 15) // max 15 points

  // Factor 5: Agent response time (customer experience)
  let serviceScore = 10 // default
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('first_response_at, created_at')
    .eq('id', conversationId)
    .single()

  if (conv?.first_response_at && conv?.created_at) {
    const waitSecs =
      (new Date(conv.first_response_at).getTime() - new Date(conv.created_at).getTime()) / 1000
    if (waitSecs < 300) serviceScore = 10      // < 5 min
    else if (waitSecs < 900) serviceScore = 7  // < 15 min
    else if (waitSecs < 3600) serviceScore = 4 // < 1h
    else serviceScore = 0
  }

  const total = Math.min(msgScore + keywordScore + responseSpeedScore + depthScore + serviceScore, 100)

  const factors = {
    message_count: msgCount,
    matched_keywords: matchedKeywords,
    avg_response_gap_minutes: null as number | null,
    total_messages: totalMessages,
    factors_breakdown: {
      engagement: msgScore,
      intent_keywords: keywordScore,
      lead_responsiveness: responseSpeedScore,
      conversation_depth: depthScore,
      service_speed: serviceScore,
    },
  }

  return { score: Math.round(total), factors }
}

/**
 * Update lead score on conversation.
 */
export async function updateConversationLeadScore(conversationId: string): Promise<void> {
  const { score, factors } = await calculateLeadScore(conversationId)

  await supabaseAdmin
    .from('conversations')
    .update({
      lead_score: score,
      lead_score_factors: factors,
      lead_scored_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}

/**
 * Suggest tags for a conversation using Claude.
 * Called after conversation is closed to pre-fill the tag picker.
 */
export async function suggestTags(
  conversationId: string,
  orgId: string,
  outcome: string
): Promise<TagSuggestion[]> {
  // Fetch conversation + messages
  const [{ data: messages }, availableTags] = await Promise.all([
    supabaseAdmin
      .from('messages')
      .select('sender_type, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('is_internal_note', false)
      .order('created_at', { ascending: true })
      .limit(100),
    getAvailableTags(orgId),
  ])

  if (!messages || messages.length < 2) return []

  const transcript = messages
    .filter((m) => m.content?.trim())
    .map((m) => {
      const role = m.sender_type === 'contact' ? 'CLIENTE' : 'ATENDENTE'
      return `[${role}]: ${m.content}`
    })
    .join('\n')

  // Build tag list for the prompt
  const tagsByDimension = availableTags.reduce<Record<string, typeof availableTags>>((acc, tag) => {
    if (!acc[tag.dimension]) acc[tag.dimension] = []
    acc[tag.dimension].push(tag)
    return acc
  }, {})

  const tagListText = Object.entries(tagsByDimension)
    .map(([dim, tags]) => {
      const dimLabel = {
        service_type: 'Tipo de Atendimento',
        lead_quality: 'Qualidade do Lead',
        loss_reason: 'Motivo da Perda',
        win_reason: 'Motivo do Fechamento',
      }[dim] || dim
      return `${dimLabel}:\n${tags.map((t) => `  ${t.slug} → "${t.label}"`).join('\n')}`
    })
    .join('\n\n')

  const prompt = `Analise a conversa abaixo e sugira tags para classificá-la. Resultado: ${outcome.toUpperCase()}

TAGS DISPONÍVEIS:
${tagListText}

CONVERSA:
${transcript}

Responda APENAS com JSON válido (sem markdown):
[
  {
    "slug": "tag_slug",
    "reasoning": "Por que esta tag se aplica (1 frase)",
    "confidence": 0.0 a 1.0
  }
]

Regras:
- Máximo 1 tag de cada dimensão (service_type, lead_quality, e loss_reason OU win_reason)
- Para conversas convertidas: use win_reason (não loss_reason)
- Para conversas perdidas: use loss_reason (não win_reason) e seja preciso sobre accountability
- Só sugira se confidence >= 0.6
- Prefira tags específicas às genéricas`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const suggestions: Array<{ slug: string; reasoning: string; confidence: number }> =
      JSON.parse(clean)

    // Enrich with tag definition data
    return suggestions
      .filter((s) => s.confidence >= 0.6)
      .map((s) => {
        const def = availableTags.find((t) => t.slug === s.slug)
        if (!def) return null
        return {
          slug: s.slug,
          label: def.label,
          dimension: def.dimension,
          accountability: def.accountability,
          confidence: s.confidence,
          reasoning: s.reasoning,
        } as TagSuggestion
      })
      .filter(Boolean) as TagSuggestion[]
  } catch {
    return []
  }
}

/**
 * Get accountability breakdown for a campaign/channel.
 * The core "whose fault?" analytics.
 */
export async function getAccountabilityBreakdown(
  orgId: string,
  options: {
    startDate?: string
    endDate?: string
    channel?: string
    campaignId?: string
  }
): Promise<{
  marketing: { count: number; rate: number; topReasons: string[] }
  sales: { count: number; rate: number; topReasons: string[] }
  market: { count: number; rate: number; topReasons: string[] }
  total_tagged_lost: number
}> {
  let query = supabaseAdmin
    .from('conversation_tags')
    .select(`
      tag_slug, tag_label, accountability, dimension,
      conversations!inner(org_id, outcome, attr_channel, attr_campaign_id, outcome_at)
    `)
    .eq('conversations.org_id', orgId)
    .eq('conversations.outcome', 'lost')
    .eq('dimension', 'loss_reason')
    .not('accountability', 'is', null)

  if (options.startDate) {
    query = query.gte('conversations.outcome_at', options.startDate)
  }
  if (options.endDate) {
    query = query.lte('conversations.outcome_at', options.endDate)
  }
  if (options.channel) {
    query = query.eq('conversations.attr_channel', options.channel)
  }
  if (options.campaignId) {
    query = query.eq('conversations.attr_campaign_id', options.campaignId)
  }

  const { data } = await query

  const rows = (data || []) as Array<{
    tag_slug: string
    tag_label: string
    accountability: string
  }>

  const byAccountability = rows.reduce<Record<string, { count: number; reasons: Record<string, number> }>>(
    (acc, row) => {
      const key = row.accountability
      if (!acc[key]) acc[key] = { count: 0, reasons: {} }
      acc[key].count++
      acc[key].reasons[row.tag_label] = (acc[key].reasons[row.tag_label] || 0) + 1
      return acc
    },
    {}
  )

  const total = rows.length

  const build = (key: string) => {
    const data = byAccountability[key] || { count: 0, reasons: {} }
    const topReasons = Object.entries(data.reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label]) => label)
    return {
      count: data.count,
      rate: total > 0 ? Math.round((data.count / total) * 1000) / 10 : 0,
      topReasons,
    }
  }

  return {
    marketing: build('marketing'),
    sales: build('sales'),
    market: build('market'),
    total_tagged_lost: total,
  }
}
