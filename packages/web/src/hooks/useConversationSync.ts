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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mountedRef = useRef(true)

  // Use refs for store methods to avoid dependency churn
  const storeRef = useRef(useConversationStore.getState())
  storeRef.current = useConversationStore.getState()

  useEffect(() => {
    mountedRef.current = true

    // Guard: clean up any stale channel from StrictMode double-mount
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    async function fetchAll() {
      try {
        // Add AbortController with timeout to prevent hanging
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)

        const { data, error } = await supabase
          .from('conversations')
          .select(CONVERSATION_SELECT)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(500)
          .abortSignal(controller.signal)

        clearTimeout(timeout)

        if (error) {
          console.error('[ConversationSync] Fetch error:', error.message)
        } else if (data && mountedRef.current) {
          storeRef.current.setConversations(data as ConversationWithRelations[])
        }
      } catch (err) {
        console.error('[ConversationSync] Fetch exception:', err)
      } finally {
        // Always set loading false — even on error
        if (mountedRef.current) {
          storeRef.current.setLoading(false)
        }
      }
    }

    // Always fetch data immediately
    fetchAll()

    // Subscribe for realtime updates (best-effort, not blocking)
    // NOTE: This subscribes to ALL conversations (org-scoped via RLS).
    // Future optimization: filter by assigned_to for agent-specific views,
    // but keep broad subscription for inbox (unassigned conversations must be visible).
    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        async (payload) => {
          if (!mountedRef.current) return
          console.log('[ConversationSync] INSERT event received:', payload.new.id)

          // Small delay to ensure contact & related data are committed
          await new Promise((r) => setTimeout(r, 300))

          const { data, error } = await supabase
            .from('conversations')
            .select(CONVERSATION_SELECT)
            .eq('id', payload.new.id)
            .single()

          if (error || !data || !mountedRef.current) return

          // Deduplicate
          const existing = useConversationStore.getState().conversations
          if (!existing.find((c) => c.id === data.id)) {
            storeRef.current.add(data as ConversationWithRelations)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        async (payload) => {
          if (!mountedRef.current) return

          const { data, error } = await supabase
            .from('conversations')
            .select(CONVERSATION_SELECT)
            .eq('id', payload.new.id)
            .single()

          if (error || !data || !mountedRef.current) return

          const existing = useConversationStore.getState().conversations
          if (existing.find((c) => c.id === data.id)) {
            storeRef.current.update(payload.new.id as string, data as ConversationWithRelations)
          } else {
            storeRef.current.add(data as ConversationWithRelations)
          }
        }
      )
      .subscribe((status) => {
        console.log('[ConversationSync] Subscription status:', status)
        if (status === 'CHANNEL_ERROR') {
          console.error('[ConversationSync] Channel error — will retry automatically')
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
  }, []) // No dependencies — runs once, uses refs for store methods
}
