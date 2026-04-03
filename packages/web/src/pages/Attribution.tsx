import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
  DollarSign,
  Megaphone,
  Users,
  AlertCircle,
  RefreshCw,
  BarChart3,
  ArrowRight,
  GitMerge,
} from 'lucide-react'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const SERVER_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

const CHANNEL_LABELS: Record<string, string> = {
  meta_paid: 'Meta Ads',
  google_paid: 'Google Ads',
  organic: 'Orgânico',
  direct: 'Direto',
  whatsapp_direct: 'WhatsApp Direto',
  other: 'Outro',
}

const PERIODS = [
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 90 dias', days: 90 },
  { label: 'Todo o período', days: 0 },
]

interface FunnelData {
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

interface AccountabilityData {
  marketing: { count: number; rate: number; topReasons: string[] }
  sales: { count: number; rate: number; topReasons: string[] }
  market: { count: number; rate: number; topReasons: string[] }
  total_tagged_lost: number
}

interface TagFrequency {
  tag_slug: string
  tag_label: string
  accountability: string | null
  dimension: string
  count: number
  revenue: number | null
}

function apiFetch(path: string) {
  const headers = getAuthHeaders()
  return fetch(`${SERVER_URL}${path}`, { headers }).then((res) =>
    res.ok ? res.json() : null
  )
}

export function Attribution() {
  const [period, setPeriod] = useState(30)
  const [channelFilter, setChannelFilter] = useState('all')
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [accountability, setAccountability] = useState<AccountabilityData | null>(null)
  const [tagFreq, setTagFreq] = useState<TagFrequency[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const start =
        period > 0
          ? new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString()
          : undefined

      const params = new URLSearchParams()
      if (start) params.set('start_date', start)
      if (channelFilter !== 'all') params.set('channel', channelFilter)

      const [funnelData, accountData] = await Promise.all([
        apiFetch(`/api/intelligence/analytics?${params}`),
        apiFetch(`/api/tags/analytics/accountability?${params}`),
      ])

      if (funnelData) setFunnel(funnelData)
      if (accountData) setAccountability(accountData)

      // Fetch tag frequency from supabase directly
      const { data: freq } = await supabase
        .from('v_accountability_summary')
        .select('*')
        .order('occurrences', { ascending: false })
        .limit(20)

      setTagFreq(
        (freq || []).map((r: Record<string, unknown>) => ({
          tag_slug: r.tag_slug as string,
          tag_label: r.tag_label as string,
          accountability: r.accountability as string | null,
          dimension: '',
          count: Number(r.occurrences || 0),
          revenue: r.revenue_generated ? Number(r.revenue_generated) : null,
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [period, channelFilter])

  useEffect(() => { load() }, [load])

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  const totalLost = (funnel?.lost ?? 0) + (funnel?.problem ?? 0)
  const totalTaggedLost = accountability?.total_tagged_lost ?? 0
  const untaggedRate =
    totalLost > 0 && totalTaggedLost < totalLost
      ? Math.round(((totalLost - totalTaggedLost) / totalLost) * 100)
      : 0

  return (
    <div className="flex flex-col h-full overflow-auto bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-zinc-700" />
              Funil de Vendas
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Da campanha até o fechamento — responsabilidade clara para cada etapa
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={channelFilter} onValueChange={(v) => { if (v) setChannelFilter(v) }}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue>
                  {channelFilter === 'all'
                    ? 'Todos canais'
                    : CHANNEL_LABELS[channelFilter] || channelFilter}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todos canais</SelectItem>
                {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button variant="outline" size="sm" onClick={load} className="h-8 text-xs gap-1.5">
              <RefreshCw className="w-3 h-3" />
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Funnel visualization */}
        <div className="grid grid-cols-5 gap-0">
          <FunnelStage
            label="Conversas"
            value={funnel?.total ?? 0}
            icon={Users}
            color="zinc"
            loading={loading}
          />
          <FunnelArrow />
          <FunnelStage
            label="Fechados"
            value={funnel?.converted ?? 0}
            icon={TrendingUp}
            color="emerald"
            sub={funnel ? `${funnel.conversionRate}% de conversão` : undefined}
            loading={loading}
          />
          <FunnelArrow />
          <FunnelStage
            label="Receita"
            value={funnel ? formatCurrency(funnel.revenue) : '—'}
            icon={DollarSign}
            color="blue"
            sub={funnel?.converted ? `${funnel.converted} vendas` : undefined}
            loading={loading}
            valueIsString
          />
        </div>

        {/* The Accountability Split — the main feature */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-800">De quem é a responsabilidade?</h2>
            {totalTaggedLost > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {totalTaggedLost} perdas classificadas
              </Badge>
            )}
          </div>

          {accountability && accountability.total_tagged_lost > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <AccountabilityCard
                title="Problema de Marketing"
                subtitle="Lead não qualificado para o produto"
                count={accountability.marketing.count}
                rate={accountability.marketing.rate}
                total={totalTaggedLost}
                reasons={accountability.marketing.topReasons}
                icon={Megaphone}
                colorClass="border-blue-200 bg-blue-50"
                barColor="bg-blue-500"
                iconColor="text-blue-600"
                action="Revisar segmentação e criativos dos anúncios"
              />
              <AccountabilityCard
                title="Problema de Vendas"
                subtitle="Lead qualificado, mas não convertido"
                count={accountability.sales.count}
                rate={accountability.sales.rate}
                total={totalTaggedLost}
                reasons={accountability.sales.topReasons}
                icon={Users}
                colorClass="border-orange-200 bg-orange-50"
                barColor="bg-orange-500"
                iconColor="text-orange-600"
                action="Treinamento, playbook e processo de followup"
              />
              <AccountabilityCard
                title="Condições de Mercado"
                subtitle="Fatores externos ao controle"
                count={accountability.market.count}
                rate={accountability.market.rate}
                total={totalTaggedLost}
                reasons={accountability.market.topReasons}
                icon={AlertCircle}
                colorClass="border-zinc-200 bg-zinc-50"
                barColor="bg-zinc-400"
                iconColor="text-zinc-500"
                action="Revisar proposta de valor e política de preços"
              />
            </div>
          ) : (
            <EmptyAccountability untaggedRate={untaggedRate} totalLost={totalLost} />
          )}
        </div>

        {/* By Channel */}
        {funnel && funnel.byChannel.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 mb-3">Conversão por Canal</h2>
            <div className="grid gap-3">
              {funnel.byChannel
                .sort((a, b) => b.conversions - a.conversions)
                .map((ch) => (
                  <ChannelRow
                    key={ch.channel}
                    channel={ch.channel}
                    conversions={ch.conversions}
                    revenue={ch.revenue}
                    rate={ch.rate}
                    formatCurrency={formatCurrency}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Tag frequency table */}
        {tagFreq.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 mb-3">Motivos mais frequentes</h2>
            <Card className="border-zinc-200 shadow-none">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="text-left text-[10px] uppercase tracking-wider text-zinc-400 font-medium px-4 py-2.5">
                        Motivo
                      </th>
                      <th className="text-left text-[10px] uppercase tracking-wider text-zinc-400 font-medium px-4 py-2.5">
                        Responsável
                      </th>
                      <th className="text-right text-[10px] uppercase tracking-wider text-zinc-400 font-medium px-4 py-2.5">
                        Ocorrências
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tagFreq.map((tag, i) => (
                      <tr
                        key={tag.tag_slug}
                        className={cn('border-b border-zinc-50 last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50')}
                      >
                        <td className="px-4 py-2.5">
                          <span className="text-sm text-zinc-700">{tag.tag_label}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <AccountabilityBadge accountability={tag.accountability} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-sm font-semibold text-zinc-700">{tag.count}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FunnelStage({
  label,
  value,
  icon: Icon,
  color,
  sub,
  loading,
  valueIsString,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  sub?: string
  loading: boolean
  valueIsString?: boolean
}) {
  const colorMap: Record<string, string> = {
    zinc: 'text-zinc-600 bg-zinc-100',
    emerald: 'text-emerald-600 bg-emerald-100',
    blue: 'text-blue-600 bg-blue-100',
  }

  return (
    <Card className="border-zinc-200 shadow-none">
      <CardContent className="p-4 text-center">
        <div className={cn('inline-flex p-2 rounded-lg mb-2', colorMap[color])}>
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-xs text-zinc-500 mb-1">{label}</p>
        <p className={cn('font-bold text-zinc-900', valueIsString ? 'text-lg' : 'text-2xl')}>
          {loading ? '—' : value}
        </p>
        {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function FunnelArrow() {
  return (
    <div className="flex items-center justify-center">
      <ArrowRight className="w-4 h-4 text-zinc-300" />
    </div>
  )
}

function AccountabilityCard({
  title,
  subtitle,
  count,
  rate,
  total,
  reasons,
  icon: Icon,
  colorClass,
  barColor,
  iconColor,
  action,
}: {
  title: string
  subtitle: string
  count: number
  rate: number
  total: number
  reasons: string[]
  icon: React.ElementType
  colorClass: string
  barColor: string
  iconColor: string
  action: string
}) {
  const barWidth = total > 0 ? (count / total) * 100 : 0

  return (
    <Card className={cn('border shadow-none', colorClass)}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', iconColor)} />
          <div>
            <p className="text-sm font-semibold text-zinc-800">{title}</p>
            <p className="text-[11px] text-zinc-500">{subtitle}</p>
          </div>
        </div>

        {/* Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-bold text-zinc-900">{count} perdas</span>
            <span className="text-zinc-500">{rate}%</span>
          </div>
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', barColor)}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>

        {/* Top reasons */}
        {reasons.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-zinc-500 font-medium">Principais motivos:</p>
            {reasons.map((r) => (
              <div key={r} className="flex items-center gap-1.5">
                <div className={cn('w-1 h-1 rounded-full shrink-0', barColor)} />
                <span className="text-[11px] text-zinc-600">{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action */}
        {count > 0 && (
          <div className="pt-1 border-t border-white/40">
            <p className="text-[10px] text-zinc-500 italic">{action}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyAccountability({ untaggedRate, totalLost }: { untaggedRate: number; totalLost: number }) {
  return (
    <Card className="border-zinc-200 shadow-none border-dashed">
      <CardContent className="p-6 text-center">
        <AlertCircle className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-zinc-500">Ainda sem dados de responsabilidade</p>
        {totalLost > 0 ? (
          <p className="text-xs text-zinc-400 mt-1">
            Você tem {totalLost} conversas encerradas sem classificação.
            {untaggedRate > 0 && ` Classifique pelo menos ${Math.ceil(totalLost * 0.5)} para ativar esta análise.`}
          </p>
        ) : (
          <p className="text-xs text-zinc-400 mt-1">
            Quando agentes registrarem resultados e adicionarem tags de motivo, o Funil de Verdade aparecerá aqui.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ChannelRow({
  channel,
  conversions,
  revenue,
  rate,
  formatCurrency,
}: {
  channel: string
  conversions: number
  revenue: number
  rate: number
  formatCurrency: (v: number) => string
}) {
  return (
    <Card className="border-zinc-200 shadow-none">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-4">
          <div className="w-28 shrink-0">
            <p className="text-xs font-medium text-zinc-700">
              {CHANNEL_LABELS[channel] || channel}
            </p>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
              <span>{conversions} fechamentos</span>
              <span>{rate}%</span>
            </div>
            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${Math.min(rate, 100)}%` }}
              />
            </div>
          </div>
          <div className="w-28 text-right shrink-0">
            <p className="text-sm font-semibold text-zinc-800">{formatCurrency(revenue)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AccountabilityBadge({ accountability }: { accountability: string | null }) {
  const config = {
    marketing: { label: 'Marketing', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    sales: { label: 'Vendas', className: 'bg-orange-100 text-orange-700 border-orange-200' },
    market: { label: 'Mercado', className: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
    neutral: { label: 'Geral', className: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
  }[accountability || 'neutral'] || { label: accountability || '—', className: 'bg-zinc-100 text-zinc-500 border-zinc-200' }

  return (
    <Badge variant="outline" className={cn('text-[10px] h-4 px-1.5 font-medium', config.className)}>
      {config.label}
    </Badge>
  )
}
