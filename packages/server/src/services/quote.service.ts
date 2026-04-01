import { supabaseAdmin } from '../lib/supabase.js'

interface QuoteItem {
  product_id: string
  title: string
  image_url?: string
  cost_price: number
  markup: number
  sale_price: number
  quantity: number
  subtotal: number
}

interface CreateQuoteInput {
  orgId: string
  conversationId?: string
  contactId?: string
  items: QuoteItem[]
  discountType?: 'fixed' | 'percentage'
  discountValue?: number
  paymentTerms?: string
  notes?: string
  sellerId?: string
  sellerName?: string
  validDays?: number
}

/**
 * Create a new quote.
 */
export async function createQuote(input: CreateQuoteInput) {
  const subtotal = input.items.reduce((sum, item) => sum + item.subtotal, 0)

  let discountAmount = 0
  if (input.discountType === 'fixed') {
    discountAmount = input.discountValue || 0
  } else if (input.discountType === 'percentage') {
    discountAmount = subtotal * ((input.discountValue || 0) / 100)
  }

  const total = Math.max(0, subtotal - discountAmount)

  const validUntil = input.validDays
    ? new Date(Date.now() + input.validDays * 86400000).toISOString().split('T')[0]
    : null

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .insert({
      org_id: input.orgId,
      conversation_id: input.conversationId || null,
      contact_id: input.contactId || null,
      items: input.items,
      subtotal,
      discount_type: input.discountType || null,
      discount_value: input.discountValue || 0,
      total,
      payment_terms: input.paymentTerms || null,
      notes: input.notes || null,
      seller_id: input.sellerId || null,
      seller_name: input.sellerName || null,
      valid_until: validUntil,
      status: 'draft',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Get a quote by ID.
 */
export async function getQuote(quoteId: string, orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('quotes')
    .select('*, contacts(name, wa_id, phone, email)')
    .eq('id', quoteId)
    .eq('org_id', orgId)
    .single()

  if (error) throw error
  return data
}

/**
 * Update a quote.
 */
export async function updateQuote(
  quoteId: string,
  orgId: string,
  updates: Partial<{
    items: QuoteItem[]
    discountType: 'fixed' | 'percentage'
    discountValue: number
    paymentTerms: string
    notes: string
    status: string
    validDays: number
  }>
) {
  const current = await getQuote(quoteId, orgId)
  if (!current) throw new Error('Orçamento não encontrado')

  const items = updates.items || (current.items as QuoteItem[])
  const subtotal = items.reduce((sum: number, item: QuoteItem) => sum + item.subtotal, 0)

  const discountType = updates.discountType || current.discount_type
  const discountValue = updates.discountValue ?? current.discount_value ?? 0

  let discountAmount = 0
  if (discountType === 'fixed') {
    discountAmount = discountValue
  } else if (discountType === 'percentage') {
    discountAmount = subtotal * (discountValue / 100)
  }

  const total = Math.max(0, subtotal - discountAmount)

  const validUntil = updates.validDays
    ? new Date(Date.now() + updates.validDays * 86400000).toISOString().split('T')[0]
    : current.valid_until

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .update({
      items,
      subtotal,
      discount_type: discountType,
      discount_value: discountValue,
      total,
      payment_terms: updates.paymentTerms ?? current.payment_terms,
      notes: updates.notes ?? current.notes,
      status: updates.status ?? current.status,
      valid_until: validUntil,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Format a quote as WhatsApp-friendly text.
 */
export async function formatQuoteAsText(quoteId: string, orgId: string): Promise<string> {
  const quote = await getQuote(quoteId, orgId)
  if (!quote) throw new Error('Orçamento não encontrado')

  // Get org info for branding
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()

  // Get quote settings
  const { data: settings } = await supabaseAdmin
    .from('quote_settings')
    .select('footer_text')
    .eq('org_id', orgId)
    .single()

  const items = quote.items as QuoteItem[]
  const contactName = quote.contacts?.name || 'Cliente'
  const dateStr = new Date(quote.created_at).toLocaleDateString('pt-BR')

  let text = `*ORÇAMENTO #${String(quote.quote_number).padStart(4, '0')}*\n`
  text += `${org?.name || 'Empresa'}\n`
  text += `━━━━━━━━━━━━━━━━━━━\n`
  text += `Cliente: ${contactName}\n`
  text += `Data: ${dateStr}`
  if (quote.seller_name) text += ` | Vendedor: ${quote.seller_name}`
  text += `\n\n`

  // Items
  for (const item of items) {
    const itemTotal = formatBRL(item.subtotal)
    text += `${item.quantity}x ${item.title} — ${itemTotal}\n`
  }

  text += `\n━━━━━━━━━━━━━━━━━━━\n`
  text += `Subtotal: ${formatBRL(quote.subtotal)}\n`

  if (quote.discount_value && quote.discount_value > 0) {
    const discountLabel = quote.discount_type === 'percentage'
      ? `${quote.discount_value}%`
      : formatBRL(quote.discount_value)
    text += `Desconto: -${discountLabel}\n`
  }

  text += `*TOTAL: ${formatBRL(quote.total)}*\n`

  if (quote.payment_terms) {
    text += `\nPagamento: ${quote.payment_terms}\n`
  }

  if (quote.valid_until) {
    const validStr = new Date(quote.valid_until).toLocaleDateString('pt-BR')
    text += `Válido até: ${validStr}\n`
  }

  if (quote.notes) {
    text += `\nObs: ${quote.notes}\n`
  }

  if (settings?.footer_text) {
    text += `\n_${settings.footer_text}_`
  }

  return text
}

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
