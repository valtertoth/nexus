import { memo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { getInitials, truncate } from '@nexus/shared'
import { getAvatarColor } from '@/lib/avatarColors'
import type { ConversationWithRelations } from '@/stores/conversationStore'

interface ConversationItemProps {
  conversation: ConversationWithRelations
  isSelected: boolean
  onSelect: (id: string) => void
}

const statusColors: Record<string, string> = {
  open: 'bg-emerald-500',
  pending: 'bg-amber-500',
  resolved: 'bg-zinc-300',
  closed: 'bg-zinc-200',
}

export const ConversationItem = memo(function ConversationItem({ conversation, isSelected, onSelect }: ConversationItemProps) {
  const contact = conversation.contact
  const contactName = contact?.name || contact?.wa_id || 'Desconhecido'
  const initials = getInitials(contactName)
  const avatarColor = getAvatarColor(contactName)
  const hasUnread = conversation.unread_count > 0

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
        locale: ptBR,
      })
    : ''

  return (
    <button
      onClick={() => onSelect(conversation.id)}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors duration-150 border-l-2',
        isSelected
          ? 'bg-zinc-100 border-l-zinc-900'
          : 'bg-white border-l-transparent hover:bg-zinc-50',
      )}
    >
      {/* Status indicator + Avatar */}
      <div className="relative shrink-0">
        <Avatar className="w-10 h-10">
          {contact?.avatar_url && <AvatarImage src={contact.avatar_url} alt={contactName} />}
          <AvatarFallback className={`${avatarColor.bg} ${avatarColor.text} text-sm font-medium`}>
            {initials}
          </AvatarFallback>
        </Avatar>
        <div
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white',
            statusColors[conversation.status] || 'bg-zinc-300'
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'text-sm truncate',
              hasUnread ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-700'
            )}
          >
            {contactName}
          </span>
          <span className="text-xs text-zinc-400 shrink-0">{timeAgo}</span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p
            className={cn(
              'text-sm truncate',
              hasUnread ? 'text-zinc-600' : 'text-zinc-400'
            )}
          >
            {conversation.last_message_preview
              ? truncate(conversation.last_message_preview, 60)
              : 'Nenhuma mensagem'}
          </p>

          {hasUnread && (
            <Badge
              variant="default"
              className="shrink-0 h-5 min-w-5 flex items-center justify-center text-xs px-1.5 rounded-full"
            >
              {conversation.unread_count}
            </Badge>
          )}
        </div>

        {/* Sector tag */}
        {conversation.sector && (
          <div className="mt-1.5">
            <span
              className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md font-medium"
              style={{
                backgroundColor: `${conversation.sector.color}15`,
                color: conversation.sector.color,
              }}
            >
              {conversation.sector.name}
            </span>
          </div>
        )}
      </div>
    </button>
  )
})
