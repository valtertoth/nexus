import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BrainCircuit, Send, Loader2, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAuthHeaders } from '@/lib/supabase'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface ConsultMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface AiConsultPanelProps {
  conversationId: string
  open: boolean
  onClose: () => void
}

/** Render text with basic markdown: **bold**, newlines preserved */
function renderMarkdown(text: string) {
  // Split by **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

export function AiConsultPanel({ conversationId, open, onClose }: AiConsultPanelProps) {
  const [messages, setMessages] = useState<ConsultMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 200)
    }
  }, [open])

  // Reset when conversation changes
  useEffect(() => {
    setMessages([])
    setInput('')
  }, [conversationId])

  const handleSend = useCallback(async () => {
    const question = input.trim()
    if (!question || streaming) return

    const userMsg: ConsultMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setStreaming(true)

    // Add placeholder for assistant response
    const assistantId = `assistant-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ])

    try {
      const headers = getAuthHeaders()

      // Build chat history (exclude the current question)
      const chatHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const response = await fetch(
        `${API_BASE}/api/ai/consult/${conversationId}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ question, chatHistory }),
        }
      )

      if (!response.ok) throw new Error('Falha na consulta')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No reader')

      let buffer = ''
      let currentEvent = ''
      let pendingData: string[] = []

      function flushData() {
        if (pendingData.length === 0) return
        // SSE multi-line data: rejoin with \n (per spec)
        const chunk = pendingData.join('\n')
        pendingData = []

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + chunk }
              : m
          )
        )
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            flushData()
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:') && currentEvent === 'text') {
            const data = line.slice(5)
            const chunk = data.startsWith(' ') ? data.slice(1) : data
            pendingData.push(chunk)
          } else if (line === '') {
            // Empty line = end of SSE event
            flushData()
          }
        }
      }
      flushData()
    } catch (err) {
      console.error('[AiConsult] Error:', err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Desculpe, ocorreu um erro. Tente novamente.' }
            : m
        )
      )
    } finally {
      setStreaming(false)
    }
  }, [input, streaming, messages, conversationId])

  const handleClear = useCallback(() => {
    setMessages([])
    setInput('')
  }, [])

  if (!open) return null

  return (
    <div className="w-[380px] shrink-0 flex flex-col h-full border-l border-zinc-200 bg-white animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-zinc-600" />
          <span className="text-sm font-medium text-zinc-900">Consultar IA</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
              aria-label="Limpar conversa"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
            aria-label="Fechar painel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <BrainCircuit className="w-8 h-8 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500 mb-1">
              Consulte a IA em particular
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Peça conselhos sobre como abordar este cliente, resolver objeções, ou tirar dúvidas sobre produtos. O cliente não verá esta conversa.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'max-w-[90%]',
              msg.role === 'user' ? 'ml-auto' : 'mr-auto'
            )}
          >
            <div
              className={cn(
                'rounded-xl px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-zinc-900 text-white rounded-br-md'
                  : 'bg-zinc-100 text-zinc-800 rounded-bl-md'
              )}
            >
              {msg.content ? (
                <span className="whitespace-pre-wrap">{renderMarkdown(msg.content)}</span>
              ) : (
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Pensando...
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Pergunte sobre este cliente..."
            rows={1}
            className="min-h-9 max-h-24 resize-none text-sm py-2"
            disabled={streaming}
          />
          <Button
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            aria-label="Enviar pergunta"
          >
            {streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
