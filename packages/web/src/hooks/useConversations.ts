import { useMemo } from 'react'
import { useConversationStore, type ConversationWithRelations } from '@/stores/conversationStore'
import { useActiveProfile } from '@/stores/profileStore'

/**
 * Read-only hook for consuming conversations from the store.
 * Safe to call from multiple components — no side effects.
 * Realtime sync is handled by useConversationSync() in MainLayout.
 *
 * Filtering is memoized to avoid O(n) work on every render.
 */
export function useConversations() {
  const {
    conversations,
    selectedId,
    filters,
    loading,
    select,
    updateFilters,
    incrementUnread,
    resetUnread,
  } = useConversationStore()
  const activeProfile = useActiveProfile()

  // Memoize filtered conversations — only recalculates when conversations or filters change
  const filteredConversations = useMemo(() => {
    const searchLower = filters.search ? filters.search.toLowerCase() : ''

    return conversations.filter((c) => {
      // Profile sector filter: non-admin profiles see their sector + unassigned (no sector)
      if (activeProfile?.sectorId && c.sector_id !== null && c.sector_id !== activeProfile.sectorId) return false
      if (filters.status !== 'all' && c.status !== filters.status) return false
      if (filters.sectorId !== 'all' && c.sector_id !== filters.sectorId) return false
      if (filters.assignedTo === 'unassigned' && c.assigned_to !== null) return false
      if (
        filters.assignedTo !== 'all' &&
        filters.assignedTo !== 'unassigned' &&
        c.assigned_to !== filters.assignedTo
      )
        return false
      if (searchLower) {
        const matchName = c.contact?.name?.toLowerCase().includes(searchLower)
        const matchPhone = c.contact?.wa_id?.includes(searchLower)
        const matchPreview = c.last_message_preview?.toLowerCase().includes(searchLower)
        if (!matchName && !matchPhone && !matchPreview) return false
      }
      return true
    })
  }, [conversations, filters, activeProfile?.sectorId])

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  return {
    conversations: filteredConversations,
    allConversations: conversations,
    selectedConversation,
    selectedId,
    loading,
    filters,
    select,
    updateFilters,
    incrementUnread,
    resetUnread,
  }
}

export type { ConversationWithRelations }
