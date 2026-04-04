import { useState, useCallback, useRef } from 'react'
import { useConversations } from '@/hooks/useConversations'
import { getAuthHeaders } from '@/lib/supabase'
import { toast } from 'sonner'
import { ConversationList } from '@/components/inbox/ConversationList'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { ContactPanel } from '@/components/contacts/ContactPanel'
import { ProductQuickPanel } from '@/components/chat/ProductQuickPanel'
import { MarkupCalculator } from '@/components/chat/MarkupCalculator'
import { AiConsultPanel } from '@/components/chat/AiConsultPanel'
import { MessageSquare, User, Package, Calculator, BrainCircuit } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RightPanelTab = 'details' | 'products' | 'calculator' | 'consult' | null

export default function Inbox() {
  const { selectedConversation } = useConversations()
  const [rightPanel, setRightPanel] = useState<RightPanelTab>('details')
  const sendMessageRef = useRef<(text: string) => void>(() => {})
  const insertInComposerRef = useRef<(text: string) => void>(() => {})

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

  const sendMediaUrl = useCallback(async (url: string, contentType: 'image' | 'document' | 'video', caption?: string, filename?: string) => {
    if (!selectedConversation) return
    try {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' }
      const res = await fetch(`${API_BASE}/api/messages/send-media-url`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          url,
          contentType,
          caption,
          filename,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao enviar mídia')
      }
    } catch (err) {
      console.error('[Inbox] sendMediaUrl failed:', err)
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar mídia')
    }
  }, [selectedConversation, API_BASE])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Column 1: Conversation List (320px) */}
      <div className="w-80 shrink-0">
        <ConversationList />
      </div>

      {/* Column 2: Chat Panel (flex-1) */}
      <div className="flex-1 min-w-0">
        {selectedConversation ? (
          <ChatPanel
            conversation={selectedConversation}
            sendMessageRef={sendMessageRef}
            insertInComposerRef={insertInComposerRef}
          />
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

      {/* Column 3: Unified Right Sidebar (380px, tab-switched) */}
      {selectedConversation && rightPanel && (
        <div className="w-[380px] shrink-0 border-l border-zinc-200 bg-white flex flex-col h-full animate-in slide-in-from-right-4 duration-200">
          {/* Tab header */}
          <div className="h-14 px-4 flex items-center gap-1 border-b border-zinc-200 shrink-0">
            <button
              onClick={() => setRightPanel('details')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                rightPanel === 'details'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              )}
            >
              <User className="w-3.5 h-3.5" />
              Detalhes
            </button>
            <button
              onClick={() => setRightPanel('products')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                rightPanel === 'products'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              )}
            >
              <Package className="w-3.5 h-3.5" />
              Produtos
            </button>
            <button
              onClick={() => setRightPanel('calculator')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                rightPanel === 'calculator'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              )}
            >
              <Calculator className="w-3.5 h-3.5" />
              Calc
            </button>
            <button
              onClick={() => setRightPanel('consult')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                rightPanel === 'consult'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              )}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              IA
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setRightPanel(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              aria-label="Fechar painel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {rightPanel === 'details' && (
              <ContactPanel
                conversation={selectedConversation}
                onClose={() => setRightPanel(null)}
                embedded
              />
            )}
            {rightPanel === 'products' && (
              <ProductQuickPanel
                open={true}
                onClose={() => setRightPanel(null)}
                onSendToChat={(text) => insertInComposerRef.current(text)}
                onSendMediaUrl={sendMediaUrl}
                embedded
              />
            )}
            {rightPanel === 'calculator' && (
              <MarkupCalculator
                open={true}
                onClose={() => setRightPanel(null)}
                onInsertInChat={(text) => {
                  insertInComposerRef.current(text)
                }}
                embedded
              />
            )}
            {rightPanel === 'consult' && (
              <AiConsultPanel
                conversationId={selectedConversation.id}
                open={true}
                onClose={() => setRightPanel(null)}
                embedded
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
