import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Clock, Loader2 } from 'lucide-react'

interface FollowupButtonProps {
  conversationId: string
  /** Estilo compacto para caber no header do chat. */
  compact?: boolean
}

const SHORTCUTS: { label: string; days: number }[] = [
  { label: '+1 dia', days: 1 },
  { label: '+3 dias', days: 3 },
  { label: '+1 semana', days: 7 },
]

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

export function FollowupButton({ conversationId, compact }: FollowupButtonProps) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [customDate, setCustomDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function schedule(remindAtIso: string) {
    if (saving) return
    setSaving(true)
    try {
      await api.post('/api/followups', {
        conversationId,
        remind_at: remindAtIso,
        note: note.trim() || undefined,
      })
      toast.success('Follow-up agendado.')
      setOpen(false)
      setNote('')
      setCustomDate('')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Erro ao agendar follow-up.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  function scheduleCustom() {
    if (!customDate) return
    const parsed = new Date(customDate)
    if (Number.isNaN(parsed.getTime())) {
      toast.error('Data inválida.')
      return
    }
    schedule(parsed.toISOString())
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size={compact ? 'icon' : 'sm'}
            className="text-zinc-500 hover:text-zinc-900"
            aria-label="Agendar follow-up"
          />
        }
      >
        <Clock className="w-4 h-4 shrink-0" />
        {!compact && <span className="ml-1.5">Follow-up</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-900">Lembrar deste cliente</p>
            <p className="text-xs text-zinc-500">Uma nota entra na sua fila de follow-ups.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="followup-note" className="text-xs">Nota (opcional)</Label>
            <Textarea
              id="followup-note"
              placeholder="Ex.: confirmar medidas do aparador"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SHORTCUTS.map((s) => (
              <Button
                key={s.days}
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => schedule(inDays(s.days))}
              >
                {s.label}
              </Button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="followup-custom" className="text-xs">Data específica</Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="followup-custom"
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="text-sm"
              />
              <Button
                type="button"
                size="sm"
                disabled={saving || !customDate}
                onClick={scheduleCustom}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Agendar'}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
