import { useState } from 'react'
import { useConversations } from '@/hooks/useConversations'
import { ConversationList } from '@/components/inbox/ConversationList'
import { ContactPanel } from '@/components/contacts/ContactPanel'
import { MessageSquare, ArrowRight } from 'lucide-react'

export default function Inbox() {
  const { selectedConversation } = useConversations()
  const [showContactPanel, setShowContactPanel] = useState(true)

  return (
    <div className="flex h-full">
      {/* Column 1: Conversation List (320px) */}
      <div className="w-80 shrink-0">
        <ConversationList />
      </div>

      {/* Column 2: Chat Panel (flex-1) */}
      <div className="flex-1 min-w-0">
        {selectedConversation ? (
          // ChatPanel will be created in Prompt 4
          <div className="flex items-center justify-center h-full bg-zinc-50">
            <div className="text-center">
              <p className="text-sm text-zinc-500">
                Chat com {selectedConversation.contact?.name || selectedConversation.contact?.wa_id}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Painel de chat será implementado no Prompt 4
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-zinc-50">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-100 mb-4">
              <MessageSquare className="w-6 h-6 text-zinc-300" />
            </div>
            <h3 className="text-sm font-medium text-zinc-500 mb-1">
              Selecione uma conversa
            </h3>
            <p className="text-xs text-zinc-400 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" />
              Escolha na lista ao lado para começar
            </p>
          </div>
        )}
      </div>

      {/* Column 3: Contact Panel (300px, collapsible) */}
      {selectedConversation && showContactPanel && (
        <div className="w-[300px] shrink-0">
          <ContactPanel
            conversation={selectedConversation}
            onClose={() => setShowContactPanel(false)}
          />
        </div>
      )}
    </div>
  )
}
