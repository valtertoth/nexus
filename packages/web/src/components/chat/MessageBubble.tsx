import { cn } from '@/lib/utils'
import { Check, CheckCheck, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import type { Message } from '@nexus/shared'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isContact = message.sender_type === 'contact'
  const isSystem = message.sender_type === 'system'
  const isAiApproved = message.ai_approved === true

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-zinc-400 bg-zinc-100 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  const time = message.created_at
    ? format(new Date(message.created_at), 'HH:mm')
    : ''

  return (
    <div
      className={cn(
        'flex mb-2',
        isContact ? 'justify-start' : 'justify-end'
      )}
    >
      <div
        className={cn(
          'max-w-[70%] px-3.5 py-2 relative group',
          isContact
            ? 'bg-zinc-100 text-zinc-900 rounded-2xl rounded-bl-md'
            : 'bg-zinc-900 text-white rounded-2xl rounded-br-md'
        )}
      >
        {/* Content */}
        {message.content_type === 'text' && (
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}

        {message.content_type === 'image' && message.media_url && (
          <img
            src={message.media_url}
            alt="Imagem"
            className="rounded-lg max-w-full max-h-64 object-cover"
          />
        )}

        {message.content_type === 'document' && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-400">📄</span>
            <span className="truncate">{message.media_filename || 'Documento'}</span>
          </div>
        )}

        {/* Footer: time + status */}
        <div
          className={cn(
            'flex items-center gap-1.5 mt-1',
            isContact ? 'justify-end' : 'justify-end'
          )}
        >
          {/* AI badge */}
          {isAiApproved && !isContact && (
            <Sparkles className="w-3 h-3 text-amber-300 opacity-70" />
          )}

          <span
            className={cn(
              'text-[10px]',
              isContact ? 'text-zinc-400' : 'text-zinc-400'
            )}
          >
            {time}
          </span>

          {/* Delivery status */}
          {!isContact && (
            <span className="flex">
              {message.wa_status === 'read' ? (
                <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
              ) : message.wa_status === 'delivered' ? (
                <CheckCheck className="w-3.5 h-3.5 text-zinc-400" />
              ) : (
                <Check className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
