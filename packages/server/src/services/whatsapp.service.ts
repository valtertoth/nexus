import { supabaseAdmin } from '../lib/supabase.js'
import type {
  WebhookPayload,
  WebhookMessage,
  WebhookStatus,
  WebhookValue,
  SendTextPayload,
  CloudApiResponse,
} from '@nexus/shared'
import crypto, { timingSafeEqual } from 'node:crypto'

const GRAPH_API_URL = 'https://graph.facebook.com/v22.0'

interface ParsedMessage {
  from: string
  profileName: string
  messageId: string
  timestamp: string
  type: string
  text?: string
  mediaId?: string
  mediaMimeType?: string
  mediaFilename?: string
  caption?: string
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  isReply?: boolean
  replyToId?: string
}

interface ParsedStatus {
  messageId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  recipientId: string
  timestamp: string
  errorCode?: number
  errorMessage?: string
  // Fonte autoritativa da janela de 24h — Meta anexa no primeiro status da janela
  conversationId?: string
  conversationExpiresAt?: string // ISO, derivado de conversation.expiration_timestamp
}

// --- Parsing ---

export function parseWebhookPayload(body: WebhookPayload): {
  messages: ParsedMessage[]
  statuses: ParsedStatus[]
  phoneNumberId: string | null
} {
  const result: { messages: ParsedMessage[]; statuses: ParsedStatus[]; phoneNumberId: string | null } = {
    messages: [],
    statuses: [],
    phoneNumberId: null,
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value: WebhookValue = change.value
      result.phoneNumberId = value.metadata?.phone_number_id || null

      // Parse messages
      if (value.messages) {
        for (const msg of value.messages) {
          const contact = value.contacts?.find((ct) => ct.wa_id === msg.from)
          const parsed: ParsedMessage = {
            from: msg.from,
            profileName: contact?.profile?.name || msg.from,
            messageId: msg.id,
            timestamp: msg.timestamp,
            type: msg.type,
          }

          switch (msg.type) {
            case 'text':
              parsed.text = msg.text?.body
              break
            case 'image':
              parsed.mediaId = msg.image?.id
              parsed.mediaMimeType = msg.image?.mime_type
              parsed.caption = msg.image?.caption
              break
            case 'audio':
              parsed.mediaId = msg.audio?.id
              parsed.mediaMimeType = msg.audio?.mime_type
              break
            case 'video':
              parsed.mediaId = msg.video?.id
              parsed.mediaMimeType = msg.video?.mime_type
              parsed.caption = msg.video?.caption
              break
            case 'document':
              parsed.mediaId = msg.document?.id
              parsed.mediaMimeType = msg.document?.mime_type
              parsed.mediaFilename = msg.document?.filename
              break
            case 'sticker':
              parsed.mediaId = msg.sticker?.id
              parsed.mediaMimeType = msg.sticker?.mime_type
              break
            case 'location':
              parsed.location = msg.location
              break
            case 'interactive': {
              // Button reply or list reply from the customer
              const msgAny = msg as unknown as Record<string, Record<string, unknown>>
              const interactive = msgAny.interactive
              if (interactive?.type === 'button_reply') {
                const btn = interactive.button_reply as { id?: string; title?: string } | undefined
                parsed.text = btn?.title || '[Botão]'
              } else if (interactive?.type === 'list_reply') {
                const list = interactive.list_reply as { id?: string; title?: string; description?: string } | undefined
                parsed.text = list?.title || '[Lista]'
              } else {
                parsed.text = '[Resposta interativa]'
              }
              break
            }
            case 'reaction': {
              const msgAny = msg as unknown as Record<string, { emoji?: string; message_id?: string }>
              const reaction = msgAny.reaction
              parsed.text = reaction?.emoji ? `[Reação: ${reaction.emoji}]` : '[Reação]'
              break
            }
            case 'contacts': {
              const msgAny = msg as unknown as Record<string, Array<{ name?: { formatted_name?: string } }>>
              const contacts = msgAny.contacts
              const contactName = contacts?.[0]?.name?.formatted_name || 'Contato'
              parsed.text = `[Contato compartilhado: ${contactName}]`
              break
            }
          }

          if (msg.context) {
            parsed.isReply = true
            parsed.replyToId = msg.context.id
          }

          result.messages.push(parsed)
        }
      }

      // Parse statuses
      if (value.statuses) {
        for (const status of value.statuses) {
          const expTs = status.conversation?.expiration_timestamp
          result.statuses.push({
            messageId: status.id,
            status: status.status,
            recipientId: status.recipient_id,
            timestamp: status.timestamp,
            errorCode: status.errors?.[0]?.code,
            errorMessage: status.errors?.[0]?.message,
            conversationId: status.conversation?.id,
            conversationExpiresAt: expTs
              ? new Date(parseInt(expTs, 10) * 1000).toISOString()
              : undefined,
          })
        }
      }
    }
  }

  return result
}

// --- Signature validation ---

export function validateWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  appSecret: string
): boolean {
  if (!signature) return false
  const expectedSig = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')
  const expected = Buffer.from(`sha256=${expectedSig}`)
  const received = Buffer.from(signature)
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

// --- Sending ---

// Cache credentials per org to avoid repeated DB calls + decryption
const credentialsCache = new Map<string, { phoneNumberId: string; accessToken: string; cachedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function getOrgCredentials(orgId: string) {
  const cached = credentialsCache.get(orgId)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { phoneNumberId: cached.phoneNumberId, accessToken: cached.accessToken }
  }

  // Fetch org data (needed for multiple strategies)
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('wa_phone_number_id, wa_access_token_encrypted, settings')
    .eq('id', orgId)
    .single()

  const phoneNumberId = org?.wa_phone_number_id || process.env.WA_PHONE_NUMBER_ID

  if (!phoneNumberId) {
    throw new Error('WhatsApp não configurado — WA_PHONE_NUMBER_ID ausente')
  }

  // Strategy 1: Plaintext token from org settings (most reliable, no decryption)
  const settingsToken = (org?.settings as Record<string, unknown>)?.wa_access_token as string | undefined
  if (settingsToken) {
    console.log(`[WhatsApp] credentials loaded from settings for org=${orgId}`)
    credentialsCache.set(orgId, { phoneNumberId, accessToken: settingsToken, cachedAt: Date.now() })
    return { phoneNumberId, accessToken: settingsToken }
  }

  // Strategy 2: Environment variables
  const envAccessToken = process.env.WA_ACCESS_TOKEN
  if (envAccessToken) {
    credentialsCache.set(orgId, { phoneNumberId, accessToken: envAccessToken, cachedAt: Date.now() })
    return { phoneNumberId, accessToken: envAccessToken }
  }

  // Strategy 3: Encrypted token from database (requires app.encryption_secret GUC)
  if (org?.wa_access_token_encrypted) {
    const { data: tokenData, error: rpcError } = await supabaseAdmin.rpc('decrypt_wa_token', {
      encrypted: org.wa_access_token_encrypted,
    })

    if (!rpcError && tokenData) {
      console.log(`[WhatsApp] credentials loaded via DB decrypt for org=${orgId}`)
      credentialsCache.set(orgId, { phoneNumberId, accessToken: tokenData as string, cachedAt: Date.now() })
      return { phoneNumberId, accessToken: tokenData as string }
    }
    if (rpcError) {
      console.warn(`[WhatsApp] decrypt_wa_token failed for org=${orgId}: ${rpcError.message}`)
    }
  }

  throw new Error('WhatsApp não configurado — nenhum access token encontrado')
}

/** Invalidate cached credentials (e.g. after 401/403 from WhatsApp API) */
function invalidateCredentialsCache(orgId: string): void {
  if (credentialsCache.has(orgId)) {
    console.warn(`[WhatsApp] Invalidating credential cache for org=${orgId} due to auth error`)
    credentialsCache.delete(orgId)
  }
}

/**
 * Erro estruturado de envio da Cloud API — carrega o código/motivo devolvidos pela
 * Meta (ex.: 131047 janela expirada, 131056 pair-rate, 470 fora da janela) para que a
 * rota persista em messages.wa_error_code/message e devolva ao front.
 */
export class WhatsAppSendError extends Error {
  readonly waErrorCode: number | null
  readonly waErrorMessage: string | null
  readonly httpStatus: number

  constructor(httpStatus: number, waErrorCode: number | null, waErrorMessage: string | null) {
    super(
      `WhatsApp send failed (HTTP ${httpStatus}` +
        `${waErrorCode != null ? `, code ${waErrorCode}` : ''}): ${waErrorMessage ?? 'unknown error'}`
    )
    this.name = 'WhatsAppSendError'
    this.httpStatus = httpStatus
    this.waErrorCode = waErrorCode
    this.waErrorMessage = waErrorMessage
  }
}

/**
 * Função ÚNICA de envio (texto/mídia/template). Trata 429 honrando Retry-After UMA vez
 * (retry inline, sem double-sleep — não relança para um retrier externo dormir de novo),
 * invalida credencial em 401/403, e em qualquer outra falha lança WhatsAppSendError com o
 * código/motivo da Meta.
 */
async function postGraphMessage(
  orgId: string,
  payload: Record<string, unknown>,
  label: string
): Promise<CloudApiResponse> {
  const { phoneNumberId, accessToken } = await getOrgCredentials(orgId)
  let retried429 = false

  for (;;) {
    const response = await fetch(`${GRAPH_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })

    if (response.ok) {
      const result = (await response.json()) as CloudApiResponse
      console.log(`[WhatsApp] ${label} sent — waMessageId=${result.messages?.[0]?.id}`)
      return result
    }

    const errorBody = (await response.json().catch(() => null)) as
      | { error?: { code?: number; message?: string } }
      | null
    const waErrorCode = errorBody?.error?.code ?? null
    const waErrorMessage = errorBody?.error?.message ?? `HTTP ${response.status}`

    if (response.status === 401 || response.status === 403) {
      invalidateCredentialsCache(orgId)
    }

    // Rate limit / pair-rate: espera o Retry-After (ou 5s) e tenta de novo UMA vez só.
    if (response.status === 429 && !retried429) {
      retried429 = true
      const retryAfter = response.headers.get('retry-after')
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000
      console.warn(`[WhatsApp] ${label} rate limited (429) — waiting ${waitMs}ms then retrying once`)
      await new Promise((r) => setTimeout(r, waitMs))
      continue
    }

    console.error(
      `[WhatsApp] ${label} failed — status=${response.status}, code=${waErrorCode}, message=${waErrorMessage}`
    )
    throw new WhatsAppSendError(response.status, waErrorCode, waErrorMessage)
  }
}

export async function sendTextMessage(
  orgId: string,
  to: string,
  text: string,
  replyToMessageId?: string
): Promise<CloudApiResponse> {
  console.log(`[WhatsApp] sending text — to=${to}, orgId=${orgId}${replyToMessageId ? `, replyTo=${replyToMessageId}` : ''}`)

  const payload: SendTextPayload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  }

  if (replyToMessageId) {
    payload.context = { message_id: replyToMessageId }
  }

  return postGraphMessage(orgId, payload as unknown as Record<string, unknown>, `text to ${to}`)
}

export async function markAsRead(
  orgId: string,
  waMessageId: string
): Promise<void> {
  try {
    const { phoneNumberId, accessToken } = await getOrgCredentials(orgId)

    const response = await fetch(`${GRAPH_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: waMessageId,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      console.warn(`[WhatsApp] markAsRead failed for ${waMessageId}: ${response.status}`)
    }
  } catch (err) {
    // Best-effort — never fail the message pipeline for a read receipt
    console.warn('[WhatsApp] markAsRead error:', err instanceof Error ? err.message : err)
  }
}

export async function getMediaUrl(
  accessToken: string,
  mediaId: string
): Promise<{ url: string; mime_type: string; file_size: number }> {
  // Retry up to 2 times with 1s delay — media URLs can transiently fail
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const response = await fetch(`${GRAPH_API_URL}/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8_000),
      })

      if (!response.ok) {
        // Invalidate cached credentials on auth errors
        if (response.status === 401 || response.status === 403) {
          // getMediaUrl uses a direct token, but clear org cache as a safety measure
          credentialsCache.clear()
        }
        throw new Error(`Failed to get media URL for ${mediaId}: ${response.status}`)
      }

      return response.json() as Promise<{ url: string; mime_type: string; file_size: number }>
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
  throw lastError!
}

export async function sendMediaMessage(
  orgId: string,
  to: string,
  mediaType: 'image' | 'audio' | 'video' | 'document' | 'sticker',
  mediaUrl: string,
  mimeType: string,
  filename?: string,
  caption?: string
): Promise<CloudApiResponse> {
  const mediaPayload: Record<string, unknown> = { link: mediaUrl }
  if (caption && ['image', 'video', 'document'].includes(mediaType)) {
    mediaPayload.caption = caption
  }
  if (mediaType === 'document' && filename) {
    mediaPayload.filename = filename
  }
  // WhatsApp Cloud API only accepts mime_type for sticker type (not document)
  if (mimeType && mediaType === 'sticker') {
    mediaPayload.mime_type = mimeType
  }

  console.log(`[WhatsApp] sending ${mediaType} — to=${to}, orgId=${orgId}, mime=${mimeType}`)

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: mediaType,
    [mediaType]: mediaPayload,
  }

  return postGraphMessage(orgId, payload, `${mediaType} to ${to}`)
}

export function isServiceWindowActive(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) > new Date()
}

// --- Templates ---

export interface MessageTemplate {
  name: string
  language: string
  status: string
  category: string
  id: string
  components: Array<{
    type: string
    text?: string
    format?: string
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>
    example?: Record<string, unknown>
  }>
}

// Cache de templates aprovados por org (10 min) — evita bater no Graph a cada abertura
// do TemplatePicker.
const templatesCache = new Map<string, { data: MessageTemplate[]; cachedAt: number }>()
const TEMPLATES_TTL_MS = 10 * 60 * 1000 // 10 minutes

export async function listTemplates(orgId: string): Promise<MessageTemplate[]> {
  const cached = templatesCache.get(orgId)
  if (cached && Date.now() - cached.cachedAt < TEMPLATES_TTL_MS) {
    return cached.data
  }

  const { accessToken } = await getOrgCredentials(orgId)

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('wa_business_account_id')
    .eq('id', orgId)
    .single()

  const wabaid = org?.wa_business_account_id || process.env.WA_BUSINESS_ACCOUNT_ID
  if (!wabaid) {
    throw new Error('WA_BUSINESS_ACCOUNT_ID nao configurado')
  }

  const response = await fetch(
    `${GRAPH_API_URL}/${wabaid}/message_templates?limit=100&status=APPROVED`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to list templates: ${response.status}`)
  }

  const data = await response.json() as { data: MessageTemplate[] }
  const templates = data.data || []
  templatesCache.set(orgId, { data: templates, cachedAt: Date.now() })
  return templates
}

export async function sendTemplateMessage(
  orgId: string,
  to: string,
  templateName: string,
  languageCode: string,
  components?: Array<Record<string, unknown>>
): Promise<CloudApiResponse> {
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components && components.length > 0 ? { components } : {}),
    },
  }

  return postGraphMessage(orgId, payload, `template "${templateName}" to ${to}`)
}
