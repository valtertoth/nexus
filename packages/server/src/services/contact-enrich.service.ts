import { supabaseAdmin } from '../lib/supabase.js'

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirrored by the front-end ContactInfoPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────

export interface EnrichedShopifyOrder {
  name: string        // order name, e.g. "#1042"
  total: number       // numeric total
  currency: string    // e.g. "BRL"
  date: string | null // ISO created_at
  title: string | null // first line item title (best-effort)
}

export interface EnrichedShopify {
  linked: boolean
  customerId: number | null
  customerUrl: string | null
  /** Live data pulled from Shopify Admin API — null when unavailable */
  live: {
    name: string | null
    email: string | null
    tags: string[]
    ordersCount: number
    totalSpent: number
    lastOrders: EnrichedShopifyOrder[]
  } | null
  /** Set when we tried Shopify but it failed — panel stays alive */
  error?: string
}

export interface EnrichedContact {
  id: string
  name: string | null
  /** Best-available raw phone digits */
  phone: string | null
  /** E.164 form: +5511999999999 */
  phoneE164: string | null
  email: string | null
  tags: string[]
  // Value
  lifetimeValue: number | null
  totalRevenue: number | null
  totalConversations: number
  // Profile (IA)
  profile: {
    summary: string | null
    stage: string | null
    sentiment: string | null
    interests: string[]
    traits: string[]
    objections: string[]
  }
  // Origin / attribution
  origin: {
    source: string | null
    medium: string | null
    campaign: string | null
    channel: string | null
    adId: string | null
    hasAd: boolean
    hasAny: boolean
  }
  // Shopify — null only when the store is not configured for the org
  shopify: EnrichedShopify | null
  /** False when the org has no Shopify credentials at all */
  shopifyConfigured: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SHOPIFY_API_VERSION = '2024-10'

/** Normalize a phone-ish string to E.164 (+digits). Returns null when unusable. */
function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  return `+${digits}`
}

function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

/**
 * Coerce a value that may be a string[], JSON-encoded array, comma/newline text,
 * or null into a clean string[]. The profile_* columns store text[] but we stay
 * defensive since the DB shape has drifted over migrations.
 */
function toStringArray(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return []
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s)
        if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean)
      } catch { /* fall through */ }
    }
    return s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)
  }
  return []
}

/**
 * Resolve + decrypt the org's Shopify credentials.
 * Returns null when the org has none configured (panel still works, local-only).
 */
async function getShopifyCredentials(
  orgId: string,
): Promise<{ domain: string; token: string } | null> {
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('shopify_domain, shopify_access_token_encrypted')
    .eq('id', orgId)
    .single()

  if (!org?.shopify_domain || !org?.shopify_access_token_encrypted) return null

  const { data: decrypted, error } = await supabaseAdmin.rpc('decrypt_shopify_token', {
    encrypted: org.shopify_access_token_encrypted,
  })

  if (error || !decrypted) return null

  const domain = String(org.shopify_domain).replace(/^https?:\/\//, '').replace(/\/$/, '')
  return { domain, token: decrypted as string }
}

interface ShopifyCustomerApi {
  id: number
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  tags?: string | null
  orders_count?: number
  total_spent?: string
}

interface ShopifyOrderApi {
  name?: string
  total_price?: string
  currency?: string
  created_at?: string
  line_items?: Array<{ title?: string }>
}

async function shopifyFetch<T>(
  domain: string,
  token: string,
  path: string,
): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/${path}`, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function customerUrl(domain: string, id: number): string {
  return `https://${domain}/admin/customers/${id}`
}

function mapLastOrders(orders: ShopifyOrderApi[]): EnrichedShopifyOrder[] {
  return orders.slice(0, 5).map((o) => ({
    name: o.name || '#—',
    total: toNum(o.total_price) ?? 0,
    currency: o.currency || 'BRL',
    date: o.created_at || null,
    title: o.line_items?.[0]?.title || null,
  }))
}

/** Fetch live customer + last orders for a known Shopify customer id. */
async function fetchShopifyLive(
  domain: string,
  token: string,
  customerId: number,
): Promise<EnrichedShopify['live']> {
  const custRes = await shopifyFetch<{ customer: ShopifyCustomerApi }>(
    domain,
    token,
    `customers/${customerId}.json`,
  )
  const cust = custRes?.customer
  if (!cust) return null

  const ordersRes = await shopifyFetch<{ orders: ShopifyOrderApi[] }>(
    domain,
    token,
    `customers/${customerId}/orders.json?status=any&limit=5&order=created_at+desc`,
  )

  const fullName = `${cust.first_name || ''} ${cust.last_name || ''}`.trim()
  return {
    name: fullName || null,
    email: cust.email || null,
    tags: cust.tags ? cust.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    ordersCount: cust.orders_count ?? 0,
    totalSpent: toNum(cust.total_spent) ?? 0,
    lastOrders: mapLastOrders(ordersRes?.orders || []),
  }
}

/**
 * Try to match this contact to a Shopify customer by phone (E.164 + BR variants).
 * On a hit, persists shopify_customer_id/url onto the contact (idempotent).
 * Returns the matched customer id, or null.
 */
async function matchShopifyByPhone(
  domain: string,
  token: string,
  contactId: string,
  orgId: string,
  phone: string,
): Promise<number | null> {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null

  const queries = [digits]
  if (digits.startsWith('55') && digits.length >= 12) queries.push(digits.slice(2))

  for (const q of queries) {
    const res = await shopifyFetch<{ customers: ShopifyCustomerApi[] }>(
      domain,
      token,
      `customers/search.json?query=phone:${encodeURIComponent(q)}&limit=1`,
    )
    const match = res?.customers?.[0]
    if (match?.id) {
      // Idempotent persist — only writes the link, safe to repeat.
      await supabaseAdmin
        .from('contacts')
        .update({
          shopify_customer_id: match.id,
          shopify_customer_url: customerUrl(domain, match.id),
        })
        .eq('id', contactId)
        .eq('org_id', orgId)
      return match.id
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the enriched view of a contact: local DB fields + (best-effort) live
 * Shopify data. Shopify failures never bubble up — the panel always renders
 * the local data.
 */
export async function enrichContact(
  orgId: string,
  contactId: string,
): Promise<EnrichedContact | null> {
  // Untyped admin client → rows come back loose; read defensively.
  const { data: row, error } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .single()

  if (error || !row) return null

  const c = row as Record<string, unknown>

  const phoneRaw = toStr(c.phone) || toStr(c.wa_id)
  const phoneE164 = toE164(phoneRaw)

  // total_conversations may be stale/absent — fall back to a live count.
  let totalConversations = toNum(c.total_conversations) ?? 0
  if (!totalConversations) {
    const { count } = await supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', contactId)
      .eq('org_id', orgId)
    totalConversations = count || 0
  }

  const origin = {
    source: toStr(c.utm_source),
    medium: toStr(c.utm_medium),
    campaign: toStr(c.utm_campaign),
    channel: toStr(c.utm_channel),
    adId: toStr(c.utm_ad_id),
    hasAd: !!(c.utm_ad_id || c.fbc || c.gclid),
    hasAny: !!(c.utm_source || c.utm_medium || c.utm_campaign || c.utm_ad_id || c.fbc || c.gclid),
  }

  const enriched: EnrichedContact = {
    id: String(c.id),
    name: toStr(c.name),
    phone: phoneRaw,
    phoneE164,
    email: toStr(c.email),
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
    lifetimeValue: toNum(c.lifetime_value),
    totalRevenue: toNum(c.total_revenue),
    totalConversations,
    profile: {
      summary: toStr(c.profile_summary),
      stage: toStr(c.profile_stage),
      sentiment: toStr(c.profile_sentiment),
      interests: toStringArray(c.profile_interests),
      traits: toStringArray(c.profile_traits),
      objections: toStringArray(c.profile_objections),
    },
    origin,
    shopify: null,
    shopifyConfigured: false,
  }

  // ─── Shopify bridge (fail-safe) ────────────────────────────────────────────
  const creds = await getShopifyCredentials(orgId)
  if (!creds) {
    return enriched // local-only; shopifyConfigured stays false
  }

  enriched.shopifyConfigured = true

  try {
    let customerId = toNum(c.shopify_customer_id)
    let custUrl = toStr(c.shopify_customer_url)

    // Not linked yet → try matching by phone and persist the link.
    if (!customerId && phoneE164) {
      const matched = await matchShopifyByPhone(
        creds.domain,
        creds.token,
        contactId,
        orgId,
        phoneE164,
      )
      if (matched) {
        customerId = matched
        custUrl = customerUrl(creds.domain, matched)
      }
    }

    if (!customerId) {
      enriched.shopify = { linked: false, customerId: null, customerUrl: null, live: null }
      return enriched
    }

    const live = await fetchShopifyLive(creds.domain, creds.token, customerId)
    enriched.shopify = {
      linked: true,
      customerId,
      customerUrl: custUrl || customerUrl(creds.domain, customerId),
      live,
    }
  } catch (err) {
    console.error('[contact-enrich] Shopify enrichment failed:', err)
    enriched.shopify = {
      linked: !!toNum(c.shopify_customer_id),
      customerId: toNum(c.shopify_customer_id),
      customerUrl: toStr(c.shopify_customer_url),
      live: null,
      error: 'Falha ao consultar o Shopify',
    }
  }

  return enriched
}
