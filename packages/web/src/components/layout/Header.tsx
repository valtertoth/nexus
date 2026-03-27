import { useLocation } from 'react-router-dom'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { cn } from '@/lib/utils'

const pageTitles: Record<string, string> = {
  '/': 'Inbox',
  '/dashboard': 'Dashboard',
  '/contacts': 'Contatos',
  '/knowledge': 'Base de Conhecimento',
  '/analytics': 'Analytics',
  '/settings': 'Configurações',
}

export function Header() {
  const location = useLocation()
  const { profile } = useAuthContext()
  const title = pageTitles[location.pathname] ?? 'Nexus'

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-zinc-200 bg-white">
      <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">
        {title}
      </h1>

      <div className="flex items-center gap-3">
        {/* Online/Offline indicator */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              profile?.is_online ? 'bg-emerald-500' : 'bg-zinc-300'
            )}
          />
          <span className="text-xs text-zinc-500">
            {profile?.is_online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </header>
  )
}
