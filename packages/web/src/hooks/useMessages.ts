import { useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { useMessageStore } from '@/stores/messageStore'
import { useConversationStore } from '@/stores/conversationStore'
import type { Message } from '@nexus/shared'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function useMessages(conversationId: string | null) {
  const {
    messages: allMessages,
    aiSuggestion,
    sendingMessage,
    setMessages,
    addMessage,
    updateMessage,
    setAiSuggestion,
    clearAiSuggestion,
    setSendingMessage,
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

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (convId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (!error && data) {
      setMessages(convId, data as Message[])

      // Load existing AI suggestion from the latest contact message
      const latestContactMsg = [...data]
        .reverse()
        .find((m) => m.sender_type === 'contact' && m.ai_suggested_response)

      if (latestContactMsg?.ai_suggested_response) {
        const contactMsgIndex = data.findIndex((m) => m.id === latestContactMsg.id)
        const hasAgentReplyAfter = data
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
  }, [setMessages, setAiSuggestion])

  // Fetch when conversationId changes
  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId)
      resetUnread(conversationId)

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
  useEffect(() => {
    if (!conversationId) return

    const convId = conversationId

    const channel = supabase
      .channel(`messages:${convId}`)
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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId]) // Only conversationId — refs handle the rest

  // Send message
  const sendMessage = useCallback(async (
    content: string,
    options?: {
      aiApproved?: boolean
      aiEdited?: boolean
      aiOriginal?: string
    }
  ) => {
    if (!conversationId || !content.trim()) return

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
        throw new Error((err as { error?: string }).error || 'Falha ao enviar mensagem')
      }

      clearAiSuggestion()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao enviar mensagem'
      toast.error(message)
    } finally {
      setSendingMessage(false)
    }
  }, [conversationId, setSendingMessage, clearAiSuggestion])

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

  return {
    messages,
    aiSuggestion: aiSuggestion?.conversationId === conversationId ? aiSuggestion : null,
    sendingMessage,
    sendMessage,
    sendMedia,
    clearAiSuggestion,
    setAiSuggestion,
  }
}
