import { useEffect, useRef, useState, useCallback, type MutableRefObject } from 'react'
import { useMessages } from '@/hooks/useMessages'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { MessageComposer } from './MessageComposer'
import { AiComposer } from './AiComposer'
import { QuoteBuilder } from './QuoteBuilder'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPhone } from '@nexus/shared'
import type { ConversationWithRelations } from '@/stores/conversationStore'
import type { AiMode } from '@nexus/shared'
import type { RightPanelTab } from '@/pages/Inbox'

function MessageSkeleton({ align }: { align: 'left' | 'right' }) {
  return (
    <div className={cn('flex mb-2', align === 'right' ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'rounded-2xl px-4 py-3 animate-pulse',
        align === 'right' ? 'bg-zinc-200' : 'bg-white'
      )}>
        <div className="h-3 w-40 bg-zinc-300/50 rounded mb-1.5" />
        <div className="h-3 w-24 bg-zinc-300/50 rounded" />
      </div>
    </div>
  )
}

function MessageSkeletons() {
  return (
    <div className="px-4 py-4 space-y-2">
      <MessageSkeleton align="left" />
      <MessageSkeleton align="left" />
      <MessageSkeleton align="right" />
      <MessageSkeleton align="left" />
      <MessageSkeleton align="right" />
    </div>
  )
}

interface ChatPanelProps {
  conversation: ConversationWithRelations
  rightPanel: RightPanelTab
  onToggleRightPanel: (tab: 'details' | 'products' | 'calculator' | 'consult') => void
  sendMessageRef?: MutableRefObject<(text: string) => void>
  insertInComposerRef?: MutableRefObject<(text: string) => void>
}

export function ChatPanel({ conversation, rightPanel, onToggleRightPanel, sendMessageRef, insertInComposerRef }: ChatPanelProps) {
  const { profile } = useAuthContext()
  const {
    messages,
    hasLoaded,
    aiSuggestion,
    sendingMessage,
    sendMessage,
    sendMedia,
    retryMessage,
    clearAiSuggestion,
    setAiSuggestion,
    fetchMoreMessages,
    hasMore,
    loadingMore,
  } = useMessages(conversation.id)

  const [aiMode, setAiMode] = useState<AiMode>('dictated')
  const [composerInitialValue, setComposerInitialValue] = useState('')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const prevMessageCountRef = useRef<number>(0)

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

  // Auto-scroll to bottom when NEW messages arrive (appended at end)
  // Preserve scroll position when OLDER messages are prepended at top
  useEffect(() => {
    if (!scrollRef.current) return
    const prevCount = prevMessageCountRef.current
    const currentCount = messages.length

    if (currentCount > prevCount && prevCount > 0 && prevScrollHeightRef.current > 0) {
      // Messages were prepended (loaded older): preserve scroll position
      const newScrollHeight = scrollRef.current.scrollHeight
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current
      if (scrollDiff > 0 && scrollRef.current.scrollTop < 200) {
        scrollRef.current.scrollTop = scrollDiff
      } else {
        // Messages appended (new message): scroll to bottom
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    } else {
      // Initial load or conversation switch: scroll to bottom
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }

    prevMessageCountRef.current = currentCount
    prevScrollHeightRef.current = scrollRef.current.scrollHeight
  }, [messages.length])

  // Reset refs when conversation changes
  useEffect(() => {
    prevMessageCountRef.current = 0
    prevScrollHeightRef.current = 0
  }, [conversation.id])

  // Infinite scroll: detect when user scrolls near top
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    if (scrollRef.current.scrollTop < 100) {
      // Save scroll height before fetching so we can preserve position
      prevScrollHeightRef.current = scrollRef.current.scrollHeight
      fetchMoreMessages()
    }
  }, [fetchMoreMessages])

  // Check if service window is active
  const windowExpires = conversation.wa_service_window_expires_at
  const isWindowExpired = windowExpires ? new Date(windowExpires) <= new Date() : false

  const handleSend = useCallback((content: string) => {
    sendMessage(content)
    setComposerInitialValue('')
  }, [sendMessage])

  // Expose sendMessage to parent via ref (for ProductQuickPanel integration)
  useEffect(() => {
    if (sendMessageRef) {
      sendMessageRef.current = sendMessage
    }
  }, [sendMessageRef, sendMessage])

  // Expose copilot suggestion insertion to parent (appears as AI suggestion for approval)
  useEffect(() => {
    if (insertInComposerRef) {
      insertInComposerRef.current = (text: string) => {
        setAiSuggestion({
          text,
          sources: [{ doc_name: 'Painel de Produtos', chunk_id: '', similarity: 1 }],
          loading: false,
          conversationId: conversation.id,
        })
      }
    }
  }, [insertInComposerRef, setAiSuggestion, conversation.id])

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
          rightPanel={rightPanel}
          onToggleRightPanel={onToggleRightPanel}
          onOpenQuote={() => setQuoteOpen(true)}
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-zinc-100" ref={scrollRef} onScroll={handleScroll}>
          {!hasLoaded ? (
            <MessageSkeletons />
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-zinc-400">Início da conversa</p>
            </div>
          ) : (
            <div className="px-4 py-4 space-y-1">
              {loadingMore && (
                <div className="flex justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                </div>
              )}
              {!hasMore && messages.length > 0 && (
                <p className="text-center text-xs text-zinc-400 py-2">Início da conversa</p>
              )}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onRetry={retryMessage} />
              ))}
            </div>
          )}
        </div>

        {/* AI Composer (dual composer with editable segments) */}
        {aiSuggestion && !aiSuggestion.loading && aiMode !== 'off' && (
          <AiComposer
            text={aiSuggestion.text}
            sources={aiSuggestion.sources?.map(s => ({
              documentName: s.doc_name ?? '',
              similarity: s.similarity ?? 0,
              page: s.page,
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
