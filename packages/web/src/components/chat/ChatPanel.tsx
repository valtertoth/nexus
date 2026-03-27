import { useEffect, useRef, useState, useCallback } from 'react'
import { useMessages } from '@/hooks/useMessages'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { MessageComposer } from './MessageComposer'
import { AISuggestionBar } from './AISuggestionBar'
import { ScrollArea } from '@/components/ui/scroll-area'
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
    clearAiSuggestion,
  } = useMessages(conversation.id)

  const [aiMode, setAiMode] = useState<AiMode>(profile?.ai_mode || 'dictated')
  const [composerInitialValue, setComposerInitialValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

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

  const handleAiApprove = useCallback((text: string) => {
    sendMessage(text, { aiApproved: true })
  }, [sendMessage])

  const handleAiEdit = useCallback((text: string) => {
    setComposerInitialValue(text)
    clearAiSuggestion()
  }, [clearAiSuggestion])

  const handleAiDiscard = useCallback(() => {
    clearAiSuggestion()
  }, [clearAiSuggestion])

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <ChatHeader
        conversation={conversation}
        aiMode={aiMode}
        onAiModeChange={setAiMode}
      />

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="px-4 py-4 space-y-1">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      </ScrollArea>

      {/* AI Suggestion Bar */}
      {aiSuggestion && !aiSuggestion.loading && aiMode !== 'off' && (
        <AISuggestionBar
          text={aiSuggestion.text}
          sources={aiSuggestion.sources?.map(s => ({
            documentName: 'doc_name' in s ? (s as Record<string, unknown>).doc_name as string : '',
            similarity: 'similarity' in s ? (s as Record<string, unknown>).similarity as number : 0,
            page: 'page' in s ? (s as Record<string, unknown>).page as number : undefined,
          }))}
          loading={aiSuggestion.loading}
          aiMode={aiMode}
          onApprove={handleAiApprove}
          onEdit={handleAiEdit}
          onDiscard={handleAiDiscard}
        />
      )}

      {/* Composer */}
      <MessageComposer
        onSend={handleSend}
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
  )
}
