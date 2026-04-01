import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import {
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  Link2,
  Unplug,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function IntegrationsTab() {
  const { profile } = useAuthContext()
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [isFullKey, setIsFullKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!profile?.org_id) return
    loadApiKey()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.org_id])

  async function loadApiKey() {
    if (!profile?.org_id) return
    setLoading(true)
    const { data } = await supabase
      .from('organizations')
      .select('nexus_api_key')
      .eq('id', profile.org_id)
      .single()

    const key = data?.nexus_api_key || null
    setHasKey(!!key)
    // Never store the full key from DB load — only show masked version
    setApiKey(null)
    setIsFullKey(false)
    setLoading(false)
  }

  async function handleRegenerate() {
    if (!profile?.org_id) return

    const confirmed = window.confirm(
      'Regenerar a API Key vai desconectar qualquer integração ativa. Continuar?'
    )
    if (!confirmed) return

    setRegenerating(true)
    try {
      const headers = getAuthHeaders()

      const res = await fetch(`${API_BASE}/api/intelligence/api-key/regenerate`, {
        method: 'POST',
        headers,
      })

      if (!res.ok) throw new Error('Falha ao regenerar')

      const result = await res.json()
      setApiKey(result.apiKey)
      setHasKey(true)
      setIsFullKey(true)
      setShowKey(true)
      toast.success('API Key regenerada')
    } catch {
      toast.error('Erro ao regenerar API Key')
    } finally {
      setRegenerating(false)
    }
  }

  async function handleCopy() {
    if (!apiKey || !isFullKey) return
    await navigator.clipboard.writeText(apiKey)
    setCopied(true)
    toast.success('API Key copiada')
    setTimeout(() => setCopied(false), 2000)
  }

  const maskedKey = hasKey ? '••••••••••••••••••••••••••••••••' : ''
  const displayKey = isFullKey && apiKey
    ? (showKey ? apiKey : apiKey.substring(0, 8) + '••••••••••••••••••••••••' + apiKey.substring(apiKey.length - 6))
    : maskedKey

  return (
    <div className="max-w-2xl space-y-6">
      {/* Intelligence Integration */}
      <Card className="border-zinc-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center">
                <Zap className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Toth Intelligence</CardTitle>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Sincroniza conversoes para Meta CAPI e Google Ads
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] uppercase tracking-wider font-medium',
                hasKey
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500'
              )}
            >
              {hasKey ? (
                <span className="flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> Pronto
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Unplug className="w-3 h-3" /> Sem chave
                </span>
              )}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : (
            <>
              {/* API Key display */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600">API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      readOnly
                      value={displayKey}
                      placeholder="Nenhuma chave gerada"
                      className="h-9 text-sm font-mono pr-20 bg-zinc-50"
                    />
                    {hasKey && isFullKey && (
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5">
                        <button
                          onClick={() => setShowKey(!showKey)}
                          className="p-1.5 rounded hover:bg-zinc-200 transition-colors text-zinc-400 hover:text-zinc-600"
                          aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                        >
                          {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={handleCopy}
                          className="p-1.5 rounded hover:bg-zinc-200 transition-colors text-zinc-400 hover:text-zinc-600"
                          aria-label="Copiar chave"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="h-9 text-xs gap-1.5 shrink-0"
                  >
                    {regenerating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {hasKey ? 'Regenerar' : 'Gerar chave'}
                  </Button>
                </div>
              </div>

              {/* Instructions */}
              <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3.5 space-y-2">
                <p className="text-xs font-medium text-zinc-700">Como conectar</p>
                <ol className="text-xs text-zinc-500 space-y-1.5 list-decimal list-inside">
                  <li>Copie a API Key acima</li>
                  <li>Abra o painel do Intelligence</li>
                  <li>Va em Integracoes e cole a chave no campo "Nexus API Key"</li>
                  <li>Informe a URL do servidor Nexus (ex: <code className="text-zinc-700 bg-zinc-100 px-1 rounded">https://seu-servidor.com</code>)</li>
                  <li>Clique em "Conectar" — o Intelligence vai testar automaticamente</li>
                </ol>
              </div>

              {/* What syncs */}
              <div className="border-t border-zinc-100 pt-3">
                <p className="text-xs font-medium text-zinc-700 mb-2">O que sincroniza automaticamente</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Conversoes → Meta CAPI', desc: 'Purchase events para Facebook/Instagram' },
                    { label: 'Conversoes → Google Ads', desc: 'Offline conversions para Google' },
                    { label: 'Atribuicao de leads', desc: 'UTM e click IDs das campanhas' },
                    { label: 'Insights operacionais', desc: 'Padroes vencedores extraidos pela IA' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-md bg-white border border-zinc-100 p-2.5">
                      <p className="text-xs font-medium text-zinc-700">{item.label}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
