import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireUUID } from '../lib/validate.js'

type AuthVars = { Variables: { userId: string; orgId: string; userRole: string } }

const contacts = new Hono<AuthVars>()

contacts.use('*', authMiddleware)
contacts.use('*', apiRateLimit)

// GET /api/contacts — List contacts for the org
contacts.get('/', async (c) => {
  const orgId = c.get('orgId')
  const search = c.req.query('search')?.trim()
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200)
  const offset = parseInt(c.req.query('offset') || '0', 10)

  let query = supabaseAdmin
    .from('contacts')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(`name.ilike.%${search}%,wa_id.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error, count } = await query

  if (error) {
    return c.json({ error: 'Erro ao buscar contatos' }, 500)
  }

  return c.json({ contacts: data || [], total: count || 0 })
})

// GET /api/contacts/:id — Get a single contact with conversation history
contacts.get('/:id', async (c) => {
  const orgId = c.get('orgId')
  const contactId = requireUUID(c.req.param('id'), 'id')

  const { data: contact, error } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .single()

  if (error || !contact) {
    return c.json({ error: 'Contato nao encontrado' }, 404)
  }

  // Fetch conversation summary
  const { data: conversations } = await supabaseAdmin
    .from('conversations')
    .select('id, status, outcome, outcome_value, created_at, resolved_at, last_message_at, last_message_preview, sector_id')
    .eq('contact_id', contactId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20)

  return c.json({ contact, conversations: conversations || [] })
})

// PATCH /api/contacts/:id — Update contact fields
contacts.patch('/:id', async (c) => {
  const orgId = c.get('orgId')
  const contactId = requireUUID(c.req.param('id'), 'id')

  const body = await c.req.json<{
    name?: string
    email?: string
    phone?: string
    tags?: string[]
    notes?: string
    shopify_customer_id?: number
    shopify_customer_url?: string
  }>()

  // Build update payload — only include fields that were sent
  const updatePayload: Record<string, unknown> = {}
  if (body.name !== undefined) updatePayload.name = body.name
  if (body.email !== undefined) updatePayload.email = body.email
  if (body.phone !== undefined) updatePayload.phone = body.phone
  if (body.tags !== undefined) updatePayload.tags = body.tags
  if (body.notes !== undefined) {
    const { data: existing } = await supabaseAdmin
      .from('contacts')
      .select('metadata')
      .eq('id', contactId)
      .eq('org_id', orgId)
      .single()

    const currentMeta = (existing?.metadata as Record<string, unknown>) || {}
    updatePayload.metadata = { ...currentMeta, notes: body.notes }
  }
  if (body.shopify_customer_id !== undefined) updatePayload.shopify_customer_id = body.shopify_customer_id
  if (body.shopify_customer_url !== undefined) updatePayload.shopify_customer_url = body.shopify_customer_url

  if (Object.keys(updatePayload).length === 0) {
    return c.json({ error: 'Nenhum campo para atualizar' }, 400)
  }

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .update(updatePayload)
    .eq('id', contactId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    return c.json({ error: `Erro ao atualizar contato: ${error.message}` }, 500)
  }

  return c.json({ contact: data })
})

// GET /api/contacts/:id/shopify — Lookup Shopify customer by phone
contacts.get('/:id/shopify', async (c) => {
  const orgId = c.get('orgId')
  const contactId = requireUUID(c.req.param('id'), 'id')

  // Get contact phone
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('wa_id, phone, name, email, shopify_customer_id')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .single()

  if (!contact) {
    return c.json({ error: 'Contato nao encontrado' }, 404)
  }

  // If already linked, return the existing ID
  if (contact.shopify_customer_id) {
    return c.json({
      linked: true,
      shopify_customer_id: contact.shopify_customer_id,
    })
  }

  // Get Shopify credentials from org
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('metadata')
    .eq('id', orgId)
    .single()

  const meta = org?.metadata as Record<string, unknown> | null
  const shopifyStore = meta?.shopify_store as string | undefined
  const shopifyToken = meta?.shopify_access_token as string | undefined

  if (!shopifyStore || !shopifyToken) {
    return c.json({ error: 'Shopify nao configurado para esta organizacao' }, 400)
  }

  // Search Shopify customers by phone
  const phone = contact.phone || contact.wa_id
  const normalizedPhone = phone.replace(/\D/g, '')

  // Try multiple phone formats for Brazilian numbers
  const searchQueries = [normalizedPhone]
  if (normalizedPhone.startsWith('55') && normalizedPhone.length >= 12) {
    // Also try without country code
    searchQueries.push(normalizedPhone.slice(2))
  }

  for (const query of searchQueries) {
    try {
      const url = `https://${shopifyStore}/admin/api/2024-10/customers/search.json?query=phone:${query}&limit=5`
      const res = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': shopifyToken,
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) continue

      const data = await res.json() as { customers?: Array<{ id: number; email: string; first_name: string; last_name: string; phone: string; orders_count: number; total_spent: string }> }
      const customers = data.customers || []

      if (customers.length > 0) {
        return c.json({
          linked: false,
          candidates: customers.map((cust) => ({
            id: cust.id,
            name: `${cust.first_name || ''} ${cust.last_name || ''}`.trim(),
            email: cust.email,
            phone: cust.phone,
            orders_count: cust.orders_count,
            total_spent: cust.total_spent,
            url: `https://${shopifyStore}/admin/customers/${cust.id}`,
          })),
        })
      }
    } catch (err) {
      console.error('[Contacts] Shopify search failed:', err)
    }
  }

  return c.json({ linked: false, candidates: [] })
})

// POST /api/contacts/:id/shopify/link — Link a Shopify customer to a contact
contacts.post('/:id/shopify/link', async (c) => {
  const orgId = c.get('orgId')
  const contactId = requireUUID(c.req.param('id'), 'id')

  const { shopifyCustomerId, shopifyCustomerUrl } = await c.req.json<{
    shopifyCustomerId: number
    shopifyCustomerUrl?: string
  }>()

  if (!shopifyCustomerId) {
    return c.json({ error: 'shopifyCustomerId obrigatorio' }, 400)
  }

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .update({
      shopify_customer_id: shopifyCustomerId,
      shopify_customer_url: shopifyCustomerUrl || null,
    })
    .eq('id', contactId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    return c.json({ error: `Erro ao vincular: ${error.message}` }, 500)
  }

  return c.json({ contact: data })
})

export default contacts
