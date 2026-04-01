import { useEffect, useState } from 'react'
import { MessageSquare, Clock, Brain, TrendingUp, TrendingDown, LayoutDashboard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { usePresence } from '@/hooks/usePresence'
import { getInitials } from '@nexus/shared'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { cn } from '@/lib/utils'

interface DailyStats {
  day: string
  new_conversations: number
  resolved_conversations: number
  total_messages: number
}

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
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
}) {
  return (
    <Card className="border-zinc-200 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-500">{title}</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
            {trendLabel && (
              <div className="mt-1 flex items-center gap-1">
                {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                <span
                  className={cn(
                    'text-xs font-medium',
                    trend === 'up' && 'text-emerald-600',
                    trend === 'down' && 'text-red-600',
                    trend === 'neutral' && 'text-zinc-500'
                  )}
                >
                  {trendLabel}
                </span>
              </div>
            )}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
            <Icon className="h-5 w-5 text-zinc-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444']

export default function Dashboard() {
  const { profile } = useAuthContext()
  const { onlineUsers } = usePresence()
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [aiSummary, setAiSummary] = useState<AiUsageSummary | null>(null)
  const [agents, setAgents] = useState<AgentPerf[]>([])
  const [todayConvs, setTodayConvs] = useState(0)
  const [todayMsgs, setTodayMsgs] = useState(0)

  const orgId = profile?.org_id

  useEffect(() => {
    if (!orgId) return

    async function load() {
      // Daily stats (7 days)
      const { data: daily } = await supabase.rpc('daily_conversation_stats', {
        p_org_id: orgId,
        p_days: 7,
      })
      if (daily) {
        setDailyStats(daily as DailyStats[])
        const today = daily[daily.length - 1] as DailyStats | undefined
        if (today) {
          setTodayConvs(today.new_conversations)
          setTodayMsgs(today.total_messages)
        }
      }

      // AI usage summary
      const { data: aiData } = await supabase.rpc('ai_usage_summary', {
        p_org_id: orgId,
        p_days: 7,
      })
      if (aiData) {
        // RPC returns array with single row
        const summary = Array.isArray(aiData) ? aiData[0] : aiData
        setAiSummary(summary as AiUsageSummary)
      }

      // Agent performance
      const { data: agentData } = await supabase.rpc('agent_performance', {
        p_org_id: orgId,
        p_days: 7,
      })
      if (agentData) {
        setAgents(agentData as AgentPerf[])
      }
    }

    load()
  }, [orgId])

  const approvalRate = aiSummary
    ? aiSummary.total_suggestions > 0
      ? Math.round((aiSummary.approved_count / aiSummary.total_suggestions) * 100)
      : 0
    : 0

  const pieData = aiSummary
    ? [
        { name: 'Aprovadas', value: aiSummary.approved_count },
        { name: 'Editadas', value: aiSummary.edited_count },
        { name: 'Descartadas', value: aiSummary.discarded_count },
      ].filter((d) => d.value > 0)
    : []

  const chartData = dailyStats.map((d) => ({
    date: new Date(d.day).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
    conversas: d.new_conversations,
    mensagens: d.total_messages,
    resolvidas: d.resolved_conversations,
  }))

  return (
    <div className="flex flex-col h-full overflow-auto bg-zinc-50">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 text-zinc-700" />
          Dashboard
        </h1>
        <p className="text-sm text-zinc-500 mt-0.5">Visao geral dos ultimos 7 dias</p>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Conversas hoje"
            value={todayConvs}
            icon={MessageSquare}
            trend="neutral"
            trendLabel="últimas 24h"
          />
          <StatCard
            title="Latência média IA"
            value={aiSummary ? `${(aiSummary.avg_latency_ms / 1000).toFixed(1)}s` : '—'}
            icon={Clock}
            trend="neutral"
          />
          <StatCard
            title="Taxa aprovação IA"
            value={`${approvalRate}%`}
            icon={Brain}
            trend={approvalRate >= 70 ? 'up' : 'down'}
            trendLabel={`${aiSummary?.total_suggestions || 0} sugestões`}
          />
          <StatCard
            title="Mensagens hoje"
            value={todayMsgs}
            icon={MessageSquare}
            trend="neutral"
            trendLabel="total"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Area Chart — Conversations per day */}
          <Card className="lg:col-span-2 border-zinc-200 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-900">
                Conversas por dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#a1a1aa" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#a1a1aa" />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #e4e4e7',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="conversas"
                      stroke="#18181b"
                      fill="#18181b"
                      fillOpacity={0.1}
                      strokeWidth={2}
                      name="Novas"
                    />
                    <Area
                      type="monotone"
                      dataKey="resolvidas"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.08}
                      strokeWidth={2}
                      name="Resolvidas"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Pie Chart — AI Usage */}
          <Card className="border-zinc-200 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-900">
                Uso da IA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                    Sem dados de IA
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {pieData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[i] }}
                      />
                      <span className="text-zinc-600">{item.name}</span>
                    </div>
                    <span className="font-medium text-zinc-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Online Agents */}
        <Card className="border-zinc-200 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-900">
              Atendentes ({agents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {agents.length === 0 && (
                <p className="text-sm text-zinc-400 py-4 text-center">
                  Nenhum dado de atendentes
                </p>
              )}
              {agents.map((agent) => {
                const isOnline = onlineUsers.some((u) => u.userId === agent.user_id)
                return (
                  <div
                    key={agent.user_id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-100 px-3 py-2"
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-zinc-100 text-zinc-600 text-xs">
                          {getInitials(agent.user_name)}
                        </AvatarFallback>
                      </Avatar>
                      {isOnline && (
                        <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-900">{agent.user_name}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <div className="text-center">
                        <p className="font-semibold text-zinc-900">
                          {agent.conversations_handled}
                        </p>
                        <p>conversas</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-zinc-900">{agent.messages_sent}</p>
                        <p>mensagens</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
