import { useNavigate } from 'react-router-dom'
import {
  Eye,
  Inbox,
  MessageSquare,
  Timer,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSupervisor, type WaitingConversation } from '@/hooks/useSupervisor'
import { useConversationStore } from '@/stores/conversationStore'
import { usePresence } from '@/hooks/usePresence'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`
}

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  tone = 'default',
}: {
  title: string
  value: string | number
  icon: React.ElementType
  hint?: string
  tone?: 'default' | 'warn' | 'danger'
}) {
  return (
    <Card className="border-zinc-200 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-500">{title}</p>
            <p
              className={cn(
                'mt-1 text-2xl font-bold',
                tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-zinc-900'
              )}
            >
              {value}
            </p>
            {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
          </div>
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              tone === 'danger' ? 'bg-red-50' : tone === 'warn' ? 'bg-amber-50' : 'bg-zinc-100'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5',
                tone === 'danger' ? 'text-red-500' : tone === 'warn' ? 'text-amber-500' : 'text-zinc-600'
              )}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Supervisor() {
  const { data, loading, error, refresh } = useSupervisor()
  const navigate = useNavigate()
  const { isUserOnline } = usePresence()

  // Abre a conversa no Inbox (o Inbox lê o selecionado pelo store, não pela URL).
  function openConversation(id: string) {
    useConversationStore.getState().select(id)
    navigate('/')
  }

  function WaitingRow({ item }: { item: WaitingConversation }) {
    return (
      <button
        onClick={() => openConversation(item.conversation_id)}
        className="flex w-full items-center gap-3 rounded-lg border border-zinc-100 px-3 py-2 text-left transition-colors hover:bg-zinc-50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900">
            {item.contact_name || 'Contato sem nome'}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {item.assigned_name ? item.assigned_name : 'Não atribuída'}
            {!item.window_open && ' · janela fechada'}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
            item.wait_secs > 900 ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-600'
          )}
        >
          {formatDuration(item.wait_secs)}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <Eye className="h-5 w-5 text-zinc-700" />
            Supervisão
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Visão ao vivo do atendimento
            {data && (
              <span className="ml-1 text-zinc-400">
                · atualizado {new Date(data.generated_at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>

      <div className="flex-1 space-y-6 p-6">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-zinc-200 shadow-none">
                  <CardContent className="p-5">
                    <Skeleton className="mb-2 h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="border-zinc-200 shadow-none">
              <CardContent className="p-5">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : data ? (
          <>
            {/* Top cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Na fila (não atribuídas)"
                value={data.totals.queue}
                icon={Inbox}
                tone={data.totals.queue > 0 ? 'warn' : 'default'}
                hint="aguardando um vendedor"
              />
              <StatCard
                title="Abertas"
                value={data.totals.open}
                icon={MessageSquare}
                hint={`${data.totals.pending} pendentes · ${data.totals.closed_today} fechadas hoje`}
              />
              <StatCard
                title="1ª resposta média (hoje)"
                value={data.first_response.avg_secs != null ? formatDuration(data.first_response.avg_secs) : '—'}
                icon={Timer}
                hint={`${data.first_response.count} respostas`}
              />
              <StatCard
                title="Paradas (> 15min)"
                value={data.totals.stalled}
                icon={AlertTriangle}
                tone={data.totals.stalled > 0 ? 'danger' : 'default'}
                hint="janela aberta, sem resposta"
              />
            </div>

            {/* Por vendedor */}
            <Card className="border-zinc-200 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                  <Users className="h-4 w-4 text-zinc-500" />
                  Vendedores ({data.agents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.agents.length === 0 ? (
                  <p className="py-6 text-center text-sm text-zinc-400">Nenhum vendedor cadastrado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100 text-left text-xs font-medium text-zinc-400">
                          <th className="py-2 pr-3 font-medium">Vendedor</th>
                          <th className="py-2 pr-3 text-center font-medium">Abertas</th>
                          <th className="py-2 pr-3 text-center font-medium">Aguardando</th>
                          <th className="py-2 pr-3 text-center font-medium">1ª resp. (hoje)</th>
                          <th className="py-2 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {data.agents.map((a) => {
                          const online = isUserOnline(a.user_id) || a.is_online
                          return (
                            <tr key={a.user_id}>
                              <td className="py-2.5 pr-3 font-medium text-zinc-900">{a.name}</td>
                              <td className="py-2.5 pr-3 text-center tabular-nums text-zinc-700">{a.open}</td>
                              <td className="py-2.5 pr-3 text-center">
                                <span
                                  className={cn(
                                    'inline-block min-w-6 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                                    a.waiting > 0 ? 'bg-amber-50 text-amber-700' : 'text-zinc-400'
                                  )}
                                >
                                  {a.waiting}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-center tabular-nums text-zinc-600">
                                {a.avg_first_response_secs != null
                                  ? formatDuration(a.avg_first_response_secs)
                                  : '—'}
                              </td>
                              <td className="py-2.5">
                                <div className="flex items-center justify-center gap-1.5">
                                  <span
                                    className={cn(
                                      'h-2 w-2 rounded-full',
                                      online ? 'bg-emerald-500' : 'bg-zinc-300'
                                    )}
                                  />
                                  <span className={cn('text-xs', online ? 'text-emerald-600' : 'text-zinc-400')}>
                                    {online ? 'online' : 'offline'}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Listas: esperando + paradas */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="border-zinc-200 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <Timer className="h-4 w-4 text-zinc-500" />
                    Esperando há mais tempo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.waiting_longest.length === 0 ? (
                    <p className="py-6 text-center text-sm text-zinc-400">
                      Ninguém aguardando resposta. Tudo em dia.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {data.waiting_longest.map((item) => (
                        <WaitingRow key={item.conversation_id} item={item} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-zinc-200 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Paradas (janela aberta, {'>'} 15min)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.stalled.length === 0 ? (
                    <p className="py-6 text-center text-sm text-zinc-400">Nenhuma conversa parada.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {data.stalled.map((item) => (
                        <WaitingRow key={item.conversation_id} item={item} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
