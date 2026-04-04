import { useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { useMessageStore } from '@/stores/messageStore'
import { useConversationStore } from '@/stores/conversationStore'
import { playNotificationSound, showMessageNotification } from '@/lib/notifications'
import type { Message } from '@nexus/shared'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function useMessages(conversationId: string | null) {
  const {
    messages: allMessages,
    aiSuggestion,
    sendingMessage,
    hasMore,
    loadingMore,
    loadedConversations,
    setMessages,
    addMessage,
    updateMessage,
    removeMessage,
    prependMessages,
    evictOldConversations,
    setAiSuggestion,
    clearAiSuggestion,
    setSendingMessage,
    setHasMore,
    setLoadingMore,
  } = useMessageStore()

  const { update: updateConversation, resetUnread } = useConversationStore()

  const messages = conversationId ? allMessages[conversationId] || [] : []

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
  const fetchMoreMessages = useCallback(async () => {
    if (!conversationId) return
    const convMessages = allMessages[conversationId] || []
    if (convMessages.length === 0) return
    if (loadingMore[conversationId]) return
    if (hasMore[conversationId] === false) return

    setLoadingMore(conversationId, true)

    const oldestMessage = convMessages[0]
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
  }, [conversationId, allMessages, loadingMore, hasMore, setLoadingMore, prependMessages, setHasMore])

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
              const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
              retryCount++
              console.log(`[Messages] Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`)
              retryTimeout = setTimeout(subscribe, delay)
            }
          }

          if (status === 'CLOSED' && mounted) {
            wasDisconnected = true
            if (retryCount < MAX_RETRIES) {
              const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
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

    setSendingMessage(true)
    try {
      const headers = getAuthHeaders()

      const response = await fetch(`${API_BASE}/api/messages/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversationId,
          content: content.trim(),
          contentType: 'text',
          aiApproved: options?.aiApproved ?? false,
          aiEdited: options?.aiEdited ?? false,
          aiOriginal: options?.aiOriginal,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        // Mark optimistic message as failed
        updateMessage(conversationId, tempId, { wa_status: 'failed' } as Partial<Message>)
        throw new Error((err as { error?: string }).error || 'Falha ao enviar mensagem')
      }

      // On success, the realtime subscription will deliver the real message.
      // addMessage already handles cleanup of temp messages when the real one arrives.
      clearAiSuggestion()
    } catch (err) {
      // Update optimistic message to show failed state
      updateMessage(conversationId, tempId, { wa_status: 'failed' } as Partial<Message>)
      const message = err instanceof Error ? err.message : 'Falha ao enviar mensagem'
      toast.error(message)
    } finally {
      setSendingMessage(false)
    }
  }, [conversationId, addMessage, updateMessage, setSendingMessage, clearAiSuggestion])

  // Send media (image, video, audio, document)
  const sendMedia = useCallback(async (
    file: File,
    contentType: 'image' | 'audio' | 'video' | 'document',
    caption?: string
  ) => {
    if (!conversationId) return

    setSendingMessage(true)
    try {
      const headers = getAuthHeaders()

      const formData = new FormData()
      formData.append('conversationId', conversationId)
      formData.append('contentType', contentType)
      formData.append('file', file)
      if (caption) formData.append('caption', caption)

      const response = await fetch(`${API_BASE}/api/messages/send-media`, {
        method: 'POST',
        headers: { Authorization: headers.Authorization },
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Falha ao enviar mídia')
      }

      clearAiSuggestion()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao enviar mídia'
      toast.error(message)
    } finally {
      setSendingMessage(false)
    }
  }, [conversationId, setSendingMessage, clearAiSuggestion])

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

  const hasLoaded = conversationId ? loadedConversations.has(conversationId) : false

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
    hasMore: hasMore[conversationId ?? ''] ?? true,
    loadingMore: loadingMore[conversationId ?? ''] ?? false,
  }
}
