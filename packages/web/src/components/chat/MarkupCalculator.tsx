import { useCallback, useRef, useState } from 'react'
import { X, ChevronRight, Copy, MessageSquare, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/markup'
import { useMarkupCalculator } from '@/hooks/useMarkupCalculator'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────────────

interface MarkupCalculatorProps {
  open: boolean
  onClose: () => void
  onInsertInChat?: (text: string) => void
}

// ─── Health styles ──────────────────────────────────────────────────────────

const HEALTH_STYLES = {
  loss: {
    dot: 'bg-red-500',
    text: 'text-red-600',
    border: 'border-red-200',
    bg: 'bg-gradient-to-br from-red-50 to-white',
  },
  low: {
    dot: 'bg-amber-400',
    text: 'text-amber-600',
    border: 'border-amber-200',
    bg: 'bg-gradient-to-br from-amber-50 to-white',
  },
  healthy: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-600',
    border: 'border-emerald-200',
    bg: 'bg-gradient-to-br from-emerald-50 to-white',
  },
  high: {
    dot: 'bg-emerald-600',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    bg: 'bg-gradient-to-br from-emerald-50 to-white',
  },
} as const

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  return `há ${Math.floor(diff / 86400)}d`
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function RateInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs text-zinc-500 whitespace-nowrap">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          step={0.1}
          min={0}
          max={99}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-16 h-7 text-xs text-right font-medium text-zinc-900 border border-zinc-200 rounded-md px-2 outline-none focus:border-zinc-400 transition-colors bg-white"
        />
        <span className="text-xs text-zinc-400">%</span>
      </div>
    </div>
  )
}

function CollapsibleSection({
  title,
  tag,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string
  tag: string
  summary: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-zinc-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 text-zinc-400 transition-transform duration-200',
              expanded && 'rotate-90'
            )}
          />
          <span className="text-xs font-medium text-zinc-700">{title}</span>
          <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-medium">
            {tag}
          </span>
        </div>
        <span className="text-xs font-semibold text-zinc-900">{summary}</span>
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-250',
          expanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-zinc-100">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function MarkupCalculator({ open, onClose, onInsertInChat }: MarkupCalculatorProps) {
  const calc = useMarkupCalculator()
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(() => {
    const price = calc.getSellingPrice()
    if (!price) return

    const text = `R$ ${formatBRL(price)}`
    navigator.clipboard.writeText(text).catch(() => {
      toast.info(`Preço: ${text}`)
    })

    // Visual feedback via state
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500)

    // Add to history
    calc.addToHistory({
      purchasePrice: calc.purchasePrice,
      sellingPrice: price,
      markupMultiplier: price / calc.purchasePrice,
      timestamp: Date.now(),
    })
  }, [calc])

  const handleInsert = useCallback(() => {
    const price = calc.getSellingPrice()
    if (!price || !onInsertInChat) return

    const text = `R$ ${formatBRL(price)}`
    onInsertInChat(text)
    toast.success('Preço inserido no chat')

    // Add to history
    calc.addToHistory({
      purchasePrice: calc.purchasePrice,
      sellingPrice: price,
      markupMultiplier: price / calc.purchasePrice,
      timestamp: Date.now(),
    })
  }, [calc, onInsertInChat])

  if (!open) return null

  const acqSummary = `+${calc.acquisitionRate.toFixed(1).replace('.', ',')}%`
  const salesSummary = `${calc.salesRate.toFixed(1).replace('.', ',')}%`

  return (
    <div className="w-[380px] shrink-0 border-l border-zinc-200 bg-white flex flex-col h-full animate-in slide-in-from-right-4 duration-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-zinc-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-100">
            <svg
              className="w-4 h-4 text-zinc-700"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="8" y1="10" x2="8" y2="10.01" />
              <line x1="12" y1="10" x2="12" y2="10.01" />
              <line x1="16" y1="10" x2="16" y2="10.01" />
              <line x1="8" y1="14" x2="8" y2="14.01" />
              <line x1="12" y1="14" x2="12" y2="14.01" />
              <line x1="16" y1="14" x2="16" y2="14.01" />
              <line x1="8" y1="18" x2="16" y2="18" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-zinc-900">Calculadora</span>
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-md h-7 w-7 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
          aria-label="Fechar calculadora"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Mode Tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-zinc-100">
            <button
              onClick={() => calc.setMode('calc')}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-md transition-all',
                calc.mode === 'calc'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              )}
            >
              Calcular Preço
            </button>
            <button
              onClick={() => calc.setMode('reverse')}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-md transition-all',
                calc.mode === 'reverse'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              )}
            >
              Eng. Reversa
            </button>
          </div>

          {/* Purchase Price — Prominent */}
          <div>
            <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
              Preço de compra
            </label>
            <div className="flex items-center border border-zinc-300 rounded-lg focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-200 transition-all bg-white">
              <span className="pl-3 pr-1 text-sm font-medium text-zinc-400">R$</span>
              <input
                type="number"
                value={calc.purchasePrice || ''}
                step={0.01}
                min={0}
                onChange={(e) => calc.setPurchasePrice(parseFloat(e.target.value) || 0)}
                placeholder="0,00"
                className="flex-1 h-10 bg-transparent text-base font-semibold text-zinc-900 outline-none pr-3 placeholder:text-zinc-300"
              />
            </div>
          </div>

          {/* Actual Selling Price (reverse mode only) */}
          {calc.mode === 'reverse' && (
            <div>
              <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
                Preço de venda praticado
              </label>
              <div className="flex items-center border border-zinc-300 rounded-lg focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-200 transition-all bg-white">
                <span className="pl-3 pr-1 text-sm font-medium text-zinc-400">R$</span>
                <input
                  type="number"
                  value={calc.actualSellingPrice || ''}
                  step={0.01}
                  min={0}
                  onChange={(e) => calc.setActualSellingPrice(parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                  className="flex-1 h-10 bg-transparent text-base font-semibold text-zinc-900 outline-none pr-3 placeholder:text-zinc-300"
                />
              </div>
            </div>
          )}

          {/* Acquisition Costs — Collapsible */}
          <CollapsibleSection
            title="Custos de aquisição"
            tag="POR FORA"
            summary={acqSummary}
            expanded={calc.expandedSections.acquisition}
            onToggle={() => calc.toggleSection('acquisition')}
          >
            <RateInput
              label="Frete"
              value={calc.rates.freight}
              onChange={(v) => calc.updateRate('freight', v)}
            />
            <RateInput
              label="IPI"
              value={calc.rates.ipi}
              onChange={(v) => calc.updateRate('ipi', v)}
            />
          </CollapsibleSection>

          {/* Sales Expenses — Collapsible */}
          <CollapsibleSection
            title="Despesas de venda"
            tag="POR DENTRO"
            summary={salesSummary}
            expanded={calc.expandedSections.sales}
            onToggle={() => calc.toggleSection('sales')}
          >
            <RateInput
              label="NFe / Simples"
              value={calc.rates.nfe}
              onChange={(v) => calc.updateRate('nfe', v)}
            />
            <RateInput
              label="Comissão"
              value={calc.rates.commission}
              onChange={(v) => calc.updateRate('commission', v)}
            />
            <RateInput
              label="Cartão 10x"
              value={calc.rates.cardFee}
              onChange={(v) => calc.updateRate('cardFee', v)}
            />
            <RateInput
              label="ADS"
              value={calc.rates.ads}
              onChange={(v) => calc.updateRate('ads', v)}
            />
          </CollapsibleSection>

          {/* Desired Margin (calc mode only) */}
          {calc.mode === 'calc' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-500">Margem desejada</label>
                <span className="text-xs font-semibold text-zinc-900">
                  {calc.desiredMargin.toFixed(1).replace('.', ',')}%
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                step={0.5}
                value={calc.desiredMargin}
                onChange={(e) => calc.setDesiredMargin(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer accent-zinc-900"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-zinc-400">1%</span>
                <span className="text-[10px] text-zinc-400">50%</span>
              </div>
            </div>
          )}

          {/* ═══ RESULT CARD (Calc Mode) ═══ */}
          {calc.mode === 'calc' && calc.calcResult && !calc.calcResult.error && (
            <div
              className={cn(
                'rounded-xl border-2 p-4 transition-all',
                HEALTH_STYLES[calc.calcResult.health.level].border,
                HEALTH_STYLES[calc.calcResult.health.level].bg
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-wider font-semibold',
                    HEALTH_STYLES[calc.calcResult.health.level].text
                  )}
                >
                  Preço de venda
                </span>
                <span className="text-xs font-mono font-semibold text-zinc-500">
                  x{calc.calcResult.markupMultiplier.toFixed(4).replace('.', ',')}
                </span>
              </div>
              <div className="text-3xl font-bold text-zinc-900 mb-1">
                R$ {formatBRL(calc.calcResult.sellingPrice)}
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500">Lucro:</span>
                  <span className="text-xs font-semibold text-zinc-700">
                    R$ {formatBRL(calc.calcResult.profitPerUnit)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full animate-pulse',
                      HEALTH_STYLES[calc.calcResult.health.level].dot
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs font-medium',
                      HEALTH_STYLES[calc.calcResult.health.level].text
                    )}
                  >
                    {calc.calcResult.health.label}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? 'Copiado!' : 'Copiar preço'}</span>
                </button>
                {onInsertInChat && (
                  <button
                    onClick={handleInsert}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-zinc-900 text-xs font-medium text-white hover:bg-zinc-800 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Inserir no chat
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ═══ RESULT CARD (Reverse Mode) ═══ */}
          {calc.mode === 'reverse' && calc.reverseResult && (
            <div
              className={cn(
                'rounded-xl border-2 p-4 transition-all',
                HEALTH_STYLES[calc.reverseResult.health.level].border,
                HEALTH_STYLES[calc.reverseResult.health.level].bg
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-wider font-semibold',
                    HEALTH_STYLES[calc.reverseResult.health.level].text
                  )}
                >
                  Margem real
                </span>
                <span className="text-xs font-mono font-semibold text-zinc-500">
                  x{calc.reverseResult.markupMultiplier.toFixed(4).replace('.', ',')}
                </span>
              </div>
              <div className="text-3xl font-bold text-zinc-900 mb-1">
                {(calc.reverseResult.realMargin * 100).toFixed(1).replace('.', ',')}%
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500">Lucro:</span>
                  <span className="text-xs font-semibold text-zinc-700">
                    R$ {formatBRL(calc.reverseResult.profitPerUnit)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full animate-pulse',
                      HEALTH_STYLES[calc.reverseResult.health.level].dot
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs font-medium',
                      HEALTH_STYLES[calc.reverseResult.health.level].text
                    )}
                  >
                    {calc.reverseResult.health.label}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ═══ ERROR CARD ═══ */}
          {calc.mode === 'calc' && calc.calcResult && calc.calcResult.error && (
            <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-semibold text-red-700">Preço impossível</span>
              </div>
              <p className="text-xs text-red-600">
                A soma das despesas + margem ultrapassa 100%. Reduza as taxas ou a margem desejada.
              </p>
              <p className="text-xs text-red-500 mt-1">
                Margem máxima possível:{' '}
                {(calc.calcResult.maxMargin * 100).toFixed(1).replace('.', ',')}%
              </p>
            </div>
          )}

          {/* ═══ HISTORY ═══ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-500">Últimos cálculos</span>
              {calc.history.length > 0 && (
                <button
                  onClick={calc.clearHistory}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>
            {calc.history.length === 0 ? (
              <div className="py-4 text-center">
                <span className="text-xs text-zinc-400">Nenhum cálculo ainda</span>
              </div>
            ) : (
              <div className="space-y-1">
                {calc.history.map((entry, i) => (
                  <button
                    key={`${entry.timestamp}-${i}`}
                    onClick={() => calc.restoreFromHistory(entry)}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">
                        R${formatBRL(entry.purchasePrice)}
                      </span>
                      <svg
                        className="w-3 h-3 text-zinc-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14 5l7 7m0 0l-7 7m7-7H3"
                        />
                      </svg>
                      <span className="text-xs font-semibold text-zinc-900">
                        R${formatBRL(entry.sellingPrice)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-400">
                        x{entry.markupMultiplier.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {getTimeAgo(entry.timestamp)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
