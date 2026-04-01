import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import {
  Search,
  Plus,

  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Send,
  Copy,
  Check,
  ShoppingCart,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAuthHeaders } from '@/lib/supabase'
import { toast } from 'sonner'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface Product {
  id: string
  title: string
  image_url?: string
  cost_price: number
  sale_price?: number
  variants: Array<{ id: string; title: string; price: number; cost?: number; sku?: string }>
}

interface QuoteItem {
  product_id: string
  title: string
  image_url?: string
  cost_price: number
  markup: number
  sale_price: number
  quantity: number
  subtotal: number
}

interface QuoteBuilderProps {
  conversationId: string
  contactId?: string
  contactName?: string
  contactPhone?: string
  sellerName?: string
  open: boolean
  onClose: () => void
  onSendText: (text: string) => void
}

type Step = 'products' | 'details' | 'preview'

export function QuoteBuilder({
  conversationId,
  contactId,
  contactName,
  contactPhone,
  sellerName,
  open,
  onClose,
  onSendText,
}: QuoteBuilderProps) {
  const [step, setStep] = useState<Step>('products')
  const [products, setProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [items, setItems] = useState<QuoteItem[]>([])
  const [defaultMarkup, setDefaultMarkup] = useState(2.0)

  // Details step
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('percentage')
  const [discountValue, setDiscountValue] = useState(0)
  const [paymentTerms, setPaymentTerms] = useState('')
  const [validDays, setValidDays] = useState(30)
  const [notes, setNotes] = useState('')

  // Preview
  const [previewText, setPreviewText] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Load products and settings
  useEffect(() => {
    if (!open) return
    loadProducts()
    loadSettings()
  }, [open])

  async function loadProducts(q?: string) {
    setLoadingProducts(true)
    try {
      const headers = getAuthHeaders()
      const url = q
        ? `${API_BASE}/api/quotes/shopify/products?q=${encodeURIComponent(q)}`
        : `${API_BASE}/api/quotes/shopify/products`
      const res = await fetch(url, { headers })
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products || [])
      }
    } catch {
      // silent
    } finally {
      setLoadingProducts(false)
    }
  }

  async function loadSettings() {
    try {
      const headers = getAuthHeaders()
      const res = await fetch(`${API_BASE}/api/quotes/settings/current`, { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.default_markup) setDefaultMarkup(data.default_markup)
      }
    } catch {
      // use defaults
    }
  }

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      loadProducts(searchQuery || undefined)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const addItem = useCallback((product: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id
            ? { ...i, quantity: i.quantity + 1, subtotal: i.sale_price * (i.quantity + 1) }
            : i
        )
      }
      const salePrice = product.cost_price * defaultMarkup
      return [
        ...prev,
        {
          product_id: product.id,
          title: product.title,
          image_url: product.image_url,
          cost_price: product.cost_price,
          markup: defaultMarkup,
          sale_price: salePrice,
          quantity: 1,
          subtotal: salePrice,
        },
      ]
    })
  }, [defaultMarkup])

  const updateItem = useCallback((productId: string, updates: Partial<QuoteItem>) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.product_id !== productId) return i
        const updated = { ...i, ...updates }
        // Recalculate sale_price if markup changed
        if (updates.markup !== undefined) {
          updated.sale_price = updated.cost_price * updated.markup
        }
        // Recalculate subtotal
        updated.subtotal = updated.sale_price * updated.quantity
        return updated
      })
    )
  }, [])

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId))
  }, [])

  // Calculations
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0)
  const discountAmount = discountType === 'percentage'
    ? subtotal * (discountValue / 100)
    : discountValue
  const total = Math.max(0, subtotal - discountAmount)

  const handleCreateQuote = useCallback(async () => {
    if (items.length === 0) return
    setSaving(true)

    try {
      const headers = getAuthHeaders()

      const res = await fetch(`${API_BASE}/api/quotes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversationId,
          contactId,
          items,
          discountType: discountValue > 0 ? discountType : undefined,
          discountValue: discountValue > 0 ? discountValue : undefined,
          paymentTerms: paymentTerms || undefined,
          notes: notes || undefined,
          sellerName,
          validDays,
        }),
      })

      if (!res.ok) throw new Error('Falha ao criar orçamento')

      const quote = await res.json()

      // Get formatted text
      const textRes = await fetch(`${API_BASE}/api/quotes/${quote.id}/text`, { headers })
      if (textRes.ok) {
        const { text } = await textRes.json()
        setPreviewText(text)
        setStep('preview')
      }

      toast.success('Orçamento criado')
    } catch (err) {
      toast.error('Erro ao criar orçamento')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }, [items, conversationId, contactId, discountType, discountValue, paymentTerms, notes, sellerName, validDays])

  const handleSendAsText = useCallback(() => {
    if (!previewText) return
    onSendText(previewText)
    toast.success('Orçamento enviado')
    onClose()
  }, [previewText, onSendText, onClose])

  const handleCopy = useCallback(async () => {
    if (!previewText) return
    await navigator.clipboard.writeText(previewText)
    setCopied(true)
    toast.success('Orçamento copiado')
    setTimeout(() => setCopied(false), 2000)
  }, [previewText])

  const handleReset = useCallback(() => {
    setStep('products')
    setItems([])
    setDiscountValue(0)
    setPaymentTerms('')
    setNotes('')
    setPreviewText('')
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-5 h-5 text-zinc-600" />
            <h2 className="text-base font-medium text-zinc-900">
              {step === 'products' && 'Selecionar produtos'}
              {step === 'details' && 'Detalhes do orçamento'}
              {step === 'preview' && 'Prévia do orçamento'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Step indicators */}
            <div className="flex gap-1 mr-3">
              {(['products', 'details', 'preview'] as Step[]).map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    'w-2 h-2 rounded-full transition-colors',
                    step === s ? 'bg-zinc-900' : i < ['products', 'details', 'preview'].indexOf(step) ? 'bg-zinc-400' : 'bg-zinc-200'
                  )}
                />
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'products' && (
            <ProductsStep
              products={products}
              items={items}
              searchQuery={searchQuery}
              loading={loadingProducts}
              onSearchChange={setSearchQuery}
              onAddItem={addItem}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              subtotal={subtotal}
            />
          )}

          {step === 'details' && (
            <DetailsStep
              contactName={contactName || ''}
              contactPhone={contactPhone || ''}
              discountType={discountType}
              discountValue={discountValue}
              paymentTerms={paymentTerms}
              validDays={validDays}
              notes={notes}
              subtotal={subtotal}
              discountAmount={discountAmount}
              total={total}
              onDiscountTypeChange={setDiscountType}
              onDiscountValueChange={setDiscountValue}
              onPaymentTermsChange={setPaymentTerms}
              onValidDaysChange={setValidDays}
              onNotesChange={setNotes}
            />
          )}

          {step === 'preview' && (
            <PreviewStep text={previewText} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-200 bg-zinc-50">
          <div>
            {step !== 'products' && step !== 'preview' && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setStep('products')}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Voltar
              </Button>
            )}
            {step === 'preview' && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleReset}
              >
                Novo orçamento
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 'products' && (
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setStep('details')}
                disabled={items.length === 0}
              >
                Próximo
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}

            {step === 'details' && (
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleCreateQuote}
                disabled={saving || items.length === 0}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                Gerar orçamento
              </Button>
            )}

            {step === 'preview' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Copiar
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleSendAsText}
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar por texto
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Step: Products ─────────────────────────────────────────────────

function ProductsStep({
  products,
  items,
  searchQuery,
  loading,
  onSearchChange,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  subtotal,
}: {
  products: Product[]
  items: QuoteItem[]
  searchQuery: string
  loading: boolean
  onSearchChange: (q: string) => void
  onAddItem: (p: Product) => void
  onUpdateItem: (id: string, updates: Partial<QuoteItem>) => void
  onRemoveItem: (id: string) => void
  subtotal: number
}) {
  return (
    <div className="p-5 space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <Input
          placeholder="Buscar produto..."
          className="pl-9 h-9 text-sm"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Product list */}
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          </div>
        )}

        {!loading && products.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-6">
            {searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto sincronizado. Configure o Shopify nas configurações.'}
          </p>
        )}

        {!loading && products.map((product) => {
          const isAdded = items.some((i) => i.product_id === product.id)
          return (
            <div
              key={product.id}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-zinc-100 hover:border-zinc-200 transition-colors"
            >
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-md bg-zinc-100 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{product.title}</p>
                <p className="text-xs text-zinc-400">
                  Custo: {formatBRL(product.cost_price)}
                  {product.sale_price ? ` · Venda: ${formatBRL(product.sale_price)}` : ''}
                </p>
              </div>
              <Button
                variant={isAdded ? 'secondary' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1 shrink-0"
                onClick={() => onAddItem(product)}
              >
                <Plus className="w-3 h-3" />
                {isAdded ? 'Mais' : 'Adicionar'}
              </Button>
            </div>
          )
        })}
      </div>

      {/* Selected items */}
      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              Itens selecionados ({items.length})
            </span>
            <span className="text-xs font-medium text-zinc-700">
              Subtotal: {formatBRL(subtotal)}
            </span>
          </div>

          <div className="space-y-1.5">
            {items.map((item) => (
              <div
                key={item.product_id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-50 border border-zinc-100"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 truncate">{item.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <label className="text-xs text-zinc-400 flex items-center gap-1">
                      Qtd:
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => onUpdateItem(item.product_id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-14 h-6 text-xs px-1.5 text-center"
                      />
                    </label>
                    <label className="text-xs text-zinc-400 flex items-center gap-1">
                      Markup:
                      <Input
                        type="number"
                        min={1}
                        step={0.1}
                        value={item.markup}
                        onChange={(e) => onUpdateItem(item.product_id, { markup: Math.max(1, parseFloat(e.target.value) || 1) })}
                        className="w-16 h-6 text-xs px-1.5 text-center"
                      />
                    </label>
                    <span className="text-xs font-medium text-zinc-700 ml-auto">
                      {formatBRL(item.subtotal)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveItem(item.product_id)}
                  className="p-1 rounded hover:bg-zinc-200 transition-colors text-zinc-400 hover:text-zinc-600 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Step: Details ──────────────────────────────────────────────────

function DetailsStep({
  contactName,
  contactPhone,
  discountType,
  discountValue,
  paymentTerms,
  validDays,
  notes,
  subtotal,
  discountAmount,
  total,
  onDiscountTypeChange,
  onDiscountValueChange,
  onPaymentTermsChange,
  onValidDaysChange,
  onNotesChange,
}: {
  contactName: string
  contactPhone: string
  discountType: 'fixed' | 'percentage'
  discountValue: number
  paymentTerms: string
  validDays: number
  notes: string
  subtotal: number
  discountAmount: number
  total: number
  onDiscountTypeChange: (t: 'fixed' | 'percentage') => void
  onDiscountValueChange: (v: number) => void
  onPaymentTermsChange: (v: string) => void
  onValidDaysChange: (v: number) => void
  onNotesChange: (v: string) => void
}) {
  return (
    <div className="p-5 space-y-5">
      {/* Client info (auto-filled) */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-zinc-500">Cliente</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Nome</label>
            <Input value={contactName} readOnly className="h-8 text-sm bg-zinc-50" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Telefone</label>
            <Input value={contactPhone} readOnly className="h-8 text-sm bg-zinc-50" />
          </div>
        </div>
      </div>

      {/* Discount */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-zinc-500">Desconto</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onDiscountTypeChange('percentage')}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md border transition-colors',
                discountType === 'percentage'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              )}
            >
              Percentual %
            </button>
            <button
              onClick={() => onDiscountTypeChange('fixed')}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md border transition-colors',
                discountType === 'fixed'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              )}
            >
              Fixo R$
            </button>
          </div>
          <Input
            type="number"
            min={0}
            step={discountType === 'percentage' ? 1 : 10}
            value={discountValue || ''}
            onChange={(e) => onDiscountValueChange(parseFloat(e.target.value) || 0)}
            placeholder={discountType === 'percentage' ? '0%' : 'R$ 0,00'}
            className="w-28 h-8 text-sm"
          />
        </div>
      </div>

      {/* Payment terms */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-500 block">Pagamento</label>
        <Input
          value={paymentTerms}
          onChange={(e) => onPaymentTermsChange(e.target.value)}
          placeholder="Ex: PIX, 10x sem juros, etc."
          className="h-8 text-sm"
        />
      </div>

      {/* Validity */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-500 block">Validade (dias)</label>
        <Input
          type="number"
          min={1}
          value={validDays}
          onChange={(e) => onValidDaysChange(parseInt(e.target.value) || 30)}
          className="w-24 h-8 text-sm"
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-500 block">Observações</label>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Notas adicionais..."
          rows={2}
          className="text-sm resize-none"
        />
      </div>

      {/* Summary */}
      <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Subtotal</span>
          <span className="text-zinc-700">{formatBRL(subtotal)}</span>
        </div>
        {discountValue > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">
              Desconto {discountType === 'percentage' ? `(${discountValue}%)` : ''}
            </span>
            <span className="text-red-500">-{formatBRL(discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-medium pt-2 border-t border-zinc-200">
          <span className="text-zinc-900">Total</span>
          <span className="text-zinc-900">{formatBRL(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Step: Preview ──────────────────────────────────────────────────

function PreviewStep({ text }: { text: string }) {
  return (
    <div className="p-5">
      <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4">
        <pre className="text-sm text-zinc-800 whitespace-pre-wrap font-mono leading-relaxed">
          {text}
        </pre>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
