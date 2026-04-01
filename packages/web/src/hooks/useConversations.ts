import { useConversationStore, type ConversationWithRelations } from '@/stores/conversationStore'
import { useActiveProfile } from '@/stores/profileStore'

/**
 * Read-only hook for consuming conversations from the store.
 * Safe to call from multiple components — no side effects.
 * Realtime sync is handled by useConversationSync() in MainLayout.
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

  // Filter conversations based on active filters
  const filteredConversations = conversations.filter((c) => {
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
    if (filters.search) {
      const search = filters.search.toLowerCase()
      const matchName = c.contact?.name?.toLowerCase().includes(search)
      const matchPhone = c.contact?.wa_id?.includes(search)
      const matchPreview = c.last_message_preview?.toLowerCase().includes(search)
      if (!matchName && !matchPhone && !matchPreview) return false
    }
    return true
  })

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null

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
