import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ConversationOutcome } from '@nexus/shared'

export interface OutcomeData {
  outcome: ConversationOutcome
  value?: number
  currency?: string
  reason?: string
  product?: string
}

export function useConversationOutcome() {
  const [submitting, setSubmitting] = useState(false)

  const recordOutcome = useCallback(
    async (conversationId: string, data: OutcomeData): Promise<boolean> => {
      setSubmitting(true)
      try {
        await api.post('/api/intelligence/outcome', { conversationId, ...data })

        const outcomeLabel =
          data.outcome === 'converted'
            ? 'Convertido'
            : data.outcome === 'lost'
            ? 'Perdido'
            : 'Problema'

        toast.success(`Resultado registrado: ${outcomeLabel}`)
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao registrar resultado'
        toast.error(message)
        return false
      } finally {
        setSubmitting(false)
      }
    },
    []
  )

  return { recordOutcome, submitting }
}
