import { useEffect, useRef, useState, useCallback } from 'react'
import { useMessages } from '@/hooks/useMessages'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { MessageComposer } from './MessageComposer'
import { AiComposer } from './AiComposer'
import { AiConsultPanel } from './AiConsultPanel'
import { QuoteBuilder } from './QuoteBuilder'
import { formatPhone } from '@nexus/shared'
import type { ConversationWithRelations } from '@/stores/conversationStore'
import type { AiMode } from '@nexus/shared'

interface ChatPanelProps {
  conversation: ConversationWithRelations
}

export function ChatPanel({ conversation }: ChatPanelProps) {
  const { profile } = useAuthContext()
  const {
    messages,
    aiSuggestion,
    sendingMessage,
    sendMessage,
    sendMedia,
    clearAiSuggestion,
  } = useMessages(conversation.id)

  const [aiMode, setAiMode] = useState<AiMode>('dictated')
  const [composerInitialValue, setComposerInitialValue] = useState('')
  const [consultOpen, setConsultOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load AI mode from DB on mount (always fresh, not stale profile cache)
  useEffect(() => {
    if (!profile?.id) return
    supabase
      .from('users')
      .select('ai_mode')
      .eq('id', profile.id)
      .single()
      .then(({ data }) => {
        if (data?.ai_mode) setAiMode(data.ai_mode as AiMode)
      })
  }, [profile?.id])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Check if service window is active
  const windowExpires = conversation.wa_service_window_expires_at
  const isWindowExpired = windowExpires ? new Date(windowExpires) <= new Date() : false

  const handleSend = useCallback((content: string) => {
    sendMessage(content)
    setComposerInitialValue('')
  }, [sendMessage])

  const handleAiSendSegment = useCallback((text: string, opts?: { aiApproved?: boolean }) => {
    sendMessage(text, { aiApproved: opts?.aiApproved ?? true })
  }, [sendMessage])

  const handleAiDiscard = useCallback(() => {
    clearAiSuggestion()
  }, [clearAiSuggestion])

  return (
    <div className="flex h-full">
      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 bg-white">
        {/* Header */}
        <ChatHeader
          conversation={conversation}
          aiMode={aiMode}
          onAiModeChange={setAiMode}
          onToggleConsult={() => setConsultOpen((v) => !v)}
          consultOpen={consultOpen}
          onOpenQuote={() => setQuoteOpen(true)}
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-zinc-100" ref={scrollRef}>
          <div className="px-4 py-4 space-y-1">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        </div>

        {/* AI Composer (dual composer with editable segments) */}
        {aiSuggestion && !aiSuggestion.loading && aiMode !== 'off' && (
          <AiComposer
            text={aiSuggestion.text}
            sources={aiSuggestion.sources?.map(s => ({
              documentName: 'doc_name' in s ? (s as Record<string, unknown>).doc_name as string : '',
              similarity: 'similarity' in s ? (s as Record<string, unknown>).similarity as number : 0,
              page: 'page' in s ? (s as Record<string, unknown>).page as number : undefined,
            }))}
            aiMode={aiMode}
            onSendSegment={handleAiSendSegment}
            onDiscard={handleAiDiscard}
          />
        )}

        {/* Composer */}
        <MessageComposer
          onSend={handleSend}
          onSendMedia={sendMedia}
          disabled={isWindowExpired}
          sending={sendingMessage}
          initialValue={composerInitialValue}
          placeholder={
            isWindowExpired
              ? 'Janela de 24h expirada — envie um template'
              : 'Digite uma mensagem...'
          }
        />
      </div>

      {/* AI Consult Panel (slides in from right) */}
      <AiConsultPanel
        conversationId={conversation.id}
        open={consultOpen}
        onClose={() => setConsultOpen(false)}
      />

      {/* Quote Builder (modal overlay) */}
      <QuoteBuilder
        conversationId={conversation.id}
        contactId={conversation.contact?.id}
        contactName={conversation.contact?.name || conversation.contact?.wa_id || ''}
        contactPhone={conversation.contact?.wa_id ? formatPhone(conversation.contact.wa_id) : ''}
        sellerName={profile?.name || ''}
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        onSendText={(text) => sendMessage(text)}
      />
    </div>
  )
}
