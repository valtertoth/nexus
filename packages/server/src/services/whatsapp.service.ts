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

async function getOrgCredentials(orgId: string) {
  // Try org-level credentials from database first
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('wa_phone_number_id, wa_access_token_encrypted')
    .eq('id', orgId)
    .single()

  if (data?.wa_phone_number_id && data?.wa_access_token_encrypted) {
    const { data: tokenData } = await supabaseAdmin.rpc('decrypt_wa_token', {
      encrypted: data.wa_access_token_encrypted,
    })
    if (tokenData) {
      return {
        phoneNumberId: data.wa_phone_number_id,
        accessToken: tokenData as string,
      }
    }
  }

  // Fallback to environment variables
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID
  const accessToken = process.env.WA_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp não configurado para esta organização')
  }

  return { phoneNumberId, accessToken }
}

export async function sendTextMessage(
  orgId: string,
  to: string,
  text: string,
  replyToMessageId?: string
): Promise<CloudApiResponse> {
  const { phoneNumberId, accessToken } = await getOrgCredentials(orgId)

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
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`)
  }

  return response.json() as Promise<CloudApiResponse>
}

export async function markAsRead(
  orgId: string,
  waMessageId: string
): Promise<void> {
  const { phoneNumberId, accessToken } = await getOrgCredentials(orgId)

  await fetch(`${GRAPH_API_URL}/${phoneNumberId}/messages`, {
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
  })
}

export async function getMediaUrl(
  accessToken: string,
  mediaId: string
): Promise<{ url: string; mime_type: string; file_size: number }> {
  const response = await fetch(`${GRAPH_API_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Failed to get media URL for ${mediaId}`)
  }

  return response.json() as Promise<{ url: string; mime_type: string; file_size: number }>
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
  // WhatsApp Cloud API only accepts mime_type for document and sticker types
  if (mimeType && ['document', 'sticker'].includes(mediaType)) {
    mediaPayload.mime_type = mimeType
  }

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
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`)
  }

  return response.json() as Promise<CloudApiResponse>
}

export function isServiceWindowActive(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) > new Date()
}
