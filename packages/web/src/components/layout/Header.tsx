import { useLocation } from 'react-router-dom'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { usePresence } from '@/hooks/usePresence'
import { cn } from '@/lib/utils'

const pageTitles: Record<string, string> = {
  '/': 'Inbox',
  '/dashboard': 'Dashboard',
  '/contacts': 'Contatos',
  '/knowledge': 'Conhecimento',
  '/analytics': 'Analytics',
  '/intelligence': 'Aprendizado',
  '/attribution': 'Funil de Vendas',
  '/brain': 'Cerebro',
  '/settings': 'Configuracoes',
  '/dev/simulator': 'Simulador',
  '/dev/whatsapp': 'WhatsApp',
}

export function Header() {
  const location = useLocation()
  const { profile } = useAuthContext()
  const { isUserOnline } = usePresence()
  const title = pageTitles[location.pathname] ?? 'Nexus'
  const amOnline = profile ? isUserOnline(profile.id) : false

  // Hide on Inbox — the chat has its own header
  if (location.pathname === '/') return null

  return (
    <header className="flex items-center justify-between h-11 px-5 border-b border-zinc-100 bg-white">
      <h1 className="text-sm font-medium text-zinc-800 tracking-tight">
        {title}
      </h1>

      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            amOnline ? 'bg-emerald-500' : 'bg-zinc-300'
          )}
        />
        <span className="text-[11px] text-zinc-400">
          {amOnline ? 'Online' : 'Offline'}
        </span>
      </div>
    </header>
  )
}
