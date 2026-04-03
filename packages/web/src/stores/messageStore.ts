import { create } from 'zustand'
import type { Message, AiSuggestionSource } from '@nexus/shared'

interface AiSuggestionState {
  text: string
  sources: AiSuggestionSource[]
  loading: boolean
  conversationId: string
}

interface MessageStore {
  messages: Record<string, Message[]>
  aiSuggestion: AiSuggestionState | null
  sendingMessage: boolean

  // Per-conversation pagination state
  hasMore: Record<string, boolean>
  loadingMore: Record<string, boolean>

  // Tracks which conversations have completed their initial fetch
  loadedConversations: Set<string>

  setMessages: (conversationId: string, messages: Message[]) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (conversationId: string, messageId: string, data: Partial<Message>) => void
  removeMessage: (conversationId: string, messageId: string) => void
  prependMessages: (conversationId: string, messages: Message[]) => void
  setHasMore: (conversationId: string, hasMore: boolean) => void
  setLoadingMore: (conversationId: string, loading: boolean) => void
  setAiSuggestion: (suggestion: AiSuggestionState | null) => void
  clearAiSuggestion: () => void
  setSendingMessage: (sending: boolean) => void
}

export const useMessageStore = create<MessageStore>((set) => ({
  messages: {},
  aiSuggestion: null,
  sendingMessage: false,
  hasMore: {},
  loadingMore: {},
  loadedConversations: new Set(),

  setMessages: (conversationId, messages) =>
    set((s) => {
      const loaded = new Set(s.loadedConversations)
      loaded.add(conversationId)
      return {
        messages: { ...s.messages, [conversationId]: messages },
        loadedConversations: loaded,
      }
    }),

  addMessage: (conversationId, message) =>
    set((s) => {
      const existing = s.messages[conversationId] || []
      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) return s

      // If this is a real agent message (from server/realtime), remove the
      // oldest temp message (FIFO order ensures correct pairing even for
      // duplicate content like "ok" sent twice)
      let filtered = existing
      if (message.sender_type === 'agent' && !message.id.startsWith('temp-')) {
        let removedOne = false
        filtered = existing.filter((m) => {
          if (removedOne) return true
          if (m.id.startsWith('temp-') && m.sender_type === 'agent') {
            removedOne = true
            return false // Remove the first (oldest) temp message
          }
          return true
        })
      }

      return {
        messages: {
          ...s.messages,
          [conversationId]: [...filtered, message],
        },
      }
    }),

  updateMessage: (conversationId, messageId, data) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          m.id === messageId ? { ...m, ...data } : m
        ),
      },
    })),

  removeMessage: (conversationId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).filter(
          (m) => m.id !== messageId
        ),
      },
    })),

  prependMessages: (conversationId, messages) =>
    set((s) => {
      const existing = s.messages[conversationId] || []
      const existingIds = new Set(existing.map((m) => m.id))
      const newMessages = messages.filter((m) => !existingIds.has(m.id))
      return {
        messages: {
          ...s.messages,
          [conversationId]: [...newMessages, ...existing],
        },
      }
    }),

  setHasMore: (conversationId, hasMore) =>
    set((s) => ({
      hasMore: { ...s.hasMore, [conversationId]: hasMore },
    })),

  setLoadingMore: (conversationId, loading) =>
    set((s) => ({
      loadingMore: { ...s.loadingMore, [conversationId]: loading },
    })),

  setAiSuggestion: (suggestion) => set({ aiSuggestion: suggestion }),

  clearAiSuggestion: () => set({ aiSuggestion: null }),

  setSendingMessage: (sending) => set({ sendingMessage: sending }),
}))
