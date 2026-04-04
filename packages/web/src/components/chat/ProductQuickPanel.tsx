import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Package,
  Search,
  ChevronLeft,
  X,
  Send,
  Image as ImageIcon,
  FileText,
  Video,
  Ruler,
  Palette,
  Truck,
  Tag,
  Info,
  Copy,
  Check,
  ChevronRight,
  BookOpen,
  Shield,
  Wrench,
  Layers,
  Sparkles,
  Box,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAuthHeaders } from '@/lib/supabase'
import { toast } from 'sonner'
import type { ShopifyProduct, ShopifyProductVariant } from '@nexus/shared'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface ProductQuickPanelProps {
  open: boolean
  onClose: () => void
  onSendToChat: (text: string) => void
  onSendMediaUrl?: (url: string, contentType: 'image' | 'document' | 'video', caption?: string, filename?: string) => void
  /** When true, renders without own header/border/animation (parent handles chrome) */
  embedded?: boolean
}

type Tab = 'info' | 'media' | 'specs' | 'catalogos'

// ─── Helpers ────────────────────────────────────────────────────────

/** Sanitize text into a clean filename (no accents, no special chars) */
function toFilename(prefix: string, productTitle: string, ext: string): string {
  const sanitize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 50)
  return `${sanitize(prefix)}_${sanitize(productTitle)}.${ext}`
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/** Extract known metafield values with fallbacks */
function getMetafield(product: ShopifyProduct, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = product.metafields?.[key]
    if (val != null && val !== '') return String(val)
  }
  return null
}

/** Parse dimension-like metafields — Shopify uses `custom.dimens_es` (accent replaced by underscore) */
function parseDimensions(product: ShopifyProduct) {
  return {
    width: getMetafield(product, 'custom.largura', 'custom.width'),
    depth: getMetafield(product, 'custom.profundidade', 'custom.depth'),
    height: getMetafield(product, 'custom.altura', 'custom.height'),
    weight: getMetafield(product, 'custom.peso', 'custom.weight'),
    seatHeight: getMetafield(product, 'custom.altura_assento', 'custom.seat_height'),
  }
}

function parseMaterials(product: ShopifyProduct): string[] {
  const raw = getMetafield(product, 'custom.materiais', 'custom.materials')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch { /* not JSON — treat as multiline text */ }
  // Split by newlines for multiline text like "ESTRUTURA:\nMadeira e Aço..."
  return [raw]
}

function parseDelivery(product: ShopifyProduct): string | null {
  const prazo = getMetafield(product, 'custom.prazo', 'custom.prazo_entrega')
  if (!prazo) return null
  // If numeric (days), format it
  const num = parseInt(prazo)
  if (!isNaN(num)) return `${num} dias uteis`
  return prazo
}

/** Parse galeria_inspiracao images from metafields.
 * After sync, file_reference GIDs are resolved to actual URLs. */
function parseGaleriaInspiracao(product: ShopifyProduct): string[] {
  const raw = getMetafield(product, 'custom.galeria_inspiracao')
  if (!raw) return []
  // Try JSON array of URLs first
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((u: unknown) => typeof u === 'string' && String(u).startsWith('http'))
  } catch { /* not JSON */ }
  // Single URL
  if (raw.startsWith('http')) return [raw]
  return []
}

/** Get acabamento/acabamentos_disponiveis — may be text or metaobject refs (GIDs).
 * Also check custom.acabamento which is a URL to PDF catalog. */
function getAcabamento(product: ShopifyProduct): string | null {
  // Try the text field for acabamentos disponiveis
  const text = getMetafield(product, 'custom.acabamentos_disponiveis')
  if (text) {
    // If it's metaobject GIDs, skip it (not useful as text)
    if (text.includes('gid://shopify/Metaobject')) return null
    return text
  }
  return null
}

/** Get material text — stored in `custom.materiais` (multiline) */
function getMaterial(product: ShopifyProduct): string | null {
  return getMetafield(product, 'custom.materiais', 'custom.materials', 'custom.material')
}

/** Get dimensoes text — stored in `custom.dimens_es` (accent → underscore in Shopify) */
function getDimensoes(product: ShopifyProduct): string | null {
  const raw = getMetafield(product, 'custom.dimens_es', 'custom.dimensoes', 'custom.dimensions')
  if (raw) return raw
  // Fallback to individual dimension fields
  const dims = parseDimensions(product)
  const parts: string[] = []
  if (dims.width) parts.push(`Largura: ${dims.width}`)
  if (dims.depth) parts.push(`Profundidade: ${dims.depth}`)
  if (dims.height) parts.push(`Altura: ${dims.height}`)
  if (dims.weight) parts.push(`Peso: ${dims.weight}`)
  if (dims.seatHeight) parts.push(`Altura do assento: ${dims.seatHeight}`)
  return parts.length > 0 ? parts.join('\n') : null
}

/** Get montagem text */
function getMontagem(product: ShopifyProduct): string | null {
  return getMetafield(product, 'custom.montagem')
}

/** Get garantia text */
function getGarantia(product: ShopifyProduct): string | null {
  return getMetafield(product, 'custom.garantia')
}

// ─── Subcomponents ──────────────────────────────────────────────────

function ProductListItem({
  product,
  onClick,
}: {
  product: ShopifyProduct
  onClick: () => void
}) {
  const hasStock = product.is_active
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-zinc-100 hover:border-zinc-300 transition-colors text-left group"
    >
      <div className="w-12 h-12 rounded-lg bg-zinc-100 overflow-hidden shrink-0">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-5 h-5 text-zinc-300" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-zinc-900 block truncate">
          {product.title}
        </span>
        {product.product_type && (
          <span className="text-xs text-zinc-500 block truncate mt-0.5">
            {product.product_type}
          </span>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded font-medium',
              hasStock
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'
            )}
          >
            {hasStock ? 'Disponivel' : 'Indisponivel'}
          </span>
          {product.variants?.[0]?.sku && (
            <span className="text-xs text-zinc-400">
              SKU: {product.variants[0].sku}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 shrink-0 transition-colors" />
    </button>
  )
}

function SendButton({
  onClick,
  label = 'Enviar',
  size = 'sm',
}: {
  onClick: () => void
  label?: string
  size?: 'sm' | 'xs'
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'shrink-0 gap-1 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100',
        size === 'xs' && 'h-7 px-2 text-xs'
      )}
    >
      <Send className="w-3 h-3" />
      {label}
    </Button>
  )
}

function SectionCard({
  icon: Icon,
  title,
  badge,
  onSend,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  badge?: { text: string; className: string }
  onSend?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-zinc-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
            {title}
          </span>
          {badge && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', badge.className)}>
              {badge.text}
            </span>
          )}
        </div>
        {onSend && <SendButton onClick={onSend} size="xs" />}
      </div>
      {children}
    </div>
  )
}

function ImageGallery({
  images,
  title,
  onSendImage,
}: {
  images: string[]
  title: string
  onSendImage: (url: string, index: number) => void
  onSendAll?: () => void
}) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const mainImg = images[selectedIdx] || images[0]

  if (images.length === 0) return null

  return (
    <div className="px-4 pt-3 pb-2">
      {/* Main image */}
      <div className="relative rounded-xl overflow-hidden bg-zinc-100 aspect-square mb-3">
        <img
          src={mainImg}
          alt={`${title} - foto ${selectedIdx + 1}`}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-3 right-3">
          <Button
            size="sm"
            onClick={() => onSendImage(mainImg, selectedIdx)}
            className="bg-zinc-900/90 backdrop-blur text-white text-xs font-medium gap-1.5 hover:bg-zinc-900 h-8"
          >
            <Send className="w-3.5 h-3.5" />
            Enviar foto
          </Button>
        </div>
        {images.length > 1 && (
          <div className="absolute bottom-3 left-3">
            <span className="bg-zinc-900/80 backdrop-blur text-white text-[11px] px-2 py-1 rounded-md">
              {selectedIdx + 1} / {images.length}
            </span>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedIdx(idx)}
              className={cn(
                'w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition-colors',
                idx === selectedIdx ? 'border-zinc-900' : 'border-transparent hover:border-zinc-300'
              )}
            >
              <img
                src={url}
                alt={`${title} ${idx + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function VariantChips({ variants }: { variants: ShopifyProductVariant[] }) {
  const [selected, setSelected] = useState(0)

  if (variants.length <= 1 && variants[0]?.title === 'Default Title') return null

  return (
    <SectionCard icon={Palette} title="Variantes">
      <div className="flex flex-wrap gap-2">
        {variants.map((v, i) => (
          <button
            key={v.id}
            onClick={() => setSelected(i)}
            className={cn(
              'border rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              i === selected
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
            )}
          >
            {v.title}
            {v.sku && <span className="text-zinc-400 ml-1.5">({v.sku})</span>}
          </button>
        ))}
      </div>
    </SectionCard>
  )
}

// ─── Main Component ─────────────────────────────────────────────────

export function ProductQuickPanel({
  open,
  onClose,
  onSendToChat,
  onSendMediaUrl,
  embedded,
}: ProductQuickPanelProps) {
  const [products, setProducts] = useState<ShopifyProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('info')
  const [copied, setCopied] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hasFetchedRef = useRef(false)

  // Fetch products on mount
  const fetchProducts = useCallback(async (query?: string) => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const url = query
        ? `${API_BASE}/api/quotes/shopify/products?q=${encodeURIComponent(query)}`
        : `${API_BASE}/api/quotes/shopify/products`
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error('Erro ao buscar produtos')
      const data = await res.json()
      setProducts(data.products || [])
    } catch (err) {
      console.error('[ProductPanel] Fetch failed:', err)
      if (hasFetchedRef.current) {
        toast.error('Erro ao buscar produtos')
      }
    } finally {
      setLoading(false)
      hasFetchedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (open && products.length === 0 && !hasFetchedRef.current) {
      fetchProducts()
    }
  }, [open, fetchProducts, products.length])

  // Reset when panel closes
  useEffect(() => {
    if (!open) {
      setSelectedProduct(null)
      setActiveTab('info')
      setSearchQuery('')
    }
  }, [open])

  // Debounced search
  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => {
        fetchProducts(value || undefined)
      }, 300)
    },
    [fetchProducts]
  )

  if (!open) return null

  // ─── Build formatted texts ──────────────────────────────────────

  function buildDimensionsText(product: ShopifyProduct): string {
    const dims = parseDimensions(product)
    const parts: string[] = []
    if (dims.width) parts.push(`Largura: ${dims.width}`)
    if (dims.depth) parts.push(`Profundidade: ${dims.depth}`)
    if (dims.height) parts.push(`Altura: ${dims.height}`)
    if (dims.weight) parts.push(`Peso: ${dims.weight}`)
    if (dims.seatHeight) parts.push(`Altura do assento: ${dims.seatHeight}`)
    if (parts.length === 0) return ''
    return `*${product.title} — Dimensoes:*\n\n${parts.join('\n')}`
  }

  function buildMaterialsText(product: ShopifyProduct): string {
    const materials = parseMaterials(product)
    if (materials.length === 0) return ''
    return `*${product.title} — Materiais:*\n\n${materials.map((m) => `• ${m}`).join('\n')}`
  }

  function buildDeliveryText(product: ShopifyProduct): string {
    const delivery = parseDelivery(product)
    if (!delivery) return ''
    return `*Prazo de entrega:* ${delivery}`
  }

  function buildFullDescription(product: ShopifyProduct): string {
    const lines: string[] = [`*${product.title}*`]

    if (product.description) {
      lines.push('')
      lines.push(product.description.slice(0, 300))
    }

    const dims = parseDimensions(product)
    const dimParts: string[] = []
    if (dims.width) dimParts.push(dims.width)
    if (dims.depth) dimParts.push(dims.depth)
    if (dims.height) dimParts.push(dims.height)
    if (dimParts.length > 0) {
      lines.push('')
      lines.push(`Dimensoes: ${dimParts.join(' x ')}`)
    }
    if (dims.weight) lines.push(`Peso: ${dims.weight}`)

    const materials = parseMaterials(product)
    if (materials.length > 0) {
      lines.push('')
      lines.push('Materiais:')
      materials.forEach((m) => lines.push(`• ${m}`))
    }

    const variants = product.variants?.filter(
      (v) => v.title !== 'Default Title'
    )
    if (variants && variants.length > 0) {
      lines.push('')
      lines.push(`Opcoes: ${variants.map((v) => v.title).join(', ')}`)
    }

    const delivery = parseDelivery(product)
    if (delivery) {
      lines.push('')
      lines.push(`Entrega: ${delivery}`)
    }

    if (product.vendor) {
      lines.push(`Fabricante: ${product.vendor}`)
    }

    return lines.join('\n')
  }

  function buildSpecsText(product: ShopifyProduct): string {
    const lines: string[] = [`*${product.title} — Ficha Tecnica:*`, '']

    if (product.product_type) lines.push(`Tipo: ${product.product_type}`)
    if (product.vendor) lines.push(`Fabricante: ${product.vendor}`)

    const material = getMaterial(product)
    if (material) lines.push(`\n*Material:*\n${material}`)

    const dimensoes = getDimensoes(product)
    if (dimensoes) lines.push(`\n*Dimensoes:*\n${dimensoes}`)

    const montagem = getMontagem(product)
    if (montagem) lines.push(`\n*Montagem:* ${montagem}`)

    const garantia = getGarantia(product)
    if (garantia) lines.push(`\n*Garantia:* ${garantia}`)

    const delivery = parseDelivery(product)
    if (delivery) lines.push(`\n*Prazo:* ${delivery}`)

    const cor = getMetafield(product, 'custom.cor')
    if (cor) lines.push(`\n*Cor:* ${cor}`)

    return lines.join('\n')
  }

  function handleCopyText(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copiado!')
  }

  function handleSend(text: string, label?: string) {
    if (!text) {
      toast.error('Sem dados para enviar')
      return
    }
    onSendToChat(text)
    toast.success(label || 'Texto inserido no composer')
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className={cn(
      'flex flex-col h-full bg-white',
      !embedded && 'w-[380px] shrink-0 border-l border-zinc-200 animate-in slide-in-from-right-4 duration-200'
    )}>
      {/* Header — only in standalone mode */}
      {!embedded && (
        <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-zinc-700" />
            <span className="text-sm font-medium text-zinc-900">Produtos</span>
            {products.length > 0 && (
              <span className="text-xs bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-md">
                {products.length}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Search */}
      {!selectedProduct && (
        <div className="px-3 py-2.5 border-b border-zinc-100 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar produto..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 h-9 bg-zinc-50 border-zinc-200 text-sm"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {loading && !selectedProduct && (
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !selectedProduct && products.length === 0 && hasFetchedRef.current && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Package className="w-10 h-10 text-zinc-200 mb-3" />
            <p className="text-sm font-medium text-zinc-500 mb-1">Nenhum produto encontrado</p>
            <p className="text-xs text-zinc-400">
              {searchQuery
                ? 'Tente outro termo de busca'
                : 'Sincronize seus produtos Shopify nas Configuracoes'}
            </p>
          </div>
        )}

        {/* Product List */}
        {!loading && !selectedProduct && products.length > 0 && (
          <div className="p-3 space-y-1.5">
            {products.map((product) => (
              <ProductListItem
                key={product.id}
                product={product}
                onClick={() => {
                  setSelectedProduct(product)
                  setActiveTab('info')
                }}
              />
            ))}
          </div>
        )}

        {/* Product Detail */}
        {selectedProduct && (
          <div>
            {/* Back */}
            <div className="px-4 py-2 border-b border-zinc-100">
              <button
                onClick={() => setSelectedProduct(null)}
                className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>
            </div>

            {/* Image Gallery — all product images */}
            {(() => {
              const productImages = selectedProduct.images?.length > 0
                ? selectedProduct.images
                : selectedProduct.image_url ? [selectedProduct.image_url] : []
              return productImages.length > 0 ? (
                <ImageGallery
                  images={productImages}
                  title={selectedProduct.title}
                  onSendImage={(url, idx) => {
                    if (onSendMediaUrl) {
                      onSendMediaUrl(url, 'image', `Foto ${idx + 1} — ${selectedProduct.title}`)
                      toast.success('Foto enviada!')
                    } else {
                      handleSend(
                        `Foto ${idx + 1} — ${selectedProduct.title}]\n${url}`,
                        'Link da foto enviado!'
                      )
                    }
                  }}
                />
              ) : null
            })()}

            {/* Title & Status */}
            <div className="px-4 py-3 border-b border-zinc-100">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-900">
                    {selectedProduct.title}
                  </h3>
                  {selectedProduct.description && (
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                      {selectedProduct.description}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-lg font-medium shrink-0 ml-2',
                    selectedProduct.is_active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-zinc-100 text-zinc-500'
                  )}
                >
                  {selectedProduct.is_active ? 'Disponivel' : 'Indisponivel'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-400">
                {selectedProduct.variants?.[0]?.sku && (
                  <span>SKU: {selectedProduct.variants[0].sku}</span>
                )}
                {selectedProduct.handle && (
                  <>
                    <span>|</span>
                    <span>{selectedProduct.handle}</span>
                  </>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="px-4 pt-2.5 border-b border-zinc-200 flex gap-4 shrink-0">
              {([
                { key: 'info' as Tab, label: 'Info' },
                { key: 'media' as Tab, label: 'Midias' },
                { key: 'specs' as Tab, label: 'Ficha Tecnica' },
                { key: 'catalogos' as Tab, label: 'Catalogos' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'pb-2.5 text-sm transition-colors relative',
                    activeTab === tab.key
                      ? 'text-zinc-900 font-medium'
                      : 'text-zinc-400 hover:text-zinc-600'
                  )}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content: Info */}
            {activeTab === 'info' && (
              <div className="p-4 space-y-3">
                {/* Price (internal) */}
                <SectionCard
                  icon={Tag}
                  title="Preco (interno)"
                  badge={{ text: 'Nao enviar', className: 'bg-rose-50 text-rose-600' }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zinc-50 rounded-lg p-2.5">
                      <span className="text-[11px] text-zinc-400 block">Custo</span>
                      <span className="text-sm font-semibold text-zinc-900">
                        {formatCurrency(selectedProduct.cost_price || 0)}
                      </span>
                    </div>
                    <div className="bg-zinc-50 rounded-lg p-2.5">
                      <span className="text-[11px] text-zinc-400 block">
                        Venda
                        {selectedProduct.cost_price > 0 &&
                          selectedProduct.sale_price > 0 &&
                          ` (${(selectedProduct.sale_price / selectedProduct.cost_price).toFixed(1)}x)`}
                      </span>
                      <span className="text-sm font-semibold text-emerald-700">
                        {formatCurrency(selectedProduct.sale_price || 0)}
                      </span>
                    </div>
                  </div>
                </SectionCard>

                {/* Variants */}
                <VariantChips variants={selectedProduct.variants || []} />

                {/* Dimensions */}
                {(() => {
                  const dims = parseDimensions(selectedProduct)
                  const hasDims = Object.values(dims).some(Boolean)
                  if (!hasDims) return null
                  return (
                    <SectionCard
                      icon={Ruler}
                      title="Dimensoes"
                      onSend={() =>
                        handleSend(
                          buildDimensionsText(selectedProduct),
                          'Dimensoes enviadas!'
                        )
                      }
                    >
                      <div className="grid grid-cols-3 gap-2">
                        {dims.width && (
                          <div className="bg-zinc-50 rounded-lg p-2 text-center">
                            <span className="text-[11px] text-zinc-400 block">Largura</span>
                            <span className="text-sm font-semibold text-zinc-900">{dims.width}</span>
                          </div>
                        )}
                        {dims.depth && (
                          <div className="bg-zinc-50 rounded-lg p-2 text-center">
                            <span className="text-[11px] text-zinc-400 block">Profund.</span>
                            <span className="text-sm font-semibold text-zinc-900">{dims.depth}</span>
                          </div>
                        )}
                        {dims.height && (
                          <div className="bg-zinc-50 rounded-lg p-2 text-center">
                            <span className="text-[11px] text-zinc-400 block">Altura</span>
                            <span className="text-sm font-semibold text-zinc-900">{dims.height}</span>
                          </div>
                        )}
                      </div>
                      {(dims.weight || dims.seatHeight) && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {dims.weight && (
                            <div className="bg-zinc-50 rounded-lg p-2 text-center">
                              <span className="text-[11px] text-zinc-400 block">Peso</span>
                              <span className="text-sm font-semibold text-zinc-900">{dims.weight}</span>
                            </div>
                          )}
                          {dims.seatHeight && (
                            <div className="bg-zinc-50 rounded-lg p-2 text-center">
                              <span className="text-[11px] text-zinc-400 block">Assento</span>
                              <span className="text-sm font-semibold text-zinc-900">{dims.seatHeight}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </SectionCard>
                  )
                })()}

                {/* Materials */}
                {parseMaterials(selectedProduct).length > 0 && (
                  <SectionCard
                    icon={Info}
                    title="Materiais"
                    onSend={() =>
                      handleSend(
                        buildMaterialsText(selectedProduct),
                        'Materiais enviados!'
                      )
                    }
                  >
                    <div className="space-y-1.5">
                      {parseMaterials(selectedProduct).map((mat, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-zinc-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 shrink-0" />
                          {mat}
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {/* Delivery */}
                {parseDelivery(selectedProduct) && (
                  <SectionCard
                    icon={Truck}
                    title="Entrega"
                    onSend={() =>
                      handleSend(
                        buildDeliveryText(selectedProduct),
                        'Prazo enviado!'
                      )
                    }
                  >
                    <div className="bg-zinc-50 rounded-lg p-2.5">
                      <span className="text-sm font-medium text-zinc-900">
                        {parseDelivery(selectedProduct)}
                      </span>
                    </div>
                  </SectionCard>
                )}

                {/* Tags */}
                {selectedProduct.tags && selectedProduct.tags.length > 0 && (
                  <SectionCard icon={Tag} title="Tags">
                    <div className="flex flex-wrap gap-1.5">
                      {selectedProduct.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {/* Full description CTA */}
                <Button
                  onClick={() =>
                    handleSend(
                      buildFullDescription(selectedProduct),
                      'Descricao completa enviada!'
                    )
                  }
                  className="w-full bg-zinc-900 text-white hover:bg-zinc-800 gap-2"
                >
                  <Send className="w-4 h-4" />
                  Enviar descricao completa
                </Button>

                {/* Copy description */}
                <Button
                  variant="outline"
                  onClick={() =>
                    handleCopyText(buildFullDescription(selectedProduct))
                  }
                  className="w-full gap-2 text-zinc-600"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied ? 'Copiado!' : 'Copiar descricao'}
                </Button>
              </div>
            )}

            {/* Tab Content: Media */}
            {activeTab === 'media' && (
              <div className="p-4 space-y-3">
                {/* Product Photos */}
                {(() => {
                  const productImages = selectedProduct.images?.length > 0
                    ? selectedProduct.images
                    : selectedProduct.image_url ? [selectedProduct.image_url] : []

                  return productImages.length > 0 ? (
                    <SectionCard
                      icon={ImageIcon}
                      title={`Fotos do produto (${productImages.length})`}
                      onSend={() => {
                        if (onSendMediaUrl && productImages.length > 0) {
                          productImages.forEach((imgUrl, idx) => {
                            setTimeout(() => {
                              onSendMediaUrl(imgUrl, 'image', idx === 0 ? selectedProduct.title : undefined)
                            }, idx * 1500)
                          })
                          toast.success(`Enviando ${productImages.length} fotos...`)
                        }
                      }}
                    >
                      <div className="grid grid-cols-3 gap-2">
                        {productImages.map((imgUrl, idx) => (
                          <div key={idx} className="relative group">
                            <img
                              src={imgUrl}
                              alt={`${selectedProduct.title} ${idx + 1}`}
                              className="w-full aspect-square rounded-lg object-cover"
                              loading="lazy"
                            />
                            <button
                              onClick={() => {
                                if (onSendMediaUrl) {
                                  onSendMediaUrl(imgUrl, 'image', `Foto ${idx + 1} — ${selectedProduct.title}`)
                                  toast.success(`Foto ${idx + 1} enviada!`)
                                } else {
                                  handleSend(
                                    `Foto ${idx + 1} — ${selectedProduct.title}]\n${imgUrl}`,
                                    `Foto ${idx + 1} enviada!`
                                  )
                                }
                              }}
                              className="absolute inset-0 bg-zinc-900/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <Send className="w-5 h-5 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  ) : null
                })()}

                {/* Galeria Inspiracao */}
                {(() => {
                  const galeriaImages = parseGaleriaInspiracao(selectedProduct)
                  if (galeriaImages.length === 0) return null

                  return (
                    <SectionCard
                      icon={Sparkles}
                      title={`Galeria inspiracao (${galeriaImages.length})`}
                      onSend={() => {
                        if (onSendMediaUrl && galeriaImages.length > 0) {
                          galeriaImages.forEach((imgUrl, idx) => {
                            setTimeout(() => {
                              onSendMediaUrl(imgUrl, 'image', idx === 0 ? `${selectedProduct.title} — Inspiracao` : undefined)
                            }, idx * 1500)
                          })
                          toast.success(`Enviando ${galeriaImages.length} fotos de inspiracao...`)
                        }
                      }}
                    >
                      <div className="grid grid-cols-3 gap-2">
                        {galeriaImages.map((imgUrl, idx) => (
                          <div key={idx} className="relative group">
                            <img
                              src={imgUrl}
                              alt={`Inspiracao ${idx + 1}`}
                              className="w-full aspect-square rounded-lg object-cover"
                              loading="lazy"
                            />
                            <button
                              onClick={() => {
                                if (onSendMediaUrl) {
                                  onSendMediaUrl(imgUrl, 'image', `Inspiracao ${idx + 1} — ${selectedProduct.title}`)
                                  toast.success(`Foto de inspiracao ${idx + 1} enviada!`)
                                } else {
                                  handleSend(
                                    `Inspiracao ${idx + 1} — ${selectedProduct.title}]\n${imgUrl}`,
                                    `Foto de inspiracao enviada!`
                                  )
                                }
                              }}
                              className="absolute inset-0 bg-zinc-900/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <Send className="w-5 h-5 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                })()}

                {/* Videos */}
                {(() => {
                  const videoUrl = getMetafield(selectedProduct, 'custom.video_reels', 'custom.video', 'custom.video_url', 'custom.video_360')
                  if (!videoUrl) return null
                  return (
                    <SectionCard icon={Video} title="Videos">
                      <div className="flex items-center gap-3 bg-zinc-50 rounded-lg p-3">
                        <div className="w-14 h-10 bg-zinc-200 rounded-lg flex items-center justify-center shrink-0">
                          <Video className="w-5 h-5 text-zinc-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-zinc-800 block truncate">
                            Video do produto
                          </span>
                        </div>
                        <SendButton
                          onClick={() =>
                            handleSend(
                              `Video — ${selectedProduct.title}\n${videoUrl}`,
                              'Video enviado!'
                            )
                          }
                          size="xs"
                        />
                      </div>
                    </SectionCard>
                  )
                })()}

                {/* Empty state */}
                {(() => {
                  const productImages = selectedProduct.images?.length > 0
                    ? selectedProduct.images
                    : selectedProduct.image_url ? [selectedProduct.image_url] : []
                  const galeriaImages = parseGaleriaInspiracao(selectedProduct)
                  const videoUrl = getMetafield(selectedProduct, 'custom.video_reels', 'custom.video', 'custom.video_url', 'custom.video_360')
                  if (productImages.length === 0 && galeriaImages.length === 0 && !videoUrl) {
                    return (
                      <div className="flex flex-col items-center py-8 text-center">
                        <ImageIcon className="w-8 h-8 text-zinc-200 mb-2" />
                        <p className="text-xs text-zinc-400">Nenhuma midia cadastrada</p>
                      </div>
                    )
                  }
                  return null
                })()}
              </div>
            )}

            {/* Tab Content: Specs (Ficha Tecnica) */}
            {activeTab === 'specs' && (
              <div className="p-4 space-y-3">
                {/* Send all specs */}
                <Button
                  variant="outline"
                  onClick={() =>
                    handleSend(
                      buildSpecsText(selectedProduct),
                      'Ficha tecnica completa enviada!'
                    )
                  }
                  className="w-full gap-2 text-zinc-600 text-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar ficha tecnica completa
                </Button>

                {/* Acabamento */}
                {(() => {
                  const acabamento = getAcabamento(selectedProduct)
                  if (!acabamento) return null
                  return (
                    <SectionCard
                      icon={Layers}
                      title="Acabamento"
                      onSend={() =>
                        handleSend(
                          `*${selectedProduct.title} — Acabamento:*\n\n${acabamento}`,
                          'Acabamento enviado!'
                        )
                      }
                    >
                      <p className="text-sm text-zinc-700 whitespace-pre-line">{acabamento}</p>
                    </SectionCard>
                  )
                })()}

                {/* Material */}
                {(() => {
                  const material = getMaterial(selectedProduct)
                  if (!material) return null
                  return (
                    <SectionCard
                      icon={Info}
                      title="Material"
                      onSend={() =>
                        handleSend(
                          `*${selectedProduct.title} — Material:*\n\n${material}`,
                          'Material enviado!'
                        )
                      }
                    >
                      <p className="text-sm text-zinc-700 whitespace-pre-line">{material}</p>
                    </SectionCard>
                  )
                })()}

                {/* Dimensoes */}
                {(() => {
                  const dimensoes = getDimensoes(selectedProduct)
                  if (!dimensoes) return null
                  return (
                    <SectionCard
                      icon={Ruler}
                      title="Dimensoes"
                      onSend={() =>
                        handleSend(
                          `*${selectedProduct.title} — Dimensoes:*\n\n${dimensoes}`,
                          'Dimensoes enviadas!'
                        )
                      }
                    >
                      <p className="text-sm text-zinc-700 whitespace-pre-line">{dimensoes}</p>
                    </SectionCard>
                  )
                })()}

                {/* Montagem */}
                {(() => {
                  const montagem = getMontagem(selectedProduct)
                  if (!montagem) return null
                  return (
                    <SectionCard
                      icon={Wrench}
                      title="Montagem"
                      onSend={() =>
                        handleSend(
                          `*${selectedProduct.title} — Montagem:*\n\n${montagem}`,
                          'Montagem enviada!'
                        )
                      }
                    >
                      <p className="text-sm text-zinc-700 whitespace-pre-line">{montagem}</p>
                    </SectionCard>
                  )
                })()}

                {/* Garantia */}
                {(() => {
                  const garantia = getGarantia(selectedProduct)
                  if (!garantia) return null
                  return (
                    <SectionCard
                      icon={Shield}
                      title="Garantia"
                      onSend={() =>
                        handleSend(
                          `*${selectedProduct.title} — Garantia:*\n\n${garantia}`,
                          'Garantia enviada!'
                        )
                      }
                    >
                      <p className="text-sm text-zinc-700 whitespace-pre-line">{garantia}</p>
                    </SectionCard>
                  )
                })()}

                {/* Cor */}
                {(() => {
                  const cor = getMetafield(selectedProduct, 'custom.cor')
                  if (!cor) return null
                  return (
                    <SectionCard
                      icon={Palette}
                      title="Cor"
                      onSend={() =>
                        handleSend(
                          `*${selectedProduct.title} — Cor:* ${cor}`,
                          'Cor enviada!'
                        )
                      }
                    >
                      <p className="text-sm text-zinc-700">{cor}</p>
                    </SectionCard>
                  )
                })()}

                {/* Prazo de entrega */}
                {(() => {
                  const prazo = parseDelivery(selectedProduct)
                  if (!prazo) return null
                  return (
                    <SectionCard
                      icon={Truck}
                      title="Prazo de entrega"
                      onSend={() =>
                        handleSend(
                          `*${selectedProduct.title} — Prazo:* ${prazo}`,
                          'Prazo enviado!'
                        )
                      }
                    >
                      <p className="text-sm text-zinc-700">{prazo}</p>
                    </SectionCard>
                  )
                })()}

                {/* General info */}
                {(selectedProduct.product_type || selectedProduct.vendor) && (
                  <SectionCard icon={Tag} title="Informacoes gerais">
                    <table className="w-full text-sm">
                      <tbody>
                        {selectedProduct.product_type && (
                          <tr className="border-b border-zinc-50">
                            <td className="py-1.5 text-zinc-500 pr-4">Tipo</td>
                            <td className="py-1.5 text-zinc-900 font-medium">{selectedProduct.product_type}</td>
                          </tr>
                        )}
                        {selectedProduct.vendor && (
                          <tr className="border-b border-zinc-50">
                            <td className="py-1.5 text-zinc-500 pr-4">Fabricante</td>
                            <td className="py-1.5 text-zinc-900 font-medium">{selectedProduct.vendor}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </SectionCard>
                )}

                {/* Empty state when no specs at all */}
                {(() => {
                  const hasAny = getAcabamento(selectedProduct) || getMaterial(selectedProduct) ||
                    getDimensoes(selectedProduct) || getMontagem(selectedProduct) ||
                    getGarantia(selectedProduct) || selectedProduct.product_type || selectedProduct.vendor
                  if (hasAny) return null
                  return (
                    <div className="flex flex-col items-center py-8 text-center">
                      <FileText className="w-8 h-8 text-zinc-200 mb-2" />
                      <p className="text-xs text-zinc-400">Nenhuma especificacao cadastrada</p>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Tab Content: Catalogos */}
            {activeTab === 'catalogos' && (
              <div className="p-4 space-y-3">
                {/* Catalogo de Produtos */}
                {(() => {
                  const catalogoUrl = getMetafield(selectedProduct, 'custom.catalogo')
                  if (!catalogoUrl) return null
                  return (
                    <SectionCard icon={BookOpen} title="Catalogo de Produtos">
                      <div className="flex items-center gap-3 bg-zinc-50 rounded-lg p-3">
                        <div className="w-10 h-12 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                          <BookOpen className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-zinc-800 block truncate">
                            Catalogo de Produtos
                          </span>
                          <span className="text-xs text-zinc-400">PDF / Documento</span>
                        </div>
                        <SendButton
                          onClick={() => {
                            if (onSendMediaUrl) {
                              onSendMediaUrl(
                                catalogoUrl,
                                'document',
                                `Catalogo — ${selectedProduct.title}`,
                                toFilename('Catalogo', selectedProduct.title, 'pdf')
                              )
                              toast.success('Catalogo enviado!')
                            } else {
                              handleSend(
                                `*Catalogo de Produtos — ${selectedProduct.title}*\n${catalogoUrl}`,
                                'Catalogo enviado!'
                              )
                            }
                          }}
                          size="xs"
                        />
                      </div>
                    </SectionCard>
                  )
                })()}

                {/* Catalogo de Acabamentos */}
                {(() => {
                  const acabamentosUrl = getMetafield(selectedProduct, 'custom.acabamento')
                  if (!acabamentosUrl) return null
                  return (
                    <SectionCard icon={Palette} title="Catalogo de Acabamentos">
                      <div className="flex items-center gap-3 bg-zinc-50 rounded-lg p-3">
                        <div className="w-10 h-12 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
                          <Palette className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-zinc-800 block truncate">
                            Catalogo de Acabamentos
                          </span>
                          <span className="text-xs text-zinc-400">PDF / Documento</span>
                        </div>
                        <SendButton
                          onClick={() => {
                            if (onSendMediaUrl) {
                              onSendMediaUrl(
                                acabamentosUrl,
                                'document',
                                `Acabamentos — ${selectedProduct.title}`,
                                toFilename('Acabamentos', selectedProduct.title, 'pdf')
                              )
                              toast.success('Catalogo de acabamentos enviado!')
                            } else {
                              handleSend(
                                `*Catalogo de Acabamentos — ${selectedProduct.title}*\n${acabamentosUrl}`,
                                'Catalogo de acabamentos enviado!'
                              )
                            }
                          }}
                          size="xs"
                        />
                      </div>
                    </SectionCard>
                  )
                })()}

                {/* Bloco 3D */}
                {(() => {
                  const bloco3dUrl = getMetafield(selectedProduct, 'custom.bloco', 'custom.bloco_3d')
                  if (!bloco3dUrl) return null
                  return (
                    <SectionCard icon={Box} title="Bloco 3D">
                      <div className="flex items-center gap-3 bg-zinc-50 rounded-lg p-3">
                        <div className="w-10 h-12 bg-violet-50 rounded-lg flex items-center justify-center shrink-0">
                          <Box className="w-5 h-5 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-zinc-800 block truncate">
                            Bloco 3D
                          </span>
                          <span className="text-xs text-zinc-400">Arquivo 3D</span>
                        </div>
                        <SendButton
                          onClick={() => {
                            if (onSendMediaUrl) {
                              onSendMediaUrl(
                                bloco3dUrl,
                                'document',
                                `Bloco 3D — ${selectedProduct.title}`,
                                toFilename('Bloco3D', selectedProduct.title, 'skp')
                              )
                              toast.success('Bloco 3D enviado!')
                            } else {
                              handleSend(
                                `*Bloco 3D — ${selectedProduct.title}*\n${bloco3dUrl}`,
                                'Bloco 3D enviado!'
                              )
                            }
                          }}
                          size="xs"
                        />
                      </div>
                    </SectionCard>
                  )
                })()}

                {/* Empty state */}
                {(() => {
                  const hasCatalogo = getMetafield(selectedProduct, 'custom.catalogo')
                  const hasAcabamentos = getMetafield(selectedProduct, 'custom.acabamento')
                  const hasBloco3d = getMetafield(selectedProduct, 'custom.bloco', 'custom.bloco_3d')
                  if (hasCatalogo || hasAcabamentos || hasBloco3d) return null
                  return (
                    <div className="flex flex-col items-center py-8 text-center">
                      <BookOpen className="w-8 h-8 text-zinc-200 mb-2" />
                      <p className="text-xs text-zinc-400">Nenhum catalogo cadastrado para este produto</p>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
