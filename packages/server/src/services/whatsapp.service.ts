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
          result.statuses.push({
            messageId: status.id,
            status: status.status,
            recipientId: status.recipient_id,
            timestamp: status.timestamp,
            errorCode: status.errors?.[0]?.code,
            errorMessage: status.errors?.[0]?.message,
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

// Cache credentials in memory to avoid repeated DB calls + decryption
let credentialsCache: { phoneNumberId: string; accessToken: string; orgId: string; cachedAt: number } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function getOrgCredentials(orgId: string) {
  // Return cached credentials if fresh
  if (credentialsCache && credentialsCache.orgId === orgId && Date.now() - credentialsCache.cachedAt < CACHE_TTL_MS) {
    return { phoneNumberId: credentialsCache.phoneNumberId, accessToken: credentialsCache.accessToken }
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
    credentialsCache = { phoneNumberId, accessToken: settingsToken, orgId, cachedAt: Date.now() }
    return { phoneNumberId, accessToken: settingsToken }
  }

  // Strategy 2: Environment variables
  const envAccessToken = process.env.WA_ACCESS_TOKEN
  if (envAccessToken) {
    credentialsCache = { phoneNumberId, accessToken: envAccessToken, orgId, cachedAt: Date.now() }
    return { phoneNumberId, accessToken: envAccessToken }
  }

  // Strategy 3: Encrypted token from database (requires app.encryption_secret GUC)
  if (org?.wa_access_token_encrypted) {
    const { data: tokenData, error: rpcError } = await supabaseAdmin.rpc('decrypt_wa_token', {
      encrypted: org.wa_access_token_encrypted,
    })

    if (!rpcError && tokenData) {
      console.log(`[WhatsApp] credentials loaded via DB decrypt for org=${orgId}`)
      credentialsCache = { phoneNumberId, accessToken: tokenData as string, orgId, cachedAt: Date.now() }
      return { phoneNumberId, accessToken: tokenData as string }
    }
    if (rpcError) {
      console.warn(`[WhatsApp] decrypt_wa_token failed for org=${orgId}: ${rpcError.message}`)
    }
  }

  throw new Error('WhatsApp não configurado — nenhum access token encontrado')
}

export async function sendTextMessage(
  orgId: string,
  to: string,
  text: string,
  replyToMessageId?: string
): Promise<CloudApiResponse> {
  const { phoneNumberId, accessToken } = await getOrgCredentials(orgId)

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

  const response = await fetch(
    `${GRAPH_API_URL}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
    // Respect Meta's rate limit headers — wait before retry
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after')
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000
      console.warn(`[WhatsApp] Rate limited (429) — waiting ${waitMs}ms before retry`)
      await new Promise(r => setTimeout(r, waitMs))
    }
    console.error(`[WhatsApp] send text failed — to=${to}, orgId=${orgId}, status=${response.status}, error=${JSON.stringify(error)}`)
    throw new Error(`WhatsApp API error (${response.status}): ${JSON.stringify(error)}`)
  }

  const result = await response.json() as CloudApiResponse
  console.log(`[WhatsApp] text sent — to=${to}, waMessageId=${result.messages?.[0]?.id}`)
  return result
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
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
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
  const { phoneNumberId, accessToken } = await getOrgCredentials(orgId)

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

  const response = await fetch(
    `${GRAPH_API_URL}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
    console.error(`[WhatsApp] send ${mediaType} failed — to=${to}, orgId=${orgId}, error=${JSON.stringify(error)}`)
    throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`)
  }

  const result = await response.json() as CloudApiResponse
  console.log(`[WhatsApp] ${mediaType} sent — to=${to}, waMessageId=${result.messages?.[0]?.id}`)
  return result
}

export function isServiceWindowActive(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) > new Date()
}
