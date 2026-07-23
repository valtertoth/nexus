import { useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import { useMessageStore } from '@/stores/messageStore'
import { useConversationStore } from '@/stores/conversationStore'
import { playNotificationSound, showMessageNotification } from '@/lib/notifications'
import type { Message } from '@nexus/shared'

const EMPTY_MESSAGES: Message[] = []

export function useMessages(conversationId: string | null) {
  // Per-conversation state selectors — only re-render when THIS conversation's data changes
  const messages = useMessageStore(
    (s) => (conversationId ? s.messages[conversationId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES)
  )
  const aiSuggestion = useMessageStore((s) => s.aiSuggestion)
  const sendingMessage = useMessageStore(
    (s) => (conversationId ? s.sendingMessage[conversationId] ?? false : false)
  )
  const hasMore = useMessageStore(
    (s) => (conversationId ? s.hasMore[conversationId] ?? true : true)
  )
  const loadingMore = useMessageStore(
    (s) => (conversationId ? s.loadingMore[conversationId] ?? false : false)
  )
  const hasLoaded = useMessageStore(
    (s) => (conversationId ? s.loadedConversations.has(conversationId) : false)
  )

  // Action selectors — stable references, never trigger re-renders
  const setMessages = useMessageStore((s) => s.setMessages)
  const addMessage = useMessageStore((s) => s.addMessage)
  const updateMessage = useMessageStore((s) => s.updateMessage)
  const removeMessage = useMessageStore((s) => s.removeMessage)
  const prependMessages = useMessageStore((s) => s.prependMessages)
  const evictOldConversations = useMessageStore((s) => s.evictOldConversations)
  const setAiSuggestion = useMessageStore((s) => s.setAiSuggestion)
  const clearAiSuggestion = useMessageStore((s) => s.clearAiSuggestion)
  const setSendingMessage = useMessageStore((s) => s.setSendingMessage)
  const setHasMore = useMessageStore((s) => s.setHasMore)
  const setLoadingMore = useMessageStore((s) => s.setLoadingMore)

  const updateConversation = useConversationStore((s) => s.update)
  const resetUnread = useConversationStore((s) => s.resetUnread)

  // Use refs for callbacks to avoid subscription churn
  const addMessageRef = useRef(addMessage)
  const updateMessageRef = useRef(updateMessage)
  const setAiSuggestionRef = useRef(setAiSuggestion)
  const updateConversationRef = useRef(updateConversation)

  addMessageRef.current = addMessage
  updateMessageRef.current = updateMessage
  setAiSuggestionRef.current = setAiSuggestion
  updateConversationRef.current = updateConversation

  // Fetch messages for a conversation (latest 50, newest first then reversed)
  const fetchMessages = useCallback(async (convId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data) {
      const sorted = [...data].reverse() // back to ascending for display
      setMessages(convId, sorted as Message[])
      setHasMore(convId, data.length === 50)

      // Load existing AI suggestion from the latest contact message
      const latestContactMsg = [...sorted]
        .reverse()
        .find((m) => m.sender_type === 'contact' && m.ai_suggested_response)

      if (latestContactMsg?.ai_suggested_response) {
        const contactMsgIndex = sorted.findIndex((m) => m.id === latestContactMsg.id)
        const hasAgentReplyAfter = sorted
          .slice(contactMsgIndex + 1)
          .some((m) => m.sender_type === 'agent')

        if (!hasAgentReplyAfter) {
          setAiSuggestion({
            text: latestContactMsg.ai_suggested_response,
            sources: latestContactMsg.ai_suggestion_sources || [],
            loading: false,
            conversationId: convId,
          })
        }
      }
    }
  }, [setMessages, setHasMore, setAiSuggestion])

  // Load older messages (infinite scroll up)
  // Uses store.getState() to read current messages at call time, avoiding stale closures
  const fetchMoreMessages = useCallback(async () => {
    if (!conversationId) return
    const store = useMessageStore.getState()
    const currentMessages = store.messages[conversationId]
    if (!currentMessages || currentMessages.length === 0) return
    if (store.loadingMore[conversationId]) return
    if (store.hasMore[conversationId] === false) return

    setLoadingMore(conversationId, true)

    const oldestMessage = currentMessages[0]
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .lt('created_at', oldestMessage.created_at)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data) {
      const sorted = [...data].reverse()
      prependMessages(conversationId, sorted as Message[])
      setHasMore(conversationId, data.length === 50)
    }

    setLoadingMore(conversationId, false)
  }, [conversationId, setLoadingMore, prependMessages, setHasMore])

  // Fetch when conversationId changes + evict old conversations from memory
  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId)
      resetUnread(conversationId)

      // Evict oldest cached conversations to cap memory usage
      evictOldConversations(conversationId)

      // Persist unread reset to database so it survives page refresh
      supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId)
        .then(({ error }) => {
          if (error) console.warn('[Messages] Failed to reset unread in DB:', error)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // Realtime subscription — ONLY depends on conversationId
  // Uses refs for store callbacks to prevent subscription churn
  // Includes reconnection with exponential backoff
  useEffect(() => {
    if (!conversationId) return

    const convId = conversationId
    let channel: ReturnType<typeof supabase.channel> | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let retryCount = 0
    let wasDisconnected = false
    let mounted = true
    const MAX_RETRIES = 10

    function subscribe() {
      if (!mounted) return

      // Clean up previous channel
      if (channel) {
        supabase.removeChannel(channel)
        channel = null
      }

      channel = supabase
        .channel(`messages:${convId}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${convId}`,
          },
          (payload) => {
            const msg = payload.new as Message
            addMessageRef.current(convId, msg)

            // Play notification for incoming contact messages
            if (msg.sender_type === 'contact') {
              playNotificationSound()
              showMessageNotification(
                'Nova mensagem',
                msg.content || ''
              )
            }

            updateConversationRef.current(convId, {
              last_message_preview: msg.content || '',
              last_message_at: msg.created_at,
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${convId}`,
          },
          (payload) => {
            const updated = payload.new as Message
            updateMessageRef.current(convId, updated.id, updated)

            if (updated.ai_suggested_response && updated.sender_type === 'contact') {
              setAiSuggestionRef.current({
                text: updated.ai_suggested_response,
                sources: updated.ai_suggestion_sources || [],
                loading: false,
                conversationId: convId,
              })
            }
          }
        )
        .subscribe((status, err) => {
          if (!mounted) return

          if (status === 'SUBSCRIBED') {
            console.log(`[Messages] Connected to channel for ${convId}`)
            retryCount = 0
            // If reconnecting after disconnection, refetch messages to catch up
            if (wasDisconnected) {
              console.log(`[Messages] Reconnected — refetching messages for ${convId}`)
              fetchMessages(convId)
              wasDisconnected = false
            }
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[Messages] ${status} for ${convId}:`, err?.message)
            wasDisconnected = true

            if (retryCount < MAX_RETRIES && mounted) {
              const delay = Math.min(1000 * Math.pow(2, retryCount), 30000) + Math.random() * 1000
              retryCount++
              console.log(`[Messages] Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`)
              retryTimeout = setTimeout(subscribe, delay)
            }
          }

          if (status === 'CLOSED' && mounted) {
            wasDisconnected = true
            if (retryCount < MAX_RETRIES) {
              const delay = Math.min(1000 * Math.pow(2, retryCount), 30000) + Math.random() * 1000
              retryCount++
              retryTimeout = setTimeout(subscribe, delay)
            }
          }
        })
    }

    subscribe()

    return () => {
      mounted = false
      if (retryTimeout) clearTimeout(retryTimeout)
      if (channel) supabase.removeChannel(channel)
    }
  }, [conversationId, fetchMessages]) // fetchMessages is stable (useCallback)

  // Send message with optimistic rendering
  const sendMessage = useCallback(async (
    content: string,
    options?: {
      aiApproved?: boolean
      aiEdited?: boolean
      aiOriginal?: string
    }
  ) => {
    if (!conversationId || !content.trim()) return

    // 1. Create optimistic message (appears instantly)
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: conversationId,
      org_id: '',
      sender_type: 'agent',
      sender_id: null,
      content: content.trim(),
      content_type: 'text',
      media_url: null,
      media_original_url: null,
      media_mime_type: null,
      media_filename: null,
      media_size: null,
      wa_message_id: null,
      wa_media_id: null,
      wa_status: 'pending',
      wa_timestamp: null,
      ai_suggested_response: null,
      ai_suggestion_sources: null,
      ai_approved: options?.aiApproved ?? null,
      ai_edited: options?.aiEdited ?? false,
      ai_original_suggestion: options?.aiOriginal ?? null,
      ai_model_used: null,
      ai_tokens_used: null,
      ai_latency_ms: null,
      is_internal_note: false,
      reply_to_message_id: null,
      metadata: {},
      created_at: new Date().toISOString(),
    }

    addMessage(conversationId, optimisticMsg)

    setSendingMessage(conversationId, true)
    try {
      await api.post('/api/messages/send', {
        conversationId,
        content: content.trim(),
        contentType: 'text',
        aiApproved: options?.aiApproved ?? false,
        aiEdited: options?.aiEdited ?? false,
        aiOriginal: options?.aiOriginal,
      })

      clearAiSuggestion()
    } catch (err) {
      updateMessage(conversationId, tempId, { wa_status: 'failed' } as Partial<Message>)
      const message = err instanceof Error ? err.message : 'Falha ao enviar mensagem'
      toast.error(message)
    } finally {
      setSendingMessage(conversationId, false)
    }
  }, [conversationId, addMessage, updateMessage, setSendingMessage, clearAiSuggestion])

  // Send media (image, video, audio, document)
  const sendMedia = useCallback(async (
    file: File,
    contentType: 'image' | 'audio' | 'video' | 'document',
    caption?: string
  ) => {
    if (!conversationId) return

    // 1. Bolha otimista — a mídia aparece na hora (paridade WhatsApp) e vira
    //    'failed' com motivo se o envio falhar.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const localUrl = URL.createObjectURL(file)
    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: conversationId,
      org_id: '',
      sender_type: 'agent',
      sender_id: null,
      content: caption?.trim() || '',
      content_type: contentType,
      media_url: localUrl,
      media_original_url: null,
      media_mime_type: file.type || null,
      media_filename: file.name || null,
      media_size: file.size || null,
      wa_message_id: null,
      wa_media_id: null,
      wa_status: 'pending',
      wa_timestamp: null,
      ai_suggested_response: null,
      ai_suggestion_sources: null,
      ai_approved: null,
      ai_edited: false,
      ai_original_suggestion: null,
      ai_model_used: null,
      ai_tokens_used: null,
      ai_latency_ms: null,
      is_internal_note: false,
      reply_to_message_id: null,
      metadata: {},
      created_at: new Date().toISOString(),
    }
    addMessage(conversationId, optimisticMsg)

    setSendingMessage(conversationId, true)
    try {
      const formData = new FormData()
      formData.append('conversationId', conversationId)
      formData.append('contentType', contentType)
      formData.append('file', file)
      if (caption) formData.append('caption', caption)

      // Timeout generoso: documento até 100MB em rede lenta não pode abortar em 15s.
      await api.post('/api/messages/send-media', formData, { timeout: 120_000 })

      clearAiSuggestion()
    } catch (err) {
      updateMessage(conversationId, tempId, { wa_status: 'failed' } as Partial<Message>)
      const message = err instanceof Error ? err.message : 'Falha ao enviar mídia'
      toast.error(message)
    } finally {
      setSendingMessage(conversationId, false)
      // Libera o object URL depois que o realtime já trouxe a mídia real.
      setTimeout(() => URL.revokeObjectURL(localUrl), 30_000)
    }
  }, [conversationId, addMessage, updateMessage, setSendingMessage, clearAiSuggestion])

  // Retry a failed message
  const retryMessage = useCallback(async (message: Message) => {
    if (!conversationId || !message.content) return

    // Remove the failed message
    removeMessage(conversationId, message.id)

    // Re-send with the same content (creates new optimistic message)
    await sendMessage(message.content, {
      aiApproved: message.ai_approved ?? undefined,
      aiEdited: message.ai_edited ?? undefined,
      aiOriginal: message.ai_original_suggestion ?? undefined,
    })
  }, [conversationId, removeMessage, sendMessage])

  return {
    messages,
    hasLoaded,
    aiSuggestion: aiSuggestion?.conversationId === conversationId ? aiSuggestion : null,
    sendingMessage,
    sendMessage,
    sendMedia,
    retryMessage,
    clearAiSuggestion,
    setAiSuggestion,
    fetchMoreMessages,
    hasMore,
    loadingMore,
  }
}
