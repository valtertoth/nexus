import { create } from 'zustand'
import type { Conversation, Contact, Sector, User, ConversationStatus } from '@nexus/shared'

export interface ConversationWithRelations extends Conversation {
  contact: Contact
  sector?: Sector | null
  assigned_user?: User | null
}

interface ConversationFilters {
  status: ConversationStatus | 'all'
  assignedTo: string | 'all' | 'unassigned'
  sectorId: string | 'all'
  search: string
}

interface ConversationStore {
  conversations: ConversationWithRelations[]
  selectedId: string | null
  filters: ConversationFilters
  loading: boolean

  setConversations: (conversations: ConversationWithRelations[]) => void
  select: (id: string | null) => void
  add: (conversation: ConversationWithRelations) => void
  update: (id: string, data: Partial<ConversationWithRelations>) => void
  updateFilters: (filters: Partial<ConversationFilters>) => void
  setLoading: (loading: boolean) => void
  incrementUnread: (id: string) => void
  resetUnread: (id: string) => void
}

export const useConversationStore = create<ConversationStore>((set) => ({
  conversations: [],
  selectedId: null,
  filters: {
    status: 'all',
    assignedTo: 'all',
    sectorId: 'all',
    search: '',
  },
  loading: true,

  setConversations: (conversations) => set({ conversations, loading: false }),

  select: (id) => set({ selectedId: id }),

  add: (conversation) =>
    set((s) => ({
      conversations: [conversation, ...s.conversations],
    })),

  update: (id, data) =>
    set((s) => ({
      conversations: s.conversations
        .map((c) => (c.id === id ? { ...c, ...data } : c))
        .sort((a, b) => {
          const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
          const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
          return dateB - dateA
        }),
    })),

  updateFilters: (filters) =>
    set((s) => ({
      filters: { ...s.filters, ...filters },
    })),

  setLoading: (loading) => set({ loading }),

  incrementUnread: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, unread_count: c.unread_count + 1 } : c
      ),
    })),

  resetUnread: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, unread_count: 0 } : c
      ),
    })),
}))
