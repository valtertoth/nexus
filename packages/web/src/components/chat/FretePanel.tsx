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
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Truck,
  Ruler,
  Send,
  Copy,
  ChevronDown,
  ChevronUp,
  Search,
  Loader2,
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

// ── Data hooks (plain useState/useEffect — no react-query) ─────────────────

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

// ── Dimensions Calculator (inline) ─────────────────────────────────────────

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
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Ruler className="size-3.5 text-zinc-500" strokeWidth={1.5} />
        <span className="text-xs font-medium text-zinc-600">Calcular M3 por dimensoes</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="space-y-0.5">
          <Label className="text-[10px] text-zinc-400">Comp. (cm)</Label>
          <Input
            type="number"
            min={0}
            value={dims.comprimento || ''}
            onChange={(e) => handleChange('comprimento', e.target.value)}
            placeholder="0"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] text-zinc-400">Larg. (cm)</Label>
          <Input
            type="number"
            min={0}
            value={dims.largura || ''}
            onChange={(e) => handleChange('largura', e.target.value)}
            placeholder="0"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] text-zinc-400">Alt. (cm)</Label>
          <Input
            type="number"
            min={0}
            value={dims.altura || ''}
            onChange={(e) => handleChange('altura', e.target.value)}
            placeholder="0"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] text-zinc-400">Qtd.</Label>
          <Input
            type="number"
            min={1}
            value={dims.quantidade || ''}
            onChange={(e) => handleChange('quantidade', e.target.value)}
            placeholder="1"
            className="h-7 text-xs"
          />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          Volume: <span className="font-medium text-zinc-800">{m3.toFixed(4)} m3</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={m3 <= 0}
          onClick={() => onCalculate(m3)}
          className="h-6 text-[10px] px-2"
        >
          Usar este M3
        </Button>
      </div>
    </div>
  )
}

// ── Result Card (inline) ───────────────────────────────────────────────────

function FreteResultCard({ result }: { result: FreteResult }) {
  const lines = [
    { label: 'Frete Peso', value: result.fretePeso },
    { label: 'Despacho', value: result.despacho },
    { label: `GRIS (${formatPercent(result.detalhes.grisPct)})`, value: result.gris },
    { label: 'Pedagio', value: result.pedagio },
  ]
  if (result.advalorem > 0) lines.push({ label: 'Ad-Valorem', value: result.advalorem })
  if (result.txDifAcesso > 0) lines.push({ label: `TxDifAcesso (${formatPercent(result.detalhes.txDifPct)})`, value: result.txDifAcesso })
  if (result.entrega > 0) lines.push({ label: 'Entrega', value: result.entrega })

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <h3 className="text-xs font-medium text-zinc-900">Resultado do Frete</h3>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600">
            {result.detalhes.faixaLabel}
          </span>
          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
            {result.detalhes.praca}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-0">
        {lines.map((line) => (
          <div key={line.label} className="flex items-center justify-between py-1">
            <span className="text-[11px] text-zinc-500">{line.label}</span>
            <span className="text-xs text-zinc-700">{formatCurrency(line.value)}</span>
          </div>
        ))}

        <Separator className="my-1.5 bg-zinc-100" />

        <div className="flex items-center justify-between py-1">
          <span className="text-[11px] text-zinc-500">Subtotal</span>
          <span className="text-xs text-zinc-700">{formatCurrency(result.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-[11px] text-zinc-500">ICMS ({formatPercent(result.detalhes.icmsPct)})</span>
          <span className="text-xs text-zinc-700">{formatCurrency(result.icms)}</span>
        </div>

        <Separator className="my-1.5 bg-zinc-100" />

        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs font-medium text-zinc-900">Total</span>
          <span className="text-sm font-medium text-zinc-900">{formatCurrency(result.total)}</span>
        </div>

        {result.margem > 0 && (
          <>
            <div className="flex items-center justify-between py-1">
              <span className="text-[11px] text-zinc-500">Margem de Seguranca</span>
              <span className="text-xs text-zinc-700">{formatCurrency(result.margem)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-zinc-50 px-2 py-1.5">
              <span className="text-xs font-medium text-zinc-900">Total com Margem</span>
              <span className="text-sm font-medium text-zinc-900">{formatCurrency(result.totalComMargem)}</span>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-zinc-100 px-4 py-2">
        <div className="flex items-center gap-3 text-[10px] text-zinc-400">
          <span>Estado: {result.detalhes.estado}</span>
          <span>M3: {result.detalhes.m3.toFixed(4)}</span>
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

  // ── Reset dependent fields on transportadora change ──
  useEffect(() => {
    setOrigemCodigo('')
    setCidadeSearch('')
    setSelectedCidade(null)
  }, [transportadoraId])

  // ── Handlers ──
  const handleCidadeSelect = useCallback((cidade: CidadePraca) => {
    setSelectedCidade(cidade)
    setCidadeSearch(`${cidade.cidade}${cidade.estado ? ` - ${cidade.estado}` : ''}`)
    setShowCidadeDropdown(false)
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
    toast.success('Copiado')
  }, [result, formatResultText])

  return (
    <div className={cn('flex flex-col h-full', !embedded && 'bg-white')}>
      {/* Header (only when not embedded) */}
      {!embedded && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200">
          <Truck className="w-4 h-4 text-zinc-600" />
          <h2 className="text-sm font-medium text-zinc-900">Calculadora de Frete</h2>
        </div>
      )}

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Transportadora */}
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-600">Transportadora</Label>
          {loadingTransp ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Carregando...
            </div>
          ) : (
            <Select value={transportadoraId} onValueChange={(v) => { if (v) setTransportadoraId(v) }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione a transportadora" />
              </SelectTrigger>
              <SelectContent>
                {transportadoras.map((t: Transportadora) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Origem */}
        {transportadoraId && (
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Origem</Label>
            <Select value={origemCodigo} onValueChange={(v) => { if (v) setOrigemCodigo(v) }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                {origens.map((o: TransportadoraOrigem) => (
                  <SelectItem key={o.id} value={o.codigo} className="text-xs">
                    {o.nome} ({o.codigo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Cidade destino */}
        {origemCodigo && (
          <div className="space-y-1.5 relative">
            <Label className="text-xs text-zinc-600">Cidade Destino</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <Input
                value={cidadeSearch}
                onChange={(e) => {
                  setCidadeSearch(e.target.value)
                  setShowCidadeDropdown(true)
                  if (selectedCidade && e.target.value !== `${selectedCidade.cidade}${selectedCidade.estado ? ` - ${selectedCidade.estado}` : ''}`) {
                    setSelectedCidade(null)
                  }
                }}
                onFocus={() => cidadeSearch.length >= 2 && setShowCidadeDropdown(true)}
                onBlur={() => setTimeout(() => setShowCidadeDropdown(false), 200)}
                placeholder="Digite a cidade..."
                className="h-8 text-xs pl-7"
              />
              {searchingCidades && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-zinc-400" />
              )}
            </div>

            {/* Dropdown */}
            {showCidadeDropdown && cidades.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {cidades.map((c: CidadePraca) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleCidadeSelect(c)}
                    className="w-full px-3 py-2 text-left hover:bg-zinc-50 transition-colors duration-150"
                  >
                    <span className="text-xs text-zinc-900">{c.cidade}</span>
                    {c.estado && <span className="text-[10px] text-zinc-400 ml-1">- {c.estado}</span>}
                    <span className="text-[10px] text-zinc-400 float-right">{c.praca}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Selected badge */}
            {selectedCidade && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
                  Praca: {selectedCidade.praca}
                </span>
                {selectedCidade.unidade && (
                  <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500">
                    {selectedCidade.unidade}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* M3 + Dimensions */}
        {selectedCidade && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-600">Volume (M3)</Label>
              <button
                type="button"
                onClick={() => setShowDimensoes(!showDimensoes)}
                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-700 transition-colors duration-150"
              >
                <Ruler className="w-3 h-3" />
                Calcular por dimensoes
                {showDimensoes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={m3 || ''}
              onChange={(e) => setM3(parseFloat(e.target.value) || 0)}
              placeholder="0.0000"
              className="h-8 text-xs"
            />
            {showDimensoes && (
              <DimensoesCalculator onCalculate={(val) => { setM3(val); setShowDimensoes(false) }} />
            )}
          </div>
        )}

        {/* Valor Mercadoria */}
        {selectedCidade && (
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Valor da Mercadoria (R$)</Label>
            <Input
              type="number"
              min={0}
              step={100}
              value={valorMercadoria || ''}
              onChange={(e) => setValorMercadoria(parseFloat(e.target.value) || 0)}
              placeholder="0,00"
              className="h-8 text-xs"
            />
          </div>
        )}

        {/* Incluir entrega */}
        {selectedCidade && params?.entregaAtiva && (
          <div className="flex items-center justify-between">
            <Label className="text-xs text-zinc-600">Incluir entrega ({formatCurrency(params.entregaFixa)})</Label>
            <Switch checked={incluirEntrega} onCheckedChange={setIncluirEntrega} />
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-3">
            <FreteResultCard result={result} />

            {/* Actions */}
            <div className="flex gap-2">
              {onInsertInChat && (
                <Button
                  size="sm"
                  onClick={handleSendToChat}
                  className="flex-1 h-8 text-xs gap-1.5"
                >
                  <Send className="w-3 h-3" />
                  Enviar no chat
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="h-8 text-xs gap-1.5"
              >
                <Copy className="w-3 h-3" />
                Copiar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
