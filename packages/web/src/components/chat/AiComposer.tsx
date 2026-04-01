import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, X, Send, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { splitMessage } from '@/lib/splitMessage'
import type { AiMode } from '@nexus/shared'

interface AiComposerProps {
  text: string
  sources?: { documentName: string; similarity: number; page?: number }[]
  aiMode: AiMode
  onSendSegment: (text: string, opts?: { aiApproved?: boolean }) => void
  onDiscard: () => void
}

interface Segment {
  id: string
  text: string
  sent: boolean
  sending: boolean
}

export function AiComposer({
  text,
  sources,
  aiMode,
  onSendSegment,
  onDiscard,
}: AiComposerProps) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [sendingAll, setSendingAll] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Split text into segments on mount or text change
  useEffect(() => {
    const parts = splitMessage(text)
    setSegments(
      parts.map((t, i) => ({
        id: `seg-${i}-${Date.now()}`,
        text: t,
        sent: false,
        sending: false,
      }))
    )
  }, [text])

  // Auto-send countdown for automatic mode
  useEffect(() => {
    if (aiMode !== 'automatic') return

    setCountdown(5)
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          handleSendAll()
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMode, text])

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  const updateSegmentText = useCallback((id: string, newText: string) => {
    cancelCountdown()
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, text: newText } : s))
    )
  }, [cancelCountdown])

  const removeSegment = useCallback((id: string) => {
    cancelCountdown()
    setSegments((prev) => {
      const remaining = prev.filter((s) => s.id !== id)
      if (remaining.length === 0) {
        onDiscard()
      }
      return remaining
    })
  }, [cancelCountdown, onDiscard])

  const handleSendOne = useCallback(async (id: string) => {
    cancelCountdown()
    const segment = segments.find((s) => s.id === id)
    if (!segment || segment.sent || !segment.text.trim()) return

    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, sending: true } : s))
    )

    onSendSegment(segment.text.trim(), { aiApproved: true })

    // Mark as sent after a brief delay for visual feedback
    setTimeout(() => {
      setSegments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, sent: true, sending: false } : s))
      )
    }, 300)
  }, [segments, onSendSegment, cancelCountdown])

  const handleSendAll = useCallback(async () => {
    cancelCountdown()
    const pending = segments.filter((s) => !s.sent && s.text.trim())
    if (pending.length === 0) return

    setSendingAll(true)

    for (let i = 0; i < pending.length; i++) {
      const seg = pending[i]

      setSegments((prev) =>
        prev.map((s) => (s.id === seg.id ? { ...s, sending: true } : s))
      )

      onSendSegment(seg.text.trim(), { aiApproved: true })

      setSegments((prev) =>
        prev.map((s) => (s.id === seg.id ? { ...s, sent: true, sending: false } : s))
      )

      // Stagger between messages (natural typing delay)
      if (i < pending.length - 1) {
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 700))
      }
    }

    setSendingAll(false)
  }, [segments, onSendSegment, cancelCountdown])

  const pendingCount = segments.filter((s) => !s.sent).length
  const allSent = pendingCount === 0 && segments.length > 0

  const sourceLabel = sources && sources.length > 0
    ? `Baseado em: ${sources[0].documentName}${sources[0].page ? `, p.${sources[0].page}` : ''}`
    : null

  // Auto-dismiss when all segments sent
  useEffect(() => {
    if (allSent) {
      const t = setTimeout(onDiscard, 600)
      return () => clearTimeout(t)
    }
  }, [allSent, onDiscard])

  if (aiMode === 'off') return null

  return (
    <div className="animate-in slide-in-from-bottom-2 duration-300 mx-4 mb-2">
      <div className="border border-zinc-200 border-l-2 border-l-amber-400 bg-zinc-50 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-medium text-zinc-600">
            Sugestão da IA
          </span>
          {sourceLabel && (
            <span className="text-xs text-zinc-400 ml-1 truncate">
              — {sourceLabel}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {aiMode === 'automatic' && countdown > 0 && !sendingAll && (
              <span className="text-xs text-amber-500 mr-1">
                {countdown}s
              </span>
            )}
            <button
              onClick={() => { cancelCountdown(); onDiscard() }}
              className="p-1 rounded hover:bg-zinc-200 transition-colors text-zinc-400 hover:text-zinc-600"
              aria-label="Descartar sugestao"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Segments */}
        <div className="px-3 pb-2 space-y-1.5">
          {segments.map((seg) => (
            <div
              key={seg.id}
              className={cn(
                'group flex items-start gap-2 rounded-lg transition-all duration-200',
                seg.sent
                  ? 'opacity-40'
                  : 'bg-white border border-zinc-200'
              )}
            >
              {!seg.sent && (
                <>
                  <textarea
                    value={seg.text}
                    onChange={(e) => updateSegmentText(seg.id, e.target.value)}
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-zinc-800 resize-none py-2 pl-3 pr-1 focus:outline-none min-h-[36px]"
                    style={{ height: 'auto' }}
                    onInput={(e) => {
                      const target = e.currentTarget
                      target.style.height = 'auto'
                      target.style.height = `${Math.min(target.scrollHeight, 96)}px`
                    }}
                    disabled={seg.sending}
                  />
                  <div className="flex items-center gap-0.5 py-1.5 pr-1.5 shrink-0">
                    <button
                      onClick={() => removeSegment(seg.id)}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-100 transition-all text-zinc-300 hover:text-zinc-500"
                      aria-label="Remover segmento"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleSendOne(seg.id)}
                      disabled={seg.sending || !seg.text.trim()}
                      className="p-1.5 rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
                      aria-label="Enviar segmento"
                    >
                      {seg.sending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </>
              )}
              {seg.sent && (
                <p className="text-sm text-zinc-400 py-2 px-3 line-through">
                  {seg.text}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Footer: Send all */}
        {pendingCount > 0 && (
          <div className="flex items-center justify-between px-3 pb-3">
            <span className="text-xs text-zinc-400">
              {segments.length > 1 ? `${pendingCount} parte${pendingCount > 1 ? 's' : ''}` : ''}
            </span>
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleSendAll}
              disabled={sendingAll}
            >
              {sendingAll ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              {segments.length > 1 ? 'Enviar tudo' : 'Enviar'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
