import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { usePresence } from '@/hooks/usePresence'
import { ProfileSwitcher } from '@/components/layout/ProfileSwitcher'
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
  BarChart3,
  Settings,
  Zap,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Lightbulb,
  GitMerge,
  Smartphone,
  Radio,
  Database,
  Brain,
} from 'lucide-react'
import { getInitials } from '@nexus/shared'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  badge?: number
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'Operacao',
    items: [
      { to: '/', icon: MessageSquare, label: 'Inbox' },
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/contacts', icon: Users, label: 'Contatos' },
    ],
  },
  {
    title: 'Inteligencia',
    items: [
      { to: '/brain', icon: Brain, label: 'Cerebro' },
      { to: '/knowledge', icon: Database, label: 'Conhecimento' },
      { to: '/intelligence', icon: Lightbulb, label: 'Aprendizado' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/attribution', icon: GitMerge, label: 'Funil' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/settings', icon: Settings, label: 'Configuracoes' },
    ],
  },
]

const devNavItems: NavItem[] = [
  { to: '/dev/simulator', icon: Smartphone, label: 'Simulador' },
  { to: '/dev/whatsapp', icon: Radio, label: 'WhatsApp' },
]

export function Sidebar() {
  const [expanded, setExpanded] = useState(false)
  const { onlineUsers } = usePresence()

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-zinc-950 border-r border-zinc-800 transition-all duration-200',
        expanded ? 'w-56' : 'w-14'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-12 px-3 border-b border-zinc-800/60">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {expanded && (
          <span className="ml-2.5 text-sm font-bold text-white tracking-tight">
            Nexus
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-1.5 flex flex-col overflow-y-auto">
        <div className="flex-1 space-y-3">
          {navSections.map((section) => (
            <div key={section.title}>
              {expanded && (
                <p className="px-2.5 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
                  {section.title}
                </p>
              )}
              {!expanded && section.title !== 'Operacao' && (
                <div className="mx-2 mb-1.5 border-t border-zinc-800/40" />
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <Tooltip key={item.to}>
                      <TooltipTrigger
                        render={
                          <NavLink
                            to={item.to}
                            end={item.to === '/'}
                            className={({ isActive }) =>
                              cn(
                                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors duration-100',
                                isActive
                                  ? 'bg-zinc-800/70 text-white font-medium'
                                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                              )
                            }
                          />
                        }
                      >
                        <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.6} />
                        {expanded && <span>{item.label}</span>}
                        {item.badge && item.badge > 0 && (
                          <Badge
                            variant="destructive"
                            className="ml-auto h-4 min-w-4 flex items-center justify-center text-[10px] px-1"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </TooltipTrigger>
                      {!expanded && (
                        <TooltipContent side="right" sideOffset={6} className="text-xs">
                          {item.label}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Dev tools */}
        <div className="pt-1.5 mt-1 border-t border-zinc-800/40 space-y-0.5">
          {expanded && (
            <p className="px-2.5 pb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-700">
              Dev
            </p>
          )}
          {devNavItems.map((item) => {
            const Icon = item.icon
            return (
              <Tooltip key={item.to}>
                <TooltipTrigger
                  render={
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors duration-100',
                          isActive
                            ? 'bg-zinc-800/50 text-zinc-400'
                            : 'text-zinc-700 hover:text-zinc-500 hover:bg-zinc-800/20'
                        )
                      }
                    />
                  }
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.6} />
                  {expanded && <span>{item.label}</span>}
                </TooltipTrigger>
                {!expanded && (
                  <TooltipContent side="right" sideOffset={6} className="text-xs">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            )
          })}
        </div>
      </nav>

      {/* Online Users */}
      {expanded && onlineUsers.length > 0 && (
        <div className="mx-2 mb-1.5 rounded-md bg-zinc-900/40 p-2">
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            Online ({onlineUsers.length})
          </p>
          <div className="space-y-1">
            {onlineUsers.slice(0, 5).map((user) => (
              <div key={user.userId} className="flex items-center gap-1.5">
                <div className="relative">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="bg-zinc-700 text-zinc-300 text-[8px]">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-zinc-950 bg-emerald-500" />
                </div>
                <span className="truncate text-[11px] text-zinc-500">{user.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!expanded && onlineUsers.length > 0 && (
        <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900/40">
          <div className="relative">
            <span className="text-[10px] font-medium text-zinc-500">{onlineUsers.length}</span>
            <div className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </div>
        </div>
      )}

      {/* Expand/Collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-center mx-1.5 mb-1.5 py-1.5 rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/30 transition-colors"
        aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}
      >
        {expanded ? (
          <ChevronLeft className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Profile switcher */}
      <div className="border-t border-zinc-800/60 p-2">
        <ProfileSwitcher expanded={expanded} />
      </div>
    </aside>
  )
}
