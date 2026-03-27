import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useMessageStore } from '@/stores/messageStore'
import { useConversationStore } from '@/stores/conversationStore'
import type { Message } from '@nexus/shared'

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
    }
  }, [setMessages])

  // Fetch when conversationId changes
  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId)
      resetUnread(conversationId)
    }
  }, [conversationId, fetchMessages, resetUnread])

  // Realtime: new messages + AI suggestion updates
  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          addMessage(conversationId, msg)

          // Update conversation preview
          updateConversation(conversationId, {
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
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message
          updateMessage(conversationId, updated.id, updated)

          // If AI suggestion arrived, show it
          if (updated.ai_suggested_response && updated.sender_type === 'contact') {
            setAiSuggestion({
              text: updated.ai_suggested_response,
              sources: updated.ai_suggestion_sources || [],
              loading: false,
              conversationId,
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, addMessage, updateMessage, setAiSuggestion, updateConversation])

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
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token

      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
        throw new Error('Falha ao enviar mensagem')
      }

      clearAiSuggestion()
    } finally {
      setSendingMessage(false)
    }
  }, [conversationId, setSendingMessage, clearAiSuggestion])

  return {
    messages,
    aiSuggestion: aiSuggestion?.conversationId === conversationId ? aiSuggestion : null,
    sendingMessage,
    sendMessage,
    clearAiSuggestion,
    setAiSuggestion,
  }
}
