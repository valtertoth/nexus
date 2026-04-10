import { supabaseAdmin } from '../lib/supabase.js'
import { analyzeConversation } from './conversation_intelligence.service.js'
import { updateContactLifetimeStats } from './ecosystem.service.js'
import type { ConversationOutcome, ConversionEventInsert } from '@nexus/shared'

export interface RecordOutcomeParams {
  conversationId: string
  orgId: string
  userId: string
  outcome: ConversationOutcome
  value?: number
  currency?: string
  reason?: string
  product?: string
}

/**
 * Record conversation outcome (converted/lost/problem).
 * Creates a conversion event if converted, triggers intelligence analysis.
 */
export async function recordOutcome(params: RecordOutcomeParams): Promise<void> {
  const { conversationId, orgId, userId, outcome, value, currency = 'BRL', reason, product } = params

  // 1. Update conversation outcome
  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .update({
      outcome,
      outcome_value: value,
      outcome_currency: currency,
      outcome_reason: reason,
      outcome_product: product,
      outcome_at: new Date().toISOString(),
      outcome_by: userId,
      status: outcome === 'converted' ? 'resolved' : 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .select('id, contact_id, attr_source, attr_medium, attr_campaign, attr_campaign_id, attr_ad_id, attr_channel')
    .single()

  if (error || !conversation) {
    throw new Error(`Failed to record outcome: ${error?.message || 'conversation not found'}`)
  }

  // 2. If converted — create conversion event for CAPI
  if (outcome === 'converted') {
    await createConversionEvent({
      orgId,
      conversationId,
      contactId: conversation.contact_id,
      value,
      currency,
      productName: product,
      attrSource: conversation.attr_source,
      attrMedium: conversation.attr_medium,
      attrCampaign: conversation.attr_campaign,
      attrCampaignId: conversation.attr_campaign_id,
      attrAdId: conversation.attr_ad_id,
      attrChannel: conversation.attr_channel,
    })
  }

  // 3. Update contact lifetime stats
  setImmediate(() => {
    updateContactLifetimeStats(conversation.contact_id, outcome, value ?? null).catch((err) => {
      console.error('[Conversion] Contact stats update failed:', err)
    })
  })

  // 4. Trigger intelligence analysis in background
  setImmediate(() => {
    analyzeConversation(conversationId).catch((err) => {
      console.error('[Conversion] Intelligence analysis failed:', err)
    })
  })

  console.log(`[Conversion] Outcome recorded: ${outcome} for conversation ${conversationId}`)
}

interface CreateConversionEventParams {
  orgId: string
  conversationId: string
  contactId: string
  value?: number
  currency?: string
  productName?: string
  attrSource?: string | null
  attrMedium?: string | null
  attrCampaign?: string | null
  attrCampaignId?: string | null
  attrAdId?: string | null
  attrChannel?: string | null
}

async function createConversionEvent(params: CreateConversionEventParams): Promise<string | null> {
  // Fetch contact data for CAPI matching
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('wa_id, phone, email, fbc, fbp, gclid')
    .eq('id', params.contactId)
    .single()

  const eventData: ConversionEventInsert = {
    org_id: params.orgId,
    conversation_id: params.conversationId,
    contact_id: params.contactId,
    event_type: 'Purchase',
    value: params.value,
    currency: params.currency || 'BRL',
    product_name: params.productName,
    attr_source: params.attrSource ?? undefined,
    attr_medium: params.attrMedium ?? undefined,
    attr_campaign: params.attrCampaign ?? undefined,
    attr_campaign_id: params.attrCampaignId ?? undefined,
    attr_ad_id: params.attrAdId ?? undefined,
    attr_channel: params.attrChannel ?? undefined,
    contact_wa_id: contact?.wa_id,
    contact_phone: contact?.phone ?? undefined,
    contact_email: contact?.email ?? undefined,
    // Click IDs for CAPI attribution (EMQ 8+)
    attr_fbc: (contact as any)?.fbc ?? undefined,
    attr_fbp: (contact as any)?.fbp ?? undefined,
    attr_gclid: (contact as any)?.gclid ?? undefined,
  }

  const { data, error } = await supabaseAdmin
    .from('conversion_events')
    .insert(eventData)
    .select('id')
    .single()

  if (error) {
    console.error('[Conversion] Failed to create conversion event:', error.message)
    return null
  }

  // Determine which CAPI integrations are applicable
  await markCAPIStatus(data.id, params.attrSource, params.attrChannel)

  return data.id
}

/**
 * Mark which CAPI platforms are applicable based on attribution.
 * If the lead came from Meta → meta_status = pending (will be sent)
 * If from Google → google_status = pending
 * Otherwise → not_applicable
 */
async function markCAPIStatus(
  eventId: string,
  attrSource?: string | null,
  attrChannel?: string | null
): Promise<void> {
  const source = (attrSource || '').toLowerCase()
  const channel = (attrChannel || '').toLowerCase()

  const isMetaLead = channel === 'meta_paid' || source.includes('facebook') || source.includes('instagram') || source.includes('meta')
  const isGoogleLead = channel === 'google_paid' || source.includes('google')

  await supabaseAdmin
    .from('conversion_events')
    .update({
      meta_status: isMetaLead ? 'pending' : 'not_applicable',
      google_status: isGoogleLead ? 'pending' : 'not_applicable',
    })
    .eq('id', eventId)
}

/**
 * Get pending conversion events for a specific CAPI platform.
 * Called by Intelligence platform to fetch conversions to report.
 */
export async function getPendingConversions(
  orgId: string,
  platform: 'meta' | 'google',
  limit = 50
): Promise<Array<{
  id: string
  event_type: string
  value: number | null
  currency: string
  product_name: string | null
  attr_source: string | null
  attr_medium: string | null
  attr_campaign: string | null
  attr_campaign_id: string | null
  attr_ad_id: string | null
  attr_channel: string | null
  contact_wa_id: string | null
  contact_phone: string | null
  contact_email: string | null
  created_at: string
}>> {
  const statusField = platform === 'meta' ? 'meta_status' : 'google_status'

  const { data } = await supabaseAdmin
    .from('conversion_events')
    .select(
      'id, event_type, value, currency, product_name, attr_source, attr_medium, attr_campaign, attr_campaign_id, attr_ad_id, attr_channel, contact_wa_id, contact_phone, contact_email, attr_fbc, attr_fbp, attr_gclid, created_at'
    )
    .eq('org_id', orgId)
    .eq(statusField, 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  return (data || []) as Array<{
    id: string
    event_type: string
    value: number | null
    currency: string
    product_name: string | null
    attr_source: string | null
    attr_medium: string | null
    attr_campaign: string | null
    attr_campaign_id: string | null
    attr_ad_id: string | null
    attr_channel: string | null
    contact_wa_id: string | null
    contact_phone: string | null
    contact_email: string | null
    created_at: string
  }>
}

/**
 * Mark conversion events as sent (called by Intelligence after CAPI submission).
 */
export async function markConversionSent(
  eventIds: string[],
  platform: 'meta' | 'google',
  results: Array<{ id: string; success: boolean; eventId?: string; error?: string }>
): Promise<void> {
  const now = new Date().toISOString()

  for (const result of results) {
    const update =
      platform === 'meta'
        ? {
            meta_status: result.success ? 'sent' : 'failed',
            meta_sent_at: result.success ? now : undefined,
            meta_event_id: result.eventId,
            meta_error: result.error,
          }
        : {
            google_status: result.success ? 'sent' : 'failed',
            google_sent_at: result.success ? now : undefined,
            google_error: result.error,
          }

    await supabaseAdmin
      .from('conversion_events')
      .update(update)
      .eq('id', result.id)
  }
}

/**
 * Get conversion analytics summary (for dashboard).
 */
export async function getConversionSummary(
  orgId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  total: number
  converted: number
  lost: number
  problem: number
  revenue: number
  conversionRate: number
  byChannel: Array<{ channel: string; conversions: number; revenue: number; rate: number }>
}> {
  let query = supabaseAdmin
    .from('conversations')
    .select('outcome, outcome_value, attr_channel')
    .eq('org_id', orgId)
    .not('outcome', 'is', null)

  if (startDate) query = query.gte('outcome_at', startDate)
  if (endDate) query = query.lte('outcome_at', endDate)

  const { data } = await query

  if (!data || data.length === 0) {
    return { total: 0, converted: 0, lost: 0, problem: 0, revenue: 0, conversionRate: 0, byChannel: [] }
  }

  const total = data.length
  const converted = data.filter((d) => d.outcome === 'converted').length
  const lost = data.filter((d) => d.outcome === 'lost').length
  const problem = data.filter((d) => d.outcome === 'problem').length
  const revenue = data
    .filter((d) => d.outcome === 'converted' && d.outcome_value)
    .reduce((sum, d) => sum + (d.outcome_value || 0), 0)

  // Group by channel
  const channelMap = new Map<string, { conversions: number; total: number; revenue: number }>()
  for (const row of data) {
    const channel = row.attr_channel || 'direct'
    const existing = channelMap.get(channel) || { conversions: 0, total: 0, revenue: 0 }
    existing.total++
    if (row.outcome === 'converted') {
      existing.conversions++
      existing.revenue += row.outcome_value || 0
    }
    channelMap.set(channel, existing)
  }

  const byChannel = Array.from(channelMap.entries()).map(([channel, stats]) => ({
    channel,
    conversions: stats.conversions,
    revenue: stats.revenue,
    rate: stats.total > 0 ? Math.round((stats.conversions / stats.total) * 1000) / 10 : 0,
  }))

  return {
    total,
    converted,
    lost,
    problem,
    revenue,
    conversionRate: total > 0 ? Math.round((converted / total) * 1000) / 10 : 0,
    byChannel,
  }
}
