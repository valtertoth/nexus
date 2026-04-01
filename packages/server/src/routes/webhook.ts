import { Hono } from 'hono'
import type { WebhookPayload } from '@nexus/shared'
import {
  parseWebhookPayload,
  validateWebhookSignature,
  markAsRead,
} from '../services/whatsapp.service.js'
import {
  upsertContact,
  upsertConversation,
  updateConversationWithMessage,
  saveMessage,
  messageExists,
  getAssignedUserAiMode,
} from '../services/conversation.service.js'
import { downloadAndStore } from '../services/media.service.js'
import { transcribeAudio } from '../services/transcription.service.js'
import { analyzeImage } from '../services/vision.service.js'
import { generateSuggestion } from '../services/ai.service.js'
import { parseUtmFromText, applyPendingAttribution, saveContactAttribution, copyAttributionToConversation } from '../services/attribution.service.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { webhookRateLimit } from '../middleware/rateLimit.js'

const webhook = new Hono()

// GET /webhook — Meta verification challenge
webhook.get('/', (c) => {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')

  const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook] Verification successful')
    return c.text(challenge || '', 200)
  }

  console.warn('[Webhook] Verification failed — invalid token')
  return c.text('Forbidden', 403)
})

// POST /webhook — Receive messages from WhatsApp
webhook.post('/', webhookRateLimit, async (c) => {
  // Always return 200 immediately to Meta (they retry on non-200)
  const rawBody = await c.req.text()

  // Validate signature
  const signature = c.req.header('x-hub-signature-256')
  const appSecret = process.env.WA_APP_SECRET

  if (!appSecret) {
    console.error('[Webhook] WA_APP_SECRET not configured — rejecting webhook')
    return c.text('OK', 200) // Still 200 to not trigger Meta retries
  }
  if (!validateWebhookSignature(rawBody, signature, appSecret)) {
    console.warn('[Webhook] Invalid signature')
    return c.text('OK', 200)
  }

  let body: WebhookPayload
  try {
    body = JSON.parse(rawBody)
  } catch {
    console.error('[Webhook] Invalid JSON body')
    return c.text('OK', 200)
  }

  // Process in background — return 200 to Meta immediately
  setImmediate(() => {
    processWebhook(body).catch((err) => {
      console.error('[Webhook] Processing error:', err)
    })
  })

  return c.text('OK', 200)
})

async function processWebhook(body: WebhookPayload): Promise<void> {
  const { messages, statuses, phoneNumberId } = parseWebhookPayload(body)

  if (!phoneNumberId) return

  // Find org by phone_number_id
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, wa_access_token_encrypted')
    .eq('wa_phone_number_id', phoneNumberId)
    .single()

  if (!org) {
    console.warn(`[Webhook] No org found for phone_number_id: ${phoneNumberId}`)
    return
  }

  const orgId = org.id

  // Decrypt access token for media downloads
  const { data: accessToken } = await supabaseAdmin.rpc('decrypt_wa_token', {
    encrypted: org.wa_access_token_encrypted,
  })

  // Process incoming messages
  for (const msg of messages) {
    try {
      await processIncomingMessage(orgId, msg, accessToken as string)
    } catch (err) {
      console.error(`[Webhook] Error processing message ${msg.messageId}:`, err)
    }
  }

  // Process status updates
  for (const status of statuses) {
    try {
      await processStatusUpdate(orgId, status)
    } catch (err) {
      console.error(`[Webhook] Error processing status ${status.messageId}:`, err)
    }
  }
}

async function processIncomingMessage(
  orgId: string,
  msg: ReturnType<typeof parseWebhookPayload>['messages'][number],
  accessToken: string
): Promise<void> {
  // Dedup check (scoped to org to prevent cross-tenant collisions)
  const exists = await messageExists(msg.messageId, orgId)
  if (exists) {
    console.log(`[Webhook] Duplicate message ${msg.messageId}, skipping`)
    return
  }

  // 1. Upsert contact
  const contact = await upsertContact(orgId, msg.from, msg.profileName)

  // 1b. Apply any pending attribution (from Intelligence pre-attribution)
  // + parse UTM from message text (click-to-chat links)
  setImmediate(async () => {
    try {
      await applyPendingAttribution(orgId, msg.from, contact.id)
      if (msg.text) {
        const utmParams = parseUtmFromText(msg.text)
        if (utmParams) {
          await saveContactAttribution(contact.id, utmParams)
        }
      }
    } catch (err) {
      console.error('[Webhook] Attribution failed:', err)
    }
  })

  // 2. Upsert conversation
  const conversation = await upsertConversation(orgId, contact.id)

  // 2b. Copy attribution snapshot to conversation (first time only)
  setImmediate(async () => {
    try {
      await copyAttributionToConversation(conversation.id, contact.id)
    } catch (err) {
      console.error('[Webhook] Attribution copy failed:', err)
    }
  })

  // 3. Handle media if present
  let mediaData: {
    localUrl: string
    mimeType: string
    fileSize: number
    filename: string
    buffer: Buffer
  } | null = null

  let mediaError: string | null = null

  if (msg.mediaId && accessToken) {
    try {
      mediaData = await downloadAndStore(
        msg.mediaId,
        accessToken,
        orgId,
        conversation.id
      )
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      mediaError = errMsg
      console.error(`[Webhook] Media download failed for ${msg.mediaId}:`, errMsg)
    }
  }

  // 3b. Check AI mode BEFORE expensive API calls (transcription/vision)
  // This avoids spending money on OpenAI Whisper and Claude Vision when AI is off
  const aiMode = await getAssignedUserAiMode(conversation.id)

  // 3c. Transcribe audio with Whisper (only if AI is enabled)
  let audioTranscription: string | null = null
  if (aiMode !== 'off' && msg.type === 'audio' && mediaData?.buffer && mediaData.mimeType) {
    try {
      audioTranscription = await transcribeAudio(mediaData.buffer, mediaData.mimeType)
    } catch (err) {
      console.error('[Webhook] Audio transcription failed:', err)
    }
  }

  // 3d. Analyze image with Claude Vision (only if AI is enabled)
  let imageAnalysis: string | null = null
  if (aiMode !== 'off' && msg.type === 'image' && mediaData?.buffer && mediaData.mimeType) {
    try {
      imageAnalysis = await analyzeImage(mediaData.buffer, mediaData.mimeType, msg.caption)
    } catch (err) {
      console.error('[Webhook] Image analysis failed:', err)
    }
  }

  // 4. Build content text
  let content = msg.text || msg.caption || ''
  if (msg.type === 'location' && msg.location) {
    content = `📍 ${msg.location.name || 'Localização'}: ${msg.location.latitude}, ${msg.location.longitude}`
    if (msg.location.address) content += ` — ${msg.location.address}`
  }
  // Audio: use transcription as content if available
  if (msg.type === 'audio' && audioTranscription) {
    content = `🎤 ${audioTranscription}`
  }
  // Image: append analysis as AI context (caption is preserved as content)
  if (msg.type === 'image' && imageAnalysis) {
    content = content ? `${content}\n📷 ${imageAnalysis}` : `📷 ${imageAnalysis}`
  }
  if (!content && msg.type !== 'text') {
    content = `[${msg.type}]`
  }

  // 5. Save message (include wa_media_id for retry capability)
  await saveMessage({
    conversation_id: conversation.id,
    org_id: orgId,
    sender_type: 'contact',
    content,
    content_type: msg.type === 'location' ? 'location' : (msg.type as 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker'),
    wa_message_id: msg.messageId,
    wa_media_id: msg.mediaId || undefined,
    wa_status: 'delivered',
    wa_timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
    media_url: mediaData?.localUrl,
    media_mime_type: mediaData?.mimeType || msg.mediaMimeType,
    media_filename: mediaData?.filename || msg.mediaFilename,
    media_size: mediaData?.fileSize,
    reply_to_message_id: msg.replyToId,
  })

  // 6. Update conversation
  const preview = content.length > 100 ? content.slice(0, 100) + '…' : content
  await updateConversationWithMessage(conversation.id, preview, true)

  // 7. Mark as read on WhatsApp
  try {
    await markAsRead(orgId, msg.messageId)
  } catch {
    // Non-critical — don't fail the whole pipeline
  }

  // 8. Trigger AI suggestion if mode is not 'off' (aiMode already fetched in step 3b)
  // Generate for text messages always; for media, only if there's caption or context
  const shouldGenerateAi = msg.type === 'text' || (content && !content.startsWith('['))
  if (content && shouldGenerateAi && aiMode !== 'off') {
    setImmediate(() => {
      generateSuggestion(conversation.id, content, conversation.sector_id ?? null, orgId)
        .catch((err) => console.error('[Webhook] AI suggestion failed:', err))
    })
  }

  console.log(`[Webhook] Message ${msg.messageId} from ${msg.from} processed`)
}

async function processStatusUpdate(
  orgId: string,
  status: ReturnType<typeof parseWebhookPayload>['statuses'][number]
): Promise<void> {
  // Update the message's wa_status
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ wa_status: status.status })
    .eq('wa_message_id', status.messageId)
    .eq('org_id', orgId)

  if (error) {
    console.error(`[Webhook] Status update failed for ${status.messageId}:`, error.message)
  }

  if (status.status === 'failed') {
    console.warn(
      `[Webhook] Message ${status.messageId} failed: ${status.errorCode} — ${status.errorMessage}`
    )
  }
}

export default webhook
