import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'

interface PresenceUser {
  userId: string
  name: string
  avatarUrl: string | null
  onlineAt: string
}

interface PresenceContextValue {
  onlineUsers: PresenceUser[]
  isUserOnline: (userId: string) => boolean
}

const PresenceContext = createContext<PresenceContextValue>({
  onlineUsers: [],
  isUserOnline: () => false,
})

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuthContext()
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const profileRef = useRef(profile)
  profileRef.current = profile

  useEffect(() => {
    if (!profile) return

    const profileId = profile.id
    const profileName = profile.name
    const profileAvatar = profile.avatar_url

    const channel = supabase.channel('presence:online', {
      config: { presence: { key: profileId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>()
        const users: PresenceUser[] = []
        const seen = new Set<string>()
        for (const presences of Object.values(state)) {
          for (const p of presences) {
            if (!seen.has(p.userId)) {
              seen.add(p.userId)
              users.push(p)
            }
          }
        }
        setOnlineUsers(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: profileId,
            name: profileName,
            avatarUrl: profileAvatar,
            onlineAt: new Date().toISOString(),
          })
        }
      })

    channelRef.current = channel

    // Heartbeat every 30s — use try/catch to prevent hanging
    const heartbeat = setInterval(() => {
      if (channelRef.current) {
        channelRef.current.track({
          userId: profileId,
          name: profileName,
          avatarUrl: profileAvatar,
          onlineAt: new Date().toISOString(),
        }).catch(() => {
          // Silently ignore heartbeat errors — channel will reconnect
        })
      }
    }, 30_000)

    // Mark online in DB (fire-and-forget with error handling)
    supabase
      .from('users')
      .update({ is_online: true, last_seen_at: new Date().toISOString() })
      .eq('id', profileId)
      .then(({ error }) => {
        if (error) console.warn('[Presence] Online update failed:', error.message)
      })

    return () => {
      clearInterval(heartbeat)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      supabase
        .from('users')
        .update({ is_online: false, last_seen_at: new Date().toISOString() })
        .eq('id', profileId)
        .then(({ error }) => {
          if (error) console.warn('[Presence] Offline update failed:', error.message)
        })
    }
  }, [profile?.id]) // Only re-run when user ID changes, not on every profile object change

  const isUserOnline = useCallback(
    (userId: string) => onlineUsers.some((u) => u.userId === userId),
    [onlineUsers]
  )

  return (
    <PresenceContext.Provider value={{ onlineUsers, isUserOnline }}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresenceContext() {
  return useContext(PresenceContext)
}
