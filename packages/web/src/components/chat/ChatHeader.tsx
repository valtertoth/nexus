import { useState } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AIModeToggle } from '@/components/ai/AIModeToggle'
import { OutcomeModal } from '@/components/chat/OutcomeModal'
import {
  MoreVertical,
  CheckCircle2,
  Clock,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BrainCircuit,
  ShoppingCart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getInitials, formatPhone } from '@nexus/shared'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useConversationStore } from '@/stores/conversationStore'
import type { ConversationWithRelations } from '@/stores/conversationStore'
import type { AiMode, ConversationOutcome } from '@nexus/shared'

interface ChatHeaderProps {
  conversation: ConversationWithRelations
  aiMode: AiMode
  onAiModeChange: (mode: AiMode) => void
  onToggleConsult?: () => void
  consultOpen?: boolean
  onOpenQuote?: () => void
}

const OUTCOME_BADGES: Record<ConversationOutcome, { label: string; className: string }> = {
  converted: { label: 'Convertido', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  lost: { label: 'Perdido', className: 'bg-red-100 text-red-600 border-red-200' },
  problem: { label: 'Problema', className: 'bg-amber-100 text-amber-700 border-amber-200' },
}

export function ChatHeader({ conversation, aiMode, onAiModeChange, onToggleConsult, consultOpen, onOpenQuote }: ChatHeaderProps) {
  const [outcomeOpen, setOutcomeOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const { update: updateConversation } = useConversationStore()

  const contact = conversation.contact
  const contactName = contact?.name || contact?.wa_id || 'Desconhecido'

  // Service window
  const windowExpires = conversation.wa_service_window_expires_at
  const isWindowActive = windowExpires ? new Date(windowExpires) > new Date() : false
  const windowRemaining =
    windowExpires && isWindowActive
      ? formatDistanceToNow(new Date(windowExpires), { locale: ptBR })
      : null

  const currentOutcome = conversation.outcome as ConversationOutcome | null
  const outcomeBadge = currentOutcome ? OUTCOME_BADGES[currentOutcome] : null
  const isOpen = conversation.status === 'open'
  const isPending = conversation.status === 'pending'
  const isActive = isOpen || isPending
  const hasOutcome = !!currentOutcome

  // ─── Actions ──────────────────────────────────────────────────────

  async function updateStatus(status: string, extras?: Record<string, unknown>) {
    setActionLoading(true)
    try {
      const updateData: Record<string, unknown> = { status, ...extras }

      const { error } = await supabase
        .from('conversations')
        .update(updateData)
        .eq('id', conversation.id)

      if (error) throw error

      updateConversation(conversation.id, updateData as Partial<ConversationWithRelations>)
    } catch (err) {
      console.error('Failed to update status:', err)
      toast.error('Erro ao atualizar conversa.')
    } finally {
      setActionLoading(false)
    }
  }

  function handleMarkPending() {
    updateStatus('pending')
    toast.info('Conversa marcada como pendente.')
  }

  function handleReopen() {
    updateStatus('open', { resolved_at: null, outcome: null, outcome_value: null, outcome_reason: null, outcome_product: null, outcome_at: null, outcome_by: null })
    toast.info('Conversa reaberta.')
  }

  function handleResolve() {
    updateStatus('resolved', { resolved_at: new Date().toISOString() })
    toast.success('Conversa resolvida.')
  }

  function handleOutcomeSuccess(outcome: ConversationOutcome) {
    updateConversation(conversation.id, {
      outcome,
      status: 'resolved',
    })
  }

  return (
    <>
      <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-200 bg-white">
        {/* Left: Contact info */}
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="w-8 h-8 shrink-0">
            {contact?.avatar_url && <AvatarImage src={contact.avatar_url} alt={contactName} />}
            <AvatarFallback className="bg-zinc-200 text-zinc-600 text-xs">
              {getInitials(contactName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-900 truncate">{contactName}</span>
              {conversation.sector && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
                  style={{
                    backgroundColor: `${conversation.sector.color}15`,
                    color: conversation.sector.color,
                  }}
                >
                  {conversation.sector.name}
                </span>
              )}
              {outcomeBadge && (
                <Badge variant="outline" className={`text-[10px] h-4 px-1.5 shrink-0 ${outcomeBadge.className}`}>
                  {outcomeBadge.label}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {contact?.wa_id && (
                <span className="text-xs text-zinc-400">{formatPhone(contact.wa_id)}</span>
              )}
              {windowRemaining && (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <Clock className="w-3 h-3" />
                  Expira em {windowRemaining}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: AI toggle + actions */}
        <div className="flex items-center gap-3 shrink-0">
          <AIModeToggle value={aiMode} onChange={onAiModeChange} />

          <button
            onClick={onToggleConsult}
            className={cn(
              'inline-flex items-center justify-center rounded-md h-8 w-8 transition-colors',
              consultOpen
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
            )}
            aria-label="Consultar IA"
          >
            <BrainCircuit className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenQuote}
            className="inline-flex items-center justify-center rounded-md h-8 w-8 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            aria-label="Criar orcamento"
          >
            <ShoppingCart className="w-4 h-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md h-8 w-8 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer" aria-label="Menu de acoes">
              <MoreVertical className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* Status actions — context-dependent */}
              {isOpen && (
                <DropdownMenuItem
                  className="gap-2"
                  onClick={handleMarkPending}
                  disabled={actionLoading}
                >
                  <Clock className="w-4 h-4 text-amber-500" />
                  Marcar como Pendente
                </DropdownMenuItem>
              )}
              {!isActive && (
                <DropdownMenuItem
                  className="gap-2"
                  onClick={handleReopen}
                  disabled={actionLoading}
                >
                  <RotateCcw className="w-4 h-4 text-blue-500" />
                  Reabrir conversa
                </DropdownMenuItem>
              )}

              {/* Outcome actions — only when active and no outcome yet */}
              {isActive && !hasOutcome && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2 text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50"
                    onClick={() => setTimeout(() => setOutcomeOpen(true), 50)}
                  >
                    <TrendingUp className="w-4 h-4" />
                    Marcar Convertido
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 text-red-500 focus:text-red-500 focus:bg-red-50"
                    onClick={() => setTimeout(() => setOutcomeOpen(true), 50)}
                  >
                    <TrendingDown className="w-4 h-4" />
                    Marcar Perdido
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 text-amber-600 focus:text-amber-600 focus:bg-amber-50"
                    onClick={() => setTimeout(() => setOutcomeOpen(true), 50)}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Marcar Problema
                  </DropdownMenuItem>
                </>
              )}

              {/* Resolve — only when active */}
              {isActive && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={handleResolve}
                    disabled={actionLoading}
                  >
                    <CheckCircle2 className="w-4 h-4 text-zinc-500" />
                    Resolver
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <OutcomeModal
        open={outcomeOpen}
        conversationId={conversation.id}
        onClose={() => setOutcomeOpen(false)}
        onSuccess={handleOutcomeSuccess}
      />
    </>
  )
}
