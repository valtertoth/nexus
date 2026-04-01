import { Hono } from 'hono'
import crypto from 'node:crypto'
import { authMiddleware } from '../middleware/auth.js'
import { apiRateLimit } from '../middleware/rateLimit.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { sendTextMessage, sendMediaMessage } from '../services/whatsapp.service.js'
import { downloadAndStore } from '../services/media.service.js'
import { saveMessage, updateConversationWithMessage } from '../services/conversation.service.js'
import type { ContentType } from '@nexus/shared'

type AuthVars = { Variables: { userId: string; orgId: string } }

const messages = new Hono<AuthVars>()

// All routes require auth
messages.use('*', authMiddleware)
messages.use('*', apiRateLimit)

// POST /api/messages/send — Send a message via WhatsApp
messages.post('/send', async (c) => {
  const userId = c.get('userId')
  const orgId = c.get('orgId')
  const body = await c.req.json<{
    conversationId: string
    content: string
    replyToWaMessageId?: string
  }>()

  const { conversationId, content, replyToWaMessageId } = body

  if (!conversationId || !content?.trim()) {
    return c.json({ error: 'conversationId e content são obrigatórios' }, 400)
  }

  // Get conversation with contact wa_id
  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id, org_id, contact_id, contacts(wa_id, wa_jid)')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (convError || !conversation) {
    return c.json({ error: 'Conversa não encontrada' }, 404)
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
    const result = await sendTextMessage(orgId, contactWaId, content.trim(), replyToWaMessageId)
    waMessageId = result.messages?.[0]?.id || null
  } catch (err) {
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
messages.post('/send-media', async (c) => {
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

  // Get conversation with contact wa_id
  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id, org_id, contact_id, contacts(wa_id, wa_jid)')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .single()

  if (convError || !conversation) {
    return c.json({ error: 'Conversa não encontrada' }, 404)
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
    const result = await sendMediaMessage(
      orgId,
      contactWaId,
      contentType as 'image' | 'audio' | 'video' | 'document' | 'sticker',
      mediaUrl,
      mimeType,
      filename,
      caption || undefined
    )
    waMessageId = result.messages?.[0]?.id || null
    console.log(`[Messages] Media ${contentType} enviada via Cloud API:`, waMessageId)
  } catch (err) {
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

export default messages
