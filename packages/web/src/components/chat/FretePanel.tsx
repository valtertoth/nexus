import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { supabaseFrete } from '@/lib/supabaseFrete'
import { calcularFrete } from '@/lib/freteCalculo'
import { calcularM3 } from '@/types/frete'
import type {
  Transportadora,
  TransportadoraOrigem,
  CidadePraca,
  ParametrosCalculo,
  FreteResult,
  DimensoesInput,
} from '@/types/frete'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Truck,
  Ruler,
  Send,
  Copy,
  ChevronDown,
  ChevronUp,
  Search,
  Loader2,
  MapPin,
  Package,
  CircleDollarSign,
  Check,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Utilities ──────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

// ── Data hooks (plain useState/useEffect) ─────────────────────────────────

function useTransportadoras() {
  const [data, setData] = useState<Transportadora[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    supabaseFrete
      .from('transportadoras')
      .select('*')
      .eq('ativo', true)
      .order('nome')
      .then(({ data: rows, error }) => {
        if (!error && rows) setData(rows as Transportadora[])
        setIsLoading(false)
      })
  }, [])

  return { data, isLoading }
}

function useTransportadoraOrigens(transportadoraId: string | undefined) {
  const [data, setData] = useState<TransportadoraOrigem[]>([])

  useEffect(() => {
    if (!transportadoraId) { setData([]); return }
    let cancelled = false
    supabaseFrete
      .from('transportadora_origens')
      .select('*')
      .eq('transportadora_id', transportadoraId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data: rows, error }) => {
        if (!cancelled && !error && rows) setData(rows as TransportadoraOrigem[])
      })
    return () => { cancelled = true }
  }, [transportadoraId])

  return { data }
}

function useCidadeSearch(transportadoraId: string | undefined, search: string) {
  const [data, setData] = useState<CidadePraca[]>([])
  const [isFetching, setIsFetching] = useState(false)

  useEffect(() => {
    if (!transportadoraId || search.length < 2) { setData([]); return }
    let cancelled = false
    setIsFetching(true)
    supabaseFrete
      .from('transportadora_cidade_praca')
      .select('*')
      .eq('transportadora_id', transportadoraId)
      .ilike('cidade', `${search}%`)
      .order('cidade')
      .limit(20)
      .then(({ data: rows, error }) => {
        if (!cancelled) {
          if (!error && rows) setData(rows as CidadePraca[])
          setIsFetching(false)
        }
      })
    return () => { cancelled = true }
  }, [transportadoraId, search])

  return { data, isFetching }
}

function usePracaValores(
  transportadoraId: string | undefined,
  origemCodigo: string | undefined,
  pracaDestino: string | undefined
) {
  const [data, setData] = useState<number[] | null>(null)

  useEffect(() => {
    if (!transportadoraId || !origemCodigo || !pracaDestino) { setData(null); return }
    let cancelled = false
    supabaseFrete
      .from('transportadora_tabela_frete')
      .select('faixa_idx, valor')
      .eq('transportadora_id', transportadoraId)
      .eq('origem_codigo', origemCodigo)
      .eq('praca_destino', pracaDestino)
      .order('faixa_idx')
      .then(({ data: rows, error }) => {
        if (cancelled) return
        if (error || !rows) { setData(null); return }
        const valores = new Array(9).fill(0) as number[]
        for (const row of rows as Array<{ faixa_idx: number; valor: number }>) {
          valores[row.faixa_idx] = Number(row.valor)
        }
        setData(valores)
      })
    return () => { cancelled = true }
  }, [transportadoraId, origemCodigo, pracaDestino])

  return { data }
}

function resolveOriginParams(
  transportadora: Transportadora,
  origem: TransportadoraOrigem
): ParametrosCalculo | null {
  const base = transportadora.parametros_calculo
  if (!base) return null
  if (!origem.parametros_override) return base
  return { ...base, ...origem.parametros_override }
}

// ── Field wrapper ──────────────────────────────────────────────────────────

function Field({
  label,
  icon: Icon,
  children,
  className,
}: {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-zinc-400" />}
        <span className="text-xs font-medium text-zinc-500">{label}</span>
      </div>
      {children}
    </div>
  )
}

// ── Dimensions Calculator ─────────────────────────────────────────────────

function DimensoesCalculator({ onCalculate }: { onCalculate: (m3: number) => void }) {
  const [dims, setDims] = useState<DimensoesInput>({
    comprimento: 0,
    largura: 0,
    altura: 0,
    quantidade: 1,
  })

  const m3 = calcularM3(dims)

  const handleChange = (field: keyof DimensoesInput, value: string) => {
    const num = parseFloat(value) || 0
    setDims((prev) => ({ ...prev, [field]: num }))
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { key: 'comprimento' as const, label: 'C (cm)', val: dims.comprimento },
          { key: 'largura' as const, label: 'L (cm)', val: dims.largura },
          { key: 'altura' as const, label: 'A (cm)', val: dims.altura },
          { key: 'quantidade' as const, label: 'Qtd', val: dims.quantidade },
        ].map(({ key, label, val }) => (
          <div key={key}>
            <span className="text-[10px] text-zinc-400 mb-0.5 block">{label}</span>
            <Input
              type="number"
              min={key === 'quantidade' ? 1 : 0}
              value={val || ''}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder="0"
              className="h-7 text-xs px-2"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          = <span className="font-semibold text-zinc-900">{m3.toFixed(4)} m3</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={m3 <= 0}
          onClick={() => onCalculate(m3)}
          className="h-6 text-[10px] px-2.5 gap-1"
        >
          <Check className="w-3 h-3" />
          Usar
        </Button>
      </div>
    </div>
  )
}

// ── Result breakdown ──────────────────────────────────────────────────────

function FreteResultCard({
  result,
  transportadoraNome,
}: {
  result: FreteResult
  transportadoraNome: string
}) {
  const items = [
    { label: 'Frete Peso', value: result.fretePeso },
    { label: 'Despacho', value: result.despacho },
    { label: `GRIS (${formatPercent(result.detalhes.grisPct)})`, value: result.gris },
    { label: 'Pedagio', value: result.pedagio },
  ]
  if (result.advalorem > 0)
    items.push({ label: 'Ad Valorem', value: result.advalorem })
  if (result.txDifAcesso > 0)
    items.push({ label: `Tx Dif. (${formatPercent(result.detalhes.txDifPct)})`, value: result.txDifAcesso })
  if (result.entrega > 0)
    items.push({ label: 'Entrega', value: result.entrega })

  const finalValue = result.margem > 0 ? result.totalComMargem : result.total

  return (
    <div className="space-y-3">
      {/* Total highlight */}
      <div className="rounded-xl bg-zinc-900 px-4 py-4 text-white">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-zinc-400 uppercase tracking-wider">
            {result.margem > 0 ? 'Total c/ margem' : 'Total do frete'}
          </span>
          <span className="text-[10px] text-zinc-500">{transportadoraNome}</span>
        </div>
        <div className="text-2xl font-semibold tracking-tight">
          {formatCurrency(finalValue)}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">
            {result.detalhes.faixaLabel}
          </span>
          <span className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">
            {result.detalhes.praca}
          </span>
          <span className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">
            {result.detalhes.m3.toFixed(2)} m3
          </span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="rounded-lg border border-zinc-200 divide-y divide-zinc-100">
        {/* Line items */}
        <div className="px-3 py-2 space-y-0.5">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between py-0.5">
              <span className="text-[11px] text-zinc-500">{item.label}</span>
              <span className="text-[11px] font-medium text-zinc-700 tabular-nums">
                {formatCurrency(item.value)}
              </span>
            </div>
          ))}
        </div>

        {/* Subtotal + ICMS */}
        <div className="px-3 py-2 space-y-0.5">
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[11px] text-zinc-500">Subtotal</span>
            <span className="text-[11px] font-medium text-zinc-700 tabular-nums">
              {formatCurrency(result.subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[11px] text-zinc-500">
              ICMS ({formatPercent(result.detalhes.icmsPct)})
            </span>
            <span className="text-[11px] font-medium text-zinc-700 tabular-nums">
              {formatCurrency(result.icms)}
            </span>
          </div>
        </div>

        {/* Total */}
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-900">Total</span>
            <span className="text-xs font-semibold text-zinc-900 tabular-nums">
              {formatCurrency(result.total)}
            </span>
          </div>
          {result.margem > 0 && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-zinc-500">
                + Margem ({formatPercent(result.detalhes.m3 > 0 ? result.margem / result.total : 0)})
              </span>
              <span className="text-[11px] font-medium text-zinc-700 tabular-nums">
                {formatCurrency(result.margem)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────

interface FretePanelProps {
  open: boolean
  onClose: () => void
  onInsertInChat?: (text: string) => void
  embedded?: boolean
}

export function FretePanel({ onInsertInChat, embedded }: FretePanelProps) {
  // ── Form state ──
  const [transportadoraId, setTransportadoraId] = useState<string>('')
  const [origemCodigo, setOrigemCodigo] = useState<string>('')
  const [cidadeSearch, setCidadeSearch] = useState('')
  const [selectedCidade, setSelectedCidade] = useState<CidadePraca | null>(null)
  const [showCidadeDropdown, setShowCidadeDropdown] = useState(false)
  const [m3, setM3] = useState<number>(0)
  const [valorMercadoria, setValorMercadoria] = useState<number>(0)
  const [incluirEntrega, setIncluirEntrega] = useState(false)
  const [showDimensoes, setShowDimensoes] = useState(false)

  // ── Data queries ──
  const { data: transportadoras, isLoading: loadingTransp } = useTransportadoras()
  const { data: origens } = useTransportadoraOrigens(transportadoraId || undefined)
  const { data: cidades, isFetching: searchingCidades } = useCidadeSearch(
    transportadoraId || undefined,
    cidadeSearch
  )
  const { data: fretePesoValores } = usePracaValores(
    transportadoraId || undefined,
    origemCodigo || undefined,
    selectedCidade?.praca
  )

  // ── Derived state ──
  const selectedTransportadora = useMemo(
    () => transportadoras.find((t: Transportadora) => t.id === transportadoraId),
    [transportadoras, transportadoraId]
  )

  const selectedOrigem = useMemo(
    () => origens.find((o: TransportadoraOrigem) => o.codigo === origemCodigo),
    [origens, origemCodigo]
  )

  const params = useMemo(() => {
    if (!selectedTransportadora || !selectedOrigem) return null
    return resolveOriginParams(selectedTransportadora, selectedOrigem)
  }, [selectedTransportadora, selectedOrigem])

  // ── Calculate result ──
  const result: FreteResult | null = useMemo(() => {
    if (
      !params ||
      !fretePesoValores ||
      fretePesoValores.length < 9 ||
      !m3 ||
      !valorMercadoria ||
      !selectedCidade?.praca
    ) {
      return null
    }
    return calcularFrete({
      params,
      fretePesoValores,
      m3,
      valorMercadoria,
      praca: selectedCidade.praca,
      incluirEntrega,
      margemSeguranca: selectedTransportadora?.margem_seguranca ?? 0,
    })
  }, [params, fretePesoValores, m3, valorMercadoria, selectedCidade, incluirEntrega, selectedTransportadora])

  // ── Auto-select when only 1 transportadora ──
  useEffect(() => {
    if (transportadoras.length === 1 && !transportadoraId) {
      setTransportadoraId(transportadoras[0].id)
    }
  }, [transportadoras, transportadoraId])

  // ── Auto-select when only 1 origem ──
  useEffect(() => {
    if (origens.length === 1 && !origemCodigo) {
      setOrigemCodigo(origens[0].codigo)
    }
  }, [origens, origemCodigo])

  // ── Reset dependent fields on transportadora change ──
  useEffect(() => {
    setOrigemCodigo('')
    setCidadeSearch('')
    setSelectedCidade(null)
  }, [transportadoraId])

  // ── Handlers ──
  const handleCidadeSelect = useCallback((cidade: CidadePraca) => {
    setSelectedCidade(cidade)
    setCidadeSearch(cidade.cidade)
    setShowCidadeDropdown(false)
  }, [])

  const handleReset = useCallback(() => {
    setCidadeSearch('')
    setSelectedCidade(null)
    setM3(0)
    setValorMercadoria(0)
    setIncluirEntrega(false)
    setShowDimensoes(false)
  }, [])

  const formatResultText = useCallback((r: FreteResult): string => {
    const lines = [
      `Frete calculado:`,
      `Destino: ${r.detalhes.praca} (${r.detalhes.estado})`,
      `Faixa: ${r.detalhes.faixaLabel}`,
      `M3: ${r.detalhes.m3.toFixed(4)}`,
      ``,
      `Frete Peso: ${formatCurrency(r.fretePeso)}`,
      `Despacho: ${formatCurrency(r.despacho)}`,
      `GRIS: ${formatCurrency(r.gris)}`,
      `Pedagio: ${formatCurrency(r.pedagio)}`,
    ]
    if (r.advalorem > 0) lines.push(`Ad-Valorem: ${formatCurrency(r.advalorem)}`)
    if (r.txDifAcesso > 0) lines.push(`TxDifAcesso: ${formatCurrency(r.txDifAcesso)}`)
    if (r.entrega > 0) lines.push(`Entrega: ${formatCurrency(r.entrega)}`)
    lines.push(
      ``,
      `Subtotal: ${formatCurrency(r.subtotal)}`,
      `ICMS: ${formatCurrency(r.icms)}`,
      `*Total: ${formatCurrency(r.total)}*`,
    )
    if (r.margem > 0) {
      lines.push(`Total c/ Margem: ${formatCurrency(r.totalComMargem)}`)
    }
    return lines.join('\n')
  }, [])

  const handleSendToChat = useCallback(() => {
    if (!result || !onInsertInChat) return
    onInsertInChat(formatResultText(result))
    toast.success('Frete inserido no chat')
  }, [result, onInsertInChat, formatResultText])

  const handleCopy = useCallback(() => {
    if (!result) return
    navigator.clipboard.writeText(formatResultText(result))
    toast.success('Copiado para a area de transferencia')
  }, [result, formatResultText])

  // ── Progress indicator ──
  const step = !transportadoraId ? 0 : !origemCodigo ? 1 : !selectedCidade ? 2 : !result ? 3 : 4

  return (
    <div className={cn('flex flex-col h-full', !embedded && 'bg-white')}>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Route config section */}
        <div className="px-4 pt-4 pb-3 space-y-3">
          {/* Section header with step dots */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-500">Rota</span>
            </div>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={cn(
                    'w-1.5 h-1.5 rounded-full transition-colors duration-200',
                    s < step ? 'bg-zinc-900' : s === step ? 'bg-zinc-400' : 'bg-zinc-200'
                  )}
                />
              ))}
            </div>
          </div>

          {/* Transportadora + Origem in compact layout */}
          {loadingTransp ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="space-y-2">
              <Select value={transportadoraId} onValueChange={(v) => { if (v) setTransportadoraId(v) }}>
                <SelectTrigger className="h-9 text-xs w-full">
                  <SelectValue placeholder="Transportadora">
                    {selectedTransportadora?.nome ?? 'Transportadora'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {transportadoras.map((t: Transportadora) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {transportadoraId && (
                <Select value={origemCodigo} onValueChange={(v) => { if (v) setOrigemCodigo(v) }}>
                  <SelectTrigger className="h-9 text-xs w-full">
                    <SelectValue placeholder="Origem">
                      {selectedOrigem ? selectedOrigem.nome : 'Origem'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {origens.map((o: TransportadoraOrigem) => (
                      <SelectItem key={o.id} value={o.codigo} className="text-xs">
                        {o.nome}
                        <span className="text-zinc-400 ml-1">({o.codigo})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        {origemCodigo && <div className="h-px bg-zinc-100 mx-4" />}

        {/* Destination section */}
        {origemCodigo && (
          <div className="px-4 py-3 space-y-3">
            <Field label="Destino" icon={MapPin}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <Input
                  value={cidadeSearch}
                  onChange={(e) => {
                    setCidadeSearch(e.target.value)
                    setShowCidadeDropdown(true)
                    if (selectedCidade && e.target.value !== selectedCidade.cidade) {
                      setSelectedCidade(null)
                    }
                  }}
                  onFocus={() => cidadeSearch.length >= 2 && setShowCidadeDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCidadeDropdown(false), 200)}
                  placeholder="Buscar cidade..."
                  className="h-9 text-xs pl-8"
                />
                {searchingCidades && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-zinc-400" />
                )}
              </div>

              {/* Search results dropdown */}
              {showCidadeDropdown && cidades.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mx-4 mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {cidades.map((c: CidadePraca) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleCidadeSelect(c)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50 transition-colors duration-150 border-b border-zinc-50 last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span className="text-xs text-zinc-900 truncate">{c.cidade}</span>
                        {c.estado && (
                          <span className="text-[10px] text-zinc-400 shrink-0">{c.estado}</span>
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-zinc-500 shrink-0 ml-2">
                        {c.praca}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected city badge */}
              {selectedCidade && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 border border-emerald-100">
                    <Check className="w-2.5 h-2.5" />
                    {selectedCidade.praca}
                  </span>
                  {selectedCidade.unidade && (
                    <span className="inline-flex items-center rounded-md bg-zinc-50 px-2 py-1 text-[10px] text-zinc-500 border border-zinc-100">
                      {selectedCidade.unidade}
                    </span>
                  )}
                </div>
              )}
            </Field>
          </div>
        )}

        {/* Divider */}
        {selectedCidade && <div className="h-px bg-zinc-100 mx-4" />}

        {/* Values section */}
        {selectedCidade && (
          <div className="px-4 py-3 space-y-3">
            {/* M3 */}
            <Field label="Volume (M3)" icon={Package}>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={m3 || ''}
                  onChange={(e) => setM3(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="h-9 text-xs flex-1"
                />
                <button
                  type="button"
                  onClick={() => setShowDimensoes(!showDimensoes)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 h-9 rounded-lg border text-[10px] font-medium transition-colors duration-150 shrink-0',
                    showDimensoes
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                  )}
                >
                  <Ruler className="w-3 h-3" />
                  {showDimensoes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
              {showDimensoes && (
                <DimensoesCalculator onCalculate={(val) => { setM3(val); setShowDimensoes(false) }} />
              )}
            </Field>

            {/* Valor Mercadoria */}
            <Field label="Valor da mercadoria" icon={CircleDollarSign}>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">R$</span>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={valorMercadoria || ''}
                  onChange={(e) => setValorMercadoria(parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                  className="h-9 text-xs pl-8"
                />
              </div>
            </Field>

            {/* Entrega toggle */}
            {params?.entregaAtiva && (
              <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5">
                <div>
                  <span className="text-xs font-medium text-zinc-700">Entrega</span>
                  <span className="text-[10px] text-zinc-400 ml-1.5">
                    {formatCurrency(params.entregaFixa)}
                  </span>
                </div>
                <Switch checked={incluirEntrega} onCheckedChange={setIncluirEntrega} />
              </div>
            )}
          </div>
        )}

        {/* Divider before result */}
        {result && <div className="h-px bg-zinc-100 mx-4" />}

        {/* Result */}
        {result && (
          <div className="px-4 py-3 space-y-3">
            <FreteResultCard
              result={result}
              transportadoraNome={selectedTransportadora?.nome ?? ''}
            />
          </div>
        )}
      </div>

      {/* Sticky bottom actions */}
      {result && (
        <div className="border-t border-zinc-200 px-4 py-3 bg-white space-y-2">
          <div className="flex gap-2">
            {onInsertInChat && (
              <Button
                size="sm"
                onClick={handleSendToChat}
                className="flex-1 h-9 text-xs gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar no chat
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="h-9 text-xs gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar
            </Button>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors py-1"
          >
            <RotateCcw className="w-3 h-3" />
            Novo calculo
          </button>
        </div>
      )}
    </div>
  )
}
