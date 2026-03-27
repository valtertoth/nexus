import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AIModeToggle } from '@/components/ai/AIModeToggle'
import { MoreVertical, ArrowRightLeft, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { getInitials, formatPhone } from '@nexus/shared'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ConversationWithRelations } from '@/stores/conversationStore'
import type { AiMode } from '@nexus/shared'

interface ChatHeaderProps {
  conversation: ConversationWithRelations
  aiMode: AiMode
  onAiModeChange: (mode: AiMode) => void
}

export function ChatHeader({ conversation, aiMode, onAiModeChange }: ChatHeaderProps) {
  const contact = conversation.contact
  const contactName = contact?.name || contact?.wa_id || 'Desconhecido'

  // Calculate service window remaining
  const windowExpires = conversation.wa_service_window_expires_at
  const isWindowActive = windowExpires ? new Date(windowExpires) > new Date() : false
  const windowRemaining = windowExpires && isWindowActive
    ? formatDistanceToNow(new Date(windowExpires), { locale: ptBR })
    : null

  return (
    <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-200 bg-white">
      {/* Left: Contact info */}
      <div className="flex items-center gap-3">
        <Avatar className="w-8 h-8">
          <AvatarFallback className="bg-zinc-200 text-zinc-600 text-xs">
            {getInitials(contactName)}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900">{contactName}</span>
            {conversation.sector && (
              <span
                className="text-xs px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: `${conversation.sector.color}15`,
                  color: conversation.sector.color,
                }}
              >
                {conversation.sector.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {contact?.wa_id && (
              <span className="text-xs text-zinc-400">
                {formatPhone(contact.wa_id)}
              </span>
            )}
            {windowRemaining && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <Clock className="w-3 h-3" />
                Expira em {windowRemaining}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: AI toggle + actions */}
      <div className="flex items-center gap-3">
        <AIModeToggle value={aiMode} onChange={onAiModeChange} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              Transferir
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Resolver
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-red-600">
              <XCircle className="w-4 h-4" />
              Fechar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
