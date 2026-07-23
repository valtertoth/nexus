import { useEffect, useRef, useState, useCallback, type MutableRefObject, type DragEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMessages } from '@/hooks/useMessages'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { ChatHeader } from './ChatHeader'
import { MessageBubble } from './MessageBubble'
import { MessageComposer } from './MessageComposer'
import { AiComposer } from './AiComposer'
import { QuoteBuilder } from './QuoteBuilder'
import { TemplatePicker } from './TemplatePicker'
import { Loader2, Upload, Clock, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPhone } from '@nexus/shared'
import type { ConversationWithRelations } from '@/stores/conversationStore'
import type { AiMode } from '@nexus/shared'
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
  sendMessageRef?: MutableRefObject<(text: string) => void>
  insertInComposerRef?: MutableRefObject<(text: string) => void>
}

export function ChatPanel({ conversation, sendMessageRef, insertInComposerRef }: ChatPanelProps) {
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
  const [templateOpen, setTemplateOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const prevMessageCountRef = useRef<number>(0)
  const prevScrollHeightRef = useRef<number>(0)
  const aiModeFetchedRef = useRef<string | null>(null)

  // Virtualizer — only renders visible messages + overscan
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 15,
    gap: 4,
    getItemKey: (index) => messages[index]?.id ?? index,
  })

  // Load AI mode from DB ONCE per profile (not per conversation switch)
  useEffect(() => {
    if (!profile?.id || aiModeFetchedRef.current === profile.id) return
    aiModeFetchedRef.current = profile.id
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
    const el = scrollRef.current
    if (!el) return
    const prevCount = prevMessageCountRef.current
    const currentCount = messages.length

    if (currentCount > prevCount && prevCount > 0) {
      if (isNearBottomRef.current) {
        // New message appended while near bottom — scroll to end
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(currentCount - 1, { align: 'end' })
        })
      } else {
        // Messages prepended (loaded older) — preserve scroll position
        const newScrollHeight = el.scrollHeight
        const scrollDiff = newScrollHeight - prevScrollHeightRef.current
        if (scrollDiff > 0) {
          el.scrollTop += scrollDiff
        }
      }
    } else if (currentCount > 0) {
      // Initial load or conversation switch — scroll to bottom
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(currentCount - 1, { align: 'end' })
      })
    }

    prevMessageCountRef.current = currentCount
    prevScrollHeightRef.current = el.scrollHeight
  }, [messages.length, virtualizer])

  // Reset state when conversation changes
  useEffect(() => {
    prevMessageCountRef.current = 0
    prevScrollHeightRef.current = 0
    isNearBottomRef.current = true
  }, [conversation.id])

  // Track scroll position + infinite scroll up
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return

    // Track if user is near the bottom (for auto-scroll decisions)
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150

    // Infinite scroll: load older messages when near top
    if (el.scrollTop < 100) {
      prevScrollHeightRef.current = el.scrollHeight
      fetchMoreMessages()
    }
  }, [fetchMoreMessages])

  // Check if service window is active
  const windowExpires = conversation.wa_service_window_expires_at
  const isWindowExpired = windowExpires ? new Date(windowExpires) <= new Date() : false

  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounterRef.current = 0

    const file = e.dataTransfer.files?.[0]
    if (!file || !sendMedia) return

    const contentType = file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('video/') ? 'video'
      : file.type.startsWith('audio/') ? 'audio'
      : 'document' as const

    sendMedia(file, contentType)
  }, [sendMedia])

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
      <div
        className="flex flex-col flex-1 min-w-0 bg-white relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-40 bg-white/90 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-zinc-300 rounded-lg m-2 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-zinc-500">
              <Upload className="w-8 h-8" />
              <span className="text-sm font-medium">Solte o arquivo aqui</span>
            </div>
          </div>
        )}
        {/* Header */}
        <ChatHeader
          conversation={conversation}
          aiMode={aiMode}
          onAiModeChange={setAiMode}
          onOpenQuote={() => setQuoteOpen(true)}
        />

        {/* Messages — virtualized for performance */}
        <div className="flex-1 overflow-y-auto bg-zinc-100" ref={scrollRef} onScroll={handleScroll}>
          {!hasLoaded ? (
            <MessageSkeletons />
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-zinc-400">Início da conversa</p>
            </div>
          ) : (
            <div className="px-4 py-4">
              {loadingMore && (
                <div className="flex justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                </div>
              )}
              {!hasMore && messages.length > 0 && (
                <p className="text-center text-xs text-zinc-400 py-2">Início da conversa</p>
              )}
              <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
                {virtualizer.getVirtualItems().map((virtualRow) => (
                  <div
                    key={messages[virtualRow.index].id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <MessageBubble message={messages[virtualRow.index]} onRetry={retryMessage} />
                  </div>
                ))}
              </div>
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

        {/* Aviso de janela expirada + atalho para template */}
        {isWindowExpired && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-t border-amber-200">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 flex-1 min-w-0">
              Janela de 24h expirada — só é possível enviar um template aprovado.
            </p>
            <button
              onClick={() => setTemplateOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              Enviar template
            </button>
          </div>
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

      {/* Template Picker (para janela expirada) */}
      <TemplatePicker
        conversationId={conversation.id}
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
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
