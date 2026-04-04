import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireUUID, requireString } from '../lib/validate.js'
import { syncProducts, searchProducts, listProducts, getProduct } from '../services/shopify.service.js'
import { createQuote, getQuote, updateQuote, formatQuoteAsText } from '../services/quote.service.js'

type AuthVars = { Variables: { userId: string; orgId: string; userRole: string } }

const quotes = new Hono<AuthVars>()

quotes.use('*', authMiddleware)
quotes.use('*', apiRateLimit)

// ─── Shopify Products ───────────────────────────────────────────────

// POST /api/quotes/shopify/sync — Sync products from Shopify
quotes.post('/shopify/sync', async (c) => {
  const orgId = c.get('orgId')

  try {
    const result = await syncProducts(orgId)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao sincronizar'
    return c.json({ error: message }, 500)
  }
})

// GET /api/quotes/shopify/products?q=search — Search or list products
quotes.get('/shopify/products', async (c) => {
  const orgId = c.get('orgId')
  const query = c.req.query('q')

  try {
    const products = query
      ? await searchProducts(orgId, query)
      : await listProducts(orgId)
    return c.json({ products })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar produtos'
    return c.json({ error: message }, 500)
  }
})

// GET /api/quotes/shopify/products/:id — Get single product detail
quotes.get('/shopify/products/:id', async (c) => {
  const orgId = c.get('orgId')
  const productId = c.req.param('id')

  try {
    const product = await getProduct(orgId, productId)
    if (!product) return c.json({ error: 'Produto não encontrado' }, 404)
    return c.json({ product })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar produto'
    return c.json({ error: message }, 500)
  }
})

// ─── Quote CRUD ─────────────────────────────────────────────────────

// POST /api/quotes — Create a new quote
quotes.post('/', async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const body = await c.req.json()

  requireUUID(body.conversationId, 'conversationId')
  requireUUID(body.contactId, 'contactId')

  try {
    const quote = await createQuote({
      orgId,
      conversationId: body.conversationId,
      contactId: body.contactId,
      items: body.items,
      discountType: body.discountType,
      discountValue: body.discountValue,
      paymentTerms: body.paymentTerms,
      notes: body.notes,
      sellerId: userId,
      sellerName: body.sellerName,
      validDays: body.validDays,
    })
    return c.json(quote, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar orçamento'
    return c.json({ error: message }, 500)
  }
})

// GET /api/quotes/:id — Get a quote
quotes.get('/:id', async (c) => {
  const orgId = c.get('orgId')
  const quoteId = requireUUID(c.req.param('id'), 'quoteId')

  try {
    const quote = await getQuote(quoteId, orgId)
    if (!quote) return c.json({ error: 'Orçamento não encontrado' }, 404)
    return c.json(quote)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar orçamento'
    return c.json({ error: message }, 500)
  }
})

// PATCH /api/quotes/:id — Update a quote
quotes.patch('/:id', async (c) => {
  const orgId = c.get('orgId')
  const quoteId = requireUUID(c.req.param('id'), 'quoteId')
  const body = await c.req.json()

  try {
    const quote = await updateQuote(quoteId, orgId, body)
    return c.json(quote)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar orçamento'
    return c.json({ error: message }, 500)
  }
})

// GET /api/quotes/:id/text — Get quote as formatted WhatsApp text
quotes.get('/:id/text', async (c) => {
  const orgId = c.get('orgId')
  const quoteId = requireUUID(c.req.param('id'), 'quoteId')

  try {
    const text = await formatQuoteAsText(quoteId, orgId)
    return c.json({ text })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao formatar orçamento'
    return c.json({ error: message }, 500)
  }
})

// GET /api/quotes — List quotes for org
quotes.get('/', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = c.req.query('conversation_id')
  const limit = parseInt(c.req.query('limit') || '50')

  let query = supabaseAdmin
    .from('quotes')
    .select('*, contacts(name, wa_id)')
    .eq('org_id', orgId)

  if (conversationId) {
    query = query.eq('conversation_id', conversationId)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ quotes: data })
})

// ─── Quote Settings ─────────────────────────────────────────────────

// GET /api/quotes/settings — Get quote settings
quotes.get('/settings/current', async (c) => {
  const orgId = c.get('orgId')

  const { data } = await supabaseAdmin
    .from('quote_settings')
    .select('*')
    .eq('org_id', orgId)
    .single()

  return c.json(data || { default_markup: 2.0, payment_options: ['PIX', 'Cartão', 'Boleto'] })
})

// PUT /api/quotes/settings — Update quote settings
quotes.put('/settings/current', async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json()

  const { data, error } = await supabaseAdmin
    .from('quote_settings')
    .upsert(
      {
        org_id: orgId,
        default_markup: body.default_markup,
        logo_url: body.logo_url,
        footer_text: body.footer_text,
        payment_options: body.payment_options,
        visible_fields: body.visible_fields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )
    .select()
    .single()

  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

// PUT /api/quotes/shopify/credentials — Save Shopify credentials
quotes.put('/shopify/credentials', async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json<{ domain: string; accessToken: string }>()

  requireString(body.domain, 'domain')
  requireString(body.accessToken, 'accessToken')

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({
      shopify_domain: body.domain,
      shopify_access_token: body.accessToken,
    })
    .eq('id', orgId)

  if (error) return c.json({ error: error.message }, 500)
  return c.json({ success: true })
})

export default quotes
