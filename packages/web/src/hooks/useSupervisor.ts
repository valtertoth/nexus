import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'

// ─── Tipos (espelham supervisor.service.ts) ────────────────────────────────────

export interface AgentLoad {
  user_id: string
  name: string
  is_online: boolean
  open: number
  waiting: number
  avg_first_response_secs: number | null
  response_count: number
}

export interface WaitingConversation {
  conversation_id: string
  contact_name: string | null
  assigned_to: string | null
  assigned_name: string | null
  status: string
  wait_secs: number
  window_open: boolean
}

export interface SupervisorOverview {
  generated_at: string
  totals: {
    open: number
    pending: number
    closed_today: number
    queue: number
    waiting: number
    stalled: number
  }
  first_response: { avg_secs: number | null; count: number }
  agents: AgentLoad[]
  waiting_longest: WaitingConversation[]
  stalled: WaitingConversation[]
}

const POLL_INTERVAL_MS = 15_000

/**
 * Busca o painel de supervisão e refaz o poll a cada 15s.
 * O primeiro carregamento mostra loading; refreshes seguintes são silenciosos
 * (mantêm os dados anteriores na tela até chegar o novo).
 */
export function useSupervisor() {
  const [data, setData] = useState<SupervisorOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true)
    try {
      const res = await api.get<SupervisorOverview>('/api/supervisor/overview')
      if (!mountedRef.current) return
      setData(res)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      const message = err instanceof ApiError ? err.message : 'Falha ao carregar o painel'
      setError(message)
    } finally {
      if (mountedRef.current && initial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    load(true)
    const id = window.setInterval(() => load(false), POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      window.clearInterval(id)
    }
  }, [load])

  const refresh = useCallback(() => load(false), [load])

  return { data, loading, error, refresh }
}
