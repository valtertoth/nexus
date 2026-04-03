import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/supabase'
import type { ConversationOutcome } from '@nexus/shared'

const SERVER_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

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
        const headers = getAuthHeaders()

        const res = await fetch(`${SERVER_URL}/api/intelligence/outcome`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ conversationId, ...data }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
          throw new Error(err.error || `HTTP ${res.status}`)
        }

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
