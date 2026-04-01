import { useState, useEffect, useCallback } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Phone, Mail, Calendar, Tag, X, ChevronDown, Loader2 } from 'lucide-react'
import { getInitials, formatPhone } from '@nexus/shared'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useConversationStore } from '@/stores/conversationStore'
import type { ConversationWithRelations } from '@/stores/conversationStore'
import type { Sector } from '@nexus/shared'

interface ContactPanelProps {
  conversation: ConversationWithRelations
  onClose: () => void
}

// ─── Inline Select ─────────────────────────────────────────────────
interface InlineSelectProps {
  label: string
  value: string
  options: { value: string; label: string; color?: string }[]
  onChange: (value: string) => void
  saving?: boolean
}

function InlineSelect({ label, value, options, onChange, saving }: InlineSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          disabled={saving}
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-50"
          style={
            selected?.color
              ? { backgroundColor: `${selected.color}15`, color: selected.color }
              : undefined
          }
        >
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>
              {selected?.label || '—'}
              <ChevronDown className="w-3 h-3 opacity-50" />
            </>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 bottom-full mb-1 z-50 min-w-[140px] rounded-lg border border-zinc-200 bg-white shadow-lg py-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 transition-colors flex items-center gap-2 ${
                    option.value === value ? 'font-medium text-zinc-900' : 'text-zinc-600'
                  }`}
                >
                  {option.color && (
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  {option.label}
                  {option.value === value && (
                    <span className="ml-auto text-emerald-500">✓</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Status badge config ────────────────────────────────────────────
const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  open: { label: 'Aberto', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending: { label: 'Pendente', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolved: { label: 'Resolvido', className: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
  closed: { label: 'Fechado', className: 'bg-zinc-100 text-zinc-400 border-zinc-200' },
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
]

// ─── Main component ────────────────────────────────────────────────
export function ContactPanel({ conversation, onClose }: ContactPanelProps) {
  const contact = conversation.contact
  const contactName = contact?.name || contact?.wa_id || 'Desconhecido'
  const { update: updateConversation } = useConversationStore()
  const [sectors, setSectors] = useState<Sector[]>([])
  const [savingField, setSavingField] = useState<string | null>(null)

  // Load sectors once
  useEffect(() => {
    async function loadSectors() {
      const { data } = await supabase
        .from('sectors')
        .select('id, name, color, org_id')
        .order('name')
      if (data) setSectors(data as Sector[])
    }
    loadSectors()
  }, [])

  // Generic field updater
  const updateField = useCallback(
    async (field: string, value: string | null) => {
      setSavingField(field)
      try {
        const { error } = await supabase
          .from('conversations')
          .update({ [field]: value })
          .eq('id', conversation.id)

        if (error) throw error

        // Optimistic update in store
        const storeUpdate: Record<string, unknown> = { [field]: value }
        if (field === 'sector_id') {
          storeUpdate.sector = value
            ? sectors.find((s) => s.id === value) || null
            : null
        }
        updateConversation(conversation.id, storeUpdate as Partial<ConversationWithRelations>)
      } catch (err) {
        console.error(`Failed to update ${field}:`, err)
        toast.error('Erro ao atualizar. Tente novamente.')
      } finally {
        setSavingField(null)
      }
    },
    [conversation.id, sectors, updateConversation]
  )

  // Build sector options
  const sectorOptions = [
    { value: '__none__', label: 'Sem setor', color: undefined },
    ...sectors.map((s) => ({ value: s.id, label: s.name, color: s.color })),
  ]

  const currentSectorValue = conversation.sector_id || '__none__'
  const statusBadge = STATUS_DISPLAY[conversation.status] || STATUS_DISPLAY.open

  return (
    <div className="flex flex-col h-full border-l border-zinc-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-zinc-200">
        <span className="text-sm font-medium text-zinc-900">Detalhes</span>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 transition-colors"
          aria-label="Fechar painel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contact info */}
      <div className="flex flex-col items-center px-4 py-6">
        <Avatar className="w-16 h-16 mb-3">
          {contact?.avatar_url && <AvatarImage src={contact.avatar_url} alt={contactName} />}
          <AvatarFallback className="bg-zinc-200 text-zinc-600 text-lg">
            {getInitials(contactName)}
          </AvatarFallback>
        </Avatar>
        <h3 className="text-sm font-semibold text-zinc-900">{contactName}</h3>
        {contact?.wa_id && (
          <p className="text-xs text-zinc-400 mt-0.5">
            {formatPhone(contact.wa_id)}
          </p>
        )}
      </div>

      <Separator />

      {/* Contact details */}
      <div className="px-4 py-4 space-y-4">
        {contact?.phone && (
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-600">{formatPhone(contact.phone)}</span>
          </div>
        )}
        {contact?.email && (
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-600">{contact.email}</span>
          </div>
        )}
        {contact?.first_message_at && (
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-600">
              Desde {format(new Date(contact.first_message_at), "dd 'de' MMM yyyy", { locale: ptBR })}
            </span>
          </div>
        )}
      </div>

      {/* Tags */}
      {contact?.tags && contact.tags.length > 0 && (
        <>
          <Separator />
          <div className="px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-500">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Conversation management */}
      <Separator />
      <div className="px-4 py-4 space-y-3">
        {/* Status — read-only badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Status</span>
          <Badge variant="outline" className={`text-[11px] ${statusBadge.className}`}>
            {statusBadge.label}
          </Badge>
        </div>

        {/* Priority — editable */}
        <InlineSelect
          label="Prioridade"
          value={conversation.priority}
          options={PRIORITY_OPTIONS}
          onChange={(v) => updateField('priority', v)}
          saving={savingField === 'priority'}
        />

        {/* Sector — editable */}
        <InlineSelect
          label="Setor"
          value={currentSectorValue}
          options={sectorOptions}
          onChange={(v) => updateField('sector_id', v === '__none__' ? null : v)}
          saving={savingField === 'sector_id'}
        />
      </div>
    </div>
  )
}
