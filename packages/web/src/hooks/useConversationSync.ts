import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useConversationStore, type ConversationWithRelations } from '@/stores/conversationStore'
import { useConnectionStore } from '@/stores/connectionStore'

const CONVERSATION_SELECT = `
  *,
  contact:contacts(*),
  sector:sectors(*),
  assigned_user:users!conversations_assigned_to_fkey(*)
`

const MAX_RETRIES = 10
const PAGE_SIZE = 50

/**
 * Singleton sync hook — call ONCE in a top-level component (e.g. MainLayout).
 * Subscribes to realtime changes and performs initial fetch.
 * Handles reconnection with exponential backoff.
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

    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let retryCount = 0
    let wasDisconnected = false

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
          .limit(PAGE_SIZE)
          .abortSignal(controller.signal)

        clearTimeout(timeout)

        if (error) {
          console.error('[ConversationSync] Fetch error:', error.message)
        } else if (data && mountedRef.current) {
          storeRef.current.setConversations(data as ConversationWithRelations[])
          storeRef.current.setHasMore(data.length === PAGE_SIZE)
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

    function subscribe() {
      if (!mountedRef.current) return

      // Clean up previous channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }

      // Unique channel name per attempt to avoid conflicts
      const channel = supabase
        .channel(`conversations-realtime-${Date.now()}`)
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
        .subscribe((status, err) => {
          if (!mountedRef.current) return

          if (status === 'SUBSCRIBED') {
            console.log('[ConversationSync] Connected to conversations channel')
            retryCount = 0
            useConnectionStore.getState().setRealtimeConnected(true)
            // If reconnecting after a disconnection, refetch to catch up
            if (wasDisconnected) {
              console.log('[ConversationSync] Reconnected — refetching conversations...')
              fetchAll()
              wasDisconnected = false
            }
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[ConversationSync] ${status}:`, err?.message)
            wasDisconnected = true
            useConnectionStore.getState().setRealtimeConnected(false)

            if (retryCount < MAX_RETRIES && mountedRef.current) {
              const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
              retryCount++
              console.log(`[ConversationSync] Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`)
              retryTimeout = setTimeout(subscribe, delay)
            } else if (retryCount >= MAX_RETRIES) {
              console.error('[ConversationSync] Max retries reached. Realtime subscription stopped.')
            }
          }

          if (status === 'CLOSED') {
            console.warn('[ConversationSync] Channel closed')
            wasDisconnected = true
            useConnectionStore.getState().setRealtimeConnected(false)

            if (retryCount < MAX_RETRIES && mountedRef.current) {
              const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
              retryCount++
              retryTimeout = setTimeout(subscribe, delay)
            }
          }
        })

      channelRef.current = channel
    }

    // Always fetch data immediately
    fetchAll()

    // Subscribe for realtime updates with reconnection logic
    subscribe()

    // Auto-refresh conversations when browser comes back online
    const handleOnline = () => {
      if (!mountedRef.current) return
      console.log('[ConversationSync] Back online — refreshing...')
      fetchAll()
      // Also re-subscribe in case the channel is stale
      retryCount = 0
      subscribe()
    }
    window.addEventListener('online', handleOnline)

    return () => {
      mountedRef.current = false
      window.removeEventListener('online', handleOnline)
      if (retryTimeout) clearTimeout(retryTimeout)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, []) // No dependencies — runs once, uses refs for store methods
}

/**
 * Load the next page of conversations (called from ConversationList on scroll-to-bottom).
 */
export async function fetchMoreConversations(): Promise<void> {
  const store = useConversationStore.getState()
  if (store.loadingMore || !store.hasMore) return

  store.setLoadingMore(true)

  try {
    const existing = store.conversations
    const lastConv = existing[existing.length - 1]
    if (!lastConv) return

    const { data, error } = await supabase
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .lt('last_message_at', lastConv.last_message_at || lastConv.created_at)
      .limit(PAGE_SIZE)

    if (error) {
      console.error('[ConversationSync] FetchMore error:', error.message)
      return
    }

    if (data) {
      store.appendConversations(data as ConversationWithRelations[])
      store.setHasMore(data.length === PAGE_SIZE)
    }
  } catch (err) {
    console.error('[ConversationSync] FetchMore exception:', err)
  } finally {
    store.setLoadingMore(false)
  }
}
