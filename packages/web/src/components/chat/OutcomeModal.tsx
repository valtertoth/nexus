import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Sparkles, Loader2 } from 'lucide-react'
import { useConversationOutcome } from '@/hooks/useConversationOutcome'
import { useConversationTags, type TagSuggestion } from '@/hooks/useConversationTags'
import { TagSelector } from '@/components/chat/TagSelector'
import type { ConversationOutcome } from '@nexus/shared'

interface OutcomeModalProps {
  open: boolean
  conversationId: string
  onClose: () => void
  onSuccess: (outcome: ConversationOutcome) => void
}

const OUTCOME_OPTIONS: Array<{
  value: ConversationOutcome
  label: string
  description: string
  icon: React.ElementType
  activeClass: string
}> = [
  {
    value: 'converted',
    label: 'Convertido',
    description: 'Venda realizada',
    icon: TrendingUp,
    activeClass: 'border-emerald-500 bg-emerald-50 text-emerald-700',
  },
  {
    value: 'lost',
    label: 'Perdido',
    description: 'Não houve venda',
    icon: TrendingDown,
    activeClass: 'border-red-400 bg-red-50 text-red-700',
  },
  {
    value: 'problem',
    label: 'Problema',
    description: 'Reclamação ou conflito',
    icon: AlertTriangle,
    activeClass: 'border-amber-400 bg-amber-50 text-amber-700',
  },
]

export function OutcomeModal({ open, conversationId, onClose, onSuccess }: OutcomeModalProps) {
  const [outcome, setOutcome] = useState<ConversationOutcome | null>(null)
  const [value, setValue] = useState('')
  const [product, setProduct] = useState('')
  const [reason, setReason] = useState('')
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  const { recordOutcome, submitting } = useConversationOutcome()
  const { appliedTags, addTag, removeTag, fetchSuggestions } = useConversationTags(conversationId)

  // Fetch AI tag suggestions when outcome changes
  // fetchSuggestions is stable (useCallback on conversationId) — excluded from deps to prevent re-run loops
  useEffect(() => {
    if (!outcome) {
      setSuggestions([])
      return
    }
    let cancelled = false
    setLoadingSuggestions(true)
    fetchSuggestions(outcome)
      .then((result) => { if (!cancelled) setSuggestions(result) })
      .finally(() => { if (!cancelled) setLoadingSuggestions(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome])

  const handleSubmit = async () => {
    if (!outcome) return

    const success = await recordOutcome(conversationId, {
      outcome,
      value: value ? parseFloat(value) : undefined,
      currency: 'BRL',
      product: product.trim() || undefined,
      reason: reason.trim() || undefined,
    })

    if (success) {
      onSuccess(outcome)
      handleClose()
    }
  }

  const handleClose = () => {
    setOutcome(null)
    setValue('')
    setProduct('')
    setReason('')
    setSuggestions([])
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-900">Registrar resultado</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Esse dado alimenta o funil de atribuição e o sistema de aprendizado da IA.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Outcome selection */}
          <div className="grid grid-cols-3 gap-2">
            {OUTCOME_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const isActive = outcome === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setOutcome(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-center transition-all',
                    isActive
                      ? opt.activeClass
                      : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
                  )}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.5} />
                  <span className="text-xs font-medium">{opt.label}</span>
                  <span className="text-[10px] leading-tight opacity-70">{opt.description}</span>
                </button>
              )
            })}
          </div>

          {/* Converted: show value + product */}
          {outcome === 'converted' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-zinc-600">Valor da venda (R$)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-zinc-600">Produto/Serviço (opcional)</Label>
                <Input
                  placeholder="Ex: Plano Pro, Consultoria..."
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}

          {/* Lost/Problem: show reason */}
          {(outcome === 'lost' || outcome === 'problem') && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-600">
                {outcome === 'lost' ? 'Motivo da perda (opcional)' : 'Descrição do problema (opcional)'}
              </Label>
              <Textarea
                placeholder={
                  outcome === 'lost'
                    ? 'Ex: Preço alto, escolheu concorrente...'
                    : 'Ex: Produto com defeito, entrega atrasada...'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          )}

          {/* Tags section — shown after outcome is selected */}
          {outcome && (
            <div className="space-y-2 border-t border-zinc-100 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-700">Classificação da conversa</p>
                {loadingSuggestions && (
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <Sparkles className="w-3 h-3" />
                    <span>IA analisando...</span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-zinc-400">
                Tags com borda tracejada são sugestões da IA. Adicione as que fazem sentido.
              </p>
              <TagSelector
                appliedTags={appliedTags}
                suggestions={suggestions}
                outcome={outcome}
                onAdd={addTag}
                onRemove={removeTag}
                compact={false}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
              className="flex-1 h-9 text-sm"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!outcome || submitting}
              className="flex-1 h-9 text-sm bg-zinc-900 hover:bg-zinc-800 text-white"
            >
              {submitting ? 'Salvando...' : 'Confirmar resultado'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
