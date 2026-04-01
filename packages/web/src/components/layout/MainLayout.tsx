import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { PresenceProvider } from '@/contexts/PresenceContext'
import { useConversationSync } from '@/hooks/useConversationSync'

export function MainLayout() {
  // Single subscription for all conversation realtime events
  useConversationSync()

  return (
    <PresenceProvider>
      <div className="flex h-screen overflow-hidden bg-zinc-50">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Header />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </PresenceProvider>
  )
}
