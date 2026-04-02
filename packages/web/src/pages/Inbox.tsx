import { useState } from 'react'
import { useConversations } from '@/hooks/useConversations'
import { ConversationList } from '@/components/inbox/ConversationList'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { ContactPanel } from '@/components/contacts/ContactPanel'
import { MessageSquare } from 'lucide-react'

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
          <ChatPanel conversation={selectedConversation} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center bg-zinc-50">
            <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-zinc-300" />
            </div>
            <p className="text-base font-medium text-zinc-600 mb-1">Selecione uma conversa</p>
            <p className="text-sm text-zinc-400">Escolha uma conversa no menu lateral para começar.</p>
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
