import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  Browsers,
  WASocket,
  BaileysEventMap,
  proto,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import path from 'node:path'
import fs from 'node:fs'
import QRCode from 'qrcode'
import { EventEmitter } from 'node:events'
import type { ContentType, WaMessageStatus } from '@nexus/shared'
import {
  upsertContact,
  upsertConversation,
  updateConversationWithMessage,
  saveMessage,
  messageExists,
} from './conversation.service.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { generateSuggestion } from './ai.service.js'
import { shouldAnalyzeConversation, generateConversationSnapshot } from './ecosystem.service.js'
import { withTimeout } from '../lib/resilience.js'

const AUTH_DIR = path.resolve(process.cwd(), '.baileys-auth')

// AI suggestion debounce for Baileys (mirrors webhook.ts pattern)
const baileysAiDebounceMap = new Map<string, NodeJS.Timeout>()

interface BaileysState {
  socket: WASocket | null
  qrCode: string | null
  qrDataUrl: string | null
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
  phoneNumber: string | null
  profileName: string | null
  lastError: string | null
}

class BaileysService extends EventEmitter {
  private state: BaileysState = {
    socket: null,
    qrCode: null,
    qrDataUrl: null,
    status: 'disconnected',
    phoneNumber: null,
    profileName: null,
    lastError: null,
  }

  private orgId: string | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private waVersion: number[] | null = null

  getStatus() {
    return {
      status: this.state.status,
      phoneNumber: this.state.phoneNumber,
      profileName: this.state.profileName,
      qrDataUrl: this.state.qrDataUrl,
      lastError: this.state.lastError,
    }
  }

  isConnected(): boolean {
    return this.state.status === 'connected' && this.state.socket !== null
  }

  async connect(orgId: string): Promise<{ status: string; qrDataUrl?: string }> {
    this.orgId = orgId

    if (this.state.status === 'connected') {
      return { status: 'already_connected' }
    }

    // Only block duplicate calls from the frontend, not internal reconnections
    if (this.state.socket && (this.state.status === 'connecting' || this.state.status === 'qr_ready')) {
      return {
        status: this.state.status,
        qrDataUrl: this.state.qrDataUrl || undefined,
      }
    }

    this.state.status = 'connecting'
    this.state.lastError = null

    try {
      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true })
      }

      const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

      // Fetch the latest WA Web version from web.whatsapp.com
      // This is critical -- stale versions cause 405/515 errors
      if (!this.waVersion) {
        try {
          const { version, isLatest } = await fetchLatestWaWebVersion({})
          this.waVersion = version
          console.log(`[Baileys] WA Web version: ${version.join('.')}, isLatest: ${isLatest}`)
        } catch (err) {
          console.warn('[Baileys] Nao foi possivel buscar versao, usando padrao do Baileys')
        }
      }

      const logger = pino({ level: 'silent' })

      const socketConfig: Parameters<typeof makeWASocket>[0] = {
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, logger),
        },
        logger,
        browser: Browsers.windows('Chrome'),
        generateHighQualityLinkPreview: false,
        syncFullHistory: true,
        markOnlineOnConnect: false,
        fireInitQueries: true,
      }

      // Only pass version if we successfully fetched it
      if (this.waVersion) {
        socketConfig.version = this.waVersion as [number, number, number]
      }

      console.log('[Baileys] Iniciando conexao...')
      const socket = makeWASocket(socketConfig)

      this.state.socket = socket

      // Handle connection updates
      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
          this.state.qrCode = qr
          this.state.status = 'qr_ready'
          try {
            this.state.qrDataUrl = await QRCode.toDataURL(qr, {
              width: 300,
              margin: 2,
              color: { dark: '#000000', light: '#ffffff' },
            })
          } catch {
            this.state.qrDataUrl = null
          }
          this.emit('qr', { qr, dataUrl: this.state.qrDataUrl })
          console.log('[Baileys] QR code gerado. Escaneie com o WhatsApp.')
        }

        if (connection === 'open') {
          this.state.status = 'connected'
          this.state.qrCode = null
          this.state.qrDataUrl = null
          this.reconnectAttempts = 0

          const me = socket.user
          this.state.phoneNumber = me?.id?.split(':')[0] || me?.id?.split('@')[0] || null
          this.state.profileName = me?.name || null

          console.log(`[Baileys] Conectado como ${this.state.profileName} (${this.state.phoneNumber})`)
          this.emit('connected', {
            phoneNumber: this.state.phoneNumber,
            profileName: this.state.profileName,
          })
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut

          console.log(
            `[Baileys] Conexao fechada. Codigo: ${statusCode}. Reconectar: ${shouldReconnect}`
          )

          this.state.socket = null
          this.state.qrCode = null
          this.state.qrDataUrl = null

          // 515 = restartRequired -- this is NORMAL after pairing
          // The server asks us to restart the connection, not an error
          if (statusCode === DisconnectReason.restartRequired) {
            console.log('[Baileys] Restart solicitado pelo servidor (515). Reconectando imediatamente...')
            this.state.status = 'connecting'
            // Don't count as a reconnect attempt -- this is expected behavior
            setTimeout(() => {
              if (this.orgId) this.connect(this.orgId)
            }, 1000)
            return
          }

          // 405/403 = server rejected client version or auth
          // Clear auth state and start fresh
          if (statusCode === 405 || statusCode === 403) {
            console.log(`[Baileys] Servidor rejeitou cliente (${statusCode}). Limpando auth e refazendo...`)
            if (fs.existsSync(AUTH_DIR)) {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true })
            }
            // Force re-fetch of WA version on next attempt
            this.waVersion = null
          }

          if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            this.state.status = 'connecting'
            const delay = Math.min(2000 * this.reconnectAttempts, 10000)
            console.log(
              `[Baileys] Reconectando... tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts} (em ${delay}ms)`
            )
            setTimeout(() => {
              if (this.orgId) this.connect(this.orgId)
            }, delay)
          } else {
            this.state.status = 'disconnected'
            if (statusCode === DisconnectReason.loggedOut) {
              this.state.lastError = 'Desconectado do WhatsApp. Escaneie o QR code novamente.'
              if (fs.existsSync(AUTH_DIR)) {
                fs.rmSync(AUTH_DIR, { recursive: true, force: true })
              }
            } else {
              this.state.lastError = `Conexao perdida apos ${this.maxReconnectAttempts} tentativas. Codigo: ${statusCode}`
            }
            this.emit('disconnected', { reason: this.state.lastError })
          }
        }
      })

      // Save credentials on update
      socket.ev.on('creds.update', saveCreds)

      // Handle incoming and outgoing messages
      // 'notify' = messages from others or from phone, 'append' = messages sent via this socket
      socket.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
        if (type !== 'notify' && type !== 'append') return

        for (const msg of msgs) {
          try {
            await this.handleIncomingMessage(msg, false) // false = realtime, trigger AI
          } catch (err) {
            console.error('[Baileys] Erro ao processar mensagem:', err)
          }
        }
      })

      // Handle historical message sync from primary device
      // This captures messages sent/received on the phone that Baileys syncs when syncFullHistory is true
      socket.ev.on('messaging-history.set', async ({ messages: msgs, isLatest }) => {
        console.log(`[Baileys] Sync historico recebido: ${msgs.length} mensagens (isLatest: ${isLatest})`)
        let processed = 0
        let skipped = 0

        // Process in batches of 20 with pause to avoid DB overload
        const BATCH_SIZE = 20
        const BATCH_DELAY_MS = 200

        for (let i = 0; i < msgs.length; i += BATCH_SIZE) {
          const batch = msgs.slice(i, i + BATCH_SIZE)

          for (const msg of batch) {
            try {
              const saved = await this.handleIncomingMessage(msg, true) // true = history sync, skip AI
              if (saved) processed++
              else skipped++
            } catch (err) {
              skipped++
            }
          }

          // Pause between batches
          if (i + BATCH_SIZE < msgs.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
          }
        }
        console.log(`[Baileys] Sync historico: ${processed} salvas, ${skipped} ignoradas`)
      })

      return {
        status: 'connecting',
      }
    } catch (err) {
      this.state.status = 'disconnected'
      this.state.lastError = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[Baileys] Erro ao conectar:', err)
      throw err
    }
  }

  async tryAutoReconnect(): Promise<void> {
    // Check if auth state exists from a previous session
    const credsPath = path.join(AUTH_DIR, 'creds.json')
    if (!fs.existsSync(credsPath)) {
      console.log('[Baileys] Sem sessao salva. Aguardando conexao manual.')
      return
    }

    console.log('[Baileys] Sessao salva encontrada. Reconectando automaticamente...')
    // Use a default orgId -- will be updated when frontend connects
    // For now, read orgId from the first org in the database
    try {
      // Connect with a placeholder orgId that will be resolved by the auth middleware
      // when the first authenticated request comes in
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .limit(1)
        .single()

      if (org) {
        await this.connect(org.id)
      } else {
        console.log('[Baileys] Nenhuma organizacao encontrada para auto-reconnect.')
      }
    } catch (err) {
      console.error('[Baileys] Erro no auto-reconnect:', err)
    }
  }

  async disconnect(): Promise<void> {
    if (this.state.socket) {
      await this.state.socket.logout()
      this.state.socket = null
    }
    this.state.status = 'disconnected'
    this.state.qrCode = null
    this.state.qrDataUrl = null
    this.state.phoneNumber = null
    this.state.profileName = null
    this.reconnectAttempts = 0

    // Clear auth state
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true })
    }

    console.log('[Baileys] Desconectado e sessao removida.')
  }

  async sendText(to: string, text: string): Promise<{ messageId: string }> {
    if (!this.state.socket || this.state.status !== 'connected') {
      throw new Error('WhatsApp nao conectado via Baileys')
    }

    // WhatsApp text message limit: 4096 characters
    if (text.length > 4096) {
      throw new Error('Mensagem excede o limite de 4096 caracteres do WhatsApp')
    }

    // Use JID as-is if it already has @ (preserves @lid vs @s.whatsapp.net)
    // Otherwise default to @s.whatsapp.net
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`
    console.log(`[Baileys] Enviando mensagem para JID: ${jid}`)

    try {
      const result = await this.state.socket.sendMessage(jid, { text })
      const messageId = result?.key?.id || crypto.randomUUID()
      return { messageId }
    } catch (err) {
      console.error(`[Baileys] sendText failed to ${jid}:`, err instanceof Error ? err.message : err)
      throw err
    }
  }

  async sendImage(jid: string, buffer: Buffer, mimeType: string, caption?: string): Promise<string | undefined> {
    if (!this.state.socket) throw new Error('WhatsApp não conectado')
    const result = await this.state.socket.sendMessage(jid, {
      image: buffer,
      mimetype: mimeType,
      caption: caption || undefined,
    })
    return result?.key?.id ?? undefined
  }

  async sendVideo(jid: string, buffer: Buffer, mimeType: string, caption?: string): Promise<string | undefined> {
    if (!this.state.socket) throw new Error('WhatsApp não conectado')
    const result = await this.state.socket.sendMessage(jid, {
      video: buffer,
      mimetype: mimeType,
      caption: caption || undefined,
    })
    return result?.key?.id ?? undefined
  }

  async sendAudio(jid: string, buffer: Buffer, mimeType: string, ptt: boolean = true): Promise<string | undefined> {
    if (!this.state.socket) throw new Error('WhatsApp não conectado')
    const result = await this.state.socket.sendMessage(jid, {
      audio: buffer,
      mimetype: mimeType,
      ptt, // push-to-talk = voice note
    })
    return result?.key?.id ?? undefined
  }

  async sendDocument(jid: string, buffer: Buffer, mimeType: string, filename: string): Promise<string | undefined> {
    if (!this.state.socket) throw new Error('WhatsApp não conectado')
    const result = await this.state.socket.sendMessage(jid, {
      document: buffer,
      mimetype: mimeType,
      fileName: filename,
    })
    return result?.key?.id ?? undefined
  }

  async sendSticker(jid: string, buffer: Buffer): Promise<string | undefined> {
    if (!this.state.socket) throw new Error('WhatsApp não conectado')
    const result = await this.state.socket.sendMessage(jid, {
      sticker: buffer,
    })
    return result?.key?.id ?? undefined
  }

  private async handleIncomingMessage(msg: proto.IWebMessageInfo, isHistorySync: boolean = false): Promise<boolean> {
    if (!this.orgId) return false

    // Ignore status messages and protocol messages
    if (!msg.key) return false
    if (msg.key.remoteJid === 'status@broadcast') return false
    if (!msg.message) return false

    const isFromMe = msg.key.fromMe === true

    // Ignore pure protocol/system messages that should not be stored
    const m = msg.message
    if (m.protocolMessage) return false

    // senderKeyDistributionMessage and messageContextInfo can appear ALONGSIDE
    // real message content, so only ignore if they are the ONLY fields present
    const contentKeys = Object.keys(m).filter(
      k => k !== 'senderKeyDistributionMessage'
        && k !== 'messageContextInfo'
        && k !== 'fastRatchetKeySenderKeyDistributionMessage'
    )
    if (contentKeys.length === 0) return false

    const jid = msg.key.remoteJid
    if (!jid || jid.endsWith('@g.us') || jid.endsWith('@newsletter')) return false // Ignore groups and channels

    // Handle both traditional @s.whatsapp.net and new @lid (Linked ID) format
    const isLid = jid.endsWith('@lid')
    let waId = jid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')
    const pushName = msg.pushName || waId

    // For LID format, try to resolve real phone number from participant field
    // or from cached store. LIDs are internal WhatsApp IDs, not phone numbers.
    if (isLid && msg.key.participant) {
      const participantPhone = msg.key.participant.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')
      if (participantPhone && participantPhone !== waId) {
        waId = participantPhone
      }
    }

    // Unwrap wrapper messages to get the inner message
    const innerMessage = m.viewOnceMessage?.message
      || m.viewOnceMessageV2?.message
      || m.ephemeralMessage?.message
      || m.documentWithCaptionMessage?.message
      || m

    // Extract text content
    let textContent = ''
    let contentType: ContentType = 'text'

    if (innerMessage.conversation) {
      textContent = innerMessage.conversation
    } else if (innerMessage.extendedTextMessage?.text) {
      textContent = innerMessage.extendedTextMessage.text
    } else if (innerMessage.imageMessage) {
      textContent = innerMessage.imageMessage.caption || '[Imagem]'
      contentType = 'image'
    } else if (innerMessage.videoMessage) {
      textContent = innerMessage.videoMessage.caption || '[Video]'
      contentType = 'video'
    } else if ((m as Record<string, unknown>).ptvMessage) {
      textContent = '[Video mensagem]'
      contentType = 'video'
    } else if (innerMessage.audioMessage) {
      textContent = '[Audio]'
      contentType = 'audio'
    } else if (innerMessage.documentMessage) {
      textContent = innerMessage.documentMessage.fileName || '[Documento]'
      contentType = 'document'
    } else if (innerMessage.stickerMessage) {
      textContent = '[Sticker]'
      contentType = 'sticker'
    } else if (innerMessage.locationMessage || innerMessage.liveLocationMessage) {
      textContent = '[Localizacao]'
      contentType = 'location'
    } else if (innerMessage.contactMessage) {
      textContent = innerMessage.contactMessage.displayName || '[Contato]'
      contentType = 'contact'
    } else if (innerMessage.contactsArrayMessage) {
      const count = innerMessage.contactsArrayMessage.contacts?.length || 0
      textContent = `[${count} Contatos]`
      contentType = 'contact'
    } else if (m.reactionMessage) {
      // Reactions are not standalone messages, ignore
      return false
    } else if (m.editedMessage) {
      // Edited messages -- ignore for now
      return false
    } else if (innerMessage.pollCreationMessage || innerMessage.pollCreationMessageV3) {
      textContent = innerMessage.pollCreationMessage?.name
        || innerMessage.pollCreationMessageV3?.name
        || '[Enquete]'
    } else if (m.pollUpdateMessage) {
      // Poll vote updates, ignore
      return false
    } else if (innerMessage.listMessage) {
      textContent = innerMessage.listMessage.description || innerMessage.listMessage.title || '[Lista]'
    } else if (innerMessage.listResponseMessage) {
      textContent = innerMessage.listResponseMessage.title || '[Resposta de lista]'
    } else if (innerMessage.buttonsResponseMessage) {
      textContent = innerMessage.buttonsResponseMessage.selectedDisplayText || '[Resposta de botao]'
    } else if (innerMessage.templateButtonReplyMessage) {
      textContent = innerMessage.templateButtonReplyMessage.selectedDisplayText || '[Resposta de template]'
    } else if (innerMessage.orderMessage) {
      textContent = '[Pedido]'
    } else if (innerMessage.productMessage) {
      textContent = '[Produto]'
    } else {
      // Log unknown message type for debugging
      const keys = Object.keys(innerMessage).filter(k => !k.startsWith('message'))
      console.log(`[Baileys] Tipo de mensagem desconhecido: ${keys.join(', ')}`)
      return false // Don't save unknown protocol messages
    }

    const waMessageId = msg.key?.id || crypto.randomUUID()

    // Deduplicate (scoped to org to prevent cross-tenant collisions)
    const exists = await messageExists(waMessageId, this.orgId)
    if (exists) return false

    // Upsert contact (the other person in the conversation)
    // Pass the original JID so we can send messages back correctly
    const contact = await upsertContact(this.orgId, waId, isFromMe ? waId : pushName, jid)

    // Upsert conversation
    const conversation = await upsertConversation(this.orgId, contact.id)

    // Download media if applicable (non-blocking for message save)
    let mediaUrl: string | null = null
    let mediaMimeType: string | null = null
    let mediaFilename: string | null = null
    let mediaSize: number | null = null

    const mediaTypes = ['image', 'audio', 'video', 'sticker', 'document']
    if (mediaTypes.includes(contentType) && this.state.socket) {
      try {
        const mediaData = await this.downloadBaileysMedia(
          msg,
          innerMessage,
          contentType,
          conversation.id
        )
        if (mediaData) {
          mediaUrl = mediaData.url
          mediaMimeType = mediaData.mimeType
          mediaFilename = mediaData.filename
          mediaSize = mediaData.size
        }
      } catch (err) {
        console.warn(`[Baileys] Media download failed for ${contentType}:`, err instanceof Error ? err.message : err)
      }
    }

    // Save message -- fromMe messages are saved as 'agent' (sent by us)
    await saveMessage({
      conversation_id: conversation.id,
      org_id: this.orgId,
      sender_type: isFromMe ? 'agent' : 'contact',
      sender_id: contact.id,
      content: textContent,
      content_type: contentType,
      wa_message_id: waMessageId,
      wa_status: (isFromMe ? 'sent' : 'delivered') as WaMessageStatus,
      media_url: mediaUrl ?? undefined,
      media_mime_type: mediaMimeType ?? undefined,
      media_filename: mediaFilename ?? undefined,
      media_size: mediaSize ?? undefined,
    })

    // Update conversation -- only increment unread for incoming messages
    const preview = textContent.length > 100 ? textContent.slice(0, 100) + '...' : textContent
    await updateConversationWithMessage(conversation.id, preview, !isFromMe)

    const direction = isFromMe ? 'enviada para' : 'recebida de'
    console.log(`[Baileys] Mensagem ${direction} ${pushName} (${waId}): ${preview}`)
    this.emit('message', {
      from: waId,
      profileName: pushName,
      text: textContent,
      conversationId: conversation.id,
    })

    // Trigger AI copilot for incoming contact messages (non-blocking)
    // Skip for history sync — avoid burning tokens on old messages
    if (!isHistorySync && !isFromMe && contentType === 'text' && textContent.length > 1) {
      // Debounce: cancel previous AI call if another message arrives within 3s
      const debounceKey = conversation.id
      const existingTimer = baileysAiDebounceMap.get(debounceKey)
      if (existingTimer) clearTimeout(existingTimer)

      const timer = setTimeout(() => {
        baileysAiDebounceMap.delete(debounceKey)
        console.log(`[Baileys] Acionando IA para mensagem: "${textContent.slice(0, 50)}"`)
        this.triggerAiSuggestion(conversation.id, textContent, this.orgId!)
      }, 3000)
      baileysAiDebounceMap.set(debounceKey, timer)
    }

    // Trigger ecosystem intelligence (non-blocking, background)
    if (!isHistorySync && !isFromMe) {
      this.triggerEcosystemAnalysis(conversation.id, this.orgId!)
    }

    return true
  }

  private async downloadBaileysMedia(
    msg: proto.IWebMessageInfo,
    innerMessage: proto.IMessage,
    contentType: string,
    conversationId: string
  ): Promise<{ url: string; mimeType: string; filename: string; size: number } | null> {
    if (!this.state.socket) return null

    // Determine which message key holds the media
    const mediaMessage = innerMessage.imageMessage
      || innerMessage.videoMessage
      || innerMessage.audioMessage
      || innerMessage.stickerMessage
      || innerMessage.documentMessage
      || (msg.message as Record<string, unknown>)?.ptvMessage

    if (!mediaMessage) return null

    // Download the binary from WhatsApp servers
    const buffer = await downloadMediaMessage(
      msg as Parameters<typeof downloadMediaMessage>[0],
      'buffer',
      {},
      {
        logger: pino({ level: 'silent' }) as any,
        reuploadRequest: this.state.socket!.updateMediaMessage,
      } as any
    )

    if (!buffer || (buffer as Buffer).length === 0) return null

    const buf = buffer as Buffer

    // Determine MIME type and extension
    const mediaObj = mediaMessage as Record<string, unknown>
    const mimeType = (mediaObj.mimetype as string) || getMimeForType(contentType)
    const ext = getExtFromMime(mimeType)
    const originalFilename = (mediaObj.fileName as string) || null

    // Generate storage path
    const fileId = msg.key?.id || crypto.randomUUID()
    const filename = originalFilename || `${fileId}.${ext}`
    const storagePath = `${this.orgId}/${conversationId}/${fileId}.${ext}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('media')
      .upload(storagePath, buf, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      console.error('[Baileys] Storage upload failed:', uploadError.message)
      return null
    }

    // Create signed URL (1 year)
    const { data: signedData } = await supabaseAdmin.storage
      .from('media')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

    const url = signedData?.signedUrl || storagePath

    console.log(`[Baileys] Media ${contentType} salva: ${storagePath} (${(buf.length / 1024).toFixed(0)} KB)`)

    return {
      url,
      mimeType,
      filename,
      size: buf.length,
    }
  }

  private async triggerEcosystemAnalysis(
    conversationId: string,
    orgId: string
  ): Promise<void> {
    try {
      const shouldAnalyze = await shouldAnalyzeConversation(conversationId, orgId)
      if (shouldAnalyze) {
        console.log(`[Baileys] Acionando analise de ecossistema para conversa ${conversationId}`)
        await generateConversationSnapshot(conversationId, orgId)
      }
    } catch (err) {
      console.warn('[Baileys] Ecosystem analysis failed:', err instanceof Error ? err.message : err)
    }
  }

  private async triggerAiSuggestion(
    conversationId: string,
    messageText: string,
    orgId: string
  ): Promise<void> {
    try {
      // Get conversation sector_id using the admin client
      const { supabaseAdmin } = await import('../lib/supabase.js')
      const { data: conv } = await supabaseAdmin
        .from('conversations')
        .select('sector_id')
        .eq('id', conversationId)
        .single()

      console.log(`[Baileys] Gerando sugestao IA para conversa ${conversationId}...`)
      const result = await withTimeout(
        generateSuggestion(
          conversationId,
          messageText,
          conv?.sector_id || null,
          orgId
        ),
        45_000,
        `AI suggestion for conversation ${conversationId}`
      )
      console.log(`[Baileys] IA sugeriu resposta (${result.tokens.total} tokens, ${result.latencyMs}ms)`)
    } catch (err) {
      // AI suggestion is best-effort, never block message flow
      console.warn('[Baileys] Erro ao gerar sugestao IA:', err instanceof Error ? err.message : err)
    }
  }
}

// Helper: get default MIME type for content type
function getMimeForType(contentType: string): string {
  const map: Record<string, string> = {
    image: 'image/jpeg',
    video: 'video/mp4',
    audio: 'audio/ogg; codecs=opus',
    sticker: 'image/webp',
    document: 'application/octet-stream',
  }
  return map[contentType] || 'application/octet-stream'
}

// Helper: get file extension from MIME type
function getExtFromMime(mimeType: string): string {
  const base = mimeType.split(';')[0].trim()
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/ogg; codecs=opus': 'ogg',
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
  return map[base] || map[mimeType] || 'bin'
}

// Singleton instance
export const baileysService = new BaileysService()
