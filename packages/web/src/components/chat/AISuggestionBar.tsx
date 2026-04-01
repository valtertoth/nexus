import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Pencil, X, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

import type { AiMode } from '@nexus/shared'

interface AISuggestionBarProps {
  text: string
  sources?: { documentName: string; similarity: number; page?: number }[]
  loading?: boolean
  aiMode: AiMode
  onApprove: (text: string) => void
  onEdit: (text: string) => void
  onDiscard: () => void
}

export function AISuggestionBar({
  text,
  sources,
  loading,
  aiMode,
  onApprove,
  onEdit,
  onDiscard,
}: AISuggestionBarProps) {
  const [countdown, setCountdown] = useState(5)
  const [expanded, setExpanded] = useState(false)

  // Auto-send countdown for automatic mode
  useEffect(() => {
    if (aiMode !== 'automatic' || loading) return

    setCountdown(5)
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval)
          onApprove(text)
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [aiMode, text, loading, onApprove])

  if (aiMode === 'off') return null

  const handleApprove = useCallback(() => onApprove(text), [onApprove, text])
  const handleEdit = useCallback(() => onEdit(text), [onEdit, text])

  const sourceLabel = sources && sources.length > 0
    ? `Baseado em: ${sources[0].documentName}${sources[0].page ? `, p.${sources[0].page}` : ''}`
    : null

  return (
    <div className="animate-in slide-in-from-bottom-2 duration-300 mx-4 mb-2">
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          )}
          <span className="text-xs font-medium text-amber-700">
            {loading ? 'Gerando sugestão...' : 'Sugestão da IA'}
          </span>
          {aiMode === 'automatic' && !loading && (
            <span className="text-xs text-amber-500 ml-auto">
              Enviando em {countdown}s
            </span>
          )}
        </div>

        {/* Loading skeleton */}
        {loading ? (
          <div className="space-y-2">
            <div className="h-3 bg-amber-200/50 rounded w-full animate-pulse" />
            <div className="h-3 bg-amber-200/50 rounded w-3/4 animate-pulse" />
          </div>
        ) : (
          <>
            {/* Suggestion text */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-left w-full"
            >
              <p className={cn(
                'text-sm text-amber-900',
                !expanded && 'line-clamp-3'
              )}>
                {text}
              </p>
            </button>

            {/* Source citation */}
            {sourceLabel && (
              <p className="text-xs text-amber-500 mt-1.5">
                {sourceLabel}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleApprove}
              >
                <Check className="w-3 h-3" />
                Enviar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleEdit}
              >
                <Pencil className="w-3 h-3" />
                Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-zinc-500"
                onClick={onDiscard}
              >
                <X className="w-3 h-3" />
                Descartar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
