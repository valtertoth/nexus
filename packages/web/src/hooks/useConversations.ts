import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useConversationStore, type ConversationWithRelations } from '@/stores/conversationStore'

export function useConversations() {
  const {
    conversations,
    selectedId,
    filters,
    loading,
    setConversations,
    select,
    add,
    update,
    updateFilters,
    incrementUnread,
    resetUnread,
  } = useConversationStore()

  // Fetch conversations with joins
  const fetchConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts(*),
        sector:sectors(*),
        assigned_user:users(*)
      `)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50)

    if (!error && data) {
      setConversations(data as ConversationWithRelations[])
    }
  }, [setConversations])

  // Initial fetch
  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Realtime subscription for conversations
  useEffect(() => {
    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
        },
        async (payload) => {
          // Fetch the full conversation with relations
          const { data } = await supabase
            .from('conversations')
            .select(`
              *,
              contact:contacts(*),
              sector:sectors(*),
              assigned_user:users(*)
            `)
            .eq('id', payload.new.id)
            .single()

          if (data) {
            add(data as ConversationWithRelations)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        },
        (payload) => {
          update(payload.new.id as string, payload.new as Partial<ConversationWithRelations>)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [add, update])

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
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
    refetch: fetchConversations,
  }
}
