import { useConversations } from '@/hooks/useConversations'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { ConversationItem } from './ConversationItem'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Search, Loader2, MessageSquare } from 'lucide-react'

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
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <MessageSquare className="w-8 h-8 text-zinc-200 mb-3" />
            <p className="text-sm text-zinc-400 text-center">
              {filters.search
                ? 'Nenhuma conversa encontrada'
                : 'Nenhuma conversa ainda'}
            </p>
          </div>
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
