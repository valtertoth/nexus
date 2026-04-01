import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'

type AuthVars = { Variables: { userId: string; orgId: string } }

const brain = new Hono<AuthVars>()

brain.use('*', authMiddleware)
brain.use('*', apiRateLimit)

// GET /api/brain — List all directives for the org
brain.get('/', async (c) => {
  const orgId = c.get('orgId')

  const { data, error } = await supabaseAdmin
    .from('org_brain_directives')
    .select('*')
    .eq('org_id', orgId)
    .order('priority', { ascending: false })

  if (error) {
    return c.json({ error: 'Erro ao buscar diretrizes' }, 500)
  }

  return c.json({ directives: data || [] })
})

// GET /api/brain/categories — List available categories
brain.get('/categories', async (c) => {
  const categories = [
    { id: 'brand_identity', name: 'Identidade da Marca', description: 'Missao, visao, valores e tom de voz da empresa' },
    { id: 'sales_strategy', name: 'Estrategia de Vendas', description: 'Abordagem comercial, tecnicas de conversao e fechamento' },
    { id: 'customer_psychology', name: 'Psicologia do Cliente', description: 'Inteligencia emocional, perfis de comprador, gatilhos' },
    { id: 'communication_style', name: 'Comunicacao e Relacionamento', description: 'Estilo de comunicacao, rapport e habilidades sociais' },
    { id: 'leadership_mindset', name: 'Mentalidade e Crescimento', description: 'Mindset de crescimento, aprendizado continuo' },
    { id: 'productivity_habits', name: 'Habitos e Produtividade', description: 'Rotinas eficientes, gestao de tempo e prioridades' },
    { id: 'financial_mindset', name: 'Mentalidade Financeira', description: 'Percepção de valor, negociacao e precificacao' },
    { id: 'wellbeing_culture', name: 'Bem-Estar e Essencialismo', description: 'Foco no essencial, qualidade sobre quantidade' },
    { id: 'custom', name: 'Personalizado', description: 'Categoria definida pelo gestor' },
  ]

  return c.json({ categories })
})

// POST /api/brain — Create a new directive
brain.post('/', async (c) => {
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const body = await c.req.json<{
    category: string
    title: string
    description?: string
    content: string
    source_reference?: string
    priority?: number
    applies_to_sectors?: string[]
  }>()

  if (!body.category || !body.title || !body.content) {
    return c.json({ error: 'category, title e content sao obrigatorios' }, 400)
  }

  const { data, error } = await supabaseAdmin
    .from('org_brain_directives')
    .insert({
      org_id: orgId,
      category: body.category,
      title: body.title,
      description: body.description || null,
      content: body.content,
      source_reference: body.source_reference || null,
      priority: body.priority ?? 5,
      applies_to_sectors: body.applies_to_sectors || [],
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    return c.json({ error: `Erro ao criar diretriz: ${error.message}` }, 500)
  }

  return c.json({ directive: data }, 201)
})

// PUT /api/brain/:id — Update a directive
brain.put('/:id', async (c) => {
  const orgId = c.get('orgId')
  const id = c.req.param('id')
  const body = await c.req.json<{
    title?: string
    description?: string
    content?: string
    source_reference?: string
    priority?: number
    is_active?: boolean
    applies_to_sectors?: string[]
  }>()

  const { data, error } = await supabaseAdmin
    .from('org_brain_directives')
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    // PGRST116 = "no rows returned" from .single() when no matching row
    if (error.code === 'PGRST116') {
      return c.json({ error: 'Diretriz nao encontrada' }, 404)
    }
    return c.json({ error: `Erro ao atualizar diretriz: ${error.message}` }, 500)
  }

  if (!data) {
    return c.json({ error: 'Diretriz nao encontrada' }, 404)
  }

  return c.json({ directive: data })
})

// DELETE /api/brain/:id — Delete a directive
brain.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  const id = c.req.param('id')

  const { error } = await supabaseAdmin
    .from('org_brain_directives')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    return c.json({ error: `Erro ao remover diretriz: ${error.message}` }, 500)
  }

  return c.json({ ok: true })
})

// PATCH /api/brain/:id/toggle — Toggle active state
brain.patch('/:id/toggle', async (c) => {
  const orgId = c.get('orgId')
  const id = c.req.param('id')

  // Get current state
  const { data: current } = await supabaseAdmin
    .from('org_brain_directives')
    .select('is_active')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (!current) {
    return c.json({ error: 'Diretriz nao encontrada' }, 404)
  }

  const { data, error } = await supabaseAdmin
    .from('org_brain_directives')
    .update({
      is_active: !current.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    return c.json({ error: `Erro ao alternar diretriz: ${error.message}` }, 500)
  }

  return c.json({ directive: data })
})

export default brain
