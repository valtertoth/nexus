import { useEffect, useCallback } from 'react'
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
      // Show suggestion if it's on the last contact message and no agent replied after it
      const latestContactMsg = [...data]
        .reverse()
        .find((m) => m.sender_type === 'contact' && m.ai_suggested_response)

      if (latestContactMsg?.ai_suggested_response) {
        // Check that no agent message was sent AFTER this contact message
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
