import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, DollarSign, Zap, Clock, BarChart3 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { cn } from '@/lib/utils'

interface AiUsageSummary {
  total_suggestions: number
  total_tokens_used: number
  avg_latency_ms: number
  approved_count: number
  edited_count: number
  discarded_count: number
  estimated_cost_usd: number
}

interface AgentPerf {
  user_id: string
  user_name: string
  conversations_handled: number
  messages_sent: number
  ai_approved: number
  ai_edited: number
  ai_discarded: number
  avg_response_time_seconds: number
}

const PERIODS = [
  { label: 'Hoje', days: 1 },
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
] as const

export default function Analytics() {
  const { profile } = useAuthContext()
  const [period, setPeriod] = useState(7)
  const [aiSummary, setAiSummary] = useState<AiUsageSummary | null>(null)
  const [agents, setAgents] = useState<AgentPerf[]>([])
  const [loading, setLoading] = useState(true)

  const orgId = profile?.org_id

  useEffect(() => {
    if (!orgId) {
      setLoading(false)
      return
    }

    setLoading(true)
    async function load() {
      const [aiRes, agentRes] = await Promise.all([
        supabase.rpc('ai_usage_summary', { p_org_id: orgId, p_days: period }),
        supabase.rpc('agent_performance', { p_org_id: orgId, p_days: period }),
      ])

      if (aiRes.data) {
        const summary = Array.isArray(aiRes.data) ? aiRes.data[0] : aiRes.data
        setAiSummary(summary as AiUsageSummary)
      }
      if (agentRes.data) {
        setAgents(agentRes.data as AgentPerf[])
      }
      setLoading(false)
    }
    load()
  }, [orgId, period])

  const approvalRate = aiSummary
    ? aiSummary.total_suggestions > 0
      ? Math.round(
          ((aiSummary.approved_count + aiSummary.edited_count) /
            aiSummary.total_suggestions) *
            100
        )
      : 0
    : 0

  return (
    <div className="flex flex-col h-full overflow-auto bg-zinc-50">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-zinc-700" />
              Analytics
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">Metricas detalhadas de atendimento e IA</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-zinc-200 p-0.5">
            {PERIODS.map((p) => (
              <Button
                key={p.days}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 text-xs',
                  period === p.days && 'bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white'
                )}
                onClick={() => setPeriod(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
          </div>
        ) : (
          <>
            {/* AI Metrics Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-zinc-200 shadow-none">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-zinc-500">Total sugestoes</p>
                      <p className="mt-1 text-2xl font-bold text-zinc-900">
                        {aiSummary?.total_suggestions || 0}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
                      <Brain className="h-5 w-5 text-zinc-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-200 shadow-none">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-zinc-500">Tokens utilizados</p>
                      <p className="mt-1 text-2xl font-bold text-zinc-900">
                        {((aiSummary?.total_tokens_used || 0) / 1000).toFixed(1)}K
                      </p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
                      <Zap className="h-5 w-5 text-zinc-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-200 shadow-none">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-zinc-500">Latencia media</p>
                      <p className="mt-1 text-2xl font-bold text-zinc-900">
                        {aiSummary
                          ? `${(aiSummary.avg_latency_ms / 1000).toFixed(1)}s`
                          : '—'}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
                      <Clock className="h-5 w-5 text-zinc-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-zinc-200 shadow-none">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-zinc-500">Custo estimado</p>
                      <p className="mt-1 text-2xl font-bold text-zinc-900">
                        ${aiSummary?.estimated_cost_usd?.toFixed(2) || '0.00'}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
                      <DollarSign className="h-5 w-5 text-zinc-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* AI Approval Breakdown */}
            <Card className="border-zinc-200 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-900">
                  Taxa de utilizacao IA — {approvalRate}% aceitas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-4 overflow-hidden rounded-full bg-zinc-100">
                  {aiSummary && aiSummary.total_suggestions > 0 && (
                    <>
                      <div
                        className="bg-emerald-500 transition-all"
                        style={{
                          width: `${(aiSummary.approved_count / aiSummary.total_suggestions) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-amber-400 transition-all"
                        style={{
                          width: `${(aiSummary.edited_count / aiSummary.total_suggestions) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-red-400 transition-all"
                        style={{
                          width: `${(aiSummary.discarded_count / aiSummary.total_suggestions) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-6 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-zinc-600">
                      Aprovadas ({aiSummary?.approved_count || 0})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="text-zinc-600">
                      Editadas ({aiSummary?.edited_count || 0})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    <span className="text-zinc-600">
                      Descartadas ({aiSummary?.discarded_count || 0})
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Agent Performance Table */}
            <Card className="border-zinc-200 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-900">
                  Performance por atendente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {agents.length === 0 ? (
                  <p className="py-6 text-center text-sm text-zinc-400">
                    Nenhum dado de performance no período
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                          <th className="pb-2 font-medium">Atendente</th>
                          <th className="pb-2 font-medium text-center">Conversas</th>
                          <th className="pb-2 font-medium text-center">Mensagens</th>
                          <th className="pb-2 font-medium text-center">IA Aprovadas</th>
                          <th className="pb-2 font-medium text-center">IA Editadas</th>
                          <th className="pb-2 font-medium text-center">IA Descartadas</th>
                          <th className="pb-2 font-medium text-right">Tempo resp.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agents.map((agent) => (
                          <tr
                            key={agent.user_id}
                            className="border-b border-zinc-50 last:border-0"
                          >
                            <td className="py-2.5 font-medium text-zinc-900">
                              {agent.user_name}
                            </td>
                            <td className="py-2.5 text-center text-zinc-600">
                              {agent.conversations_handled}
                            </td>
                            <td className="py-2.5 text-center text-zinc-600">
                              {agent.messages_sent}
                            </td>
                            <td className="py-2.5 text-center text-emerald-600">
                              {agent.ai_approved}
                            </td>
                            <td className="py-2.5 text-center text-amber-600">
                              {agent.ai_edited}
                            </td>
                            <td className="py-2.5 text-center text-red-500">
                              {agent.ai_discarded}
                            </td>
                            <td className="py-2.5 text-right text-zinc-600">
                              {agent.avg_response_time_seconds > 0
                                ? `${Math.round(agent.avg_response_time_seconds)}s`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
