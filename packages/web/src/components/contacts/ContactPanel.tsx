import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Phone, Mail, Calendar, Tag, X } from 'lucide-react'
import { getInitials, formatPhone } from '@nexus/shared'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ConversationWithRelations } from '@/stores/conversationStore'

interface ContactPanelProps {
  conversation: ConversationWithRelations
  onClose: () => void
}

export function ContactPanel({ conversation, onClose }: ContactPanelProps) {
  const contact = conversation.contact
  const contactName = contact?.name || contact?.wa_id || 'Desconhecido'

  return (
    <div className="flex flex-col h-full border-l border-zinc-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-zinc-200">
        <span className="text-sm font-medium text-zinc-900">Detalhes</span>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contact info */}
      <div className="flex flex-col items-center px-4 py-6">
        <Avatar className="w-16 h-16 mb-3">
          <AvatarFallback className="bg-zinc-200 text-zinc-600 text-lg">
            {getInitials(contactName)}
          </AvatarFallback>
        </Avatar>
        <h3 className="text-sm font-semibold text-zinc-900">{contactName}</h3>
        {contact?.wa_id && (
          <p className="text-xs text-zinc-400 mt-0.5">
            {formatPhone(contact.wa_id)}
          </p>
        )}
      </div>

      <Separator />

      {/* Details */}
      <div className="px-4 py-4 space-y-4">
        {contact?.phone && (
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-600">{formatPhone(contact.phone)}</span>
          </div>
        )}
        {contact?.email && (
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-600">{contact.email}</span>
          </div>
        )}
        {contact?.first_message_at && (
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-600">
              Desde {format(new Date(contact.first_message_at), "dd 'de' MMM yyyy", { locale: ptBR })}
            </span>
          </div>
        )}
      </div>

      {/* Tags */}
      {contact?.tags && contact.tags.length > 0 && (
        <>
          <Separator />
          <div className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-500">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Conversation info */}
      <Separator />
      <div className="px-4 py-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-xs text-zinc-400">Status</span>
          <Badge variant="outline" className="text-xs capitalize">
            {conversation.status}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-zinc-400">Prioridade</span>
          <span className="text-xs text-zinc-600 capitalize">{conversation.priority}</span>
        </div>
        {conversation.sector && (
          <div className="flex justify-between">
            <span className="text-xs text-zinc-400">Setor</span>
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded"
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
    </div>
  )
}
