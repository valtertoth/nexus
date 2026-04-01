/**
 * Markup Calculator — Pure calculation logic
 *
 * Two-stage pricing model:
 *   Stage 1 (POR FORA): Freight & IPI are additive on purchase price
 *   Stage 2 (POR DENTRO): Sales taxes & margin are divisors on selling price
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MarkupInput {
  purchasePrice: number
  freight: number      // decimal (0.15 = 15%)
  ipi: number          // decimal
  nfe: number          // decimal
  commission: number   // decimal
  cardFee: number      // decimal
  ads: number          // decimal
  desiredMargin: number // decimal
}

export interface MarkupResult {
  acquisitionCost: number
  sellingPrice: number
  markupMultiplier: number
  profitPerUnit: number
  totalExpenseRate: number
}

export interface ReverseResult {
  realMargin: number
  profitPerUnit: number
  markupMultiplier: number
}

export interface MarginHealth {
  label: string
  level: 'loss' | 'low' | 'healthy' | 'high'
}

export interface HistoryEntry {
  purchasePrice: number
  sellingPrice: number
  markupMultiplier: number
  timestamp: number
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const MARKUP_DEFAULTS: Omit<MarkupInput, 'purchasePrice'> = {
  freight: 0.15,
  ipi: 0.05,
  nfe: 0.05,
  commission: 0.01,
  cardFee: 0.15,
  ads: 0.08,
  desiredMargin: 0.10,
}

// ─── Calculations ───────────────────────────────────────────────────────────

/**
 * Calculate selling price from purchase price + costs + desired margin.
 *
 * Stage 1 (POR FORA — additive):
 *   acquisitionCost = purchasePrice × (1 + freight + ipi)
 *
 * Stage 2 (POR DENTRO — divisor):
 *   sellingPrice = acquisitionCost ÷ (1 − (nfe + commission + cardFee + ads + margin))
 */
export function calculateMarkup(input: MarkupInput): MarkupResult | { error: true; maxMargin: number } {
  const acquisitionCost = input.purchasePrice * (1 + input.freight + input.ipi)

  const totalExpenseRate =
    input.nfe + input.commission + input.cardFee + input.ads + input.desiredMargin

  if (totalExpenseRate >= 1) {
    const maxMargin = 1 - (input.nfe + input.commission + input.cardFee + input.ads)
    return { error: true, maxMargin }
  }

  const sellingPrice = acquisitionCost / (1 - totalExpenseRate)
  const markupMultiplier = sellingPrice / input.purchasePrice
  const profitPerUnit = sellingPrice * input.desiredMargin

  return { acquisitionCost, sellingPrice, markupMultiplier, profitPerUnit, totalExpenseRate }
}

/**
 * Reverse engineering: given a practiced selling price, find the real margin.
 *
 * realMargin = 1 − salesExpenses − (acquisitionCost ÷ sellingPrice)
 */
export function reverseMargin(
  purchasePrice: number,
  actualSellingPrice: number,
  costs: { freight: number; ipi: number; nfe: number; commission: number; cardFee: number; ads: number }
): ReverseResult {
  const acquisitionCost = purchasePrice * (1 + costs.freight + costs.ipi)
  const expensesWithoutMargin = costs.nfe + costs.commission + costs.cardFee + costs.ads
  const realMargin = 1 - expensesWithoutMargin - (acquisitionCost / actualSellingPrice)
  const profitPerUnit = actualSellingPrice * realMargin
  const markupMultiplier = actualSellingPrice / purchasePrice

  return { realMargin, profitPerUnit, markupMultiplier }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getMarginHealth(margin: number): MarginHealth {
  if (margin < 0) return { label: 'Prejuízo', level: 'loss' }
  if (margin < 0.10) return { label: 'Margem baixa', level: 'low' }
  if (margin <= 0.25) return { label: 'Saudável', level: 'healthy' }
  return { label: 'Margem alta', level: 'high' }
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatPercent(decimal: number): string {
  return (decimal * 100).toFixed(1).replace('.', ',') + '%'
}
