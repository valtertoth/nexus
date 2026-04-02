import { useConversations } from '@/hooks/useConversations'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { ConversationItem } from './ConversationItem'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Search, MessageSquare } from 'lucide-react'

function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-zinc-200 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-4 w-32 bg-zinc-200 rounded mb-2" />
        <div className="h-3 w-48 bg-zinc-100 rounded" />
      </div>
      <div className="h-3 w-10 bg-zinc-100 rounded" />
    </div>
  )
}

function EmptyInbox({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
        <MessageSquare className="w-6 h-6 text-zinc-400" />
      </div>
      <p className="text-sm font-medium text-zinc-700 mb-1">
        {hasSearch ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa'}
      </p>
      <p className="text-xs text-zinc-400">
        {hasSearch
          ? 'Tente buscar com outros termos.'
          : 'As conversas aparecerão aqui quando clientes enviarem mensagens.'}
      </p>
    </div>
  )
}

const filterTabs = [
  { key: 'all', label: 'Todas' },
  { key: 'mine', label: 'Minhas' },
  { key: 'unassigned', label: 'Não atribuídas' },
] as const

type FilterTab = typeof filterTabs[number]['key']

export function ConversationList() {
  const { profile } = useAuthContext()
  const {
    conversations,
    selectedId,
    loading,
    filters,
    select,
    updateFilters,
  } = useConversations()

  const activeTab: FilterTab =
    filters.assignedTo === 'unassigned'
      ? 'unassigned'
      : filters.assignedTo !== 'all'
        ? 'mine'
        : 'all'

  function handleTabChange(tab: FilterTab) {
    switch (tab) {
      case 'all':
        updateFilters({ assignedTo: 'all' })
        break
      case 'mine':
        updateFilters({ assignedTo: profile?.id || 'all' })
        break
      case 'unassigned':
        updateFilters({ assignedTo: 'unassigned' })
        break
    }
  }

  return (
    <div className="flex flex-col h-full border-r border-zinc-200 bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="Buscar conversas..."
            className="pl-9 h-9 text-sm"
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-4 pb-3">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={cn(
              'px-3 py-1 text-xs rounded-md transition-colors duration-150',
              activeTab === tab.key
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:bg-zinc-100'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Separator />

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="py-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <ConversationSkeleton key={i} />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <EmptyInbox hasSearch={!!filters.search} />
        ) : (
          <div>
            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isSelected={conversation.id === selectedId}
                onSelect={select}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
