import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useConversationStore, type ConversationWithRelations } from '@/stores/conversationStore'

const CONVERSATION_SELECT = `
  *,
  contact:contacts(*),
  sector:sectors(*),
  assigned_user:users!conversations_assigned_to_fkey(*)
`

/**
 * Singleton sync hook — call ONCE in a top-level component (e.g. MainLayout).
 * Subscribes to realtime changes and performs initial fetch.
 * Other components use useConversations() to read/filter the store.
 */
export function useConversationSync() {
  const { setConversations, add, update } = useConversationStore()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const { setLoading } = useConversationStore.getState()

    async function fetchAll() {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select(CONVERSATION_SELECT)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(500)

        if (error) {
          console.error('[ConversationSync] Fetch error:', error.message)
          if (mountedRef.current) setLoading(false)
          return
        }

        if (data && mountedRef.current) {
          setConversations(data as ConversationWithRelations[])
        }
      } catch (err) {
        console.error('[ConversationSync] Fetch exception:', err)
        if (mountedRef.current) setLoading(false)
      }
    }

    // Always fetch data immediately — don't depend on realtime status
    fetchAll()

    // Subscribe for realtime updates (best-effort, not blocking)
    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        async (payload) => {
          console.log('[ConversationSync] INSERT event received:', payload.new.id)

          // Small delay to ensure contact & related data are committed
          await new Promise((r) => setTimeout(r, 300))

          const { data, error } = await supabase
            .from('conversations')
            .select(CONVERSATION_SELECT)
            .eq('id', payload.new.id)
            .single()

          if (error) {
            console.error('[ConversationSync] INSERT fetch error:', error.message)
            return
          }

          if (data && mountedRef.current) {
            // Deduplicate — avoid adding if already in store (race with fetchAll)
            const existing = useConversationStore.getState().conversations
            if (!existing.find((c) => c.id === data.id)) {
              add(data as ConversationWithRelations)
              console.log('[ConversationSync] New conversation added:', data.id)
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        async (payload) => {
          // Re-fetch with full relations
          const { data, error } = await supabase
            .from('conversations')
            .select(CONVERSATION_SELECT)
            .eq('id', payload.new.id)
            .single()

          if (error) {
            console.error('[ConversationSync] UPDATE fetch error:', error.message)
            return
          }

          if (data && mountedRef.current) {
            // If conversation doesn't exist in store yet (e.g. reopened), add it
            const existing = useConversationStore.getState().conversations
            if (existing.find((c) => c.id === data.id)) {
              update(payload.new.id as string, data as ConversationWithRelations)
            } else {
              add(data as ConversationWithRelations)
              console.log('[ConversationSync] Conversation added via UPDATE:', data.id)
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[ConversationSync] Subscription status:', status)
        if (status === 'CHANNEL_ERROR') {
          console.error('[ConversationSync] Channel error — realtime updates may be delayed')
        }
      })

    channelRef.current = channel

    return () => {
      mountedRef.current = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [setConversations, add, update])
}
