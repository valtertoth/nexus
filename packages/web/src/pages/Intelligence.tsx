import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Lightbulb,
  RefreshCw,
  ChevronRight,
  BarChart3,
} from 'lucide-react'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { cn } from '@/lib/utils'

const SERVER_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface ConversionSummary {
  total: number
  converted: number
  lost: number
  problem: number
  revenue: number
  conversionRate: number
  byChannel: Array<{
    channel: string
    conversions: number
    revenue: number
    rate: number
  }>
}

interface Insight {
  id: string
  insight_type: string
  title: string
  description: string
  playbook: string | null
  example_quote: string | null
  confidence: number
  tags: string[]
  outcome: string
  attr_channel: string | null
  attr_campaign: string | null
  created_at: string
  sectors?: { name: string } | null
}

interface Sector {
  id: string
  name: string
  color: string
}

const INSIGHT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  winning_pattern: { label: 'Padrão Vencedor', color: 'emerald' },
  losing_pattern: { label: 'Padrão de Perda', color: 'red' },
  key_phrase: { label: 'Frase-Chave', color: 'blue' },
  objection_handled: { label: 'Objeção Superada', color: 'violet' },
  turning_point: { label: 'Ponto de Virada', color: 'amber' },
  playbook_step: { label: 'Passo do Playbook', color: 'sky' },
}

const CHANNEL_LABELS: Record<string, string> = {
  meta_paid: 'Meta Ads',
  google_paid: 'Google Ads',
  organic: 'Orgânico',
  direct: 'Direto',
  whatsapp_direct: 'WhatsApp',
  other: 'Outro',
}

const PERIODS = [
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 90 dias', days: 90 },
]


export function Intelligence() {
  const { profile: _profile } = useAuthContext()
  const [period, setPeriod] = useState(30)
  const [sectorFilter, setSectorFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sectors, setSectors] = useState<Sector[]>([])
  const [summary, setSummary] = useState<ConversionSummary | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingInsights, setLoadingInsights] = useState(true)

  useEffect(() => {
    fetchSectors()
  }, [])

  useEffect(() => {
    fetchSummary()
    fetchInsights()
  }, [period, sectorFilter, typeFilter])

  async function fetchSectors() {
    const { data } = await supabase.from('sectors').select('id, name, color').order('name')
    setSectors((data as Sector[]) || [])
  }

  async function fetchSummary() {
    setLoadingSummary(true)
    try {
      const headers = getAuthHeaders()

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - period)

      const params = new URLSearchParams({ start_date: startDate.toISOString() })
      const res = await fetch(`${SERVER_URL}/api/intelligence/analytics?${params}`, {
        headers,
      })
      if (res.ok) setSummary(await res.json())
    } finally {
      setLoadingSummary(false)
    }
  }

  async function fetchInsights() {
    setLoadingInsights(true)
    try {
      let query = supabase
        .from('conversation_insights')
        .select('*, sectors(name)')
        .eq('is_active', true)
        .order('confidence', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)

      if (sectorFilter !== 'all') query = query.eq('sector_id', sectorFilter)
      if (typeFilter !== 'all') query = query.eq('insight_type', typeFilter)

      const { data } = await query
      setInsights((data as Insight[]) || [])
    } finally {
      setLoadingInsights(false)
    }
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)


  return (
    <div className="flex flex-col h-full overflow-auto bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-zinc-700" />
              Aprendizado Automatico
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Padroes de sucesso e fracasso extraidos automaticamente das suas conversas
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue>
                  {PERIODS.find((p) => p.days === period)?.label || `${period} dias`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.days} value={String(p.days)} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchSummary(); fetchInsights() }}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className="w-3 h-3" />
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            title="Taxa de Conversão"
            value={loadingSummary ? '—' : `${summary?.conversionRate ?? 0}%`}
            sub={`${summary?.converted ?? 0} de ${summary?.total ?? 0} conversas`}
            icon={Target}
            iconClass="text-emerald-600"
          />
          <SummaryCard
            title="Receita Total"
            value={loadingSummary ? '—' : formatCurrency(summary?.revenue ?? 0)}
            sub={`${summary?.converted ?? 0} vendas fechadas`}
            icon={DollarSign}
            iconClass="text-blue-600"
          />
          <SummaryCard
            title="Perdidos"
            value={loadingSummary ? '—' : String(summary?.lost ?? 0)}
            sub={`${summary?.total ? Math.round(((summary.lost ?? 0) / summary.total) * 100) : 0}% das conversas`}
            icon={TrendingDown}
            iconClass="text-red-500"
          />
          <SummaryCard
            title="Insights Gerados"
            value={loadingInsights ? '—' : String(insights.length)}
            sub="padrões identificados pela IA"
            icon={Lightbulb}
            iconClass="text-amber-500"
          />
        </div>

        {/* By Channel */}
        {summary && summary.byChannel.length > 0 && (
          <Card className="border-zinc-200 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Conversão por Canal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {summary.byChannel
                  .sort((a, b) => b.conversions - a.conversions)
                  .map((ch) => (
                    <div key={ch.channel} className="flex items-center gap-3">
                      <span className="w-28 text-xs text-zinc-500 truncate">
                        {CHANNEL_LABELS[ch.channel] || ch.channel}
                      </span>
                      <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(ch.rate, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-zinc-700 w-12 text-right">
                        {ch.rate}%
                      </span>
                      <span className="text-xs text-zinc-400 w-24 text-right">
                        {formatCurrency(ch.revenue)}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Insights */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-800">
              Insights extraídos pela IA
            </h2>
            <div className="flex items-center gap-2">
              <Select value={sectorFilter} onValueChange={(v) => { if (v) setSectorFilter(v) }}>
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue>
                    {sectorFilter === 'all'
                      ? 'Todos setores'
                      : sectors.find((s) => s.id === sectorFilter)?.name || sectorFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todos setores</SelectItem>
                  {sectors.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { if (v) setTypeFilter(v) }}>
                <SelectTrigger className="h-7 w-44 text-xs">
                  <SelectValue>
                    {typeFilter === 'all'
                      ? 'Todos tipos'
                      : INSIGHT_TYPE_CONFIG[typeFilter]?.label || typeFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todos tipos</SelectItem>
                  {Object.entries(INSIGHT_TYPE_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loadingInsights ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-zinc-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : insights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Lightbulb className="w-8 h-8 text-zinc-300 mb-3" />
              <p className="text-sm font-medium text-zinc-500">Nenhum insight gerado ainda</p>
              <p className="text-xs text-zinc-400 mt-1">
                Registre resultados nas conversas para ativar o sistema de aprendizado
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  title,
  value,
  sub,
  icon: Icon,
  iconClass,
}: {
  title: string
  value: string
  sub: string
  icon: React.ElementType
  iconClass: string
}) {
  return (
    <Card className="border-zinc-200 shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-500">{title}</p>
            <p className="text-2xl font-semibold text-zinc-900 mt-1">{value}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>
          </div>
          <div className={cn('p-2 rounded-lg bg-zinc-50', iconClass)}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function InsightCard({ insight }: { insight: Insight }) {
  const [expanded, setExpanded] = useState(false)
  const config = INSIGHT_TYPE_CONFIG[insight.insight_type]
  const confidence = Math.round(insight.confidence * 100)

  const outcomeIcon = insight.outcome === 'converted' ? TrendingUp : TrendingDown
  const OutcomeIcon = outcomeIcon

  return (
    <Card
      className={cn(
        'border-zinc-200 shadow-none cursor-pointer transition-shadow hover:shadow-sm',
        expanded && 'shadow-sm'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex-shrink-0 mt-0.5',
              insight.outcome === 'converted' ? 'text-emerald-500' : 'text-red-400'
            )}
          >
            <OutcomeIcon className="w-4 h-4" strokeWidth={2} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {config && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      'text-[10px] h-4 px-1.5 font-medium',
                      `bg-${config.color}-50 text-${config.color}-700 hover:bg-${config.color}-50`
                    )}
                  >
                    {config.label}
                  </Badge>
                )}
                {insight.sectors?.name && (
                  <span className="text-[10px] text-zinc-400">{insight.sectors.name}</span>
                )}
                {insight.attr_channel && (
                  <span className="text-[10px] text-zinc-400">
                    {CHANNEL_LABELS[insight.attr_channel] || insight.attr_channel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span
                  className={cn(
                    'text-xs font-medium',
                    confidence >= 85
                      ? 'text-emerald-600'
                      : confidence >= 70
                      ? 'text-amber-600'
                      : 'text-zinc-400'
                  )}
                >
                  {confidence}%
                </span>
                <ChevronRight
                  className={cn(
                    'w-3.5 h-3.5 text-zinc-400 transition-transform',
                    expanded && 'rotate-90'
                  )}
                />
              </div>
            </div>

            <p className="text-sm font-medium text-zinc-800 mt-1">{insight.title}</p>
            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{insight.description}</p>

            {expanded && (
              <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
                {insight.example_quote && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
                      Exemplo da conversa
                    </p>
                    <blockquote className="text-xs text-zinc-600 border-l-2 border-zinc-200 pl-2.5 italic">
                      "{insight.example_quote}"
                    </blockquote>
                  </div>
                )}
                {insight.playbook && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
                      Como replicar
                    </p>
                    <p className="text-xs text-zinc-600">{insight.playbook}</p>
                  </div>
                )}
                {insight.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {insight.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
