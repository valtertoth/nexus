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

  setMessages: (conversationId: string, messages: Message[]) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (conversationId: string, messageId: string, data: Partial<Message>) => void
  setAiSuggestion: (suggestion: AiSuggestionState | null) => void
  clearAiSuggestion: () => void
  setSendingMessage: (sending: boolean) => void
}

export const useMessageStore = create<MessageStore>((set) => ({
  messages: {},
  aiSuggestion: null,
  sendingMessage: false,

  setMessages: (conversationId, messages) =>
    set((s) => ({
      messages: { ...s.messages, [conversationId]: messages },
    })),

  addMessage: (conversationId, message) =>
    set((s) => {
      const existing = s.messages[conversationId] || []
      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) return s
      return {
        messages: {
          ...s.messages,
          [conversationId]: [...existing, message],
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

  setAiSuggestion: (suggestion) => set({ aiSuggestion: suggestion }),

  clearAiSuggestion: () => set({ aiSuggestion: null }),

  setSendingMessage: (sending) => set({ sendingMessage: sending }),
}))
