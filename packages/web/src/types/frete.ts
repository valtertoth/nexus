// === INTERFACES DO MOTOR DE CALCULO ===

export interface FaixaM3 {
  id: number
  maxM3: number
}

export interface ParametrosCalculo {
  despacho: number
  gris: number
  grisPorEstado?: Record<string, number>
  pedagioTipo: 'por_fracao_m3' | 'fixo'
  pedagioValor: number
  icms: number
  icmsTipo: 'por_dentro' | 'por_fora'
  icmsPorEstado?: Record<string, number>
  advalorem: number
  entregaFixa: number
  entregaAtiva: boolean
  txDifAcessoPorPraca?: Record<string, number>
  faixasM3: FaixaM3[]
}

export interface FreteInput {
  params: ParametrosCalculo
  fretePesoValores: number[] // 9 valores da tabela para a praca
  m3: number
  valorMercadoria: number
  praca: string
  incluirEntrega: boolean
  margemSeguranca: number
}

export interface FreteResult {
  fretePeso: number
  despacho: number
  gris: number
  pedagio: number
  advalorem: number
  txDifAcesso: number
  entrega: number
  subtotal: number
  icms: number
  total: number
  margem: number
  totalComMargem: number
  detalhes: {
    praca: string
    estado: string
    faixaIdx: number
    faixaLabel: string
    m3: number
    grisPct: number
    icmsPct: number
    txDifPct: number
  }
}

// === INTERFACES DO BANCO DE DADOS ===

export interface Transportadora {
  id: string
  nome: string
  cnpj: string | null
  ativo: boolean
  fator_cubagem: number
  parametros_calculo: ParametrosCalculo | null
  margem_seguranca: number
  created_at: string
  updated_at: string
}

export interface TransportadoraOrigem {
  id: string
  transportadora_id: string
  codigo: string
  nome: string
  tipo: 'exportacao' | 'dropshipping'
  ativo: boolean
  parametros_override: Partial<ParametrosCalculo> | null
}

export interface CidadePraca {
  id: string
  transportadora_id: string
  cidade: string
  estado: string | null
  praca: string
  unidade: string | null
}

export interface TabelaFreteRow {
  id: string
  transportadora_id: string
  origem_codigo: string
  praca_destino: string
  faixa_idx: number
  valor: number
  is_valor_por_m3: boolean
}

// === INTERFACE DA CALCULADORA ===

export interface DimensoesInput {
  comprimento: number // cm
  largura: number // cm
  altura: number // cm
  quantidade: number
}

export function calcularM3(d: DimensoesInput): number {
  return (d.comprimento * d.largura * d.altura * d.quantidade) / 1_000_000
}
