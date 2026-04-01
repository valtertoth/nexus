import { supabaseAdmin } from '../lib/supabase.js'
import type { UtmChannel } from '@nexus/shared'

export interface UtmParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  utm_ad_id?: string
  utm_adset_id?: string
  utm_campaign_id?: string
  utm_channel?: UtmChannel
}

/**
 * Detect channel from utm_source + utm_medium combination.
 */
function detectChannel(params: UtmParams): UtmChannel {
  const source = (params.utm_source || '').toLowerCase()
  const medium = (params.utm_medium || '').toLowerCase()

  if (source.includes('facebook') || source.includes('instagram') || source.includes('meta')) {
    return 'meta_paid'
  }
  if (source.includes('google') || medium.includes('cpc') || medium.includes('ppc')) {
    return 'google_paid'
  }
  if (medium === 'organic' || medium === 'seo') {
    return 'organic'
  }
  if (source === 'whatsapp' || medium === 'whatsapp') {
    return 'whatsapp_direct'
  }
  if (!source && !medium) {
    return 'direct'
  }
  return 'other'
}

/**
 * Parse UTM parameters from a URL string embedded in WhatsApp message text.
 * WhatsApp Click-to-Chat links often include ?text=...&utm_source=...
 * Also parses from referrer URLs shared by the customer.
 */
export function parseUtmFromText(text: string): UtmParams | null {
  // Match any URL in the text
  const urlPattern = /https?:\/\/[^\s]+/gi
  const urls = text.match(urlPattern)

  if (!urls) return null

  for (const url of urls) {
    try {
      // Handle encoded URLs (common in WhatsApp click-to-chat)
      const decoded = decodeURIComponent(url)
      const urlObj = new URL(decoded)
      const params: UtmParams = {}

      const fields: (keyof UtmParams)[] = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
        'utm_term', 'utm_ad_id', 'utm_adset_id', 'utm_campaign_id'
      ]

      let hasUtm = false
      for (const field of fields) {
        const val = urlObj.searchParams.get(field)
        if (val) {
          (params as Record<string, string>)[field] = val
          hasUtm = true
        }
      }

      // Also check for fbclid (Meta), gclid (Google) as implicit attribution
      const fbclid = urlObj.searchParams.get('fbclid')
      const gclid = urlObj.searchParams.get('gclid')
      if (fbclid && !params.utm_source) {
        params.utm_source = 'facebook'
        params.utm_medium = 'paid'
        hasUtm = true
      }
      if (gclid && !params.utm_source) {
        params.utm_source = 'google'
        params.utm_medium = 'cpc'
        hasUtm = true
      }

      if (hasUtm) {
        params.utm_channel = detectChannel(params)
        return params
      }
    } catch {
      // Invalid URL, try next
    }
  }

  return null
}

/**
 * Parse UTM params from a structured object (e.g., from Intelligence API call).
 */
export function parseUtmFromObject(raw: Record<string, string>): UtmParams {
  const params: UtmParams = {}

  if (raw.utm_source) params.utm_source = raw.utm_source
  if (raw.utm_medium) params.utm_medium = raw.utm_medium
  if (raw.utm_campaign) params.utm_campaign = raw.utm_campaign
  if (raw.utm_content) params.utm_content = raw.utm_content
  if (raw.utm_term) params.utm_term = raw.utm_term
  if (raw.utm_ad_id) params.utm_ad_id = raw.utm_ad_id
  if (raw.utm_adset_id) params.utm_adset_id = raw.utm_adset_id
  if (raw.utm_campaign_id) params.utm_campaign_id = raw.utm_campaign_id

  params.utm_channel = detectChannel(params)
  return params
}

/**
 * Save UTM attribution to a contact — first-touch model.
 * Only saves if the contact has no existing attribution (utm_source IS NULL).
 */
export async function saveContactAttribution(
  contactId: string,
  params: UtmParams
): Promise<boolean> {
  // First-touch: only update if no attribution yet
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('utm_source, attributed_at')
    .eq('id', contactId)
    .single()

  if (!contact || contact.utm_source) {
    // Already attributed — first-touch model, skip
    return false
  }

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({
      ...params,
      attributed_at: new Date().toISOString(),
    })
    .eq('id', contactId)

  if (error) {
    console.error('[Attribution] Failed to save contact attribution:', error.message)
    return false
  }

  console.log(`[Attribution] Contact ${contactId} attributed to ${params.utm_source}/${params.utm_campaign}`)
  return true
}

/**
 * Copy UTM attribution from contact to conversation (attribution snapshot).
 * Called when conversation is created — snapshot is immutable after this.
 */
export async function copyAttributionToConversation(
  conversationId: string,
  contactId: string
): Promise<void> {
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('utm_source, utm_medium, utm_campaign, utm_campaign_id, utm_ad_id, utm_channel')
    .eq('id', contactId)
    .single()

  if (!contact || !contact.utm_source) return

  const { error } = await supabaseAdmin
    .from('conversations')
    .update({
      attr_source: contact.utm_source,
      attr_medium: contact.utm_medium,
      attr_campaign: contact.utm_campaign,
      attr_campaign_id: contact.utm_campaign_id,
      attr_ad_id: contact.utm_ad_id,
      attr_channel: contact.utm_channel,
    })
    .eq('id', conversationId)

  if (error) {
    console.error('[Attribution] Failed to copy attribution to conversation:', error.message)
  }
}

/**
 * Handle lead attribution from Intelligence platform.
 * Called via REST API when Intelligence detects a Click-to-WhatsApp lead.
 * Finds the contact by wa_id and saves attribution (first-touch).
 */
export async function receiveLeadAttribution(
  orgId: string,
  waId: string,
  params: UtmParams
): Promise<{ success: boolean; contactId?: string; alreadyAttributed?: boolean }> {
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, utm_source')
    .eq('org_id', orgId)
    .eq('wa_id', waId)
    .single()

  if (!contact) {
    // Contact hasn't messaged yet — store attribution in a pending table
    // For now, store as metadata; will be applied when contact first messages
    await supabaseAdmin
      .from('pending_attributions')
      .upsert({
        org_id: orgId,
        wa_id: waId,
        ...params,
        received_at: new Date().toISOString(),
      }, { onConflict: 'org_id,wa_id' })
      .throwOnError()

    return { success: true, alreadyAttributed: false }
  }

  if (contact.utm_source) {
    return { success: true, contactId: contact.id, alreadyAttributed: true }
  }

  const saved = await saveContactAttribution(contact.id, params)
  return { success: saved, contactId: contact.id, alreadyAttributed: !saved }
}

/**
 * Apply any pending attribution when a new contact first messages.
 * Called from webhook after upsertContact for new contacts.
 */
export async function applyPendingAttribution(
  orgId: string,
  waId: string,
  contactId: string
): Promise<void> {
  const { data: pending } = await supabaseAdmin
    .from('pending_attributions')
    .select('*')
    .eq('org_id', orgId)
    .eq('wa_id', waId)
    .single()

  if (!pending) return

  const params: UtmParams = {
    utm_source: pending.utm_source,
    utm_medium: pending.utm_medium,
    utm_campaign: pending.utm_campaign,
    utm_content: pending.utm_content,
    utm_term: pending.utm_term,
    utm_ad_id: pending.utm_ad_id,
    utm_adset_id: pending.utm_adset_id,
    utm_campaign_id: pending.utm_campaign_id,
    utm_channel: pending.utm_channel,
  }

  await saveContactAttribution(contactId, params)

  // Clean up pending
  await supabaseAdmin
    .from('pending_attributions')
    .delete()
    .eq('org_id', orgId)
    .eq('wa_id', waId)
}
