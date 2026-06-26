import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { Sparkles } from 'lucide-react'

const DEFAULT_PROMPT = `Voce e um assistente de vendas de moveis experiente e atencioso. Seu papel e:

- Ajudar clientes a encontrar os moveis ideais para suas necessidades
- Responder perguntas sobre produtos, materiais, dimensoes e prazos
- Calcular e informar custos de frete quando solicitado
- Ser cordial, profissional e eficiente
- Usar linguagem natural e amigavel, sem ser excessivamente formal
- Quando nao souber algo, ser honesto e oferecer buscar a informacao

Sempre priorize a satisfacao do cliente e seja proativo em oferecer solucoes.`

interface StepPersonalityProps {
  onComplete: () => void
}

export function StepPersonality({ onComplete }: StepPersonalityProps) {
  const [sectorName, setSectorName] = useState('Vendas')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      // Get current user's org
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userData } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .single()

      if (!userData) return

      // Create or update default sector
      const { data: existing } = await supabase
        .from('sectors')
        .select('id')
        .eq('org_id', userData.org_id)
        .eq('name', sectorName)
        .single()

      if (existing) {
        await supabase
          .from('sectors')
          .update({ system_prompt: prompt })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('sectors')
          .insert({
            org_id: userData.org_id,
            name: sectorName,
            description: `Setor de ${sectorName.toLowerCase()}`,
            system_prompt: prompt,
            color: '#8b5cf6',
          })
      }

      onComplete()
    } catch (err) {
      console.error('Error saving sector:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-amber-500" />
      </div>

      <h2 className="text-xl font-semibold text-zinc-100 mb-2">Personalidade da IA</h2>
      <p className="text-sm text-zinc-400 mb-8 text-center max-w-md">
        Configure como a IA vai se comportar nas conversas com seus clientes.
      </p>

      <div className="w-full max-w-md space-y-4">
        {/* Sector name */}
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5 block">Nome do setor</label>
          <input
            type="text"
            value={sectorName}
            onChange={(e) => setSectorName(e.target.value)}
            placeholder="Ex: Vendas, Suporte, Financeiro"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>

        {/* System prompt */}
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5 block">Instrucoes para a IA</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors resize-none leading-relaxed"
          />
          <p className="text-[11px] text-zinc-600 mt-1">
            Dica: descreva o tom, o que a IA deve e nao deve fazer, e informacoes sobre seu negocio.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving || !sectorName.trim()} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
          {saving ? 'Salvando...' : 'Salvar e continuar'}
        </Button>
      </div>
    </div>
  )
}
