import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare,
  Users,
  Brain,
  BarChart3,
  Settings,
  Zap,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { getInitials } from '@nexus/shared'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  badge?: number
}

const navItems: NavItem[] = [
  { to: '/', icon: MessageSquare, label: 'Inbox' },
  { to: '/contacts', icon: Users, label: 'Contatos' },
  { to: '/knowledge', icon: Brain, label: 'Conhecimento' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
]

export function Sidebar() {
  const [expanded, setExpanded] = useState(false)
  const { profile, signOut } = useAuthContext()

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-zinc-950 border-r border-zinc-800 transition-all duration-200',
        expanded ? 'w-64' : 'w-16'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-zinc-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {expanded && (
          <span className="ml-3 text-lg font-bold text-white tracking-tight">
            Nexus
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Tooltip key={item.to} delayDuration={0}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150',
                      isActive
                        ? 'bg-zinc-800/60 text-white'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
                    )
                  }
                >
                  <Icon className="w-5 h-5 shrink-0" strokeWidth={1.5} />
                  {expanded && <span>{item.label}</span>}
                  {item.badge && item.badge > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-auto h-5 min-w-5 flex items-center justify-center text-xs px-1.5"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </NavLink>
              </TooltipTrigger>
              {!expanded && (
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              )}
            </Tooltip>
          )
        })}
      </nav>

      {/* Expand/Collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-center mx-2 mb-2 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronLeft className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>

      {/* User section */}
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-zinc-700 text-zinc-200 text-xs">
              {profile ? getInitials(profile.name) : '?'}
            </AvatarFallback>
          </Avatar>
          {expanded && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">
                {profile?.name}
              </p>
              <p className="text-xs text-zinc-500 truncate">
                {profile?.email}
              </p>
            </div>
          )}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sair</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  )
}
