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

  const updatePresenceList = useCallback(
    (state: Record<string, { userId: string; name: string; avatarUrl: string | null; onlineAt: string }[]>) => {
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
    },
    []
  )

  useEffect(() => {
    if (!profile) return

    const channel = supabase.channel('presence:online', {
      config: { presence: { key: profile.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>()
        updatePresenceList(state)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: profile.id,
            name: profile.name,
            avatarUrl: profile.avatar_url,
            onlineAt: new Date().toISOString(),
          })
        }
      })

    channelRef.current = channel

    const heartbeat = setInterval(async () => {
      if (channelRef.current) {
        await channelRef.current.track({
          userId: profile.id,
          name: profile.name,
          avatarUrl: profile.avatar_url,
          onlineAt: new Date().toISOString(),
        })
      }
    }, 30_000)

    supabase
      .from('users')
      .update({ is_online: true, last_seen_at: new Date().toISOString() })
      .eq('id', profile.id)
      .then()

    return () => {
      clearInterval(heartbeat)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      supabase
        .from('users')
        .update({ is_online: false, last_seen_at: new Date().toISOString() })
        .eq('id', profile.id)
        .then()
    }
  }, [profile, updatePresenceList])

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
