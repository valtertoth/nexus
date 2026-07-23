import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { useConversationStore } from '@/stores/conversationStore'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BellRing, Clock, Loader2, Check, MessageSquare } from 'lucide-react'

interface FollowupItem {
  id: string
  conversation_id: string
  remind_at: string
  note: string | null
  contact_name: string | null
  contact_wa_id: string | null
  conversation_subject: string | null
  last_message_preview: string | null
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function contactLabel(f: FollowupItem): string {
  return f.contact_name || f.contact_wa_id || 'Contato'
}

export default function Followups() {
  const navigate = useNavigate()
  const selectConversation = useConversationStore((s) => s.select)

  const [due, setDue] = useState<FollowupItem[]>([])
  const [upcoming, setUpcoming] = useState<FollowupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [doneBusy, setDoneBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [dueRes, upRes] = await Promise.all([
        api.get<{ followups: FollowupItem[] }>('/api/followups/mine?scope=due'),
        api.get<{ followups: FollowupItem[] }>('/api/followups/mine?scope=upcoming'),
      ])
      setDue(dueRes.followups)
      setUpcoming(upRes.followups)
    } catch {
      toast.error('Erro ao carregar follow-ups.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openConversation(conversationId: string) {
    selectConversation(conversationId)
    navigate('/')
  }

  async function complete(id: string) {
    setDoneBusy(id)
    try {
      await api.post(`/api/followups/${id}/done`)
      setDue((prev) => prev.filter((f) => f.id !== id))
      setUpcoming((prev) => prev.filter((f) => f.id !== id))
      toast.success('Follow-up concluído.')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Erro ao concluir.'
      toast.error(message)
    } finally {
      setDoneBusy(null)
    }
  }

  function renderItem(f: FollowupItem, overdue: boolean) {
    return (
      <div key={f.id} className="flex items-start gap-3 py-3">
        <div
          className={
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' +
            (overdue ? 'bg-red-50 text-red-500' : 'bg-zinc-100 text-zinc-500')
          }
        >
          <Clock className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-zinc-900">{contactLabel(f)}</p>
            <span className={'text-xs ' + (overdue ? 'font-medium text-red-500' : 'text-zinc-400')}>
              {formatWhen(f.remind_at)}
            </span>
          </div>
          {f.note ? (
            <p className="mt-0.5 text-sm text-zinc-600 line-clamp-2">{f.note}</p>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-400 line-clamp-1">
              {f.last_message_preview || 'Sem nota'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-zinc-900"
            onClick={() => openConversation(f.conversation_id)}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">Abrir</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={doneBusy === f.id}
            onClick={() => complete(f.id)}
          >
            {doneBusy === f.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline">Concluir</span>
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-2">
        <BellRing className="h-5 w-5 text-zinc-500" />
        <h1 className="text-xl font-semibold text-zinc-900">Follow-ups</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Vencidos ({due.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {due.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-400">
                  Nenhum follow-up vencido. Em dia com os clientes.
                </p>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {due.map((f) => renderItem(f, true))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Próximos ({upcoming.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-400">
                  Nenhum follow-up agendado. Use o botão de relógio numa conversa para criar.
                </p>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {upcoming.map((f) => renderItem(f, false))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
