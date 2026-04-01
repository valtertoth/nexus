import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { Loader2, Save, Brain, Zap, DollarSign } from 'lucide-react'

export function AiTab() {
  const { profile } = useAuthContext()
  const [tokenLimit, setTokenLimit] = useState(0)
  const [tokensUsed, setTokensUsed] = useState(0)
  const [defaultAiMode, setDefaultAiMode] = useState('dictated')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aiSummary, setAiSummary] = useState<{
    total_suggestions: number
    total_tokens_used: number
    estimated_cost_usd: number
  } | null>(null)

  const orgId = profile?.org_id

  useEffect(() => {
    if (!orgId) return

    // Fetch org settings
    supabase
      .from('organizations')
      .select('ai_monthly_token_limit, ai_tokens_used_this_month, settings')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (data) {
          setTokenLimit(data.ai_monthly_token_limit)
          setTokensUsed(data.ai_tokens_used_this_month)
          const settings = data.settings as Record<string, unknown> | null
          if (settings?.default_ai_mode) {
            setDefaultAiMode(settings.default_ai_mode as string)
          }
        }
      })

    // Fetch AI usage for current month
    supabase
      .rpc('ai_usage_summary', { p_org_id: orgId, p_days: 30 })
      .then(({ data }) => {
        if (data) {
          const summary = Array.isArray(data) ? data[0] : data
          setAiSummary(
            summary as {
              total_suggestions: number
              total_tokens_used: number
              estimated_cost_usd: number
            }
          )
        }
      })
  }, [orgId])

  const handleSave = async () => {
    if (!orgId) return
    setSaving(true)
    setSaved(false)

    await supabase
      .from('organizations')
      .update({
        ai_monthly_token_limit: tokenLimit,
        settings: { default_ai_mode: defaultAiMode },
      })
      .eq('id', orgId)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const usagePercent = tokenLimit > 0 ? Math.round((tokensUsed / tokenLimit) * 100) : 0

  return (
    <div className="max-w-xl space-y-6">
      {/* Usage Overview */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-zinc-200 shadow-none">
          <CardContent className="p-4 text-center">
            <Brain className="mx-auto h-5 w-5 text-zinc-400" />
            <p className="mt-2 text-xl font-bold text-zinc-900">
              {aiSummary?.total_suggestions || 0}
            </p>
            <p className="text-xs text-zinc-500">Sugestoes (30d)</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 shadow-none">
          <CardContent className="p-4 text-center">
            <Zap className="mx-auto h-5 w-5 text-zinc-400" />
            <p className="mt-2 text-xl font-bold text-zinc-900">
              {((tokensUsed || 0) / 1000).toFixed(0)}K
            </p>
            <p className="text-xs text-zinc-500">Tokens usados</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200 shadow-none">
          <CardContent className="p-4 text-center">
            <DollarSign className="mx-auto h-5 w-5 text-zinc-400" />
            <p className="mt-2 text-xl font-bold text-zinc-900">
              ${aiSummary?.estimated_cost_usd?.toFixed(2) || '0.00'}
            </p>
            <p className="text-xs text-zinc-500">Custo (30d)</p>
          </CardContent>
        </Card>
      </div>

      {/* Token Usage Bar */}
      <Card className="border-zinc-200 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Uso de tokens mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
            <span>{(tokensUsed / 1000).toFixed(0)}K usados</span>
            <span>{(tokenLimit / 1000).toFixed(0)}K limite</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`h-full rounded-full transition-all ${
                usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-500">{usagePercent}% utilizado</p>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card className="border-zinc-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Configuracoes de IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Limite mensal de tokens</Label>
            <Input
              type="number"
              value={tokenLimit}
              onChange={(e) => setTokenLimit(parseInt(e.target.value) || 0)}
              min={0}
              step={10000}
            />
            <p className="text-xs text-zinc-500">
              0 = sem limite. Recomendado: 500.000 para plano Starter.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Modo IA padrão para novos agentes</Label>
            <select
              value={defaultAiMode}
              onChange={(e) => setDefaultAiMode(e.target.value)}
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="automatic">Automático (envia após 5s)</option>
              <option value="dictated">Copiloto (sugere, humano aprova)</option>
              <option value="off">Desligado</option>
            </select>
          </div>

          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saved ? 'Salvo!' : 'Salvar configurações'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
