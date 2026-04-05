import { Hono } from 'hono'
import crypto from 'node:crypto'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit, userApiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { sendTextMessage, sendMediaMessage } from '../services/whatsapp.service.js'
import { withRetry } from '../lib/resilience.js'
import { downloadAndStore } from '../services/media.service.js'
import { saveMessage, updateConversationWithMessage } from '../services/conversation.service.js'
import { requireString, requireUUID } from '../lib/validate.js'
import { metrics } from '../lib/metrics.js'
import type { ContentType } from '@nexus/shared'

type AuthVars = { Variables: { userId: string; orgId: string; userRole: string } }

const messages = new Hono<AuthVars>()

// All routes require auth
messages.use('*', authMiddleware)
messages.use('*', apiRateLimit)

// POST /api/messages/send — Send a message via WhatsApp
messages.post('/send', userApiRateLimit, async (c) => {
  const userId = c.get('userId')
  const orgId = c.get('orgId')
  const body = await c.req.json<{
    conversationId: string
    content: string
    replyToWaMessageId?: string
  }>()

  const { conversationId, content, replyToWaMessageId } = body

  // Input validation
  requireUUID(conversationId, 'conversationId')
  requireString(content, 'content')

  // WhatsApp text message limit: 4096 characters
  if (content.length > 4096) {
    return c.json({ error: 'Mensagem excede o limite de 4096 caracteres do WhatsApp' }, 400)
  }

  // Dedup check: prevent identical messages within 5s
  const { data: recentDup } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'agent')
    .eq('content', content)
    .gte('created_at', new Date(Date.now() - 5000).toISOString())
    .limit(1)
    .single()

  if (recentDup) {
    return c.json({ error: 'Duplicate message detected' }, 409)
  }

  // Get conversation with contact wa_id
  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id, org_id, contact_id, contacts(wa_id, wa_jid)')
    .eq('id', conversationId)
    .single()

  if (convError || !conversation) {
    return c.json({ error: 'Conversa não encontrada' }, 404)
  }

  if (conversation.org_id !== orgId) {
    return c.json({ error: 'Acesso negado a esta conversa' }, 403)
  }

  // Supabase returns related record as object (many-to-one), not array
  const contactRaw = (conversation as Record<string, unknown>).contacts as
    | { wa_id: string; wa_jid?: string }
    | { wa_id: string; wa_jid?: string }[]
    | null
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw
  const contactWaId = contact?.wa_id
  const contactWaJid = contact?.wa_jid

  if (!contactWaId) {
    return c.json({ error: 'Contato sem WhatsApp ID' }, 400)
  }

  // Send via WhatsApp Cloud API
  let waMessageId: string | null = null
  let waStatus: 'sent' | 'failed' = 'sent'

  try {
    const result = await withRetry(
      () => sendTextMessage(orgId, contactWaId, content.trim(), replyToWaMessageId),
      `send message to ${contactWaId}`,
      1,
      2000
    )
    waMessageId = result.messages?.[0]?.id || null
    metrics.messageSent()
  } catch (err) {
    metrics.messageFailed()
    console.warn('[Messages] WhatsApp send failed, saving locally:', err)
    waStatus = 'failed'
  }

  // Save to database regardless of WhatsApp delivery
  const messageId = await saveMessage({
    conversation_id: conversationId,
    org_id: orgId,
    sender_type: 'agent',
    sender_id: userId,
    content: content.trim(),
    content_type: 'text',
    wa_message_id: waMessageId || undefined,
    wa_status: waStatus,
  })

  // Update conversation preview
  const preview = content.length > 100 ? content.slice(0, 100) + '…' : content
  await updateConversationWithMessage(conversationId, preview, false)

  return c.json({ id: messageId, waMessageId }, 201)
})

// GET /api/messages/:conversationId — List messages for a conversation
messages.get('/:conversationId', async (c) => {
  const orgId = c.get('orgId')
  const conversationId = c.req.param('conversationId')
  const cursor = c.req.query('cursor') // last message created_at for pagination
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100)

  // Verify conversation belongs to org
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (!conv) {
    return c.json({ error: 'Conversa não encontrada' }, 404)
  }

  let query = supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: msgs, error } = await query

  if (error) {
    return c.json({ error: 'Erro ao buscar mensagens' }, 500)
  }

  return c.json({
    messages: msgs?.reverse() || [], // Return in chronological order
    hasMore: (msgs?.length || 0) === limit,
  })
})

// POST /api/messages/:messageId/read — Mark conversation as read
messages.post('/:messageId/read', async (c) => {
  const orgId = c.get('orgId')
  const messageId = c.req.param('messageId')

  // Get message to find conversation
  const { data: msg } = await supabaseAdmin
    .from('messages')
    .select('conversation_id')
    .eq('id', messageId)
    .eq('org_id', orgId)
    .single()

  if (!msg) {
    return c.json({ error: 'Mensagem não encontrada' }, 404)
  }

  // Reset unread count
  await supabaseAdmin
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', msg.conversation_id)
    .eq('org_id', orgId)

  return c.json({ ok: true })
})

// Helper: get file extension from MIME type
function getExtFromMime(mimeType: string): string {
  const base = mimeType.split(';')[0].trim()
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/amr': 'amr',
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
  }
  return map[base] || 'bin'
}

// POST /api/messages/send-media — Send media (image, video, audio, document) via WhatsApp
messages.post('/send-media', userApiRateLimit, async (c) => {
  const userId = c.get('userId')
  const orgId = c.get('orgId')

  const body = await c.req.parseBody()
  const conversationId = body['conversationId'] as string
  const contentType = (body['contentType'] as string) || 'document'
  const caption = (body['caption'] as string) || ''
  const file = body['file'] as File

  if (!conversationId || !file) {
    return c.json({ error: 'conversationId e file são obrigatórios' }, 400)
  }

  const validTypes = ['image', 'audio', 'video', 'document', 'sticker']
  if (!validTypes.includes(contentType)) {
    return c.json({ error: `contentType inválido. Use: ${validTypes.join(', ')}` }, 400)
  }

  // WhatsApp media size limits (in bytes)
  const MEDIA_SIZE_LIMITS: Record<string, number> = {
    image: 5 * 1024 * 1024,      // 5 MB
    audio: 16 * 1024 * 1024,     // 16 MB
    video: 16 * 1024 * 1024,     // 16 MB
    document: 100 * 1024 * 1024, // 100 MB
    sticker: 500 * 1024,         // 500 KB
  }
  const maxSize = MEDIA_SIZE_LIMITS[contentType] || 16 * 1024 * 1024
  if (file.size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(1)
    return c.json({ error: `Arquivo excede o limite de ${maxMB}MB para ${contentType}` }, 400)
  }

  // Get conversation with contact wa_id
  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id, org_id, contact_id, contacts(wa_id, wa_jid)')
    .eq('id', conversationId)
    .single()

  if (convError || !conversation) {
    return c.json({ error: 'Conversa não encontrada' }, 404)
  }

  if (conversation.org_id !== orgId) {
    return c.json({ error: 'Acesso negado a esta conversa' }, 403)
  }

  const contactRaw = (conversation as Record<string, unknown>).contacts as
    | { wa_id: string; wa_jid?: string }
    | { wa_id: string; wa_jid?: string }[]
    | null
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw
  const contactWaId = contact?.wa_id
  const contactWaJid = contact?.wa_jid

  if (!contactWaId) {
    return c.json({ error: 'Contato sem WhatsApp ID' }, 400)
  }

  // Convert file to Buffer
  const arrayBuf = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)
  const mimeType = file.type || 'application/octet-stream'
  const filename = file.name || 'file'
  const ext = getExtFromMime(mimeType)

  // Upload to Supabase Storage
  const fileId = crypto.randomUUID()
  const storagePath = `${orgId}/${conversationId}/${fileId}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('media')
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    })

  if (uploadError) {
    console.error('[Messages] Storage upload failed:', uploadError.message)
    return c.json({ error: 'Erro ao fazer upload do arquivo' }, 500)
  }

  // Create signed URL (1 year)
  const { data: signedData } = await supabaseAdmin.storage
    .from('media')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

  const mediaUrl = signedData?.signedUrl || storagePath

  // Send via WhatsApp Cloud API
  let waMessageId: string | null = null
  let waStatus: 'sent' | 'failed' = 'sent'

  try {
    const result = await withRetry(
      () => sendMediaMessage(
        orgId,
        contactWaId,
        contentType as 'image' | 'audio' | 'video' | 'document' | 'sticker',
        mediaUrl,
        mimeType,
        filename,
        caption || undefined
      ),
      `send media ${contentType} to ${contactWaId}`,
      1,
      2000
    )
    waMessageId = result.messages?.[0]?.id || null
    metrics.messageSent()
    console.log(`[Messages] Media ${contentType} enviada via Cloud API:`, waMessageId)
  } catch (err) {
    metrics.messageFailed()
    console.warn('[Messages] Cloud API media send failed:', err)
    waStatus = 'failed'
  }

  // Determine display content
  const displayContent = caption || `[${contentType.charAt(0).toUpperCase() + contentType.slice(1)}]`

  // Save to database
  const messageId = await saveMessage({
    conversation_id: conversationId,
    org_id: orgId,
    sender_type: 'agent',
    sender_id: userId,
    content: displayContent,
    content_type: contentType as ContentType,
    wa_message_id: waMessageId || undefined,
    wa_status: waStatus,
    media_url: mediaUrl,
    media_mime_type: mimeType,
    media_filename: filename,
    media_size: buffer.length,
  })

  // Update conversation preview
  const preview = displayContent.length > 100 ? displayContent.slice(0, 100) + '…' : displayContent
  await updateConversationWithMessage(conversationId, preview, false)

  return c.json({
    id: messageId,
    waMessageId,
    mediaUrl,
    mediaFilename: filename,
    mediaMimeType: mimeType,
    mediaSize: buffer.length,
  }, 201)
})

// POST /api/messages/send-media-url — Send media from external URL (e.g. Shopify product images)
messages.post('/send-media-url', userApiRateLimit, async (c) => {
  const userId = c.get('userId')
  const orgId = c.get('orgId')

  const { conversationId, url, contentType: rawType, caption, filename: clientFilename } = await c.req.json<{
    conversationId: string
    url: string
    contentType?: string
    caption?: string
    filename?: string
  }>()

  requireUUID(conversationId, 'conversationId')
  requireString(url, 'url')

  const contentType = rawType || 'image'
  const validTypes = ['image', 'audio', 'video', 'document']
  if (!validTypes.includes(contentType)) {
    return c.json({ error: `contentType inválido. Use: ${validTypes.join(', ')}` }, 400)
  }

  // Get conversation with contact wa_id
  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id, org_id, contact_id, contacts(wa_id)')
    .eq('id', conversationId)
    .single()

  if (convError || !conversation) {
    return c.json({ error: 'Conversa não encontrada' }, 404)
  }

  if (conversation.org_id !== orgId) {
    return c.json({ error: 'Acesso negado a esta conversa' }, 403)
  }

  const contactRaw = (conversation as Record<string, unknown>).contacts as
    | { wa_id: string } | { wa_id: string }[] | null
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw
  const contactWaId = contact?.wa_id

  if (!contactWaId) {
    return c.json({ error: 'Contato sem WhatsApp ID' }, 400)
  }

  // Download image from URL
  let buffer: Buffer
  let mimeType: string
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    mimeType = res.headers.get('content-type') || 'image/jpeg'
    const arrayBuf = await res.arrayBuffer()
    buffer = Buffer.from(arrayBuf)
  } catch (err) {
    console.error('[Messages] Failed to download media URL:', err)
    return c.json({ error: 'Erro ao baixar mídia da URL' }, 500)
  }

  // Build a human-readable filename for WhatsApp display
  const fileId = crypto.randomUUID().slice(0, 8)

  // 1) Try extension from the source URL path (most reliable for .pdf, .skp, etc.)
  const urlPath = new URL(url).pathname
  const urlExt = urlPath.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/)?.[1]?.toLowerCase()
  // 2) Fallback to MIME type
  const mimeExt = mimeType.split('/')[1]?.split(';')[0]?.replace('jpeg', 'jpg')
  const ext = urlExt || mimeExt || 'bin'

  // 3) Try extracting original filename from URL
  const urlFilename = decodeURIComponent(urlPath.split('/').pop() || '')
    .replace(/\.[a-zA-Z0-9]{2,5}$/, '') // strip extension

  // 4) Build display filename: client-provided > URL-derived > caption-derived > generic
  let displayName: string
  if (clientFilename) {
    // Frontend sent an explicit name (e.g. "Catalogo_Aparador_Andorra.pdf")
    displayName = clientFilename
    // Ensure it has the right extension
    if (!displayName.toLowerCase().endsWith(`.${ext}`)) {
      displayName = `${displayName}.${ext}`
    }
  } else if (urlFilename && urlFilename.length > 3 && !/^[a-f0-9-]{20,}$/i.test(urlFilename)) {
    // URL has a meaningful name (not a UUID/hash)
    displayName = `${urlFilename}.${ext}`
  } else if (caption) {
    // Derive from caption: sanitize to filesystem-safe chars
    const sanitized = caption
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
      .replace(/[^a-zA-Z0-9\s_-]/g, '')                // keep alphanumeric, space, dash, underscore
      .trim()
      .replace(/\s+/g, '_')                             // spaces → underscores
      .slice(0, 60)                                     // reasonable length
    displayName = sanitized ? `${sanitized}.${ext}` : `arquivo-${fileId}.${ext}`
  } else {
    displayName = `arquivo-${fileId}.${ext}`
  }

  const filename = displayName
  const storagePath = `${orgId}/${conversationId}/${fileId}_${filename}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('media')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true })

  if (uploadError) {
    console.error('[Messages] Storage upload failed:', uploadError.message)
    return c.json({ error: 'Erro ao fazer upload do arquivo' }, 500)
  }

  const { data: signedData } = await supabaseAdmin.storage
    .from('media')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

  const mediaUrl = signedData?.signedUrl || storagePath

  // Send via WhatsApp
  let waMessageId: string | null = null
  let waStatus: 'sent' | 'failed' = 'sent'

  try {
    const result = await withRetry(
      () => sendMediaMessage(
        orgId,
        contactWaId,
        contentType as 'image' | 'audio' | 'video' | 'document',
        mediaUrl,
        mimeType,
        filename,
        caption || undefined
      ),
      `send media-url ${contentType} to ${contactWaId}`,
      1,
      2000
    )
    waMessageId = result.messages?.[0]?.id || null
    metrics.messageSent()
  } catch (err) {
    metrics.messageFailed()
    console.warn('[Messages] Cloud API media-url send failed:', err)
    waStatus = 'failed'
  }

  const displayContent = caption || `[${contentType.charAt(0).toUpperCase() + contentType.slice(1)}]`

  const messageId = await saveMessage({
    conversation_id: conversationId,
    org_id: orgId,
    sender_type: 'agent',
    sender_id: userId,
    content: displayContent,
    content_type: contentType as ContentType,
    wa_message_id: waMessageId || undefined,
    wa_status: waStatus,
    media_url: mediaUrl,
    media_mime_type: mimeType,
    media_filename: filename,
    media_size: buffer.length,
  })

  const preview = caption || `Foto do produto`
  await updateConversationWithMessage(conversationId, preview, false)

  return c.json({ id: messageId, waMessageId, mediaUrl }, 201)
})

// POST /api/messages/retry-media — Re-download failed media from WhatsApp
messages.post('/retry-media', async (c) => {
  const orgId = c.get('orgId')

  // Find messages with media type but null media_url that have wa_media_id
  const { data: failedMessages, error } = await supabaseAdmin
    .from('messages')
    .select('id, wa_media_id, conversation_id, content_type, media_mime_type, media_filename')
    .eq('org_id', orgId)
    .in('content_type', ['image', 'audio', 'video', 'document', 'sticker'])
    .is('media_url', null)
    .not('wa_media_id', 'is', null)

  if (error) {
    return c.json({ error: 'Erro ao buscar mensagens' }, 500)
  }

  if (!failedMessages || failedMessages.length === 0) {
    return c.json({ message: 'Nenhuma mídia pendente para re-download', retried: 0 })
  }

  // Get org access token
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('wa_access_token_encrypted')
    .eq('id', orgId)
    .single()

  if (!org?.wa_access_token_encrypted) {
    return c.json({ error: 'Token WhatsApp não configurado' }, 400)
  }

  const { data: accessToken } = await supabaseAdmin.rpc('decrypt_wa_token', {
    encrypted: org.wa_access_token_encrypted,
  })

  if (!accessToken) {
    return c.json({ error: 'Falha ao decriptar token' }, 500)
  }

  let success = 0
  let failed = 0

  for (const msg of failedMessages) {
    try {
      const mediaData = await downloadAndStore(
        msg.wa_media_id!,
        accessToken as string,
        orgId,
        msg.conversation_id
      )

      await supabaseAdmin
        .from('messages')
        .update({
          media_url: mediaData.localUrl,
          media_mime_type: mediaData.mimeType,
          media_filename: mediaData.filename || msg.media_filename,
          media_size: mediaData.fileSize,
        })
        .eq('id', msg.id)

      success++
      console.log(`[RetryMedia] Re-downloaded media for message ${msg.id}`)
    } catch (err) {
      failed++
      console.error(`[RetryMedia] Failed for message ${msg.id}:`, err)
    }
  }

  return c.json({ retried: failedMessages.length, success, failed })
})

// POST /api/messages/:messageId/retry — Retry a failed message
messages.post('/:messageId/retry', authMiddleware, apiRateLimit, async (c) => {
  const messageId = requireUUID(c.req.param('messageId'), 'messageId')
  const userId = c.get('userId')
  const orgId = c.get('orgId')

  // Get the failed message
  const { data: msg, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .eq('org_id', orgId)
    .eq('wa_status', 'failed')
    .single()

  if (error || !msg) {
    return c.json({ error: 'Message not found or not in failed state' }, 404)
  }

  // Get conversation to find the contact
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('contact_id')
    .eq('id', msg.conversation_id)
    .single()

  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  // Get contact wa_id
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('wa_id')
    .eq('id', conv.contact_id)
    .single()

  if (!contact) {
    return c.json({ error: 'Contact not found' }, 404)
  }

  try {
    let waResponse
    if (msg.content_type === 'text') {
      waResponse = await withRetry(
        () => sendTextMessage(orgId, contact.wa_id, msg.content),
        `retry message ${messageId}`,
        2,
        2000
      )
    } else if (msg.media_url) {
      waResponse = await withRetry(
        () => sendMediaMessage(orgId, contact.wa_id, msg.content_type, msg.media_url, msg.media_mime_type, msg.media_filename, msg.content),
        `retry media ${messageId}`,
        2,
        2000
      )
    } else {
      return c.json({ error: 'Cannot retry this message type' }, 400)
    }

    // Update message status
    await supabaseAdmin
      .from('messages')
      .update({
        wa_message_id: waResponse.messages?.[0]?.id,
        wa_status: 'sent',
      })
      .eq('id', messageId)

    metrics.messageRetried()
    metrics.messageSent()
    return c.json({ success: true })
  } catch (err) {
    metrics.messageFailed()
    const errMsg = err instanceof Error ? err.message : 'Retry failed'
    return c.json({ error: errMsg }, 500)
  }
})

export default messages
