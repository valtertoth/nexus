import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Bot, MessageSquare, Power } from 'lucide-react'
import { toast } from 'sonner'
import type { AiMode } from '@nexus/shared'

const modes: { value: AiMode; label: string; icon: React.ElementType; tooltip: string; toast: string }[] = [
  { value: 'automatic', label: 'Auto', icon: Bot, tooltip: 'IA responde automaticamente após 5 segundos', toast: 'IA no modo automático — respostas enviadas após 5s' },
  { value: 'dictated', label: 'Copiloto', icon: MessageSquare, tooltip: 'IA sugere, você decide se envia', toast: 'IA no modo copiloto — sugestões para aprovação' },
  { value: 'off', label: 'Off', icon: Power, tooltip: 'IA desligada', toast: 'IA desligada' },
]

interface AIModeToggleProps {
  value: AiMode
  onChange?: (mode: AiMode) => void
}

export function AIModeToggle({ value, onChange }: AIModeToggleProps) {
  const { profile } = useAuthContext()

  async function handleChange(mode: AiMode) {
    if (mode === value) return // No-op if same mode
    onChange?.(mode)

    const modeConfig = modes.find((m) => m.value === mode)
    if (modeConfig) {
      toast.info(modeConfig.toast, { duration: 2000 })
    }

    // Persist to user profile
    if (profile) {
      const { error } = await supabase
        .from('users')
        .update({ ai_mode: mode })
        .eq('id', profile.id)

      if (error) {
        console.error('[AIModeToggle] Failed to persist mode:', error.message)
        toast.error('Erro ao salvar modo da IA')
      }
    }
  }

  return (
    <div className="flex items-center bg-zinc-100 rounded-lg p-0.5 gap-0.5">
      {modes.map((mode) => {
        const Icon = mode.icon
        const isActive = value === mode.value
        return (
          <Tooltip key={mode.value}>
            <TooltipTrigger
              onClick={() => handleChange(mode.value)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150 cursor-pointer',
                isActive
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{mode.label}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {mode.tooltip}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
