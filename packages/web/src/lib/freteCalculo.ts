/**
 * Motor de Calculo de Frete — Funcao Pura
 *
 * Formula real decifrada da auditoria de 60 CTEs da Vipex.
 * Zero dependencias externas. Testavel em isolamento.
 */

import type { FreteInput, FreteResult, FaixaM3 } from '@/types/frete'

const FAIXA_LABELS = [
  '0 a 0,30 M3',
  '0,31 a 0,50 M3',
  '0,51 a 0,70 M3',
  '0,71 a 1,00 M3',
  '1,01 a 1,50 M3',
  '1,51 a 2,00 M3',
  '2,01 a 2,50 M3',
  '2,51 a 3,00 M3',
  'Acima de 3 M3',
]

export function findFaixaIdx(faixasM3: FaixaM3[], m3: number): number {
  for (let i = 0; i < faixasM3.length; i++) {
    if (m3 <= faixasM3[i].maxM3) return i
  }
  return faixasM3.length - 1
}

export function getEstadoFromPraca(praca: string): string {
  return praca.split('-')[0]
}

export function calcPedagio(
  tipo: 'por_fracao_m3' | 'fixo',
  valor: number,
  m3: number
): number {
  if (tipo === 'por_fracao_m3') return valor * Math.ceil(m3)
  return valor
}

function roundCentavo(value: number): number {
  return Math.round(value * 100) / 100
}

export function calcularFrete(input: FreteInput): FreteResult {
  const { params, fretePesoValores, m3, valorMercadoria, praca, incluirEntrega, margemSeguranca } = input

  const faixaIdx = findFaixaIdx(params.faixasM3, m3)

  const isGatilho = faixaIdx === params.faixasM3.length - 1 && m3 > 3
  const fretePeso = isGatilho
    ? fretePesoValores[faixaIdx] * m3
    : fretePesoValores[faixaIdx]

  const despacho = params.despacho

  const estado = getEstadoFromPraca(praca)
  const grisPct = params.grisPorEstado?.[estado] ?? params.gris
  const gris = roundCentavo(grisPct * valorMercadoria)

  const pedagio = calcPedagio(params.pedagioTipo, params.pedagioValor, m3)

  const advalorem = roundCentavo(params.advalorem * valorMercadoria)

  const txDifPct = params.txDifAcessoPorPraca?.[praca] ?? 0
  const txDifAcesso = roundCentavo(fretePeso * txDifPct)

  const entrega = incluirEntrega && params.entregaAtiva ? params.entregaFixa : 0

  const subtotal = roundCentavo(
    fretePeso + despacho + gris + pedagio + advalorem + txDifAcesso + entrega
  )

  const icmsPct = params.icmsPorEstado?.[estado] ?? params.icms
  let total: number
  if (params.icmsTipo === 'por_dentro') {
    total = roundCentavo(subtotal / (1 - icmsPct))
  } else {
    total = roundCentavo(subtotal * (1 + icmsPct))
  }
  const icmsValor = roundCentavo(total - subtotal)

  const margem = roundCentavo(total * margemSeguranca)
  const totalComMargem = roundCentavo(total + margem)

  return {
    fretePeso: roundCentavo(fretePeso),
    despacho,
    gris,
    pedagio,
    advalorem,
    txDifAcesso,
    entrega,
    subtotal,
    icms: icmsValor,
    total,
    margem,
    totalComMargem,
    detalhes: {
      praca,
      estado,
      faixaIdx,
      faixaLabel: FAIXA_LABELS[faixaIdx] ?? `Faixa ${faixaIdx}`,
      m3,
      grisPct,
      icmsPct,
      txDifPct,
    },
  }
}
