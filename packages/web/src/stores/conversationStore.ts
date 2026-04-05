import { create } from 'zustand'
import type { Conversation, Contact, Sector, User, ConversationStatus } from '@nexus/shared'

export interface ConversationWithRelations extends Conversation {
  contact: Contact
  sector?: Sector
  assigned_user?: User
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
  hasMore: boolean
  loadingMore: boolean

  setConversations: (conversations: ConversationWithRelations[]) => void
  appendConversations: (conversations: ConversationWithRelations[]) => void
  select: (id: string | null) => void
  add: (conversation: ConversationWithRelations) => void
  update: (id: string, data: Partial<ConversationWithRelations>) => void
  updateFilters: (filters: Partial<ConversationFilters>) => void
  setLoading: (loading: boolean) => void
  setLoadingMore: (loading: boolean) => void
  setHasMore: (hasMore: boolean) => void
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
  hasMore: true,
  loadingMore: false,

  setConversations: (conversations) => set({ conversations, loading: false }),

  appendConversations: (newConversations) =>
    set((s) => {
      const existingIds = new Set(s.conversations.map((c) => c.id))
      const deduped = newConversations.filter((c) => !existingIds.has(c.id))
      return { conversations: [...s.conversations, ...deduped] }
    }),

  select: (id) => set({ selectedId: id }),

  add: (conversation) =>
    set((s) => ({
      conversations: [conversation, ...s.conversations],
    })),

  update: (id, data) =>
    set((s) => {
      const conversations = [...s.conversations]
      const idx = conversations.findIndex((c) => c.id === id)
      if (idx === -1) return s

      const updated = { ...conversations[idx], ...data }

      // If last_message_at changed, remove from current position and insert at top
      // This is O(n) instead of O(n log n) full re-sort
      if (data.last_message_at) {
        conversations.splice(idx, 1)
        conversations.unshift(updated)
      } else {
        conversations[idx] = updated
      }

      return { conversations }
    }),

  updateFilters: (filters) =>
    set((s) => ({
      filters: { ...s.filters, ...filters },
    })),

  setLoading: (loading) => set({ loading }),
  setLoadingMore: (loadingMore) => set({ loadingMore }),
  setHasMore: (hasMore) => set({ hasMore }),

  incrementUnread: (id) =>
    set((s) => {
      const idx = s.conversations.findIndex((c) => c.id === id)
      if (idx === -1) return s
      const conversations = [...s.conversations]
      conversations[idx] = { ...conversations[idx], unread_count: conversations[idx].unread_count + 1 }
      return { conversations }
    }),

  resetUnread: (id) =>
    set((s) => {
      const idx = s.conversations.findIndex((c) => c.id === id)
      if (idx === -1 || s.conversations[idx].unread_count === 0) return s // Skip if already 0
      const conversations = [...s.conversations]
      conversations[idx] = { ...conversations[idx], unread_count: 0 }
      return { conversations }
    }),
}))
