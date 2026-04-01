import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { Loader2, ShoppingCart, Link2, Unplug, RefreshCw, Plus, X, Eye } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function QuoteSettingsTab() {
  const { profile } = useAuthContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Shopify credentials
  const [shopifyDomain, setShopifyDomain] = useState('')
  const [shopifyToken, setShopifyToken] = useState('')
  const [isConnected, setIsConnected] = useState(false)

  // Quote settings
  const [defaultMarkup, setDefaultMarkup] = useState(2.0)
  const [footerText, setFooterText] = useState('')
  const [paymentOptions, setPaymentOptions] = useState<string[]>(['PIX', 'Cartão', 'Boleto'])
  const [newPaymentOption, setNewPaymentOption] = useState('')
  const [productCount, setProductCount] = useState(0)
  const [visualSearchEnabled, setVisualSearchEnabled] = useState(false)
  const [savingVisualSearch, setSavingVisualSearch] = useState(false)

  useEffect(() => {
    if (!profile?.org_id) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function loadData() {
    if (!profile?.org_id) return
    setLoading(true)

    // Load org Shopify credentials
    const { data: org } = await supabase
      .from('organizations')
      .select('shopify_domain, visual_search_enabled')
      .eq('id', profile.org_id)
      .single()

    if (org) {
      setShopifyDomain(org.shopify_domain || '')
      setIsConnected(!!org.shopify_domain)
      setVisualSearchEnabled(org.visual_search_enabled || false)
    }

    // Load quote settings
    try {
      const headers = getAuthHeaders()
      const res = await fetch(`${API_BASE}/api/quotes/settings/current`, { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.default_markup) setDefaultMarkup(data.default_markup)
        if (data.footer_text) setFooterText(data.footer_text)
        if (data.payment_options) setPaymentOptions(data.payment_options)
      }
    } catch { /* use defaults */ }

    // Count products
    const { count } = await supabase
      .from('shopify_products')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', profile.org_id)
      .eq('is_active', true)

    setProductCount(count || 0)
    setLoading(false)
  }

  async function handleSaveCredentials() {
    setSaving(true)
    try {
      const headers = getAuthHeaders()
      const res = await fetch(`${API_BASE}/api/quotes/shopify/credentials`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ domain: shopifyDomain, accessToken: shopifyToken }),
      })
      if (!res.ok) throw new Error('Falha ao salvar')
      setIsConnected(true)
      toast.success('Credenciais salvas')
    } catch {
      toast.error('Erro ao salvar credenciais')
    } finally {
      setSaving(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const headers = getAuthHeaders()
      const res = await fetch(`${API_BASE}/api/quotes/shopify/sync`, {
        method: 'POST',
        headers,
      })
      if (!res.ok) throw new Error('Falha ao sincronizar')
      const result = await res.json()
      setProductCount(result.synced)
      toast.success(`${result.synced} produtos sincronizados`)
    } catch {
      toast.error('Erro ao sincronizar produtos')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSaveSettings() {
    setSaving(true)
    try {
      const headers = getAuthHeaders()
      const res = await fetch(`${API_BASE}/api/quotes/settings/current`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          default_markup: defaultMarkup,
          footer_text: footerText,
          payment_options: paymentOptions,
        }),
      })
      if (!res.ok) throw new Error('Falha ao salvar')
      toast.success('Configurações salvas')
    } catch {
      toast.error('Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  function addPaymentOption() {
    const opt = newPaymentOption.trim()
    if (!opt || paymentOptions.includes(opt)) return
    setPaymentOptions((prev) => [...prev, opt])
    setNewPaymentOption('')
  }

  function removePaymentOption(opt: string) {
    setPaymentOptions((prev) => prev.filter((o) => o !== opt))
  }

  async function handleToggleVisualSearch(enabled: boolean) {
    if (!profile?.org_id) return
    setSavingVisualSearch(true)
    setVisualSearchEnabled(enabled)

    try {
      const { error } = await supabase
        .from('organizations')
        .update({ visual_search_enabled: enabled })
        .eq('id', profile.org_id)

      if (error) throw error

      if (enabled && productCount > 0) {
        toast.success('Visual Search ativado! Gerando embeddings dos produtos...')
        // Trigger embedding generation via sync
        const headers = getAuthHeaders()
        fetch(`${API_BASE}/api/quotes/shopify/sync`, {
          method: 'POST',
          headers,
        }).catch(() => {})
      } else if (enabled) {
        toast.success('Visual Search ativado! Sincronize os produtos primeiro.')
      } else {
        toast.success('Visual Search desativado')
      }
    } catch {
      setVisualSearchEnabled(!enabled)
      toast.error('Erro ao alterar configuracao')
    } finally {
      setSavingVisualSearch(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="rounded-lg border border-zinc-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-6 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Shopify Connection */}
      <Card className="border-zinc-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center">
                <ShoppingCart className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Shopify</CardTitle>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Sincronize produtos para criar orçamentos
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                isConnected
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500'
              )}
            >
              {isConnected ? (
                <span className="flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> Conectado
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Unplug className="w-3 h-3" /> Desconectado
                </span>
              )}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600">Domínio Shopify</label>
              <Input
                value={shopifyDomain}
                onChange={(e) => setShopifyDomain(e.target.value)}
                placeholder="minha-loja.myshopify.com"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600">Access Token</label>
              <Input
                type="password"
                value={shopifyToken}
                onChange={(e) => setShopifyToken(e.target.value)}
                placeholder={isConnected ? '••••••••' : 'shpat_...'}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveCredentials}
              disabled={saving || !shopifyDomain || !shopifyToken}
              className="text-xs gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Salvar credenciais
            </Button>

            {isConnected && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                className="text-xs gap-1.5"
              >
                {syncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Sincronizar produtos
              </Button>
            )}

            {productCount > 0 && (
              <span className="text-xs text-zinc-400 ml-auto">
                {productCount} produto{productCount !== 1 ? 's' : ''} sincronizado{productCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Visual Search */}
      {isConnected && (
        <Card className="border-zinc-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center">
                  <Eye className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-base">Visual Search</CardTitle>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Identifica produtos do catalogo quando o cliente envia fotos
                  </p>
                </div>
              </div>
              <Switch
                checked={visualSearchEnabled}
                onCheckedChange={handleToggleVisualSearch}
                disabled={savingVisualSearch}
              />
            </div>
          </CardHeader>
          {visualSearchEnabled && (
            <CardContent className="pt-0">
              <div className="rounded-md bg-violet-50 border border-violet-100 px-3 py-2.5 text-xs text-violet-700 space-y-1">
                <p className="font-medium">Como funciona:</p>
                <p>Quando um cliente envia uma foto no WhatsApp e a IA esta ativa, o sistema analisa a imagem e busca produtos similares no seu catalogo Shopify.</p>
                <p>O Copiloto recebe os produtos encontrados e sugere respostas mencionando-os automaticamente.</p>
                <p className="text-violet-500 mt-1">Custo adicional: ~R$ 0,001 por busca (apenas embedding de texto). A analise de imagem ja e feita pelo Copiloto.</p>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Quote Settings */}
      <Card className="border-zinc-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configurações de orçamento</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Default markup */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600">Markup padrão</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                step={0.1}
                value={defaultMarkup}
                onChange={(e) => setDefaultMarkup(parseFloat(e.target.value) || 2)}
                className="w-24 h-9 text-sm"
              />
              <span className="text-xs text-zinc-400">
                (custo × {defaultMarkup} = preço de venda)
              </span>
            </div>
          </div>

          {/* Payment options */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-600">Opções de pagamento</label>
            <div className="flex flex-wrap gap-1.5">
              {paymentOptions.map((opt) => (
                <Badge
                  key={opt}
                  variant="secondary"
                  className="text-xs gap-1 pr-1"
                >
                  {opt}
                  <button
                    onClick={() => removePaymentOption(opt)}
                    className="ml-0.5 p-0.5 rounded hover:bg-zinc-300 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newPaymentOption}
                onChange={(e) => setNewPaymentOption(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPaymentOption()}
                placeholder="Nova opção..."
                className="h-8 text-sm max-w-48"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addPaymentOption}
                disabled={!newPaymentOption.trim()}
                className="h-8 text-xs gap-1"
              >
                <Plus className="w-3 h-3" />
                Adicionar
              </Button>
            </div>
          </div>

          {/* Footer text */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600">Texto do rodapé</label>
            <Textarea
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Texto exibido no rodapé do orçamento..."
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          <Button
            size="sm"
            onClick={handleSaveSettings}
            disabled={saving}
            className="text-xs gap-1.5"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salvar configurações
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
