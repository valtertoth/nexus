import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { listTemplates, sendTemplateMessage, WhatsAppSendError } from '../services/whatsapp.service.js'
import { saveMessage, updateConversationWithMessage } from '../services/conversation.service.js'
import { requireUUID, requireString } from '../lib/validate.js'
import { withRetry } from '../lib/resilience.js'
import { metrics } from '../lib/metrics.js'

type AuthVars = { Variables: { userId: string; orgId: string; userRole: string } }

const templates = new Hono<AuthVars>()

templates.use('*', authMiddleware)
templates.use('*', apiRateLimit)

// GET /api/templates — List approved templates
templates.get('/', async (c) => {
  const orgId = c.get('orgId')

  try {
    const templateList = await listTemplates(orgId)
    return c.json({ templates: templateList })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao listar templates'
    return c.json({ error: msg }, 500)
  }
})

// POST /api/templates/send — Send a template message
templates.post('/send', async (c) => {
  const userId = c.get('userId')
  const orgId = c.get('orgId')

  const body = await c.req.json<{
    conversationId: string
    templateName: string
    languageCode?: string
    components?: Array<Record<string, unknown>>
  }>()

  const { conversationId, templateName, components } = body
  const languageCode = body.languageCode || 'pt_BR'

  requireUUID(conversationId, 'conversationId')
  requireString(templateName, 'templateName')

  // Get conversation with contact
  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id, org_id, contact_id, contacts(wa_id)')
    .eq('id', conversationId)
    .single()

  if (convError || !conversation) {
    return c.json({ error: 'Conversa nao encontrada' }, 404)
  }

  if (conversation.org_id !== orgId) {
    return c.json({ error: 'Acesso negado' }, 403)
  }

  const contactRaw = (conversation as Record<string, unknown>).contacts as
    | { wa_id: string } | { wa_id: string }[] | null
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw
  const contactWaId = contact?.wa_id

  if (!contactWaId) {
    return c.json({ error: 'Contato sem WhatsApp ID' }, 400)
  }

  let waMessageId: string | null = null
  let waStatus: 'sent' | 'failed' = 'sent'
  let waErrorCode: string | null = null
  let waErrorMessage: string | null = null

  try {
    const result = await withRetry(
      () => sendTemplateMessage(orgId, contactWaId, templateName, languageCode, components),
      `send template ${templateName} to ${contactWaId}`,
      1,
      2000
    )
    waMessageId = result.messages?.[0]?.id || null
    metrics.messageSent()
  } catch (err) {
    metrics.messageFailed()
    waStatus = 'failed'
    if (err instanceof WhatsAppSendError) {
      waErrorCode = err.waErrorCode != null ? String(err.waErrorCode) : null
      waErrorMessage = err.waErrorMessage
    } else {
      waErrorMessage = err instanceof Error ? err.message : String(err)
    }
    console.error(`[Templates] Send failed (code=${waErrorCode}):`, waErrorMessage)
  }

  // Save to database
  const content = `[Template: ${templateName}]`
  const messageId = await saveMessage({
    conversation_id: conversationId,
    org_id: orgId,
    sender_type: 'agent',
    sender_id: userId,
    content,
    content_type: 'text',
    wa_message_id: waMessageId || undefined,
    wa_status: waStatus,
    wa_error_code: waErrorCode || undefined,
    wa_error_message: waErrorMessage || undefined,
    metadata: { template_name: templateName, template_language: languageCode },
  })

  // Template NÃO estende a janela de 24h — só a resposta do cliente abre a janela.
  await updateConversationWithMessage(conversationId, content, false)

  if (waStatus === 'failed') {
    return c.json(
      { id: messageId, error: waErrorMessage || 'Falha ao enviar template', wa_error_code: waErrorCode, wa_error_message: waErrorMessage },
      502
    )
  }

  return c.json({ id: messageId, waMessageId }, 201)
})

export default templates
