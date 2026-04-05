import { useEffect, useMemo } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { PresenceProvider } from '@/contexts/PresenceContext'
import { useConversationSync } from '@/hooks/useConversationSync'
import { useConversationStore } from '@/stores/conversationStore'
import { requestNotificationPermission } from '@/lib/notifications'

export function MainLayout() {
  // Single subscription for all conversation realtime events
  useConversationSync()

  const conversations = useConversationStore((s) => s.conversations)

  // Request notification permission AFTER app is interactive (deferred)
  useEffect(() => {
    const timer = setTimeout(() => {
      requestNotificationPermission()
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  // Memoize unread count to avoid recalculating on every render
  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [conversations]
  )

  // Update tab title with unread count
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Nexus` : 'Nexus'
  }, [totalUnread])

  return (
    <PresenceProvider>
      <div className="flex h-screen overflow-hidden bg-zinc-50">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Header />
          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </PresenceProvider>
  )
}
