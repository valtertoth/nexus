import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  calculateMarkup,
  reverseMargin,
  getMarginHealth,
  MARKUP_DEFAULTS,
  type MarkupInput,
  type HistoryEntry,
  type MarginHealth,
} from '@/lib/markup'

// ─── Types ──────────────────────────────────────────────────────────────────

export type CalculatorMode = 'calc' | 'reverse'

interface CalculatorRates {
  freight: number
  ipi: number
  nfe: number
  commission: number
  cardFee: number
  ads: number
}

interface CalcResult {
  sellingPrice: number
  markupMultiplier: number
  profitPerUnit: number
  health: MarginHealth
  error: false
}

interface CalcError {
  error: true
  maxMargin: number
}

interface ReverseResultState {
  realMargin: number
  markupMultiplier: number
  profitPerUnit: number
  health: MarginHealth
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nexus-markup-rates'
const HISTORY_KEY = 'nexus-markup-history'
const MARGIN_KEY = 'nexus-markup-margin'
const MAX_HISTORY = 5

function loadRates(): CalculatorRates {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored) as CalculatorRates
  } catch {
    // ignore
  }
  return {
    freight: MARKUP_DEFAULTS.freight * 100,
    ipi: MARKUP_DEFAULTS.ipi * 100,
    nfe: MARKUP_DEFAULTS.nfe * 100,
    commission: MARKUP_DEFAULTS.commission * 100,
    cardFee: MARKUP_DEFAULTS.cardFee * 100,
    ads: MARKUP_DEFAULTS.ads * 100,
  }
}

function saveRates(rates: CalculatorRates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates))
  } catch {
    // ignore
  }
}

function loadMargin(): number {
  try {
    const stored = localStorage.getItem(MARGIN_KEY)
    if (stored) return parseFloat(stored)
  } catch {
    // ignore
  }
  return MARKUP_DEFAULTS.desiredMargin * 100
}

function saveMargin(margin: number) {
  try {
    localStorage.setItem(MARGIN_KEY, String(margin))
  } catch {
    // ignore
  }
}

function loadHistory(): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    if (stored) return JSON.parse(stored) as HistoryEntry[]
  } catch {
    // ignore
  }
  return []
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
  } catch {
    // ignore
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useMarkupCalculator() {
  const [mode, setMode] = useState<CalculatorMode>('calc')
  const [purchasePrice, setPurchasePrice] = useState(0)
  const [actualSellingPrice, setActualSellingPrice] = useState(0)
  const [desiredMargin, setDesiredMargin] = useState(loadMargin)
  const [rates, setRates] = useState<CalculatorRates>(loadRates)
  const [expandedSections, setExpandedSections] = useState({ acquisition: false, sales: false })
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)

  // Persist rates on change
  useEffect(() => {
    saveRates(rates)
  }, [rates])

  // Persist margin on change
  useEffect(() => {
    saveMargin(desiredMargin)
  }, [desiredMargin])

  // Persist history on change
  useEffect(() => {
    saveHistory(history)
  }, [history])

  // ─── Computed values ────────────────────────────────────────────────

  const acquisitionRate = rates.freight + rates.ipi
  const salesRate = rates.nfe + rates.commission + rates.cardFee + rates.ads

  const calcResult = useMemo<CalcResult | CalcError | null>(() => {
    if (mode !== 'calc' || purchasePrice <= 0) return null

    const input: MarkupInput = {
      purchasePrice,
      freight: rates.freight / 100,
      ipi: rates.ipi / 100,
      nfe: rates.nfe / 100,
      commission: rates.commission / 100,
      cardFee: rates.cardFee / 100,
      ads: rates.ads / 100,
      desiredMargin: desiredMargin / 100,
    }

    const result = calculateMarkup(input)

    if ('error' in result) {
      return { error: true as const, maxMargin: result.maxMargin }
    }

    return {
      sellingPrice: result.sellingPrice,
      markupMultiplier: result.markupMultiplier,
      profitPerUnit: result.profitPerUnit,
      health: getMarginHealth(desiredMargin / 100),
      error: false as const,
    }
  }, [mode, purchasePrice, rates, desiredMargin])

  const reverseResult = useMemo<ReverseResultState | null>(() => {
    if (mode !== 'reverse' || purchasePrice <= 0 || actualSellingPrice <= 0) return null

    const result = reverseMargin(purchasePrice, actualSellingPrice, {
      freight: rates.freight / 100,
      ipi: rates.ipi / 100,
      nfe: rates.nfe / 100,
      commission: rates.commission / 100,
      cardFee: rates.cardFee / 100,
      ads: rates.ads / 100,
    })

    return {
      realMargin: result.realMargin,
      markupMultiplier: result.markupMultiplier,
      profitPerUnit: result.profitPerUnit,
      health: getMarginHealth(result.realMargin),
    }
  }, [mode, purchasePrice, actualSellingPrice, rates])

  // ─── Actions ────────────────────────────────────────────────────────

  const updateRate = useCallback((key: keyof CalculatorRates, value: number) => {
    setRates((prev) => ({ ...prev, [key]: value }))
  }, [])

  const toggleSection = useCallback((section: 'acquisition' | 'sales') => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }, [])

  const addToHistory = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => {
      // Avoid duplicate of same calculation
      if (
        prev.length > 0 &&
        prev[0].purchasePrice === entry.purchasePrice &&
        Math.abs(prev[0].sellingPrice - entry.sellingPrice) < 0.01
      ) {
        return prev
      }
      const next = [entry, ...prev].slice(0, MAX_HISTORY)
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const restoreFromHistory = useCallback((entry: HistoryEntry) => {
    setPurchasePrice(entry.purchasePrice)
    setMode('calc')
  }, [])

  const getSellingPrice = useCallback((): number | null => {
    if (calcResult && !calcResult.error) {
      return calcResult.sellingPrice
    }
    return null
  }, [calcResult])

  return {
    // State
    mode,
    purchasePrice,
    actualSellingPrice,
    desiredMargin,
    rates,
    expandedSections,
    history,

    // Computed
    acquisitionRate,
    salesRate,
    calcResult,
    reverseResult,

    // Actions
    setMode,
    setPurchasePrice,
    setActualSellingPrice,
    setDesiredMargin,
    updateRate,
    toggleSection,
    addToHistory,
    clearHistory,
    restoreFromHistory,
    getSellingPrice,
  }
}
